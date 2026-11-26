mod audio_web;
mod hud;
mod net_web;

use audio_web::WebAudioBridge;
use glam::Vec2;
use hud::{HudController, MacroStep};
use js_sys::{Array, Function, Reflect};
use net_web::{fetch_json_get, fetch_json_post, fire_and_forget_post, IncomingNetEvent, NetBridge};
use robochibi_core::{
    AnimId, BrainDecision, BrainUiEvent, CameraMode, EmotionId, InputState, RobotId,
    SimulationEngine, TimeOfDay,
};
use robochibi_render::{RoboRenderer, PIP_HEIGHT, PIP_WIDTH};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{
    Blob, BlobPropertyBag, Document, Element, HtmlCanvasElement, HtmlElement, HtmlInputElement,
    HtmlSelectElement, KeyboardEvent, MouseEvent, PointerEvent, TouchEvent, Url, UrlSearchParams,
    WheelEvent, Window,
};

struct WebAppState {
    win: Window,
    doc: Document,
    canvas: HtmlCanvasElement,
    engine: SimulationEngine,
    input: InputState,
    renderer: RoboRenderer,
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    audio: WebAudioBridge,
    net: NetBridge,
    hud: HudController,
    last_frame_ms: f64,

    // Pointer / drag state
    pointer_down: bool,
    pointer_moved: bool,
    pointer_last: (f32, f32),
    joystick_touch_id: Option<i32>,
    joystick_origin: (f32, f32),

    // PIP async readback state
    pip_staging_buf: wgpu::Buffer,
    pip_in_flight: Rc<RefCell<bool>>,
    pip_ready_rgba: Rc<RefCell<Option<Vec<u8>>>>,
    pip_frame_div: u32,

    // Command catalog state
    latest_memory_doc: Option<Value>,
}

fn read_saved_user(win: &Window) -> (String, String, bool) {
    if let Ok(Some(ls)) = win.local_storage() {
        if let Ok(Some(raw)) = ls.get_item("robochibi_user") {
            if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                let name = v
                    .get("name")
                    .and_then(|x| x.as_str())
                    .unwrap_or("Entrenador")
                    .to_string();
                let avatar = v
                    .get("avatar")
                    .and_then(|x| x.as_str())
                    .unwrap_or("🐾")
                    .to_string();
                return (name, avatar, true);
            }
        }
    }
    ("Entrenador".into(), "🐾".into(), false)
}

fn requested_gfx_preference(win: &Window) -> String {
    if let Ok(search) = win.location().search() {
        if let Ok(params) = UrlSearchParams::new_with_str(&search) {
            if let Some(g) = params.get("gfx") {
                let low = g.to_ascii_lowercase();
                if low == "webgpu" || low == "webgl" {
                    return low;
                }
            }
        }
    }
    if let Ok(Some(ls)) = win.local_storage() {
        if let Ok(Some(saved)) = ls.get_item("robochibi_gfx_backend") {
            let low = saved.to_ascii_lowercase();
            if low == "webgpu" || low == "webgl" {
                return low;
            }
        }
    }
    "webgl".to_string()
}

fn has_navigator_gpu(win: &Window) -> bool {
    Reflect::get(&win.navigator(), &JsValue::from_str("gpu"))
        .map(|v| !v.is_undefined() && !v.is_null())
        .unwrap_or(false)
}

async fn init_wgpu_for_canvas(
    win: &Window,
    canvas: &HtmlCanvasElement,
    width: u32,
    height: u32,
    prefer: &str,
) -> Result<
    (
        wgpu::Device,
        wgpu::Queue,
        wgpu::Surface<'static>,
        wgpu::SurfaceConfiguration,
        &'static str,
    ),
    String,
> {
    let try_backends: Vec<(wgpu::Backends, &'static str)> = if prefer == "webgpu" && has_navigator_gpu(win) {
        vec![
            (wgpu::Backends::BROWSER_WEBGPU, "WebGPU"),
            (wgpu::Backends::GL, "WebGL2"),
        ]
    } else {
        vec![(wgpu::Backends::GL, "WebGL2")]
    };

    let mut last_err = String::from("No compatible Web graphics backend");
    for (backends, label) in try_backends {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let Ok(surface) = instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone())) else {
            last_err = format!("{label}: surface creation failed");
            continue;
        };
        let Ok(adapter) = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
        else {
            last_err = format!("{label}: adapter unavailable");
            continue;
        };

        let limits = if backends == wgpu::Backends::GL {
            wgpu::Limits::downlevel_webgl2_defaults().using_resolution(adapter.limits())
        } else {
            wgpu::Limits::default().using_resolution(adapter.limits())
        };

        let Ok((device, queue)) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("robochibi_web_device"),
                required_features: wgpu::Features::empty(),
                required_limits: limits,
                ..Default::default()
            })
            .await
        else {
            last_err = format!("{label}: device creation failed");
            continue;
        };

        let caps = surface.get_capabilities(&adapter);
        let format = caps
            .formats
            .iter()
            .copied()
            .find(|f| !f.is_srgb())
            .or_else(|| caps.formats.first().copied())
            .unwrap_or(wgpu::TextureFormat::Rgba8Unorm);

        let present_mode = caps
            .present_modes
            .first()
            .copied()
            .unwrap_or(wgpu::PresentMode::AutoVsync);
        let alpha_mode = caps
            .alpha_modes
            .first()
            .copied()
            .unwrap_or(wgpu::CompositeAlphaMode::Auto);

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            color_space: wgpu::SurfaceColorSpace::Auto,
            width: width.max(1),
            height: height.max(1),
            present_mode,
            alpha_mode,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);
        return Ok((device, queue, surface, config, label));
    }

    Err(last_err)
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    wasm_bindgen_futures::spawn_local(async move {
        if let Err(err) = boot_app().await {
            web_sys::console::error_1(&JsValue::from_str(&format!(
                "RoboChibiLand WASM boot error: {err}"
            )));
        }
    });
}

