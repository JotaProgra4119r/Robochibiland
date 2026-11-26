use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, Stream};
use glam::{Vec2, Vec3};
use robochibi_audio::RoboAudioSynth;
use robochibi_core::{
    AnimId, AudioEvent, AudioKind, EmotionId, InputState, RobotId, SimulationEngine, TimeOfDay,
};
use robochibi_render::{RoboRenderer, PIP_HEIGHT, PIP_WIDTH};
use winit::application::ApplicationHandler;
use winit::dpi::LogicalSize;
use winit::event::{ElementState, MouseButton, MouseScrollDelta, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::keyboard::{KeyCode, PhysicalKey};
use winit::window::{Window, WindowAttributes, WindowId};

#[derive(Clone, Copy, PartialEq, Eq)]
enum GfxPreference {
    Vulkan,
    Dx12,
    Gl,
    Auto,
}

impl GfxPreference {
    fn from_args(args: &[String]) -> (Self, Option<u64>) {
        let mut pref = Self::Vulkan;
        let mut smoke_frames = None;
        let mut i = 1;
        while i < args.len() {
            match args[i].as_str() {
                "--gfx" if i + 1 < args.len() => {
                    pref = match args[i + 1].to_ascii_lowercase().as_str() {
                        "vulkan" | "vk" => Self::Vulkan,
                        "dx12" | "d3d12" => Self::Dx12,
                        "gl" | "opengl" => Self::Gl,
                        _ => Self::Auto,
                    };
                    i += 2;
                }
                "--smoke-frames" if i + 1 < args.len() => {
                    smoke_frames = args[i + 1].parse::<u64>().ok();
                    i += 2;
                }
                _ => i += 1,
            }
        }
        (pref, smoke_frames)
    }

    fn backend_attempts(self) -> Vec<(wgpu::Backends, &'static str)> {
        match self {
            Self::Vulkan => vec![
                (wgpu::Backends::VULKAN, "Vulkan"),
                (wgpu::Backends::PRIMARY, "Primary (DX12/Metal)"),
                (wgpu::Backends::GL, "OpenGL"),
            ],
            Self::Dx12 => vec![
                (wgpu::Backends::DX12, "DirectX 12"),
                (wgpu::Backends::VULKAN, "Vulkan"),
                (wgpu::Backends::GL, "OpenGL"),
            ],
            Self::Gl => vec![
                (wgpu::Backends::GL, "OpenGL"),
                (wgpu::Backends::PRIMARY, "Primary"),
            ],
            Self::Auto => vec![
                (wgpu::Backends::PRIMARY, "Primary"),
                (wgpu::Backends::VULKAN, "Vulkan"),
                (wgpu::Backends::GL, "OpenGL"),
            ],
        }
    }
}

struct NativeAudioOutput {
    _stream: Option<Stream>,
    synth: Arc<Mutex<RoboAudioSynth>>,
}

impl NativeAudioOutput {
    fn new() -> Self {
        let synth = Arc::new(Mutex::new(RoboAudioSynth::new(48_000.0)));
        let stream = Self::try_start_stream(Arc::clone(&synth));
        Self {
            _stream: stream,
            synth,
        }
    }

    fn try_start_stream(synth: Arc<Mutex<RoboAudioSynth>>) -> Option<Stream> {
        let host = cpal::default_host();
        let device = host.default_output_device()?;
        let supported = device.default_output_config().ok()?;
        let sample_format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let sample_rate = config.sample_rate as f32;
        let channels = config.channels.max(1) as usize;

        if let Ok(mut guard) = synth.lock() {
            guard.set_sample_rate(sample_rate);
        }

        let err_fn = |err| log::error!("cpal audio stream error: {err}");
        let stream = match sample_format {
            SampleFormat::F32 => device
                .build_output_stream(
                    config,
                    move |data: &mut [f32], _| fill_audio_buffer(data, channels, &synth),
                    err_fn,
                    None,
                )
                .ok()?,
            SampleFormat::I16 => device
                .build_output_stream(
                    config,
                    move |data: &mut [i16], _| fill_audio_buffer(data, channels, &synth),
                    err_fn,
                    None,
                )
                .ok()?,
            SampleFormat::U16 => device
                .build_output_stream(
                    config,
                    move |data: &mut [u16], _| fill_audio_buffer(data, channels, &synth),
                    err_fn,
                    None,
                )
                .ok()?,
            _ => return None,
        };
        if stream.play().is_err() {
            return None;
        }
        Some(stream)
    }
}

fn fill_audio_buffer<T: Sample + FromSample<f32>>(
    output: &mut [T],
    channels: usize,
    synth: &Arc<Mutex<RoboAudioSynth>>,
) {
    let frames = output.len() / channels.max(1);
    if frames == 0 {
        return;
    }
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];
    if let Ok(mut guard) = synth.lock() {
        guard.render_stereo(&mut left, &mut right);
    }
    for f in 0..frames {
        let l = left[f];
        let r = right[f];
        let base = f * channels;
        if channels == 1 {
            output[base] = T::from_sample((l + r) * 0.5);
        } else {
            output[base] = T::from_sample(l);
            output[base + 1] = T::from_sample(r);
            for ch in 2..channels {
                output[base + ch] = T::from_sample((l + r) * 0.5);
            }
        }
    }
}

struct NativeGpuState {
    window: Arc<Window>,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface_config: wgpu::SurfaceConfiguration,
    renderer: RoboRenderer,
    egui_ctx: egui::Context,
    egui_state: egui_winit::State,
    egui_renderer: egui_wgpu::Renderer,
    pip_tex_id: Option<egui::TextureId>,
    backend_label: String,
    adapter_name: String,
}

struct AppState {
    gfx_pref: GfxPreference,
    smoke_frames: Option<u64>,
    frames_rendered: u64,
    gpu: Option<NativeGpuState>,
    engine: SimulationEngine,
    audio: NativeAudioOutput,
    pressed_keys: HashSet<KeyCode>,
    last_frame: Instant,
    fps_smooth: f32,
    zen_mode: bool,
    pip_enabled: bool,
    command_input: String,
    last_status_msg: String,

    // Mouse / camera state
    left_down: bool,
    right_down: bool,
    pointer_moved: bool,
    cursor_pos: (f32, f32),
    last_drag_pos: (f32, f32),
    pending_orbit_delta: Vec2,
    pending_zoom_delta: f32,
}

impl AppState {
    fn new(gfx_pref: GfxPreference, smoke_frames: Option<u64>) -> Self {
        Self {
            gfx_pref,
            smoke_frames,
            frames_rendered: 0,
            gpu: None,
            engine: SimulationEngine::new(),
            audio: NativeAudioOutput::new(),
            pressed_keys: HashSet::new(),
            last_frame: Instant::now(),
            fps_smooth: 60.0,
            zen_mode: false,
            pip_enabled: false,
            command_input: String::new(),
            last_status_msg: String::from(
                "Listo. Usa WASD/Flechas, Espacio, Tab, P, F, B, 1-6, H (Zen).",
            ),
            left_down: false,
            right_down: false,
            pointer_moved: false,
            cursor_pos: (0.0, 0.0),
            last_drag_pos: (0.0, 0.0),
            pending_orbit_delta: Vec2::ZERO,
            pending_zoom_delta: 0.0,
        }
    }

    fn init_gpu(&mut self, window: Arc<Window>) -> Result<(), String> {
        let size = window.inner_size();
        let width = size.width.max(1);
        let height = size.height.max(1);
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .map_err(|e| format!("tokio runtime error: {e}"))?;

        let mut last_err = String::from("No compatible GPU adapter found");
        for (backends, label) in self.gfx_pref.backend_attempts() {
            let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
                backends,
                ..wgpu::InstanceDescriptor::new_without_display_handle()
            });
            let Ok(surface) = instance.create_surface(Arc::clone(&window)) else {
                last_err = format!("{label}: surface creation failed");
                continue;
            };
            let Some(adapter) = rt.block_on(async {
                instance
                    .request_adapter(&wgpu::RequestAdapterOptions {
                        power_preference: wgpu::PowerPreference::HighPerformance,
                        compatible_surface: Some(&surface),
                        force_fallback_adapter: false,
                        apply_limit_buckets: false,
                    })
                    .await
                    .ok()
            }) else {
                last_err = format!("{label}: adapter unavailable");
                continue;
            };