async fn boot_app() -> Result<(), String> {
    let win = web_sys::window().ok_or("Missing window")?;
    let doc = win.document().ok_or("Missing document")?;
    let canvas_el = doc
        .get_element_by_id("world-canvas")
        .ok_or("Missing #world-canvas")?;
    let canvas: HtmlCanvasElement = canvas_el
        .dyn_into()
        .map_err(|_| "#world-canvas is not a canvas")?;

    let dpr = win.device_pixel_ratio().clamp(1.0, 2.0);
    let css_w = canvas.client_width().max(320) as f64;
    let css_h = canvas.client_height().max(240) as f64;
    let px_w = (css_w * dpr).round() as u32;
    let px_h = (css_h * dpr).round() as u32;
    canvas.set_width(px_w);
    canvas.set_height(px_h);

    let prefer = requested_gfx_preference(&win);
    let (device, queue, surface, surface_config, gfx_label) =
        init_wgpu_for_canvas(&win, &canvas, px_w, px_h, &prefer).await?;

    let engine = SimulationEngine::new();
    let renderer = RoboRenderer::new(&device, &queue, surface_config.format, px_w, px_h, &engine);

    let (u_name, u_avatar, has_saved_user) = read_saved_user(&win);
    let mut hud = HudController::new(doc.clone(), gfx_label.to_string());
    hud.load_llm_settings_into_dom();
    hud.set_text("header-user-avatar", &u_avatar);
    hud.set_text("header-user-name", &u_name);
    hud.render_macro_timeline();

    let mut net = NetBridge::new(u_name.clone(), u_avatar.clone());
    net.connect_ws(&win);
    let ev_clone = net.events.clone();
    wasm_bindgen_futures::spawn_local(async move {
        if let Ok(mem) = fetch_json_get("/api/memory").await {
            ev_clone.borrow_mut().push(IncomingNetEvent::MemoryLoaded(mem));
        }
        if let Ok(info) = fetch_json_get("/api/network-info").await {
            let local_url = info
                .get("localUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("http://localhost:3000")
                .to_string();
            let tunnel_url = info
                .get("tunnelUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            ev_clone
                .borrow_mut()
                .push(IncomingNetEvent::NetworkInfo { local_url, tunnel_url });
        }
    });

    if !has_saved_user {
        hud.set_visible("modal-login", true);
    }

    let pip_staging_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("pip_staging_readback"),
        size: (PIP_WIDTH * 4 * PIP_HEIGHT) as u64,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let now_ms = win.performance().map(|p| p.now()).unwrap_or(0.0);

    let state = Rc::new(RefCell::new(WebAppState {
        win: win.clone(),
        doc: doc.clone(),
        canvas,
        engine,
        input: InputState::default(),
        renderer,
        device,
        queue,
        surface,
        surface_config,
        audio: WebAudioBridge::new(),
        net,
        hud,
        last_frame_ms: now_ms,
        pointer_down: false,
        pointer_moved: false,
        pointer_last: (0.0, 0.0),
        joystick_touch_id: None,
        joystick_origin: (0.0, 0.0),
        pip_staging_buf,
        pip_in_flight: Rc::new(RefCell::new(false)),
        pip_ready_rgba: Rc::new(RefCell::new(None)),
        pip_frame_div: 0,
        latest_memory_doc: None,
    }));

    wire_all_events(&state);

    {
        let st = state.borrow();
        st.hud.show_toast(&format!("🚀 Motor 3D Rust activo ({gfx_label})"));
        st.hud.set_visible("loading-screen", false);
    }

    start_raf_loop(state);
    Ok(())
}

fn start_raf_loop(state: Rc<RefCell<WebAppState>>) {
    let raf_holder: Rc<RefCell<Option<Closure<dyn FnMut(f64)>>>> = Rc::new(RefCell::new(None));
    let raf_clone = raf_holder.clone();

    *raf_holder.borrow_mut() = Some(Closure::wrap(Box::new(move |now_ms: f64| {
        {
            let mut st = state.borrow_mut();
            let raw_dt = ((now_ms - st.last_frame_ms) * 0.001) as f32;
            st.last_frame_ms = now_ms;
            let dt = if raw_dt.is_finite() {
                raw_dt.clamp(0.001, 0.05)
            } else {
                0.016
            };

            // Resize check
            let dpr = st.win.device_pixel_ratio().clamp(1.0, 2.0);
            let css_w = st.canvas.client_width().max(1);
            let css_h = st.canvas.client_height().max(1);
            let target_w = ((css_w as f64) * dpr).round().max(1.0) as u32;
            let target_h = ((css_h as f64) * dpr).round().max(1.0) as u32;
            if target_w != st.surface_config.width || target_h != st.surface_config.height {
                st.canvas.set_width(target_w);
                st.canvas.set_height(target_h);
                st.surface_config.width = target_w;
                st.surface_config.height = target_h;
                let sfc = st.surface_config.clone();
                let WebAppState {
                    ref device,
                    ref surface,
                    ref mut renderer,
                    ..
                } = *st;
                surface.configure(device, &sfc);
                renderer.resize(device, target_w, target_h);
            }

            // Step simulation
            let inp = st.input.clone();
            st.engine.step(dt, &inp);
            st.input.orbit_delta = Vec2::ZERO;
            st.input.zoom_delta = 0.0;

            // Update Audio Synth
            let cam_fwd = (st.engine.cam_target - st.engine.cam_pos).normalize_or_zero();
            let cam_right = cam_fwd.cross(glam::Vec3::Y).normalize_or_zero();
            let cam_pos = st.engine.cam_pos;
            let tod = st.engine.time_of_day;
            let weather = st.engine.weather;
            let events: Vec<_> = st.engine.audio_events.drain(..).collect();
            {
                let mut synth = st.audio.synth.borrow_mut();
                synth.update_environment(cam_pos, tod, weather);
                for ev in events {
                    synth.emit_3d(ev, cam_pos, cam_right);
                }
            }

            // Drain Brain UI events
            let ui_events: Vec<_> = st.engine.brain.ui_events.drain(..).collect();
            for uev in ui_events {
                match uev {
                    BrainUiEvent::ThoughtUpdated { robot_name, thought } => {
                        st.hud.show_thought(&robot_name, &thought);
                    }
                    BrainUiEvent::ChatResponse {
                        robot_name,
                        thought,
                        action: _,
                    } => {
                        st.hud.push_chat(
                            "robot",
                            format!("🐶 {robot_name}"),
                            robot_name,
                            thought,
                        );
                    }
                    BrainUiEvent::JournalEntry {
                        author,
                        emotion,
                        thought,
                    } => {
                        let line = format!("[{author}] {thought}");
                        st.hud.recent_memories.insert(0, line.clone());
                        if st.hud.recent_memories.len() > 8 {
                            st.hud.recent_memories.truncate(8);
                        }
                        fire_and_forget_post(
                            "/api/memory/journal".into(),
                            json!({ "emotion": emotion, "thought": line }),
                        );
                    }
                    BrainUiEvent::LearnedTrick {
                        name,
                        description,
                        sequence,
                        created_by,
                    } => {
                        st.hud.show_toast(&format!("✨ Nuevo truco aprendido: {name}"));
                        let ev_bus = st.net.events.clone();
                        wasm_bindgen_futures::spawn_local(async move {
                            let _ = fetch_json_post(
                                "/api/memory/trick",
                                &json!({
                                    "name": name,
                                    "description": description,
                                    "sequence": sequence,
                                    "created_by": created_by,
                                }),
                            )
                            .await;
                            if let Ok(mem) = fetch_json_get("/api/memory").await {
                                ev_bus.borrow_mut().push(IncomingNetEvent::MemoryLoaded(mem));
                            }
                        });
                    }
                    BrainUiEvent::SpeakThought { thought, pitch } => {
                        st.audio.speak_es(&thought, pitch);
                    }
                }
            }

            // Autothink background timer
            if st.hud.autothink_enabled && !st.hud.ai_thinking {
                st.hud.autothink_timer += dt;
                if st.hud.autothink_timer >= st.hud.autothink_interval_s {
                    st.hud.autothink_timer = 0.0;
                    drop(st);
                    trigger_ai_cycle(state.clone(), None);
                }
            }
        }

        // Network events + HUD sync + GPU render
        {
            let mut st = state.borrow_mut();
            let net_events: Vec<_> = st.net.events.borrow_mut().drain(..).collect();
            for nev in net_events {
                match nev {
                    IncomingNetEvent::WsConnected => {
                        st.hud.set_text("think-status", "En Línea");
                    }
                    IncomingNetEvent::JoinAck { user_id, users } => {
                        st.net.user_id = Some(user_id);
                        st.net.online_users = users;
                        let uid = st.net.user_id.clone();
                        let uname = st.net.user_name.clone();
                        st.hud.sync_online_users(&st.net.online_users, uid.as_deref(), &uname);
                    }
                    IncomingNetEvent::UserJoined { user, count: _ } => {
                        st.hud.show_toast(&format!("👋 {} se unió a la manada", user.name));
                        st.net.online_users.retain(|x| x.id != user.id);
                        st.net.online_users.push(user);
                        let uid = st.net.user_id.clone();
                        let uname = st.net.user_name.clone();
                        st.hud.sync_online_users(&st.net.online_users, uid.as_deref(), &uname);
                    }
                    IncomingNetEvent::UserLeft { user_id, count: _ } => {
                        st.net.online_users.retain(|x| x.id != user_id);
                        let uid = st.net.user_id.clone();
                        let uname = st.net.user_name.clone();
                        st.hud.sync_online_users(&st.net.online_users, uid.as_deref(), &uname);
                    }
                    IncomingNetEvent::ChatCommand {
                        user_name,
                        user_color: _,
                        text,
                    } => {
                        st.hud.push_chat("network", format!("🌐 {user_name}"), String::new(), text.clone());
                        let dec = st.engine.handle_user_command_immediate(&text);
                        let active_name = st.engine.pack.player().id.name().to_string();
                        st.hud.show_thought(&active_name, &dec.thought);
                    }
                    IncomingNetEvent::RobotAction {
                        user_name,
                        action,
                        emotion,
                        target_robot,
                    } => {
                        if let Some(tr) = target_robot.as_deref().and_then(RobotId::from_name) {
                            st.engine.switch_robot(tr);
                        }
                        if let Some(em) = emotion.as_deref().and_then(EmotionId::from_str_loose) {
                            st.engine.set_player_emotion(em);
                        }
                        if let Some(act) = action.as_deref() {
                            let WebAppState { ref mut engine, .. } = *st;
                            engine.brain.execute_action(
                                act,
                                &mut engine.pack,
                                &mut engine.world,
                                &mut engine.particles,
                                &mut engine.audio_events,
                            );
                        }
                        st.hud.show_toast(&format!("🌐 {user_name} activó acción remota"));
                    }
                    IncomingNetEvent::BallThrow { user_name } => {
                        st.engine.throw_fetch_ball();
                        st.hud.show_toast(&format!("🎾 {user_name} lanzó la pelota"));
                    }
                    IncomingNetEvent::TunnelUrl(url) => {
                        if let Some(inp) = st.hud.el("share-tunnel-url").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                            inp.set_value(&url);
                        }
                    }
                    IncomingNetEvent::NetworkInfo { local_url, tunnel_url } => {
                        if let Some(inp) = st.hud.el("share-lan-url").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                            inp.set_value(&local_url);
                        }
                        if let Some(t) = tunnel_url {
                            if let Some(inp) = st.hud.el("share-tunnel-url").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                                inp.set_value(&t);
                            }
                        }
                    }
                    IncomingNetEvent::MemoryLoaded(mem) => {
                        st.hud.update_memory_viewer(&mem);
                        st.latest_memory_doc = Some(mem);
                    }
                    IncomingNetEvent::LlmReply {
                        raw_content,
                        model,
                        ping_ms,
                        user_cmd,
                    } => {
                        st.hud.ai_thinking = false;
                        st.hud.set_text("think-status", "Listo");
                        st.hud.api_calls += 1;
                        st.hud.set_text("hud-ai-ping", &format!("IA: {ping_ms}ms"));
                        st.hud.set_text("t-val-ping", &format!("{ping_ms} ms"));
                        st.hud.set_text("t-val-calls", &st.hud.api_calls.to_string());
                        st.hud.set_text(
                            "llm-inspector-log",
                            &format!("[{ping_ms}ms | {model}]\n{raw_content}"),
                        );

                        let active_id = st.engine.pack.player().id;
                        let mut dec: BrainDecision = st.engine.brain.parse_llm_response(
                            &raw_content,
                            active_id,
                            user_cmd.as_deref(),
                        );
                        if dec.thought.is_empty() {
                            dec.thought = "¡Guau!".into();
                        }
                        let already = if user_cmd.is_some() {
                            Some(dec.action.as_str())
                        } else {
                            None
                        };
                        let WebAppState { ref mut engine, .. } = *st;
                        engine.brain.apply_decision(
                            &dec,
                            already,
                            &mut engine.pack,
                            &mut engine.world,
                            &mut engine.particles,
                            &mut engine.audio_events,
                        );
                    }
                    IncomingNetEvent::LlmError { err_msg, user_cmd } => {
                        st.hud.ai_thinking = false;
                        st.hud.set_text("think-status", "Local");
                        st.hud.set_text("hud-ai-ping", "IA: LOCAL");
                        st.hud.set_text("llm-inspector-log", &format!("Fallback heurístico ({err_msg})"));
                        if user_cmd.is_none() {
                            let active_id = st.engine.pack.player().id;
                            let dec = st.engine.brain.heuristic_decision(active_id, None);
                            let WebAppState { ref mut engine, .. } = *st;
                            engine.brain.apply_decision(
                                &dec,
                                None,
                                &mut engine.pack,
                                &mut engine.world,
                                &mut engine.particles,
                                &mut engine.audio_events,
                            );
                        }
                    }
                    IncomingNetEvent::LlmPingResult { ok, ms, detail } => {
                        let ping_txt = if ok {
                            format!("IA: {ms}ms")
                        } else {
                            "IA: OFFLINE".to_string()
                        };
                        st.hud.set_text("hud-ai-ping", &ping_txt);
                        st.hud.set_text("t-val-ping", &format!("{ms} ms"));
                        st.hud.set_text("api-test-status", &detail);
                        st.hud.set_text("llm-inspector-log", &detail);
                        st.hud.show_toast(&detail);
                    }
                }
            }

            // Deliver any completed Eye PIP frame
            if let Some(rgba) = st.pip_ready_rgba.borrow_mut().take() {
                st.hud.blit_pip_rgba(&rgba);
            }

            // Sync HUD from Engine
            let css_w = st.canvas.client_width().max(1) as f32;
            let css_h = st.canvas.client_height().max(1) as f32;
            {
                let WebAppState {
                    ref mut hud,
                    ref engine,
                    last_frame_ms,
                    ..
                } = *st;
                hud.sync_from_engine(engine, 0.016, last_frame_ms, css_w, css_h);
            }

            // Render 3D scene via wgpu (WebGL2 or WebGPU)
            let render_pip = st.hud.pip_enabled;
            let frame_opt = match st.surface.get_current_texture() {
                wgpu::CurrentSurfaceTexture::Success(f)
                | wgpu::CurrentSurfaceTexture::Suboptimal(f) => Some(f),
                wgpu::CurrentSurfaceTexture::Lost | wgpu::CurrentSurfaceTexture::Outdated => {
                    let sfc = st.surface_config.clone();
                    st.surface.configure(&st.device, &sfc);
                    None
                }
                _ => None,
            };

            if let Some(frame) = frame_opt {
                let target_view = frame
                    .texture
                    .create_view(&wgpu::TextureViewDescriptor::default());
                let mut encoder =
                    st.device
                        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                            label: Some("web_frame_encoder"),
                        });

                {
                    let WebAppState {
                        ref mut renderer,
                        ref device,
                        ref queue,
                        ref engine,
                        ..
                    } = *st;
                    renderer.render(device, queue, &mut encoder, &target_view, engine, render_pip);
                }

                // Schedule Eye PIP readback every 3 frames when visible & idle
                st.pip_frame_div = st.pip_frame_div.wrapping_add(1);
                let trigger_pip_copy = render_pip
                    && (st.pip_frame_div % 3 == 0)
                    && !*st.pip_in_flight.borrow();

                if trigger_pip_copy {
                    encoder.copy_texture_to_buffer(
                        wgpu::TexelCopyTextureInfo {
                            texture: st.renderer.pip_texture(),
                            mip_level: 0,
                            origin: wgpu::Origin3d::ZERO,
                            aspect: wgpu::TextureAspect::All,
                        },
                        wgpu::TexelCopyBufferInfo {
                            buffer: &st.pip_staging_buf,
                            layout: wgpu::TexelCopyBufferLayout {
                                offset: 0,
                                bytes_per_row: Some(PIP_WIDTH * 4),
                                rows_per_image: Some(PIP_HEIGHT),
                            },
                        },
                        wgpu::Extent3d {
                            width: PIP_WIDTH,
                            height: PIP_HEIGHT,
                            depth_or_array_layers: 1,
                        },
                    );
                }

                st.queue.submit(Some(encoder.finish()));
                st.queue.present(frame);

                if trigger_pip_copy {
                    *st.pip_in_flight.borrow_mut() = true;
                    let buf_clone = st.pip_staging_buf.clone();
                    let in_flight = st.pip_in_flight.clone();
                    let out_rgba = st.pip_ready_rgba.clone();
                    st.pip_staging_buf
                        .slice(..)
                        .map_async(wgpu::MapMode::Read, move |res| {
                            if res.is_ok() {
                                if let Ok(view) = buf_clone.slice(..).get_mapped_range() {
                                    *out_rgba.borrow_mut() = Some(view.to_vec());
                                }
                                buf_clone.unmap();
                            }
                            *in_flight.borrow_mut() = false;
                        });
                }

                let _ = st.device.poll(wgpu::PollType::Poll);
            }
        }

        if let Some(win) = web_sys::window() {
            if let Some(cb) = raf_clone.borrow().as_ref() {
                let _ = win.request_animation_frame(cb.as_ref().unchecked_ref());
            }
        }
    }) as Box<dyn FnMut(f64)>));

    if let Some(win) = web_sys::window() {
        if let Some(cb) = raf_holder.borrow().as_ref() {
            let _ = win.request_animation_frame(cb.as_ref().unchecked_ref());
        }
    }
}