            let info = adapter.get_info();
            let limits = wgpu::Limits::default().using_resolution(adapter.limits());
            let Ok((device, queue)) = rt.block_on(async {
                adapter
                    .request_device(&wgpu::DeviceDescriptor {
                        label: Some("robochibi_native_device"),
                        required_features: wgpu::Features::empty(),
                        required_limits: limits,
                        memory_hints: wgpu::MemoryHints::Performance,
                        ..Default::default()
                    })
                    .await
            }) else {
                last_err = format!("{label}: request_device failed");
                continue;
            };

            let caps = surface.get_capabilities(&adapter);
            let format = caps
                .formats
                .iter()
                .copied()
                .find(|f| f.is_srgb())
                .unwrap_or(caps.formats[0]);
            let present_mode = if caps.present_modes.contains(&wgpu::PresentMode::Fifo) {
                wgpu::PresentMode::Fifo
            } else {
                caps.present_modes[0]
            };
            let surface_config = wgpu::SurfaceConfiguration {
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                format,
                color_space: wgpu::SurfaceColorSpace::Auto,
                width,
                height,
                present_mode,
                alpha_mode: caps.alpha_modes[0],
                view_formats: vec![],
                desired_maximum_frame_latency: 2,
            };
            surface.configure(&device, &surface_config);

            let renderer = RoboRenderer::new(&device, &queue, format, width, height, &self.engine);
            let egui_ctx = egui::Context::default();
            let egui_state = egui_winit::State::new(
                egui_ctx.clone(),
                egui::ViewportId::ROOT,
                &window,
                Some(window.scale_factor() as f32),
                None,
                None,
            );
            let mut egui_renderer = egui_wgpu::Renderer::new(
                &device,
                format,
                egui_wgpu::RendererOptions::default(),
            );
            let pip_view = renderer
                .pip_texture()
                .create_view(&wgpu::TextureViewDescriptor::default());
            let pip_tex_id = Some(egui_renderer.register_native_texture(
                &device,
                &pip_view,
                wgpu::FilterMode::Linear,
            ));

            let backend_label = format!("{:?}", info.backend);
            window.set_title(&format!(
                "RoboChibi 3D - CyberPup World [Rust + {} | {}]",
                backend_label, info.name
            ));