fn trigger_ai_cycle(state: Rc<RefCell<WebAppState>>, user_cmd: Option<String>) {
    let (ep, key, model, sys_p, _iv) = {
        let mut st = state.borrow_mut();
        if st.hud.ai_thinking {
            return;
        }
        st.hud.ai_thinking = true;
        st.hud.set_text("think-status", "Pensando...");
        st.hud.read_llm_settings()
    };

    let (system_prompt, user_json, ev_bus, perf_now) = {
        let st = state.borrow();
        let dog = st.engine.pack.player();
        let sensory = st.engine.brain.build_sensory_context_json(
            &st.engine.pack,
            &st.engine.world,
            &st.engine.vision,
            &st.hud.recent_memories,
            user_cmd.as_deref(),
        );
        let drives_str = sensory["canine_drives"].to_string();
        let sys_msg =
            robochibi_core::RobotBrain::build_system_prompt(dog.id, &sys_p, &drives_str);
        let perf = st.win.performance().map(|p| p.now()).unwrap_or(0.0);
        (sys_msg, sensory.to_string(), st.net.events.clone(), perf)
    };

    wasm_bindgen_futures::spawn_local(async move {
        let body = json!({
            "endpoint": ep,
            "apiKey": key,
            "model": model,
            "temperature": 0.82,
            "max_tokens": 140,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_json }
            ]
        });

        let t0 = perf_now;
        match fetch_json_post("/api/llm/proxy", &body).await {
            Ok((status, data)) if (200..300).contains(&status) => {
                let now = web_sys::window()
                    .and_then(|w| w.performance())
                    .map(|p| p.now())
                    .unwrap_or(t0 + 50.0);
                let ping_ms = (now - t0).max(1.0).round() as u32;
                let content = data
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c0| c0.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let mdl = data
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("auto")
                    .to_string();
                ev_bus.borrow_mut().push(IncomingNetEvent::LlmReply {
                    raw_content: content,
                    model: mdl,
                    ping_ms,
                    user_cmd,
                });
            }
            Ok((status, data)) => {
                let err_txt = data
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Error HTTP");
                ev_bus.borrow_mut().push(IncomingNetEvent::LlmError {
                    err_msg: format!("HTTP {status}: {err_txt}"),
                    user_cmd,
                });
            }
            Err(e) => {
                ev_bus.borrow_mut().push(IncomingNetEvent::LlmError {
                    err_msg: e,
                    user_cmd,
                });
            }
        }
    });
}

fn dispatch_user_chat_or_cmd(state: &Rc<RefCell<WebAppState>>, raw: &str, from_voice: bool) {
    let text = raw.trim();
    if text.is_empty() {
        return;
    }
    let dec = {
        let mut st = state.borrow_mut();
        st.audio.ensure_started();
        let author_lbl = format!(
            "{} {}",
            st.net.user_avatar,
            if from_voice { "🎙️ Tú" } else { "Tú" }
        );
        st.hud.push_chat("user", author_lbl, String::new(), text.to_string());
        let dec = st.engine.handle_user_command_immediate(text);
        let active_name = st.engine.pack.player().id.name().to_string();
        st.hud.show_thought(&active_name, &dec.thought);
        st.net.send_chat(text);
        dec
    };
    let _ = dec;
    trigger_ai_cycle(state.clone(), Some(text.to_string()));
}

fn add_listener<F, E>(target: &web_sys::EventTarget, name: &str, mut f: F)
where
    F: FnMut(E) + 'static,
    E: JsCast + 'static,
{
    let cb = Closure::wrap(Box::new(move |ev: web_sys::Event| {
        if let Ok(typed) = ev.dyn_into::<E>() {
            f(typed);
        }
    }) as Box<dyn FnMut(web_sys::Event)>);
    let _ = target.add_event_listener_with_callback(name, cb.as_ref().unchecked_ref());
    cb.forget();
}

fn click_btn(doc: &Document, id: &str, mut f: impl FnMut() + 'static) {
    if let Some(el) = doc.get_element_by_id(id) {
        add_listener(&el, "click", move |_: MouseEvent| f());
    }
}

fn exec_btn_action(state: &Rc<RefCell<WebAppState>>, id: &str) {
    let mut st = state.borrow_mut();
    st.audio.ensure_started();

    if let Some(emo) = HudController::emotion_btn_id_to_enum(id) {
        st.engine.set_player_emotion(emo);
        st.net.send_robot_action(None, Some(emo.meta().id_str), None);
        return;
    }

    if let Some(anim_name) = id.strip_prefix("btn-anim-") {
        if let Some(anim) = AnimId::from_str(anim_name) {
            let idx = st.engine.pack.active_idx;
            let dur = if matches!(anim, AnimId::Walk | AnimId::Run | AnimId::Sneak) {
                2.8
            } else if matches!(anim, AnimId::Sit | AnimId::LieDown | AnimId::Dance | AnimId::Recharge) {
                0.0
            } else {
                2.2
            };
            let WebAppState { ref mut engine, .. } = *st;
            engine.pack.anims[idx].play(anim, dur, &mut engine.pack.dogs[idx]);
            if anim == AnimId::Bark {
                engine.audio_events.push(robochibi_core::AudioEvent {
                    kind: robochibi_core::AudioKind::Bark,
                    world_pos: engine.pack.dogs[idx].position,
                    pitch: engine.pack.dogs[idx].profile().voice_pitch,
                });
            } else if anim == AnimId::Howl {
                engine.audio_events.push(robochibi_core::AudioEvent {
                    kind: robochibi_core::AudioKind::Howl,
                    world_pos: engine.pack.dogs[idx].position,
                    pitch: engine.pack.dogs[idx].profile().voice_pitch,
                });
            }
            st.net.send_robot_action(Some(anim_name), None, None);
            return;
        }
    }

    let action_key: Option<&str> = match id {
        "btn-throw-fetch" | "quick-bar-fetch" => {
            st.engine.throw_fetch_ball();
            st.net.send_ball_throw();
            None
        }
        "btn-spawn-snack" | "quick-bar-snack" => {
            st.engine.spawn_snack_in_front();
            None
        }
        "btn-pet-robot" | "quick-bar-pet" => {
            st.engine.pet_player();
            None
        }
        "btn-praise-dog" => Some("praise_burst"),
        "btn-slalom-rings" => Some("slalom_rings"),
        "btn-lake-swim" => Some("swim_lake"),
        "btn-dig-treasure" => Some("dig_treasure"),
        "btn-speed-race" => Some("speed_race"),
        "btn-call-pack" => Some("call_pack"),
        "btn-drink-water" => Some("go_fountain"),
        "btn-trigger-disco" => {
            let WebAppState { ref mut engine, .. } = *st;
            engine.world.trigger_disco_party(&mut engine.audio_events);
            st.hud.show_toast("🪩 ¡Fiesta Disco CyberCore activada!");
            Some("go_disco")
        }
        "btn-hand-tool" | "pill-toggle-hand" | "quick-bar-hand" => {
            st.engine.is_hand_tool_active = !st.engine.is_hand_tool_active;
            if !st.engine.is_hand_tool_active {
                st.engine.release_grabbed_robot();
            }
            st.hud.show_toast(if st.engine.is_hand_tool_active {
                "✋ Mano 3D ACTIVADA: Haz clic en cualquier perrito y arrástralo"
            } else {
                "✋ Mano 3D desactivada"
            });
            None
        }
        "btn-toggle-freewill" => {
            st.engine.is_free_will = !st.engine.is_free_will;
            st.hud.show_toast(if st.engine.is_free_will {
                "🐾 Modo Libre Albedrío: ACTIVADO"
            } else {
                "🐾 Modo Libre Albedrío: APAGADO"
            });
            None
        }
        _ => None,
    };

    if let Some(act) = action_key {
        let WebAppState { ref mut engine, .. } = *st;
        engine.brain.execute_action(
            act,
            &mut engine.pack,
            &mut engine.world,
            &mut engine.particles,
            &mut engine.audio_events,
        );
        st.net.send_robot_action(Some(act), None, None);
    }
}

fn switch_camera(state: &Rc<RefCell<WebAppState>>, mode: CameraMode) {
    let mut st = state.borrow_mut();
    st.engine.camera_mode = mode;
    let label = match mode {
        CameraMode::Diagonal => "📐 Diagonal",
        CameraMode::Follow => "🎥 Seguir",
        CameraMode::Orbit => "🌐 Órbita",
        CameraMode::Free => "🛸 Libre (WASD)",
        CameraMode::Eye => "👁️ Ojos del Robot",
        CameraMode::Drone => "🚁 Dron Orbital",
    };
    st.hud.show_toast(&format!("📷 Cámara: {label}"));
}

fn wire_all_events(state: &Rc<RefCell<WebAppState>>) {
    let doc = state.borrow().doc.clone();
    let win = state.borrow().win.clone();
    let canvas = state.borrow().canvas.clone();

    // 1. Canvas Pointer & Wheel Events (Orbit, Zoom, Raycast Click Switch, Hand Grab Drag)
    {
        let s = state.clone();
        add_listener(&canvas, "pointerdown", move |ev: PointerEvent| {
            let mut st = s.borrow_mut();
            st.audio.ensure_started();
            st.pointer_down = true;
            st.pointer_moved = false;
            st.pointer_last = (ev.client_x() as f32, ev.client_y() as f32);

            let rect = st.canvas.get_bounding_client_rect();
            let w = rect.width().max(1.0) as f32;
            let h = rect.height().max(1.0) as f32;
            let ndc_x = ((ev.client_x() as f32 - rect.left() as f32) / w) * 2.0 - 1.0;
            let ndc_y = 1.0 - ((ev.client_y() as f32 - rect.top() as f32) / h) * 2.0;

            if st.engine.is_hand_tool_active {
                if let Some(idx) = st.engine.pick_robot_at_ndc(ndc_x, ndc_y, w / h) {
                    st.engine.grab_robot(idx);
                    let _ = st.canvas.set_pointer_capture(ev.pointer_id());
                }
            }
        });
    }
    {
        let s = state.clone();
        add_listener(&canvas, "pointermove", move |ev: PointerEvent| {
            let mut st = s.borrow_mut();
            if !st.pointer_down {
                return;
            }
            let x = ev.client_x() as f32;
            let y = ev.client_y() as f32;
            let dx = x - st.pointer_last.0;
            let dy = y - st.pointer_last.1;
            st.pointer_last = (x, y);
            if dx.hypot(dy) > 2.5 {
                st.pointer_moved = true;
            }
            if st.engine.grabbed_robot.is_some() {
                let rect = st.canvas.get_bounding_client_rect();
                let w = rect.width().max(1.0) as f32;
                let h = rect.height().max(1.0) as f32;
                let ndc_x = ((x - rect.left() as f32) / w) * 2.0 - 1.0;
                let ndc_y = 1.0 - ((y - rect.top() as f32) / h) * 2.0;
                st.engine.drag_grabbed_robot_ndc(ndc_x, ndc_y, w / h);
            } else {
                st.input.orbit_delta.x -= dx * 0.0065;
                st.input.orbit_delta.y += dy * 0.0055;
            }
        });
    }
    {
        let s = state.clone();
        add_listener(&canvas, "pointerup", move |ev: PointerEvent| {
            let mut st = s.borrow_mut();
            let was_moved = st.pointer_moved;
            let was_grabbed = st.engine.grabbed_robot.is_some();
            st.pointer_down = false;
            if was_grabbed {
                st.engine.release_grabbed_robot();
                let _ = st.canvas.release_pointer_capture(ev.pointer_id());
                return;
            }
            if !was_moved {
                let rect = st.canvas.get_bounding_client_rect();
                let w = rect.width().max(1.0) as f32;
                let h = rect.height().max(1.0) as f32;
                let ndc_x = ((ev.client_x() as f32 - rect.left() as f32) / w) * 2.0 - 1.0;
                let ndc_y = 1.0 - ((ev.client_y() as f32 - rect.top() as f32) / h) * 2.0;
                if let Some(idx) = st.engine.pick_robot_at_ndc(ndc_x, ndc_y, w / h) {
                    let id = st.engine.pack.dogs[idx].id;
                    if st.engine.switch_robot(id) {
                        st.hud.show_toast(&format!("🐾 Controlando ahora a {}", id.name()));
                    }
                }
            }
        });
    }
    {
        let s = state.clone();
        add_listener(&canvas, "wheel", move |ev: WheelEvent| {
            ev.prevent_default();
            let mut st = s.borrow_mut();
            st.input.zoom_delta += (ev.delta_y() as f32) * 0.02;
        });
    }
    add_listener(&canvas, "contextmenu", |ev: MouseEvent| ev.prevent_default());

    // 2. Global Keyboard Controls & Hotkeys
    {
        let s = state.clone();
        add_listener(&win, "keydown", move |ev: KeyboardEvent| {
            let mut st = s.borrow_mut();
            st.audio.ensure_started();

            let key_low = ev.key().to_ascii_lowercase();
            // Ctrl+K -> Command Palette
            if (ev.ctrl_key() || ev.meta_key()) && key_low == "k" {
                ev.prevent_default();
                let is_hidden = st
                    .hud
                    .el("modal-cmd-palette")
                    .map(|e| e.class_list().contains("hidden"))
                    .unwrap_or(true);
                st.hud.set_visible("modal-cmd-palette", is_hidden);
                if is_hidden {
                    render_cmd_palette(&s, &st.hud, "");
                    if let Some(inp) = st.hud.el("cmd-palette-input").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                        inp.set_value("");
                        let _ = inp.focus();
                    }
                }
                return;
            }
            if key_low == "escape" {
                for modal_id in [
                    "modal-cmd-palette",
                    "modal-settings",
                    "modal-memory",
                    "modal-share",
                    "modal-game-menu",
                    "robot-switcher-strip",
                ] {
                    st.hud.set_visible(modal_id, false);
                }
                return;
            }

            // Ignore movement/action hotkeys while typing inside inputs
            if let Some(active_el) = st.doc.active_element() {
                let tag = active_el.tag_name().to_ascii_uppercase();
                if tag == "INPUT" || tag == "TEXTAREA" || tag == "SELECT" {
                    return;
                }
            }

            match key_low.as_str() {
                "w" | "arrowup" => st.input.forward = true,
                "s" | "arrowdown" => st.input.backward = true,
                "a" | "arrowleft" => st.input.left = true,
                "d" | "arrowright" => st.input.right = true,
                "q" | "e" => st.input.up = true,
                "c" => st.input.down = true,
                "shift" => st.input.shift = true,
                " " => {
                    ev.prevent_default();
                    st.engine.trigger_player_jump(6.6);
                }
                "tab" => {
                    ev.prevent_default();
                    let next_idx = (st.engine.pack.active_idx + 1) % 5;
                    let id = st.engine.pack.dogs[next_idx].id;
                    if st.engine.switch_robot(id) {
                        st.hud.show_toast(&format!("🐾 Controlando a {}", id.name()));
                    }
                }
                "b" => {
                    let idx = st.engine.pack.active_idx;
                    let WebAppState { ref mut engine, .. } = *st;
                    engine.pack.anims[idx].play(AnimId::Bark, 1.5, &mut engine.pack.dogs[idx]);
                    engine.audio_events.push(robochibi_core::AudioEvent {
                        kind: robochibi_core::AudioKind::Bark,
                        world_pos: engine.pack.dogs[idx].position,
                        pitch: engine.pack.dogs[idx].profile().voice_pitch,
                    });
                    st.net.send_robot_action(Some("bark"), None, None);
                }
                "f" => {
                    let idx = st.engine.pack.active_idx;
                    let WebAppState { ref mut engine, .. } = *st;
                    engine.pack.anims[idx].play(AnimId::Backflip, 1.6, &mut engine.pack.dogs[idx]);
                    engine.trigger_player_jump(6.2);
                    st.net.send_robot_action(Some("backflip"), None, None);
                }
                "g" => {
                    st.engine.throw_fetch_ball();
                    st.net.send_ball_throw();
                }
                "p" => st.engine.pet_player(),
                "h" => {
                    st.hud.zen_mode = !st.hud.zen_mode;
                    st.hud.set_visible("hud-overlay", !st.hud.zen_mode);
                    st.hud.set_visible("btn-exit-zen", st.hud.zen_mode);
                }
                _ => {}
            }
        });
    }
    {
        let s = state.clone();
        add_listener(&win, "keyup", move |ev: KeyboardEvent| {
            let mut st = s.borrow_mut();
            match ev.key().to_ascii_lowercase().as_str() {
                "w" | "arrowup" => st.input.forward = false,
                "s" | "arrowdown" => st.input.backward = false,
                "a" | "arrowleft" => st.input.left = false,
                "d" | "arrowright" => st.input.right = false,
                "q" | "e" => st.input.up = false,
                "c" => st.input.down = false,
                "shift" => st.input.shift = false,
                _ => {}
            }
        });
    }

    // 3. Pet Switcher Cards
    {
        let s = state.clone();
        click_btn(&doc, "btn-open-pet-switcher", move || {
            let st = s.borrow();
            let hidden = st
                .hud
                .el("robot-switcher-strip")
                .map(|e| e.class_list().contains("hidden"))
                .unwrap_or(true);
            st.hud.set_visible("robot-switcher-strip", hidden);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-switcher", move || {
            s.borrow().hud.set_visible("robot-switcher-strip", false);
        });
    }
    if let Ok(cards) = doc.query_selector_all(".robo-switch-card") {
        for i in 0..cards.length() {
            if let Some(node) = cards.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    let s = state.clone();
                    let name_attr = el.get_attribute("data-robot").unwrap_or_default();
                    add_listener(&el, "click", move |_: MouseEvent| {
                        let mut st = s.borrow_mut();
                        st.audio.ensure_started();
                        if let Some(id) = RobotId::from_name(&name_attr) {
                            st.engine.switch_robot(id);
                            st.hud.set_visible("robot-switcher-strip", false);
                            st.hud.show_toast(&format!("🐾 Controlando ahora a {}", id.name()));
                        }
                    });
                }
            }
        }
    }

    // 4. Time, Weather, Optical Shader & Graphics Mode (WebGL2 <-> WebGPU)
    for (btn_id, tod) in [
        ("btn-time-day", TimeOfDay::Day),
        ("btn-time-sunset", TimeOfDay::Sunset),
        ("btn-time-night", TimeOfDay::Night),
    ] {
        let s = state.clone();
        click_btn(&doc, btn_id, move || {
            let mut st = s.borrow_mut();
            st.engine.set_time_of_day(tod);
            st.hud.set_active_class("btn-time-day", tod == TimeOfDay::Day);
            st.hud.set_active_class("btn-time-sunset", tod == TimeOfDay::Sunset);
            st.hud.set_active_class("btn-time-night", tod == TimeOfDay::Night);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-cycle-weather", move || {
            let mut st = s.borrow_mut();
            let next = st.engine.weather.cycle_next();
            st.engine.set_weather(next);
            st.hud.show_toast(next.toast_es());
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-cycle-vision", move || {
            let mut st = s.borrow_mut();
            let next = st.engine.optical_filter.cycle_next();
            st.engine.optical_filter = next;
            st.hud.show_toast(next.toast_es());
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-cycle-gfx", move || {
            let st = s.borrow();
            let next = if st.hud.active_backend_label == "WebGPU" {
                "webgl"
            } else {
                "webgpu"
            };
            if let Some(ls) = st.hud.local_storage() {
                let _ = ls.set_item("robochibi_gfx_backend", next);
            }
            st.hud.show_toast(&format!(
                "🔄 Cambiando backend gráfico a {}...",
                next.to_ascii_uppercase()
            ));
            let _ = st.win.location().set_search(&format!("?gfx={next}"));
        });
    }

    // 5. Camera Controls (Pill Cycle + Desktop Hook Buttons)
    {
        let s = state.clone();
        click_btn(&doc, "btn-cam-cycle", move || {
            let next = s.borrow().engine.camera_mode.cycle_next();
            switch_camera(&s, next);
        });
    }
    for (btn_id, mode) in [
        ("btn-cam-diagonal", CameraMode::Diagonal),
        ("btn-cam-follow", CameraMode::Follow),
        ("btn-cam-orbit", CameraMode::Orbit),
        ("btn-cam-free", CameraMode::Free),
        ("btn-cam-eye", CameraMode::Eye),
        ("btn-cam-drone", CameraMode::Drone),
    ] {
        let s = state.clone();
        click_btn(&doc, btn_id, move || switch_camera(&s, mode));
    }

    // 6. Side Dock Toggles, Minimap & PIP & Audio & Zen & Fullscreen
    {
        let s = state.clone();
        click_btn(&doc, "btn-toggle-sfx", move || {
            let mut st = s.borrow_mut();
            let unmuted = st.audio.toggle_mute();
            st.hud.set_text("btn-toggle-sfx", if unmuted { "🔊" } else { "🔇" });
            st.hud.show_toast(if unmuted {
                "🔊 Sintetizador DSP Rust ACTIVADO"
            } else {
                "🔇 Audio silenciado"
            });
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-toggle-fullscreen", move || {
            let st = s.borrow();
            if st.doc.fullscreen_element().is_some() {
                st.doc.exit_fullscreen();
            } else if let Some(el) = st.doc.document_element() {
                let _ = el.request_fullscreen();
            }
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "menu-btn-fullscreen", move || {
            let st = s.borrow();
            st.hud.set_visible("modal-game-menu", false);
            if st.doc.fullscreen_element().is_some() {
                st.doc.exit_fullscreen();
            } else if let Some(el) = st.doc.document_element() {
                let _ = el.request_fullscreen();
            }
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-exit-zen", move || {
            let mut st = s.borrow_mut();
            st.hud.zen_mode = false;
            st.hud.set_visible("hud-overlay", true);
            st.hud.set_visible("btn-exit-zen", false);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-toggle-zen", move || {
            let mut st = s.borrow_mut();
            st.hud.zen_mode = !st.hud.zen_mode;
            st.hud.set_visible("hud-overlay", !st.hud.zen_mode);
            st.hud.set_visible("btn-exit-zen", st.hud.zen_mode);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "menu-btn-zen", move || {
            let mut st = s.borrow_mut();
            st.hud.set_visible("modal-game-menu", false);
            st.hud.zen_mode = true;
            st.hud.set_visible("hud-overlay", false);
            st.hud.set_visible("btn-exit-zen", true);
        });
    }

    // Minimap toggles + zoom + recenter + click-to-navigate
    let toggle_minimap = {
        let s = state.clone();
        move || {
            let mut st = s.borrow_mut();
            st.hud.minimap_enabled = !st.hud.minimap_enabled;
            st.hud.set_visible("minimap-panel", st.hud.minimap_enabled);
            st.hud.set_active_class("pill-toggle-minimap", st.hud.minimap_enabled);
        }
    };
    {
        let f = toggle_minimap.clone();
        click_btn(&doc, "pill-toggle-minimap", move || f());
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-minimap", move || {
            let mut st = s.borrow_mut();
            st.hud.minimap_enabled = false;
            st.hud.set_visible("minimap-panel", false);
            st.hud.set_active_class("pill-toggle-minimap", false);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-min-minimap", move || {
            let st = s.borrow();
            let hidden = st.hud.el("minimap-body").map(|e| e.class_list().contains("hidden")).unwrap_or(false);
            st.hud.set_visible("minimap-body", hidden);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-minimap-zoom-in", move || {
            let mut st = s.borrow_mut();
            st.hud.minimap_zoom = (st.hud.minimap_zoom * 1.25).min(4.0);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-minimap-zoom-out", move || {
            let mut st = s.borrow_mut();
            st.hud.minimap_zoom = (st.hud.minimap_zoom / 1.25).max(0.55);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-minimap-recenter", move || {
            let mut st = s.borrow_mut();
            let p = st.engine.pack.player().position;
            st.hud.minimap_center = Vec2::new(p.x, p.z);
        });
    }
    if let Some(mc) = doc.get_element_by_id("minimap-canvas") {
        let s = state.clone();
        add_listener(&mc, "click", move |ev: MouseEvent| {
            let mut st = s.borrow_mut();
            st.audio.ensure_started();
            if let Some(canvas_el) = st.hud.el("minimap-canvas") {
                let rect = canvas_el.get_bounding_client_rect();
                let w = rect.width().max(1.0) as f32;
                let h = rect.height().max(1.0) as f32;
                let ox = ev.client_x() as f32 - rect.left() as f32;
                let oy = ev.client_y() as f32 - rect.top() as f32;
                let (wx, wz) = st.hud.minimap_click_to_world(ox, oy, w, h);
                st.engine.navigate_to_waypoint(wx, wz);
                st.hud.show_toast(&format!("🎯 Navegando a ({:.0}, {:.0})", wx, wz));
            }
        });
    }

    // Eye PIP Camera toggle
    let toggle_pip = {
        let s = state.clone();
        move || {
            let mut st = s.borrow_mut();
            st.hud.pip_enabled = !st.hud.pip_enabled;
            st.hud.set_visible("pip-panel", st.hud.pip_enabled);
            st.hud.set_active_class("pill-toggle-pip", st.hud.pip_enabled);
        }
    };
    {
        let f = toggle_pip.clone();
        click_btn(&doc, "pill-toggle-pip", move || f());
    }
    {
        let s = state.clone();
        click_btn(&doc, "menu-btn-pip", move || {
            let mut st = s.borrow_mut();
            st.hud.set_visible("modal-game-menu", false);
            st.hud.pip_enabled = !st.hud.pip_enabled;
            st.hud.set_visible("pip-panel", st.hud.pip_enabled);
            st.hud.set_active_class("pill-toggle-pip", st.hud.pip_enabled);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-pip", move || {
            let mut st = s.borrow_mut();
            st.hud.pip_enabled = false;
            st.hud.set_visible("pip-panel", false);
            st.hud.set_active_class("pill-toggle-pip", false);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-min-pip", move || {
            let st = s.borrow();
            let hidden = st.hud.el("pip-body").map(|e| e.class_list().contains("hidden")).unwrap_or(false);
            st.hud.set_visible("pip-body", hidden);
        });
    }

    // Online users panel, Thought minimize, Ticker minimize
    {
        let s = state.clone();
        click_btn(&doc, "pill-toggle-users", move || {
            let st = s.borrow();
            let hidden = st.hud.el("online-users-panel").map(|e| e.class_list().contains("hidden")).unwrap_or(true);
            st.hud.set_visible("online-users-panel", hidden);
            st.hud.set_active_class("pill-toggle-users", hidden);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "menu-btn-users", move || {
            let st = s.borrow();
            st.hud.set_visible("modal-game-menu", false);
            st.hud.set_visible("online-users-panel", true);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-min-upperleft", move || {
            let st = s.borrow();
            let hidden = st.hud.el("thought-body").map(|e| e.class_list().contains("hidden")).unwrap_or(false);
            st.hud.set_visible("thought-body", hidden);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-min-ticker", move || {
            let st = s.borrow();
            let hidden = st.hud.el("activity-ticker-content").map(|e| e.class_list().contains("hidden")).unwrap_or(false);
            st.hud.set_visible("activity-ticker-content", hidden);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-manual-think", move || {
            trigger_ai_cycle(s.clone(), None);
        });
    }

    // 7. Bottom Dock Tabs & Collapse Controls
    if let Ok(tabs) = doc.query_selector_all(".dock-tab") {
        for i in 0..tabs.length() {
            if let Some(node) = tabs.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    let s = state.clone();
                    let tab_name = el.get_attribute("data-tab").unwrap_or_default();
                    add_listener(&el, "click", move |_: MouseEvent| {
                        open_bottom_dock_tab(&s.borrow().hud, &tab_name);
                    });
                }
            }
        }
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-toggle-bottom-dock", move || {
            let st = s.borrow();
            if let Some(dock) = st.hud.el("bottom-dock") {
                let is_collapsed = dock.class_list().contains("collapsed");
                if is_collapsed {
                    let _ = dock.class_list().remove_1("collapsed");
                    st.hud.set_text("dock-toggle-icon", "▼");
                } else {
                    let _ = dock.class_list().add_1("collapsed");
                    st.hud.set_text("dock-toggle-icon", "▲");
                }
            }
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-bottom-dock", move || {
            if let Some(dock) = s.borrow().hud.el("bottom-dock") {
                let _ = dock.class_list().add_1("collapsed");
            }
            s.borrow().hud.set_text("dock-toggle-icon", "▲");
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "quick-bar-more", move || {
            let st = s.borrow();
            if let Some(dock) = st.hud.el("bottom-dock") {
                let is_col = dock.class_list().contains("collapsed");
                if is_col {
                    let _ = dock.class_list().remove_1("collapsed");
                    st.hud.set_text("dock-toggle-icon", "▼");
                } else {
                    let _ = dock.class_list().add_1("collapsed");
                    st.hud.set_text("dock-toggle-icon", "▲");
                }
            }
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-toggle-chat", move || {
            open_bottom_dock_tab(&s.borrow().hud, "chat");
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "quick-bar-chat", move || {
            open_bottom_dock_tab(&s.borrow().hud, "chat");
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "cyber-perf-pill", move || {
            open_bottom_dock_tab(&s.borrow().hud, "telemetry");
        });
    }

    // 8. All Action, Animation & Emotion Buttons + Quick Bar
    for id in [
        "btn-hand-tool",
        "pill-toggle-hand",
        "quick-bar-hand",
        "btn-throw-fetch",
        "quick-bar-fetch",
        "btn-praise-dog",
        "btn-slalom-rings",
        "btn-lake-swim",
        "btn-dig-treasure",
        "btn-speed-race",
        "btn-spawn-snack",
        "quick-bar-snack",
        "btn-call-pack",
        "btn-drink-water",
        "btn-trigger-disco",
        "btn-pet-robot",
        "quick-bar-pet",
        "btn-toggle-freewill",
        "btn-anim-walk",
        "btn-anim-run",
        "btn-anim-jump",
        "btn-anim-bark",
        "btn-anim-sit",
        "btn-anim-lieDown",
        "btn-anim-wagTail",
        "btn-anim-backflip",
        "btn-anim-roll",
        "btn-anim-spin",
        "btn-anim-playBow",
        "btn-anim-headTilt",
        "btn-anim-bellyRub",
        "btn-anim-beg",
        "btn-anim-dance",
        "btn-anim-howl",
        "btn-anim-sneak",
        "btn-anim-wave",
        "btn-anim-shakeOff",
        "btn-anim-nuzzle",
        "btn-anim-sniff",
        "btn-anim-dig",
        "btn-anim-recharge",
        "btn-emo-happy",
        "btn-emo-curious",
        "btn-emo-loving",
        "btn-emo-excited",
        "btn-emo-sleepy",
        "btn-emo-alert",
        "btn-emo-mischievous",
        "btn-emo-proud",
        "btn-emo-scared",
        "btn-emo-hungry",
        "btn-emo-party",
        "btn-emo-confused",
    ] {
        let s = state.clone();
        let owned = id.to_string();
        click_btn(&doc, id, move || exec_btn_action(&s, &owned));
    }

    // Learned Tricks delegated click
    if let Some(tricks_box) = doc.get_element_by_id("learned-tricks-list") {
        let s = state.clone();
        add_listener(&tricks_box, "click", move |ev: MouseEvent| {
            let Some(t) = ev.target() else { return; };
            let Ok(el) = t.dyn_into::<Element>() else { return; };
            if let Some(seq_str) = el.get_attribute("data-seq") {
                let mut st = s.borrow_mut();
                let seq: Vec<AnimId> = seq_str
                    .split(',')
                    .filter_map(|x| AnimId::from_str(x.trim()))
                    .collect();
                if !seq.is_empty() {
                    let idx = st.engine.pack.active_idx;
                    let WebAppState { ref mut engine, .. } = *st;
                    engine.pack.anims[idx].play_sequence(seq, &mut engine.pack.dogs[idx]);
                    let tname = el.get_attribute("data-trick-name").unwrap_or_else(|| "Truco".into());
                    st.hud.show_toast(&format!("✨ Ejecutando: {tname}"));
                }
            }
        });
    }

    // 9. Virtual Touch Joystick & Radial Buttons
    {
        let s = state.clone();
        click_btn(&doc, "btn-toggle-touch", move || toggle_touch_overlay(&s));
    }
    {
        let s = state.clone();
        click_btn(&doc, "menu-btn-touch", move || {
            s.borrow().hud.set_visible("modal-game-menu", false);
            toggle_touch_overlay(&s);
        });
    }
    if let Some(jz) = doc.get_element_by_id("joystick-zone") {
        let s1 = state.clone();
        add_listener(&jz, "touchstart", move |ev: TouchEvent| {
            ev.prevent_default();
            let mut st = s1.borrow_mut();
            st.audio.ensure_started();
            let touches = ev.changed_touches();
            if let Some(t) = touches.get(0) {
                st.joystick_touch_id = Some(t.identifier());
                st.joystick_origin = (t.client_x() as f32, t.client_y() as f32);
                st.hud.set_visible("joystick-base", true);
                if let Some(jb) = st.hud.html_el("joystick-base") {
                    let _ = jb.style().set_property("left", &format!("{}px", t.client_x() - 55));
                    let _ = jb.style().set_property("top", &format!("{}px", t.client_y() - 55));
                }
            }
        });
        let s2 = state.clone();
        add_listener(&jz, "touchmove", move |ev: TouchEvent| {
            ev.prevent_default();
            let mut st = s2.borrow_mut();
            let Some(tid) = st.joystick_touch_id else { return; };
            let touches = ev.changed_touches();
            for i in 0..touches.length() {
                if let Some(t) = touches.get(i) {
                    if t.identifier() == tid {
                        let dx = t.client_x() as f32 - st.joystick_origin.0;
                        let dy = t.client_y() as f32 - st.joystick_origin.1;
                        let max_r = 45.0f32;
                        let dist = dx.hypot(dy);
                        let clamped = dist.min(max_r);
                        let angle = dy.atan2(dx);
                        let sx = angle.cos() * clamped;
                        let sy = angle.sin() * clamped;
                        if let Some(js_el) = st.hud.html_el("joystick-stick") {
                            let _ = js_el.style().set_property(
                                "transform",
                                &format!("translate({:.1}px, {:.1}px)", sx, sy),
                            );
                        }
                        if dist > 6.0 {
                            st.input.joystick = Some(Vec2::new(sx / max_r, sy / max_r));
                            st.input.joystick_running = dist > 32.0;
                        } else {
                            st.input.joystick = None;
                        }
                        break;
                    }
                }
            }
        });
        let s3 = state.clone();
        add_listener(&jz, "touchend", move |ev: TouchEvent| {
            let mut st = s3.borrow_mut();
            st.joystick_touch_id = None;
            st.input.joystick = None;
            st.input.joystick_running = false;
            st.hud.set_visible("joystick-base", false);
            if let Some(js_el) = st.hud.html_el("joystick-stick") {
                let _ = js_el.style().set_property("transform", "translate(0px, 0px)");
            }
            let _ = ev;
        });
    }
    if let Ok(touch_btns) = doc.query_selector_all(".touch-act-btn") {
        for i in 0..touch_btns.length() {
            if let Some(node) = touch_btns.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    let s = state.clone();
                    let k = el.get_attribute("data-key").unwrap_or_default();
                    add_listener(&el, "click", move |_: MouseEvent| {
                        let mut st = s.borrow_mut();
                        st.audio.ensure_started();
                        match k.as_str() {
                            " " => st.engine.trigger_player_jump(6.6),
                            "b" => {
                                let idx = st.engine.pack.active_idx;
                                let WebAppState { ref mut engine, .. } = *st;
                                engine.pack.anims[idx].play(AnimId::Bark, 1.4, &mut engine.pack.dogs[idx]);
                            }
                            "g" => st.engine.throw_fetch_ball(),
                            "p" => st.engine.pet_player(),
                            "shift" => st.input.shift = !st.input.shift,
                            _ => {}
                        }
                    });
                }
            }
        }
    }

    // 10. Chat, Filter Pills, TTS Toggle, & STT Voice Input (with fixed isFinal!)
    {
        let s = state.clone();
        click_btn(&doc, "chat-btn", move || {
            let text = s
                .borrow()
                .hud
                .el("chat-input")
                .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                .map(|i| {
                    let v = i.value();
                    i.set_value("");
                    v
                })
                .unwrap_or_default();
            dispatch_user_chat_or_cmd(&s, &text, false);
        });
    }
    if let Some(chat_in) = doc.get_element_by_id("chat-input") {
        let s = state.clone();
        add_listener(&chat_in, "keydown", move |ev: KeyboardEvent| {
            if ev.key() == "Enter" {
                let text = s
                    .borrow()
                    .hud
                    .el("chat-input")
                    .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                    .map(|i| {
                        let v = i.value();
                        i.set_value("");
                        v
                    })
                    .unwrap_or_default();
                dispatch_user_chat_or_cmd(&s, &text, false);
            }
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-clear-chat-log", move || {
            s.borrow_mut().hud.clear_chat();
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-toggle-voice", move || {
            let mut st = s.borrow_mut();
            st.audio.voice_enabled = !st.audio.voice_enabled;
            st.hud.set_text(
                "btn-toggle-voice",
                if st.audio.voice_enabled { "🔊 Voz: ON" } else { "🔇 Voz: OFF" },
            );
            st.hud.set_active_class("btn-toggle-voice", st.audio.voice_enabled);
        });
    }
    if let Ok(pills) = doc.query_selector_all(".chat-dog-pill") {
        for i in 0..pills.length() {
            if let Some(node) = pills.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    let s = state.clone();
                    let dog_filter = el.get_attribute("data-dog").unwrap_or_else(|| "ALL".into());
                    add_listener(&el, "click", move |_: MouseEvent| {
                        let mut st = s.borrow_mut();
                        st.hud.active_dog_filter = dog_filter.clone();
                        if let Ok(all) = st.doc.query_selector_all(".chat-dog-pill") {
                            for j in 0..all.length() {
                                if let Some(n) = all.get(j) {
                                    if let Ok(pe) = n.dyn_into::<Element>() {
                                        let df = pe.get_attribute("data-dog").unwrap_or_default();
                                        if df == dog_filter {
                                            let _ = pe.class_list().add_1("active");
                                        } else {
                                            let _ = pe.class_list().remove_1("active");
                                        }
                                    }
                                }
                            }
                        }
                        st.hud.render_chat_feed();
                    });
                }
            }
        }
    }

    // Web Speech API STT (fixed `results[results.length - 1].isFinal`)
    wire_speech_recognition(&state);

    // 11. Macro Sequencer with Cancellation Token
    if let Ok(chips) = doc.query_selector_all("[data-macro-add]") {
        for i in 0..chips.length() {
            if let Some(node) = chips.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    let s = state.clone();
                    let btn_id = el.get_attribute("data-macro-add").unwrap_or_default();
                    let label = el.text_content().unwrap_or_default().replace("+ ", "");
                    add_listener(&el, "click", move |_: MouseEvent| {
                        let mut st = s.borrow_mut();
                        st.hud.macro_steps.push(MacroStep {
                            btn_id: btn_id.clone(),
                            label: label.clone(),
                        });
                        st.hud.render_macro_timeline();
                    });
                }
            }
        }
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-macro-clear", move || {
            let mut st = s.borrow_mut();
            st.hud.macro_run_id = st.hud.macro_run_id.wrapping_add(1);
            st.hud.macro_running = false;
            st.hud.macro_active_idx = None;
            st.hud.macro_steps.clear();
            st.hud.set_text("macro-status-badge", "LISTO");
            st.hud.render_macro_timeline();
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-macro-loop", move || {
            let mut st = s.borrow_mut();
            st.hud.macro_loop = !st.hud.macro_loop;
            st.hud.set_text(
                "btn-macro-loop",
                if st.hud.macro_loop { "🔁 Bucle: ON" } else { "🔁 Bucle: OFF" },
            );
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-macro-play", move || {
            let run_id = {
                let mut st = s.borrow_mut();
                if st.hud.macro_running {
                    st.hud.macro_run_id = st.hud.macro_run_id.wrapping_add(1);
                    st.hud.macro_running = false;
                    st.hud.macro_active_idx = None;
                    st.hud.set_text("macro-status-badge", "DETENIDO");
                    st.hud.render_macro_timeline();
                    return;
                }
                if st.hud.macro_steps.is_empty() {
                    st.hud.show_toast("⚡ Añade pasos al secuenciador primero");
                    return;
                }
                st.hud.macro_run_id = st.hud.macro_run_id.wrapping_add(1);
                st.hud.macro_running = true;
                st.hud.set_text("macro-status-badge", "EJECUTANDO");
                st.hud.macro_run_id
            };
            run_macro_sequence(s.clone(), run_id);
        });
    }
    for (preset_id, name, steps) in [
        (
            "preset-macro-show",
            "Show Acrobático",
            vec![
                ("btn-anim-playBow", "Reverencia"),
                ("btn-anim-jump", "Saltar"),
                ("btn-anim-backflip", "Voltereta"),
                ("btn-anim-spin", "Girar"),
                ("btn-anim-wave", "Saludar"),
            ],
        ),
        (
            "preset-macro-guard",
            "Patrulla Táctica",
            vec![
                ("btn-emo-alert", "Alerta"),
                ("btn-anim-sniff", "Olfatear"),
                ("btn-anim-sneak", "Sigilo"),
                ("btn-anim-bark", "Ladrar"),
            ],
        ),
        (
            "preset-macro-fiesta",
            "Fiesta Total",
            vec![
                ("btn-trigger-disco", "Disco"),
                ("btn-emo-party", "Fiestero"),
                ("btn-anim-dance", "Bailar"),
                ("btn-anim-spin", "Girar"),
                ("btn-anim-howl", "Aullar"),
            ],
        ),
        (
            "preset-macro-training",
            "Entrenamiento",
            vec![
                ("btn-slalom-rings", "Aros"),
                ("btn-anim-jump", "Saltar"),
                ("btn-throw-fetch", "Pelota"),
                ("btn-praise-dog", "Elogiar"),
            ],
        ),
    ] {
        let s = state.clone();
        let p_name = name.to_string();
        let p_steps: Vec<MacroStep> = steps
            .into_iter()
            .map(|(bid, lbl)| MacroStep {
                btn_id: bid.to_string(),
                label: lbl.to_string(),
            })
            .collect();
        click_btn(&doc, preset_id, move || {
            let run_id = {
                let mut st = s.borrow_mut();
                st.hud.macro_steps = p_steps.clone();
                st.hud.macro_run_id = st.hud.macro_run_id.wrapping_add(1);
                st.hud.macro_running = true;
                st.hud.set_text("macro-status-badge", "EJECUTANDO");
                st.hud.show_toast(&format!("⚡ Iniciando protocolo: {p_name}"));
                st.hud.macro_run_id
            };
            run_macro_sequence(s.clone(), run_id);
        });
    }

    // 12. Modals: Game Menu, Settings, Memory, Share, Login, Command Palette & Ping Router
    {
        let s = state.clone();
        click_btn(&doc, "btn-open-game-menu", move || {
            s.borrow().hud.set_visible("modal-game-menu", true);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-game-menu", move || {
            s.borrow().hud.set_visible("modal-game-menu", false);
        });
    }
    let open_settings = {
        let s = state.clone();
        move || {
            let mut st = s.borrow_mut();
            st.hud.set_visible("modal-game-menu", false);
            st.hud.load_llm_settings_into_dom();
            st.hud.set_visible("modal-settings", true);
        }
    };
    {
        let f = open_settings.clone();
        click_btn(&doc, "btn-open-settings", move || f());
    }
    {
        let f = open_settings.clone();
        click_btn(&doc, "menu-btn-settings", move || f());
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-settings", move || {
            s.borrow().hud.set_visible("modal-settings", false);
        });
    }
    if let Some(sel) = doc.get_element_by_id("cfg-model-select") {
        let s = state.clone();
        add_listener(&sel, "change", move |ev: web_sys::Event| {
            let val = ev
                .target()
                .and_then(|t| t.dyn_into::<HtmlSelectElement>().ok())
                .map(|se| se.value())
                .unwrap_or_default();
            s.borrow().hud.set_visible("cfg-model-custom", val == "custom");
        });
    }
    if let Some(rng) = doc.get_element_by_id("cfg-interval") {
        let s = state.clone();
        add_listener(&rng, "input", move |ev: web_sys::Event| {
            let val = ev
                .target()
                .and_then(|t| t.dyn_into::<HtmlInputElement>().ok())
                .map(|i| i.value())
                .unwrap_or_else(|| "12".into());
            s.borrow().hud.set_text("cfg-interval-val", &format!("{val}s"));
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-save-settings", move || {
            let mut st = s.borrow_mut();
            let (ep, key, model, sys_p, iv) = st.hud.read_llm_settings();
            if let Some(ls) = st.hud.local_storage() {
                let _ = ls.set_item("freellm_endpoint", &ep);
                let _ = ls.set_item("freellm_apikey", &key);
                let _ = ls.set_item("freellm_model", &model);
                let _ = ls.set_item("freellm_system_prompt", &sys_p);
                let _ = ls.set_item("freellm_interval", &format!("{iv}"));
            }
            st.hud.autothink_interval_s = iv;
            if let Some(cb) = st.hud.el("cfg-autothink").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                st.hud.autothink_enabled = cb.checked();
            }
            st.hud.set_visible("modal-settings", false);
            st.hud.show_toast("⚙️ Ajustes FreeLLMAPI guardados");
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-test-connection", move || ping_llm_router(&s));
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-ping-llm-now", move || ping_llm_router(&s));
    }

    // Memory modal + Download JSON
    let open_memory = {
        let s = state.clone();
        move || {
            let ev_bus = {
                let st = s.borrow();
                st.hud.set_visible("modal-game-menu", false);
                st.hud.set_visible("modal-memory", true);
                st.net.events.clone()
            };
            wasm_bindgen_futures::spawn_local(async move {
                if let Ok(mem) = fetch_json_get("/api/memory").await {
                    ev_bus.borrow_mut().push(IncomingNetEvent::MemoryLoaded(mem));
                }
            });
        }
    };
    {
        let f = open_memory.clone();
        click_btn(&doc, "btn-open-memory", move || f());
    }
    {
        let f = open_memory.clone();
        click_btn(&doc, "menu-btn-memory", move || f());
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-memory", move || {
            s.borrow().hud.set_visible("modal-memory", false);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-download-memory", move || {
            let st = s.borrow();
            let content = st
                .latest_memory_doc
                .as_ref()
                .and_then(|v| serde_json::to_string_pretty(v).ok())
                .unwrap_or_else(|| "{}".into());
            let parts = Array::new();
            parts.push(&JsValue::from_str(&content));
            let bag = BlobPropertyBag::new();
            bag.set_type("application/json");
            if let Ok(blob) = Blob::new_with_str_sequence_and_options(&parts, &bag) {
                if let Ok(url) = Url::create_object_url_with_blob(&blob) {
                    if let Ok(a) = st.doc.create_element("a") {
                        let _ = a.set_attribute("href", &url);
                        let _ = a.set_attribute("download", "memory.json");
                        if let Ok(ha) = a.dyn_into::<HtmlElement>() {
                            ha.click();
                        }
                    }
                    let _ = Url::revoke_object_url(&url);
                }
            }
        });
    }

    // Share modal + Copy Buttons
    let open_share = {
        let s = state.clone();
        move || {
            let ev_bus = {
                let st = s.borrow();
                st.hud.set_visible("modal-game-menu", false);
                st.hud.set_visible("modal-share", true);
                st.net.events.clone()
            };
            wasm_bindgen_futures::spawn_local(async move {
                if let Ok(info) = fetch_json_get("/api/network-info").await {
                    let local_url = info
                        .get("localUrl")
                        .and_then(|v| v.as_str())
                        .unwrap_or("http://localhost:3000")
                        .to_string();
                    let tunnel_url = info
                        .get("tunnelUrl")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    ev_bus
                        .borrow_mut()
                        .push(IncomingNetEvent::NetworkInfo { local_url, tunnel_url });
                }
            });
        }
    };
    {
        let f = open_share.clone();
        click_btn(&doc, "btn-open-share", move || f());
    }
    {
        let f = open_share.clone();
        click_btn(&doc, "menu-btn-share", move || f());
    }
    {
        let f = open_share.clone();
        click_btn(&doc, "btn-share-server", move || f());
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-share", move || {
            s.borrow().hud.set_visible("modal-share", false);
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-share-bottom", move || {
            s.borrow().hud.set_visible("modal-share", false);
        });
    }
    if let Ok(cbtns) = doc.query_selector_all(".copy-btn") {
        for i in 0..cbtns.length() {
            if let Some(node) = cbtns.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    let s = state.clone();
                    let tgt = el.get_attribute("data-target").unwrap_or_default();
                    add_listener(&el, "click", move |_: MouseEvent| {
                        let st = s.borrow();
                        if let Some(inp) = st.hud.el(&tgt).and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                            let val = inp.value();
                            let _ = st.win.navigator().clipboard().write_text(&val);
                            st.hud.show_toast("📋 Enlace copiado al portapapeles");
                        }
                    });
                }
            }
        }
    }

    // Login / User Profile modal
    let open_profile = {
        let s = state.clone();
        move || {
            let st = s.borrow();
            st.hud.set_visible("modal-game-menu", false);
            st.hud.set_visible("modal-login", true);
        }
    };
    {
        let f = open_profile.clone();
        click_btn(&doc, "user-profile-badge", move || f());
    }
    {
        let f = open_profile.clone();
        click_btn(&doc, "menu-btn-profile", move || f());
    }
    if let Ok(av_opts) = doc.query_selector_all(".avatar-opt") {
        for i in 0..av_opts.length() {
            if let Some(node) = av_opts.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    let s = state.clone();
                    let av = el.get_attribute("data-avatar").unwrap_or_else(|| "🐾".into());
                    add_listener(&el, "click", move |_: MouseEvent| {
                        let mut st = s.borrow_mut();
                        st.net.user_avatar = av.clone();
                        if let Ok(all) = st.doc.query_selector_all(".avatar-opt") {
                            for j in 0..all.length() {
                                if let Some(n) = all.get(j) {
                                    if let Ok(ae) = n.dyn_into::<Element>() {
                                        if ae.get_attribute("data-avatar").as_deref() == Some(av.as_str()) {
                                            let _ = ae.class_list().add_1("active");
                                        } else {
                                            let _ = ae.class_list().remove_1("active");
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }
        }
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-login-submit", move || {
            let mut st = s.borrow_mut();
            st.audio.ensure_started();
            let name = st
                .hud
                .el("login-username-input")
                .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                .map(|i| i.value().trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Entrenador".into());
            st.net.user_name = name.clone();
            let av = st.net.user_avatar.clone();
            st.hud.set_text("header-user-avatar", &av);
            st.hud.set_text("header-user-name", &name);
            if let Some(ls) = st.hud.local_storage() {
                let _ = ls.set_item("robochibi_user", &json!({ "name": name, "avatar": av }).to_string());
            }
            st.net.send_join_update();
            st.hud.set_visible("modal-login", false);
            st.hud.show_toast(&format!("🐾 ¡Bienvenido, {av} {name}!"));
        });
    }

    // Command Palette UI bindings
    {
        let s = state.clone();
        click_btn(&doc, "btn-open-cmd-palette", move || {
            let st = s.borrow();
            st.hud.set_visible("modal-cmd-palette", true);
            render_cmd_palette(&s, &st.hud, "");
            if let Some(inp) = st.hud.el("cmd-palette-input").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                inp.set_value("");
                let _ = inp.focus();
            }
        });
    }
    {
        let s = state.clone();
        click_btn(&doc, "btn-close-cmd-palette", move || {
            s.borrow().hud.set_visible("modal-cmd-palette", false);
        });
    }
    if let Some(cmd_in) = doc.get_element_by_id("cmd-palette-input") {
        let s = state.clone();
        add_listener(&cmd_in, "input", move |ev: web_sys::Event| {
            let q = ev
                .target()
                .and_then(|t| t.dyn_into::<HtmlInputElement>().ok())
                .map(|i| i.value())
                .unwrap_or_default();
            let st = s.borrow();
            render_cmd_palette(&s, &st.hud, &q);
        });
    }
}

fn open_bottom_dock_tab(hud: &HudController, tab_name: &str) {
    if let Some(dock) = hud.el("bottom-dock") {
        let _ = dock.class_list().remove_1("collapsed");
        hud.set_text("dock-toggle-icon", "▼");
    }
    if let Ok(tabs) = hud.doc.query_selector_all(".dock-tab") {
        for i in 0..tabs.length() {
            if let Some(node) = tabs.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    if el.get_attribute("data-tab").as_deref() == Some(tab_name) {
                        let _ = el.class_list().add_1("active");
                    } else {
                        let _ = el.class_list().remove_1("active");
                    }
                }
            }
        }
    }
    if let Ok(panes) = hud.doc.query_selector_all(".tab-pane") {
        let tgt_id = format!("tab-pane-{tab_name}");
        for i in 0..panes.length() {
            if let Some(node) = panes.get(i) {
                if let Ok(el) = node.dyn_into::<Element>() {
                    if el.id() == tgt_id {
                        let _ = el.class_list().add_1("active");
                    } else {
                        let _ = el.class_list().remove_1("active");
                    }
                }
            }
        }
    }
}

fn toggle_touch_overlay(state: &Rc<RefCell<WebAppState>>) {
    let st = state.borrow();
    let hidden = st
        .hud
        .el("virtual-touch-controls")
        .map(|e| e.class_list().contains("hidden"))
        .unwrap_or(true);
    st.hud.set_visible("virtual-touch-controls", hidden);
    st.hud.show_toast(if hidden {
        "📱 Joystick táctil activado"
    } else {
        "📱 Joystick táctil ocultado"
    });
}

fn ping_llm_router(state: &Rc<RefCell<WebAppState>>) {
    let (ep, key, model, ev_bus, t0) = {
        let st = state.borrow();
        let (ep, key, model, _, _) = st.hud.read_llm_settings();
        st.hud.set_text("api-test-status", "Probando...");
        let t0 = st.win.performance().map(|p| p.now()).unwrap_or(0.0);
        (ep, key, model, st.net.events.clone(), t0)
    };
    wasm_bindgen_futures::spawn_local(async move {
        let body = json!({
            "endpoint": ep,
            "apiKey": key,
            "model": model,
            "max_tokens": 20,
            "messages": [{ "role": "user", "content": "Responde solo: OK" }]
        });
        match fetch_json_post("/api/llm/proxy", &body).await {
            Ok((status, data)) if (200..300).contains(&status) => {
                let now = web_sys::window()
                    .and_then(|w| w.performance())
                    .map(|p| p.now())
                    .unwrap_or(t0 + 20.0);
                let ms = (now - t0).max(1.0).round() as u32;
                let mdl = data.get("model").and_then(|v| v.as_str()).unwrap_or("auto");
                ev_bus.borrow_mut().push(IncomingNetEvent::LlmPingResult {
                    ok: true,
                    ms,
                    detail: format!("✅ FreeLLMAPI conectado ({ms}ms | {mdl})"),
                });
            }
            Ok((status, data)) => {
                let err = data.get("error").and_then(|v| v.as_str()).unwrap_or("Sin respuesta");
                ev_bus.borrow_mut().push(IncomingNetEvent::LlmPingResult {
                    ok: false,
                    ms: 0,
                    detail: format!("⚠️ Router HTTP {status}: {err}"),
                });
            }
            Err(e) => {
                ev_bus.borrow_mut().push(IncomingNetEvent::LlmPingResult {
                    ok: false,
                    ms: 0,
                    detail: format!("❌ Offline: {e}"),
                });
            }
        }
    });
}

fn run_macro_sequence(state: Rc<RefCell<WebAppState>>, run_id: u64) {
    wasm_bindgen_futures::spawn_local(async move {
        loop {
            let steps_len = {
                let st = state.borrow();
                if st.hud.macro_run_id != run_id || !st.hud.macro_running {
                    break;
                }
                st.hud.macro_steps.len()
            };
            if steps_len == 0 {
                break;
            }
            for idx in 0..steps_len {
                let btn_id = {
                    let mut st = state.borrow_mut();
                    if st.hud.macro_run_id != run_id || !st.hud.macro_running {
                        return;
                    }
                    st.hud.macro_active_idx = Some(idx);
                    st.hud.render_macro_timeline();
                    st.hud.macro_steps[idx].btn_id.clone()
                };
                exec_btn_action(&state, &btn_id);

                // Async sleep 1800ms via JS Promise
                let promise = js_sys::Promise::new(&mut |resolve, _| {
                    if let Some(w) = web_sys::window() {
                        let _ = w.set_timeout_with_callback_and_timeout_and_arguments_0(&resolve, 1800);
                    }
                });
                let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
            }
            let should_loop = {
                let mut st = state.borrow_mut();
                if st.hud.macro_run_id != run_id {
                    return;
                }
                if !st.hud.macro_loop {
                    st.hud.macro_running = false;
                    st.hud.macro_active_idx = None;
                    st.hud.set_text("macro-status-badge", "LISTO");
                    st.hud.render_macro_timeline();
                    false
                } else {
                    true
                }
            };
            if !should_loop {
                break;
            }
        }
    });
}

fn render_cmd_palette(state: &Rc<RefCell<WebAppState>>, hud: &HudController, query: &str) {
    let Some(res_box) = hud.el("cmd-palette-results") else {
        return;
    };
    res_box.set_text_content(Some(""));
    let q = query.to_ascii_lowercase();

    enum CmdAct {
        Switch(RobotId),
        Btn(&'static str),
        Weather,
        Vision,
        Think,
        OpenSettings,
        SwitchGfx,
    }

    let items: [(&str, &str, CmdAct); 17] = [
        ("🐾 Poseer a Sparky (Explorador)", "Robot", CmdAct::Switch(RobotId::Sparky)),
        ("⚡ Poseer a Bolt (Velocista)", "Robot", CmdAct::Switch(RobotId::Bolt)),
        ("🔍 Poseer a Pixel (Hacker)", "Robot", CmdAct::Switch(RobotId::Pixel)),
        ("💖 Poseer a Luna (Soñadora)", "Robot", CmdAct::Switch(RobotId::Luna)),
        ("🤸 Poseer a Rusty (Acróbata)", "Robot", CmdAct::Switch(RobotId::Rusty)),
        ("🎾 Lanzar Pelota (Fetch)", "Juego (G)", CmdAct::Btn("btn-throw-fetch")),
        ("🪩 Activar Fiesta Disco", "Evento", CmdAct::Btn("btn-trigger-disco")),
        ("📣 Llamar a toda la Manada", "Manada", CmdAct::Btn("btn-call-pack")),
        ("🏊 Ir a Nadar al Lago", "Acción", CmdAct::Btn("btn-lake-swim")),
        ("💎 Cavar Tesoro Oculto", "Acción", CmdAct::Btn("btn-dig-treasure")),
        ("🏁 Iniciar Carrera de Velocidad", "Juego", CmdAct::Btn("btn-speed-race")),
        ("🤸 Hacer Voltereta Mortal", "Acrobacia (F)", CmdAct::Btn("btn-anim-backflip")),
        ("🐺 Aullar en Manada", "Acrobacia", CmdAct::Btn("btn-anim-howl")),
        ("🌦️ Cambiar Clima Dinámico", "Clima", CmdAct::Weather),
        ("🕶️ Cambiar Modo de Visión Óptica", "Shader", CmdAct::Vision),
        ("⚡ Cambiar WebGL2 / WebGPU", "Motor GPU", CmdAct::SwitchGfx),
        ("🧠 Forzar Decisión Cognitiva IA", "FreeLLMAPI", CmdAct::Think),
    ];

    let _ = &CmdAct::OpenSettings;

    for (idx, (title, tag, act)) in items.into_iter().enumerate() {
        if !q.is_empty()
            && !title.to_ascii_lowercase().contains(&q)
            && !tag.to_ascii_lowercase().contains(&q)
        {
            continue;
        }
        let Ok(row) = hud.doc.create_element("div") else {
            continue;
        };
        row.set_class_name(if idx == 0 {
            "cmd-result-item selected"
        } else {
            "cmd-result-item"
        });
        if let Ok(s1) = hud.doc.create_element("span") {
            s1.set_text_content(Some(title));
            let _ = row.append_child(&s1);
        }
        if let Ok(s2) = hud.doc.create_element("span") {
            s2.set_class_name("cmd-shortcut-kbd");
            s2.set_text_content(Some(tag));
            let _ = row.append_child(&s2);
        }

        let s = state.clone();
        add_listener(&row, "click", move |_: MouseEvent| {
            s.borrow().hud.set_visible("modal-cmd-palette", false);
            match &act {
                CmdAct::Switch(id) => {
                    let mut st = s.borrow_mut();
                    st.engine.switch_robot(*id);
                    st.hud.show_toast(&format!("🐾 Controlando a {}", id.name()));
                }
                CmdAct::Btn(bid) => exec_btn_action(&s, bid),
                CmdAct::Weather => {
                    let mut st = s.borrow_mut();
                    let next = st.engine.weather.cycle_next();
                    st.engine.set_weather(next);
                    st.hud.show_toast(next.toast_es());
                }
                CmdAct::Vision => {
                    let mut st = s.borrow_mut();
                    let next = st.engine.optical_filter.cycle_next();
                    st.engine.optical_filter = next;
                    st.hud.show_toast(next.toast_es());
                }
                CmdAct::Think => trigger_ai_cycle(s.clone(), None),
                CmdAct::OpenSettings => s.borrow().hud.set_visible("modal-settings", true),
                CmdAct::SwitchGfx => {
                    let st = s.borrow();
                    let next = if st.hud.active_backend_label == "WebGPU" {
                        "webgl"
                    } else {
                        "webgpu"
                    };
                    if let Some(ls) = st.hud.local_storage() {
                        let _ = ls.set_item("robochibi_gfx_backend", next);
                    }
                    let _ = st.win.location().set_search(&format!("?gfx={next}"));
                }
            }
        });
        let _ = res_box.append_child(&row);
    }
}

fn wire_speech_recognition(state: &Rc<RefCell<WebAppState>>) {
    let win = state.borrow().win.clone();
    let doc = state.borrow().doc.clone();
    let ctor = Reflect::get(&win, &JsValue::from_str("SpeechRecognition"))
        .ok()
        .filter(|v| v.is_function())
        .or_else(|| {
            Reflect::get(&win, &JsValue::from_str("webkitSpeechRecognition"))
                .ok()
                .filter(|v| v.is_function())
        });

    let Some(ctor_val) = ctor else {
        for id in ["btn-voice-stt", "pill-quick-mic"] {
            let s = state.clone();
            click_btn(&doc, id, move || {
                s.borrow()
                    .hud
                    .show_toast("🎙️ Reconocimiento de voz no disponible en este navegador");
            });
        }
        return;
    };

    let Ok(ctor_fn) = ctor_val.dyn_into::<Function>() else {
        return;
    };
    let Ok(rec) = Reflect::construct(&ctor_fn, &Array::new()) else {
        return;
    };
    let _ = Reflect::set(&rec, &"lang".into(), &"es-ES".into());
    let _ = Reflect::set(&rec, &"interimResults".into(), &JsValue::TRUE);
    let _ = Reflect::set(&rec, &"continuous".into(), &JsValue::FALSE);

    let recording = Rc::new(RefCell::new(false));

    let s_res = state.clone();
    let on_result = Closure::wrap(Box::new(move |ev: JsValue| {
        let Ok(results) = Reflect::get(&ev, &"results".into()) else { return; };
        let len = Reflect::get(&results, &"length".into())
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as u32;
        if len == 0 {
            return;
        }
        let Ok(last_res) = Reflect::get(&results, &JsValue::from(len - 1)) else { return; };
        let is_final = Reflect::get(&last_res, &"isFinal".into())
            .ok()
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let Ok(alt0) = Reflect::get(&last_res, &JsValue::from(0)) else { return; };
        let transcript = Reflect::get(&alt0, &"transcript".into())
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_default();

        if let Some(inp) = s_res
            .borrow()
            .hud
            .el("chat-input")
            .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
        {
            inp.set_value(&transcript);
        }
        if is_final && !transcript.trim().is_empty() {
            if let Some(inp) = s_res
                .borrow()
                .hud
                .el("chat-input")
                .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
            {
                inp.set_value("");
            }
            dispatch_user_chat_or_cmd(&s_res, &transcript, true);
        }
    }) as Box<dyn FnMut(JsValue)>);
    let _ = Reflect::set(&rec, &"onresult".into(), on_result.as_ref());
    on_result.forget();

    let rec_flag = recording.clone();
    let s_end = state.clone();
    let on_end = Closure::wrap(Box::new(move |_: JsValue| {
        *rec_flag.borrow_mut() = false;
        let st = s_end.borrow();
        for id in ["btn-voice-stt", "pill-quick-mic"] {
            if let Some(el) = st.hud.el(id) {
                let _ = el.class_list().remove_1("recording");
            }
        }
    }) as Box<dyn FnMut(JsValue)>);
    let _ = Reflect::set(&rec, &"onend".into(), on_end.as_ref());
    on_end.forget();

    let rec_rc = Rc::new(rec);
    for id in ["btn-voice-stt", "pill-quick-mic"] {
        let r = rec_rc.clone();
        let rf = recording.clone();
        let s = state.clone();
        click_btn(&doc, id, move || {
            let is_rec = *rf.borrow();
            if is_rec {
                if let Ok(stop_fn) = Reflect::get(&r, &"stop".into()).and_then(|v| v.dyn_into::<Function>()) {
                    let _ = stop_fn.call0(&r);
                }
            } else if let Ok(start_fn) = Reflect::get(&r, &"start".into()).and_then(|v| v.dyn_into::<Function>()) {
                if start_fn.call0(&r).is_ok() {
                    *rf.borrow_mut() = true;
                    let st = s.borrow();
                    for bid in ["btn-voice-stt", "pill-quick-mic"] {
                        if let Some(el) = st.hud.el(bid) {
                            let _ = el.class_list().add_1("recording");
                        }
                    }
                    st.hud.show_toast("🎙️ Escuchando tu voz...");
                }
            }
        });
    }
}