            self.gpu = Some(NativeGpuState {
                window,
                surface,
                device,
                queue,
                surface_config,
                renderer,
                egui_ctx,
                egui_state,
                egui_renderer,
                pip_tex_id,
                backend_label,
                adapter_name: info.name,
            });
            return Ok(());
        }
        Err(last_err)
    }

    fn build_input_state(&self) -> InputState {
        let has = |k: KeyCode| self.pressed_keys.contains(&k);
        InputState {
            forward: has(KeyCode::KeyW) || has(KeyCode::ArrowUp),
            backward: has(KeyCode::KeyS) || has(KeyCode::ArrowDown),
            left: has(KeyCode::KeyA) || has(KeyCode::ArrowLeft),
            right: has(KeyCode::KeyD) || has(KeyCode::ArrowRight),
            up: has(KeyCode::Space),
            down: has(KeyCode::ControlLeft) || has(KeyCode::ControlRight),
            shift: has(KeyCode::ShiftLeft) || has(KeyCode::ShiftRight),
            joystick: None,
            joystick_running: false,
            orbit_delta: self.pending_orbit_delta,
            zoom_delta: self.pending_zoom_delta,
        }
    }

    fn trigger_player_bark(&mut self) {
        let idx = self.engine.pack.active_idx;
        let pos = self.engine.pack.dogs[idx].position;
        let pitch = self.engine.pack.dogs[idx].id.profile().voice_pitch;
        self.engine.pack.anims[idx].play(AnimId::Bark, 1.5, &mut self.engine.pack.dogs[idx]);
        self.engine.audio_events.push(AudioEvent {
            kind: AudioKind::Bark,
            world_pos: pos,
            pitch,
        });
    }

    fn handle_shortcut_key(&mut self, key: KeyCode) {
        match key {
            KeyCode::Space => self.engine.trigger_player_jump(1.0),
            KeyCode::Tab => {
                let next_idx = (self.engine.pack.active_idx + 1) % self.engine.pack.dogs.len();
                let next_id = self.engine.pack.dogs[next_idx].id;
                self.engine.switch_robot(next_id);
            }
            KeyCode::KeyP => self.engine.pet_player(),
            KeyCode::KeyF => self.engine.trigger_player_jump(1.35),
            KeyCode::KeyB => self.trigger_player_bark(),
            KeyCode::KeyC => {
                self.engine.camera_mode = self.engine.camera_mode.cycle_next();
            }
            KeyCode::KeyV => {
                self.engine.optical_filter = self.engine.optical_filter.cycle_next();
            }
            KeyCode::KeyT => {
                let next = match self.engine.time_of_day {
                    TimeOfDay::Day => TimeOfDay::Sunset,
                    TimeOfDay::Sunset => TimeOfDay::Night,
                    TimeOfDay::Night => TimeOfDay::Day,
                };
                self.engine.set_time_of_day(next);
            }
            KeyCode::KeyG => {
                let next = self.engine.weather.cycle_next();
                self.engine.set_weather(next);
            }
            KeyCode::KeyH => {
                self.zen_mode = !self.zen_mode;
            }
            KeyCode::Digit1 => self.engine.set_player_emotion(EmotionId::Happy),
            KeyCode::Digit2 => self.engine.set_player_emotion(EmotionId::Excited),
            KeyCode::Digit3 => self.engine.set_player_emotion(EmotionId::Curious),
            KeyCode::Digit4 => self.engine.set_player_emotion(EmotionId::Party),
            KeyCode::Digit5 => self.engine.set_player_emotion(EmotionId::Loving),
            KeyCode::Digit6 => self.engine.set_player_emotion(EmotionId::Sleepy),
            _ => {}
        }
    }

    fn step_and_render(&mut self, event_loop: &ActiveEventLoop) {
        let now = Instant::now();
        let dt = (now - self.last_frame).as_secs_f32().clamp(0.001, 0.05);
        self.last_frame = now;
        let inst_fps = 1.0 / dt.max(0.001);
        self.fps_smooth = self.fps_smooth * 0.92 + inst_fps * 0.08;

        let input = self.build_input_state();
        self.pending_orbit_delta = Vec2::ZERO;
        self.pending_zoom_delta = 0.0;
        self.engine.step(dt, &input);

        // Feed audio synth
        let forward = (self.engine.cam_target - self.engine.cam_pos).normalize_or(Vec3::NEG_Z);
        let right = forward.cross(Vec3::Y).normalize_or(Vec3::X);
        if let Ok(mut synth) = self.audio.synth.lock() {
            synth.update_environment(
                self.engine.cam_pos,
                self.engine.time_of_day,
                self.engine.weather,
            );
            for ev in self.engine.audio_events.drain(..) {
                synth.emit_3d(ev, self.engine.cam_pos, right);
            }
        } else {
            self.engine.audio_events.clear();
        }

        let Some(mut gpu) = self.gpu.take() else {
            return;
        };

        let frame = match gpu.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(f)
            | wgpu::CurrentSurfaceTexture::Suboptimal(f) => f,
            wgpu::CurrentSurfaceTexture::Lost | wgpu::CurrentSurfaceTexture::Outdated => {
                gpu.surface.configure(&gpu.device, &gpu.surface_config);
                self.gpu = Some(gpu);
                return;
            }
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                self.gpu = Some(gpu);
                return;
            }
            _ => {
                self.gpu = Some(gpu);
                return;
            }
        };

        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let raw_input = gpu.egui_state.take_egui_input(&gpu.window);
        let zen_mode = self.zen_mode;
        let mut pip_enabled = self.pip_enabled;
        let pip_tex_id = gpu.pip_tex_id;
        let backend_label = gpu.backend_label.clone();
        let adapter_name = gpu.adapter_name.clone();
        let fps_smooth = self.fps_smooth;

        let mut switch_robot_id: Option<RobotId> = None;
        let mut submit_command: Option<String> = None;
        let mut action_jump = false;
        let mut action_pet = false;
        let mut action_bark = false;
        let mut action_flip = false;
        let mut action_ball = false;
        let mut action_snack = false;
        let mut action_disco = false;
        let mut cycle_time = false;
        let mut cycle_weather = false;
        let mut cycle_cam = false;
        let mut cycle_filter = false;

        let mut full_output = gpu.egui_ctx.run_ui(raw_input, |ui| {
            if zen_mode {
                return;
            }
            egui::Panel::top("top_hud").show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.strong("🐾 RoboChibi 3D");
                    ui.separator();
                    ui.label(format!(
                        "GPU: {} ({}) | {:.0} FPS",
                        backend_label, adapter_name, fps_smooth
                    ));
                    ui.separator();
                    ui.label(format!("⚽ Goles: {}", self.engine.world.goal_score));
                    ui.separator();
                    for dog in &self.engine.pack.dogs {
                        let selected = dog.id == self.engine.pack.player().id;
                        if ui
                            .selectable_label(selected, format!("{} {:.0}%", dog.id.name(), dog.energy))
                            .clicked()
                        {
                            switch_robot_id = Some(dog.id);
                        }
                    }
                    ui.separator();
                    if ui.button(format!("☀ {}", self.engine.time_of_day.as_str())).clicked() {
                        cycle_time = true;
                    }
                    if ui.button(format!("🌦 {}", self.engine.weather.toast_es())).clicked() {
                        cycle_weather = true;
                    }
                    if ui.button(format!("📷 {}", self.engine.camera_mode.label_es())).clicked() {
                        cycle_cam = true;
                    }
                    if ui.button(format!("🕶 {}", self.engine.optical_filter.toast_es())).clicked() {
                        cycle_filter = true;
                    }
                    ui.checkbox(&mut pip_enabled, "👁 PIP");
                });
            });

            egui::Panel::left("actions_panel")
                .default_size(185.0)
                .show(ui, |ui| {
                    let p = self.engine.pack.player();
                    ui.heading(p.id.name());
                    ui.label(format!("Emoción: {:?}", p.current_emotion));
                    ui.add(egui::ProgressBar::new((p.energy / 100.0).clamp(0.0, 1.0)).text("Energía"));
                    ui.add(
                        egui::ProgressBar::new((p.affection / 100.0).clamp(0.0, 1.0))
                            .text("Afecto"),
                    );
                    ui.separator();
                    if ui.button("⬆ Saltar (Espacio)").clicked() {
                        action_jump = true;
                    }
                    if ui.button("❤ Acariciar (P)").clicked() {
                        action_pet = true;
                    }
                    if ui.button("🔊 Ladrar (B)").clicked() {
                        action_bark = true;
                    }
                    if ui.button("🤸 Voltereta (F)").clicked() {
                        action_flip = true;
                    }
                    if ui.button("⚽ Lanzar Pelota").clicked() {
                        action_ball = true;
                    }
                    if ui.button("🍪 Dar Galleta").clicked() {
                        action_snack = true;
                    }
                    if ui.button("🪩 Fiesta Disco").clicked() {
                        action_disco = true;
                    }
                    ui.checkbox(&mut self.engine.is_free_will, "🧠 Libre Albedrío");
                    ui.checkbox(&mut self.engine.is_hand_tool_active, "✋ Mano (Arrastrar)");
                    ui.separator();
                    if pip_enabled {
                        if let Some(tex_id) = pip_tex_id {
                            ui.label("👁 Cámara Ojos");
                            ui.image((
                                tex_id,
                                egui::vec2(PIP_WIDTH as f32 * 0.65, PIP_HEIGHT as f32 * 0.65),
                            ));
                        }
                    }
                });

            egui::Panel::bottom("cmd_panel").show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label("💬 Orden:");
                    let resp = ui.text_edit_singleline(&mut self.command_input);
                    let enter = resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                    if (ui.button("Enviar").clicked() || enter) && !self.command_input.trim().is_empty() {
                        submit_command = Some(self.command_input.clone());
                        self.command_input.clear();
                    }
                    ui.separator();
                    ui.label(&self.last_status_msg);
                });
            });
        });

        self.pip_enabled = pip_enabled;
        if let Some(id) = switch_robot_id {
            self.engine.switch_robot(id);
        }
        if action_jump {
            self.engine.trigger_player_jump(1.0);
        }
        if action_pet {
            self.engine.pet_player();
        }
        if action_bark {
            self.trigger_player_bark();
        }
        if action_flip {
            self.engine.trigger_player_jump(1.35);
        }
        if action_ball {
            self.engine.throw_fetch_ball();
        }
        if action_snack {
            self.engine.spawn_snack_in_front();
        }
        if action_disco {
            self.engine
                .world
                .trigger_disco_party(&mut self.engine.audio_events);
        }
        if cycle_time {
            let next = match self.engine.time_of_day {
                TimeOfDay::Day => TimeOfDay::Sunset,
                TimeOfDay::Sunset => TimeOfDay::Night,
                TimeOfDay::Night => TimeOfDay::Day,
            };
            self.engine.set_time_of_day(next);
        }
        if cycle_weather {
            let next = self.engine.weather.cycle_next();
            self.engine.set_weather(next);
        }
        if cycle_cam {
            self.engine.camera_mode = self.engine.camera_mode.cycle_next();
        }
        if cycle_filter {
            self.engine.optical_filter = self.engine.optical_filter.cycle_next();
        }
        if let Some(cmd) = submit_command {
            let decision = self.engine.handle_user_command_immediate(&cmd);
            self.last_status_msg = format!(
                "{}: {} [{}]",
                self.engine.pack.player().id.name(),
                decision.thought,
                decision.action
            );
        }

        gpu.egui_state
            .handle_platform_output(&gpu.window, full_output.platform_output);

        let screen_descriptor = egui_wgpu::ScreenDescriptor {
            size_in_pixels: [gpu.surface_config.width, gpu.surface_config.height],
            pixels_per_point: gpu.window.scale_factor() as f32,
        };
        let paint_jobs = gpu
            .egui_ctx
            .tessellate(full_output.shapes, full_output.pixels_per_point);

        for (id, deltas) in &full_output.textures_delta.set {
            for image_delta in deltas {
                gpu.egui_renderer
                    .update_texture(&gpu.device, &gpu.queue, *id, image_delta);
            }
        }

        let mut encoder = gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("native_frame_encoder"),
            });

        gpu.renderer.render(
            &gpu.device,
            &gpu.queue,
            &mut encoder,
            &view,
            &self.engine,
            self.pip_enabled,
        );

        let extra_cmds = gpu.egui_renderer.update_buffers(
            &gpu.device,
            &gpu.queue,
            &mut encoder,
            &paint_jobs,
            &screen_descriptor,
        );

        {
            let render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("egui_overlay_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            let mut render_pass = render_pass.forget_lifetime();
            gpu.egui_renderer
                .render(&mut render_pass, &paint_jobs, &screen_descriptor);
        }

        for id in &full_output.textures_delta.free {
            gpu.egui_renderer.free_texture(id);
        }
        full_output.textures_delta.clear();

        let mut cmd_bufs = extra_cmds;
        cmd_bufs.push(encoder.finish());
        gpu.queue.submit(cmd_bufs);
        gpu.queue.present(frame);

        self.frames_rendered += 1;
        if let Some(limit) = self.smoke_frames {
            if self.frames_rendered >= limit {
                println!(
                    "SMOKE_OK backend={} adapter=\"{}\" frames={}",
                    gpu.backend_label, gpu.adapter_name, self.frames_rendered
                );
                self.gpu = Some(gpu);
                event_loop.exit();
                return;
            }
        }
        self.gpu = Some(gpu);
    }
}

impl ApplicationHandler for AppState {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.gpu.is_some() {
            return;
        }
        let attrs = WindowAttributes::default()
            .with_title("RoboChibi 3D - CyberPup World [Rust + Vulkan]")
            .with_inner_size(LogicalSize::new(1280.0, 760.0));
        let window = Arc::new(
            event_loop
                .create_window(attrs)
                .expect("failed to create winit window"),
        );
        if let Err(err) = self.init_gpu(window) {
            eprintln!("GPU init error: {err}");
            event_loop.exit();
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        let mut egui_consumed = false;
        if let Some(gpu) = self.gpu.as_mut() {
            let resp = gpu.egui_state.on_window_event(&gpu.window, &event);
            egui_consumed = resp.consumed;
        }

        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(new_size) => {
                if let Some(gpu) = self.gpu.as_mut() {
                    let w = new_size.width.max(1);
                    let h = new_size.height.max(1);
                    gpu.surface_config.width = w;
                    gpu.surface_config.height = h;
                    gpu.surface.configure(&gpu.device, &gpu.surface_config);
                    gpu.renderer.resize(&gpu.device, w, h);
                }
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if let PhysicalKey::Code(code) = event.physical_key {
                    match event.state {
                        ElementState::Pressed => {
                            if !egui_consumed {
                                if !self.pressed_keys.contains(&code) {
                                    self.handle_shortcut_key(code);
                                }
                                self.pressed_keys.insert(code);
                            }
                        }
                        ElementState::Released => {
                            self.pressed_keys.remove(&code);
                        }
                    }
                }
            }
            WindowEvent::CursorMoved { position, .. } => {
                let (x, y) = (position.x as f32, position.y as f32);
                self.cursor_pos = (x, y);
                if !egui_consumed && (self.left_down || self.right_down) {
                    let dx = x - self.last_drag_pos.0;
                    let dy = y - self.last_drag_pos.1;
                    if dx.hypot(dy) > 2.0 {
                        self.pointer_moved = true;
                    }
                    self.last_drag_pos = (x, y);
                    if self.engine.grabbed_robot.is_some() {
                        if let Some(gpu) = self.gpu.as_ref() {
                            let w = gpu.surface_config.width.max(1) as f32;
                            let h = gpu.surface_config.height.max(1) as f32;
                            let ndc_x = (x / w) * 2.0 - 1.0;
                            let ndc_y = 1.0 - (y / h) * 2.0;
                            self.engine.drag_grabbed_robot_ndc(ndc_x, ndc_y, w / h);
                        }
                    } else {
                        self.pending_orbit_delta += Vec2::new(dx, dy);
                    }
                }
            }
            WindowEvent::MouseInput { state, button, .. } => {
                if egui_consumed {
                    self.left_down = false;
                    self.right_down = false;
                    return;
                }
                match (button, state) {
                    (MouseButton::Left, ElementState::Pressed) => {
                        self.left_down = true;
                        self.pointer_moved = false;
                        self.last_drag_pos = self.cursor_pos;
                        if self.engine.is_hand_tool_active {
                            if let Some(gpu) = self.gpu.as_ref() {
                                let w = gpu.surface_config.width.max(1) as f32;
                                let h = gpu.surface_config.height.max(1) as f32;
                                let ndc_x = (self.cursor_pos.0 / w) * 2.0 - 1.0;
                                let ndc_y = 1.0 - (self.cursor_pos.1 / h) * 2.0;
                                if let Some(idx) = self.engine.pick_robot_at_ndc(ndc_x, ndc_y, w / h)
                                {
                                    self.engine.grab_robot(idx);
                                }
                            }
                        }
                    }
                    (MouseButton::Left, ElementState::Released) => {
                        self.left_down = false;
                        if self.engine.grabbed_robot.is_some() {
                            self.engine.release_grabbed_robot();
                        } else if !self.pointer_moved {
                            if let Some(gpu) = self.gpu.as_ref() {
                                let w = gpu.surface_config.width.max(1) as f32;
                                let h = gpu.surface_config.height.max(1) as f32;
                                let ndc_x = (self.cursor_pos.0 / w) * 2.0 - 1.0;
                                let ndc_y = 1.0 - (self.cursor_pos.1 / h) * 2.0;
                                if let Some(idx) = self.engine.pick_robot_at_ndc(ndc_x, ndc_y, w / h)
                                {
                                    let id = self.engine.pack.dogs[idx].id;
                                    self.engine.switch_robot(id);
                                }
                            }
                        }
                    }
                    (MouseButton::Right, ElementState::Pressed) => {
                        self.right_down = true;
                        self.last_drag_pos = self.cursor_pos;
                    }
                    (MouseButton::Right, ElementState::Released) => {
                        self.right_down = false;
                    }
                    _ => {}
                }
            }
            WindowEvent::MouseWheel { delta, .. } => {
                if !egui_consumed {
                    let dy = match delta {
                        MouseScrollDelta::LineDelta(_, y) => -y * 24.0,
                        MouseScrollDelta::PixelDelta(p) => -(p.y as f32) * 0.5,
                    };
                    self.pending_zoom_delta += dy;
                }
            }
            WindowEvent::RedrawRequested => {
                self.step_and_render(event_loop);
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        if let Some(gpu) = self.gpu.as_ref() {
            gpu.window.request_redraw();
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (gfx_pref, smoke_frames) = GfxPreference::from_args(&args);
    let event_loop = EventLoop::new().expect("failed to create winit EventLoop");
    event_loop.set_control_flow(ControlFlow::Poll);
    let mut app = AppState::new(gfx_pref, smoke_frames);
    event_loop.run_app(&mut app).expect("event loop failed");
}
