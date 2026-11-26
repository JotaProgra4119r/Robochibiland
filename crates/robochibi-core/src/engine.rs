use crate::animations::AnimId;
use crate::audio_events::{AudioEvent, AudioKind};
use crate::brain::{ArrivalTask, BrainDecision, BrainUiEvent, RobotBrain};
use crate::emotions::{EmotionId, EmotionParticleSystem};
use crate::pack::{lerp_angle, RobotPackManager};
use crate::robot::RobotId;
use crate::vision::RobotVisionSystem;
use crate::world::{WorldState, MAP_PLAY_LIMIT};
use glam::camera::rh::{proj::directx::perspective, view::look_at_mat4};
use glam::{Vec2, Vec3, Vec4};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CameraMode {
    Diagonal,
    Follow,
    Orbit,
    Free,
    Eye,
    Drone,
}

impl CameraMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Diagonal => "diagonal",
            Self::Follow => "follow",
            Self::Orbit => "orbit",
            Self::Free => "free",
            Self::Eye => "eye",
            Self::Drone => "drone",
        }
    }

    pub fn label_es(self) -> &'static str {
        match self {
            Self::Diagonal => "Diag",
            Self::Follow => "Seguir",
            Self::Orbit => "Órbita",
            Self::Free => "Vuelo",
            Self::Eye => "Ojos",
            Self::Drone => "Drone",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "diagonal" => Some(Self::Diagonal),
            "follow" => Some(Self::Follow),
            "orbit" => Some(Self::Orbit),
            "free" => Some(Self::Free),
            "eye" => Some(Self::Eye),
            "drone" => Some(Self::Drone),
            _ => None,
        }
    }

    pub fn cycle_next(self) -> Self {
        match self {
            Self::Follow => Self::Diagonal,
            Self::Diagonal => Self::Orbit,
            Self::Orbit => Self::Drone,
            Self::Drone => Self::Eye,
            Self::Eye => Self::Free,
            Self::Free => Self::Follow,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeOfDay {
    Day,
    Sunset,
    Night,
}

impl TimeOfDay {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Day => "day",
            Self::Sunset => "sunset",
            Self::Night => "night",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WeatherMode {
    Clear,
    CyberRain,
    Fireflies,
    Stardust,
}

impl WeatherMode {
    pub fn cycle_next(self) -> Self {
        match self {
            Self::Clear => Self::CyberRain,
            Self::CyberRain => Self::Fireflies,
            Self::Fireflies => Self::Stardust,
            Self::Stardust => Self::Clear,
        }
    }

    pub fn toast_es(self) -> &'static str {
        match self {
            Self::Clear => "☀️ Clima Despejado",
            Self::CyberRain => "🌧️ Lluvia de Neón Cibernética",
            Self::Fireflies => "✨ Luciérnagas Cuánticas",
            Self::Stardust => "❄️ Polvo Estelar Ártico",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpticalFilter {
    Normal,
    Crt,
    NightVision,
    Thermal,
    Cinema,
}

impl OpticalFilter {
    pub fn cycle_next(self) -> Self {
        match self {
            Self::Normal => Self::Crt,
            Self::Crt => Self::NightVision,
            Self::NightVision => Self::Thermal,
            Self::Thermal => Self::Cinema,
            Self::Cinema => Self::Normal,
        }
    }

    pub fn toast_es(self) -> &'static str {
        match self {
            Self::Normal => "🕶️ Óptica: Estándar",
            Self::Crt => "📺 Óptica: CRT Scanlines",
            Self::NightVision => "🟢 Óptica: Visión Nocturna",
            Self::Thermal => "🔥 Óptica: Infrarrojo Térmico",
            Self::Cinema => "🎬 Óptica: Cine Anamórfico",
        }
    }

    pub fn css_class(self) -> &'static str {
        match self {
            Self::Normal => "",
            Self::Crt => "fx-crt",
            Self::NightVision => "fx-nightvision",
            Self::Thermal => "fx-thermal",
            Self::Cinema => "fx-cinema",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct InputState {
    pub forward: bool,
    pub backward: bool,
    pub left: bool,
    pub right: bool,
    pub up: bool,
    pub down: bool,
    pub shift: bool,
    pub joystick: Option<Vec2>,
    pub joystick_running: bool,
    pub orbit_delta: Vec2,
    pub zoom_delta: f32,
}

#[derive(Debug, Clone)]
pub struct WeatherParticle {
    pub pos: Vec3,
    pub vel: Vec3,
    pub color: [f32; 4],
    pub scale: f32,
}

pub struct SimulationEngine {
    pub world: WorldState,
    pub pack: RobotPackManager,
    pub vision: RobotVisionSystem,
    pub brain: RobotBrain,
    pub particles: EmotionParticleSystem,

    pub camera_mode: CameraMode,
    pub cam_pos: Vec3,
    pub cam_target: Vec3,
    pub cam_yaw: f32,
    pub cam_pitch: f32,
    pub cam_dist: f32,
    pub cam_user_orbit_timer: f32,
    pub drone_angle: f32,

    pub time_of_day: TimeOfDay,
    pub weather: WeatherMode,
    pub optical_filter: OpticalFilter,
    pub weather_particles: Vec<WeatherParticle>,

    pub target_waypoint: Option<Vec3>,
    pub is_free_will: bool,
    pub free_will_timer: f32,
    pub is_hand_tool_active: bool,
    pub grabbed_robot: Option<usize>,

    pub audio_events: Vec<AudioEvent>,
    pub elapsed_time: f32,
    pub star_rot_y: f32,
    rng: u64,
}

impl SimulationEngine {
    pub fn new() -> Self {
        let world = WorldState::new();
        let pack = RobotPackManager::new(&world);
        let vision = RobotVisionSystem::new();
        let brain = RobotBrain::new();
        let particles = EmotionParticleSystem::new();

        let p = pack.player().position;
        let cam_target = p + Vec3::new(0.0, 1.2, 0.0);
        let cam_pos = p + Vec3::new(14.0, 15.0, 14.0);

        Self {
            world,
            pack,
            vision,
            brain,
            particles,
            camera_mode: CameraMode::Diagonal,
            cam_pos,
            cam_target,
            cam_yaw: std::f32::consts::FRAC_PI_4,
            cam_pitch: 0.62,
            cam_dist: 24.0,
            cam_user_orbit_timer: 0.0,
            drone_angle: 0.0,
            time_of_day: TimeOfDay::Day,
            weather: WeatherMode::Clear,
            optical_filter: OpticalFilter::Normal,
            weather_particles: Vec::new(),
            target_waypoint: None,
            is_free_will: false,
            free_will_timer: 0.0,
            is_hand_tool_active: false,
            grabbed_robot: None,
            audio_events: Vec::with_capacity(32),
            elapsed_time: 0.0,
            star_rot_y: 0.0,
            rng: 0x123456789abcdef0,
        }
    }

    fn rand_f32(&mut self) -> f32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        ((self.rng & 0xffffff) as f32) / 16777216.0
    }

    pub fn set_time_of_day(&mut self, t: TimeOfDay) {
        self.time_of_day = t;
        match t {
            TimeOfDay::Day => self.world.log_activity("☀️ Es mediodía brillante en el prado."),
            TimeOfDay::Sunset => self.world.log_activity("🌅 El atardecer tiñe el cielo de oro y naranja."),
            TimeOfDay::Night => {
                self.world.log_activity("🌙 Cae la noche cibernética; las estrellas y luces de neón brillan.");
                if self.weather == WeatherMode::Clear {
                    self.set_weather(WeatherMode::Fireflies);
                }
            }
        }
    }

    pub fn set_weather(&mut self, w: WeatherMode) {
        self.weather = w;
        self.weather_particles.clear();
        let count = match w {
            WeatherMode::Clear => 0,
            WeatherMode::CyberRain => 140,
            WeatherMode::Fireflies => 65,
            WeatherMode::Stardust => 90,
        };
        for _ in 0..count {
            let rx = (self.rand_f32() - 0.5) * 90.0;
            let ry = 1.0 + self.rand_f32() * 26.0;
            let rz = (self.rand_f32() - 0.5) * 90.0;
            let (vel, color, scale) = match w {
                WeatherMode::CyberRain => (
                    Vec3::new(-1.8, -24.0 - self.rand_f32() * 8.0, 0.0),
                    [0.0, 0.95, 1.0, 0.65],
                    0.09,
                ),
                WeatherMode::Fireflies => {
                    let is_green = self.rand_f32() > 0.45;
                    (
                        Vec3::new(
                            (self.rand_f32() - 0.5) * 1.4,
                            (self.rand_f32() - 0.5) * 0.8,
                            (self.rand_f32() - 0.5) * 1.4,
                        ),
                        if is_green { [0.2, 1.0, 0.55, 0.9] } else { [0.85, 0.3, 1.0, 0.9] },
                        0.18,
                    )
                }
                WeatherMode::Stardust => (
                    Vec3::new((self.rand_f32() - 0.5) * 0.7, -2.5 - self.rand_f32() * 1.5, (self.rand_f32() - 0.5) * 0.7),
                    [0.85, 0.95, 1.0, 0.8],
                    0.13,
                ),
                WeatherMode::Clear => (Vec3::ZERO, [0.0; 4], 0.0),
            };
            self.weather_particles.push(WeatherParticle {
                pos: self.pack.player().position + Vec3::new(rx, ry, rz),
                vel,
                color,
                scale,
            });
        }
    }

    pub fn switch_robot(&mut self, id: RobotId) -> bool {
        if self.pack.switch_to(id, &mut self.world, &mut self.audio_events) {
            self.target_waypoint = None;
            self.brain.cancel_navigation();
            let thought = self.pack.player_mut().random_thought().to_string();
            self.brain.last_thought = thought.clone();
            self.brain.ui_events.push(BrainUiEvent::ThoughtUpdated {
                robot_name: id.name().to_string(),
                thought,
            });
            true
        } else {
            false
        }
    }

    pub fn trigger_player_jump(&mut self, boost: f32) {
        let idx = self.pack.active_idx;
        let pos = self.pack.dogs[idx].position;
        let ground_y = self.world.get_height_at(pos.x, pos.z);
        if pos.y <= ground_y + 0.25 {
            self.pack.dogs[idx].velocity_y = boost;
            self.pack.anims[idx].play(AnimId::Jump, 1.2, &mut self.pack.dogs[idx]);
            self.audio_events.push(AudioEvent {
                kind: AudioKind::Jump,
                world_pos: pos,
                pitch: self.pack.dogs[idx].profile().voice_pitch,
            });
        }
    }

    pub fn pet_player(&mut self) {
        let idx = self.pack.active_idx;
        self.pack.dogs[idx].pet(&mut self.audio_events);
        let pos = self.pack.dogs[idx].position;
        let name = self.pack.dogs[idx].id.name();
        self.particles.spawn_burst(pos, EmotionId::Loving);
        self.world.log_activity(format!("💖 ¡Mimos para {}!", name));
    }

    pub fn set_player_emotion(&mut self, emo: EmotionId) {
        let idx = self.pack.active_idx;
        self.pack.dogs[idx].set_emotion(emo, &mut self.audio_events, true);
        let pos = self.pack.dogs[idx].position;
        let name = self.pack.dogs[idx].id.name().to_string();
        self.particles.spawn_burst(pos, emo);
        self.brain.ui_events.push(BrainUiEvent::JournalEntry {
            author: name,
            emotion: emo.meta().name.to_string(),
            thought: format!("Cambié mi emoción a {}", emo.meta().name),
        });
    }

    pub fn throw_fetch_ball(&mut self) {
        let idx = self.pack.active_idx;
        let pos = self.pack.dogs[idx].position;
        let rot_y = self.pack.dogs[idx].rotation_y;
        let fwd = Vec3::new(rot_y.sin(), 0.0, rot_y.cos());
        self.world.throw_ball(pos, fwd, 24.0, &mut self.audio_events);
        self.brain.execute_action(
            "fetch_ball",
            &mut self.pack,
            &mut self.world,
            &mut self.particles,
            &mut self.audio_events,
        );
    }

    pub fn spawn_snack_in_front(&mut self) {
        let p = self.pack.player();
        let fwd = Vec3::new(p.rotation_y.sin(), 0.0, p.rotation_y.cos());
        let pos = p.position + fwd * 2.0;
        self.world.spawn_cyber_snack(pos, &mut self.audio_events);
    }

    pub fn navigate_to_waypoint(&mut self, world_x: f32, world_z: f32) {
        let wx = world_x.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
        let wz = world_z.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
        let wy = self.world.get_height_at(wx, wz);
        let wp = Vec3::new(wx, wy, wz);
        self.target_waypoint = Some(wp);
        self.brain.navigate_toward(wp, 5.8, AnimId::Run, ArrivalTask::None, &mut self.pack);
        self.world.log_activity(format!("🎯 Navegando hacia punto táctico ({}, {})", wx.round() as i32, wz.round() as i32));
        self.audio_events.push(AudioEvent {
            kind: AudioKind::Boop,
            world_pos: self.pack.player().position,
            pitch: 1.3,
        });
    }

    pub fn ray_from_ndc(&self, ndc_x: f32, ndc_y: f32, aspect: f32) -> (Vec3, Vec3) {
        let proj = perspective(50.0f32.to_radians(), aspect.max(0.1), 0.25, 1000.0);
        let eye = self.cam_pos;
        let tgt = if (self.cam_target - eye).length_squared() > 1e-4 {
            self.cam_target
        } else {
            eye + Vec3::NEG_Z
        };
        let view = look_at_mat4(eye, tgt, Vec3::Y);
        let inv = (proj * view).inverse();
        let near = inv.project_point3(Vec3::new(ndc_x, ndc_y, 0.0));
        let far = inv.project_point3(Vec3::new(ndc_x, ndc_y, 1.0));
        (near, (far - near).normalize_or_zero())
    }

    pub fn pick_robot_at_ndc(&self, ndc_x: f32, ndc_y: f32, aspect: f32) -> Option<usize> {
        let (ro, rd) = self.ray_from_ndc(ndc_x, ndc_y, aspect);
        let mut best: Option<(usize, f32)> = None;
        for (idx, dog) in self.pack.dogs.iter().enumerate() {
            let center = dog.position + Vec3::new(0.0, 1.15, 0.0);
            let oc = ro - center;
            let b = oc.dot(rd);
            let c = oc.dot(oc) - 1.35 * 1.35;
            let disc = b * b - c;
            if disc >= 0.0 {
                let t = -b - disc.sqrt();
                if t > 0.0 && best.map_or(true, |(_, bt)| t < bt) {
                    best = Some((idx, t));
                }
            }
        }
        best.map(|(i, _)| i)
    }

    pub fn grab_robot(&mut self, idx: usize) {
        if self.grabbed_robot.is_some() || idx >= 5 {
            return;
        }
        self.grabbed_robot = Some(idx);
        self.pack.dogs[idx].is_picked_up = true;
        self.pack.dogs[idx].velocity_y = 0.0;
        if idx == self.pack.active_idx {
            self.brain.cancel_navigation();
        }
        self.pack.anims[idx].play(AnimId::PickedUp, 0.0, &mut self.pack.dogs[idx]);
        let pos = self.pack.dogs[idx].position;
        let name = self.pack.dogs[idx].id.name();
        self.audio_events.push(AudioEvent { kind: AudioKind::Boop, world_pos: pos, pitch: 1.5 });
        self.particles.spawn_burst(pos, EmotionId::Excited);
        self.world.log_activity(format!("✋ ¡Levantaste a {} en el aire con la mano!", name));
    }

    pub fn drag_grabbed_robot_ndc(&mut self, ndc_x: f32, ndc_y: f32, aspect: f32) {
        let Some(idx) = self.grabbed_robot else { return; };
        let (ro, rd) = self.ray_from_ndc(ndc_x, ndc_y, aspect);
        if rd.y.abs() < 1e-4 {
            return;
        }
        let ground_y = self.world.get_height_at(self.pack.dogs[idx].position.x, self.pack.dogs[idx].position.z);
        let target_h = ground_y + 2.4;
        let t = (target_h - ro.y) / rd.y;
        if t > 0.0 && t < 350.0 {
            let hit = ro + rd * t;
            let cx = hit.x.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
            let cz = hit.z.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
            self.pack.dogs[idx].position.x += (cx - self.pack.dogs[idx].position.x) * 0.45;
            self.pack.dogs[idx].position.z += (cz - self.pack.dogs[idx].position.z) * 0.45;
            self.pack.dogs[idx].position.y = target_h;
        }
    }

    pub fn release_grabbed_robot(&mut self) {
        let Some(idx) = self.grabbed_robot.take() else { return; };
        self.pack.dogs[idx].is_picked_up = false;
        self.pack.dogs[idx].velocity_y = -2.5;
        self.pack.dogs[idx].position.x = self.pack.dogs[idx].position.x.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
        self.pack.dogs[idx].position.z = self.pack.dogs[idx].position.z.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
        let name = self.pack.dogs[idx].id.name();
        self.world.log_activity(format!("🐾 ¡Soltaste a {}! Cayendo suavemente al terreno.", name));
    }

    pub fn handle_user_command_immediate(&mut self, cmd: &str) -> BrainDecision {
        let active_id = self.pack.player().id;
        let dec = self.brain.extract_intent_from_text(active_id, None, Some(cmd));
        if !dec.action.is_empty() {
            self.brain.execute_action(
                &dec.action,
                &mut self.pack,
                &mut self.world,
                &mut self.particles,
                &mut self.audio_events,
            );
        }
        if let Some(emo) = EmotionId::from_str_loose(&dec.emotion) {
            let idx = self.pack.active_idx;
            self.pack.dogs[idx].set_emotion(emo, &mut self.audio_events, false);
        }
        let idx = self.pack.active_idx;
        self.audio_events.push(AudioEvent {
            kind: AudioKind::Boop,
            world_pos: self.pack.dogs[idx].position,
            pitch: self.pack.dogs[idx].profile().voice_pitch,
        });
        dec
    }

    pub fn step(&mut self, raw_dt: f32, input: &InputState) {
        let dt = raw_dt.clamp(0.0001, 0.05);
        self.elapsed_time += dt;
        self.star_rot_y += dt * 0.005;

        // 1. Update carried balls position
        for i in 0..5 {
            if let Some(bi) = self.pack.dogs[i].carried_ball_idx {
                let mp = self.pack.dogs[i].mouth_world_pos();
                if let Some(b) = self.world.balls.get_mut(bi) {
                    b.pos = mp;
                    b.velocity = Vec3::ZERO;
                }
            }
        }

        // 2. Manual Player Movement
        self.handle_manual_movement(dt, input);

        // 3. Brain Navigation & Subtasks
        self.brain.update(dt, &mut self.pack, &mut self.world, &mut self.particles, &mut self.audio_events);
        if !self.brain.is_navigating && self.target_waypoint.is_some() {
            self.target_waypoint = None;
        }

        // 4. Player Robot Secondary & Animations
        let p_idx = self.pack.active_idx;
        let p_surface = self.world.footstep_surface_at(self.pack.dogs[p_idx].position.x, self.pack.dogs[p_idx].position.z);
        self.pack.dogs[p_idx].update_secondary(dt);
        self.pack.anims[p_idx].update(dt, &mut self.pack.dogs[p_idx], p_surface, &mut self.audio_events);
        if self.pack.anims[p_idx].sequence_finished_pending {
            self.pack.anims[p_idx].sequence_finished_pending = false;
            self.pack.dogs[p_idx].set_emotion(EmotionId::Happy, &mut self.audio_events, false);
            self.audio_events.push(AudioEvent {
                kind: AudioKind::HappyJingle,
                world_pos: self.pack.dogs[p_idx].position,
                pitch: 1.0,
            });
        }

        // 5. Autonomous Pack Robots
        self.pack.update(dt, &mut self.world, &mut self.audio_events);

        // 6. World, Particles & Weather
        self.world.update(dt, &mut self.audio_events);
        self.particles.update(dt);
        self.update_weather(dt);

        // 7. Camera Update
        self.update_camera(dt, input);
    }

    fn handle_manual_movement(&mut self, dt: f32, input: &InputState) {
        let idx = self.pack.active_idx;
        if self.camera_mode == CameraMode::Free || self.pack.dogs[idx].is_picked_up || self.pack.dogs[idx].is_sliding {
            return;
        }

        let (mut mx, mut mz, is_running) = if let Some(joy) = input.joystick {
            (joy.x, joy.y, input.joystick_running || input.shift)
        } else {
            let mut x = 0.0f32;
            let mut z = 0.0f32;
            if input.forward { z -= 1.0; }
            if input.backward { z += 1.0; }
            if input.left { x -= 1.0; }
            if input.right { x += 1.0; }
            (x, z, input.shift)
        };

        let len = mx.hypot(mz);
        if len > 1.0 {
            mx /= len;
            mz /= len;
        }

        if (mx.abs() > 0.01 || mz.abs() > 0.01) && self.brain.is_navigating {
            self.brain.cancel_navigation();
            self.target_waypoint = None;
        }

        if self.brain.is_navigating {
            return;
        }

        if mx.abs() > 0.01 || mz.abs() > 0.01 {
            self.free_will_timer = 3.0;
            let rpos = self.pack.dogs[idx].position;
            let cam_yaw = (self.cam_pos.x - rpos.x).atan2(self.cam_pos.z - rpos.z);
            let input_angle = mx.atan2(-mz);
            let target_angle = cam_yaw + input_angle;

            let cur_rot = self.pack.dogs[idx].rotation_y;
            let shortest_diff = (target_angle - cur_rot).sin().atan2((target_angle - cur_rot).cos());
            self.pack.dogs[idx].bank_angle = (-shortest_diff * 0.35).clamp(-0.22, 0.22);
            self.pack.dogs[idx].rotation_y = lerp_angle(cur_rot, target_angle, dt * 12.0);

            let base_spd = if is_running { 9.5 } else { 4.8 };
            let spd = base_spd * self.pack.dogs[idx].profile().speed_multiplier;
            let ry = self.pack.dogs[idx].rotation_y;
            let fwd = Vec3::new(ry.sin(), 0.0, ry.cos());
            self.pack.dogs[idx].position += fwd * (spd * dt);

            let mut scratch = Vec::with_capacity(16);
            self.world.resolve_obstacle_collisions(&mut self.pack.dogs[idx].position, 0.75, 1.2, &mut scratch);
            self.pack.dogs[idx].position.x = self.pack.dogs[idx].position.x.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
            self.pack.dogs[idx].position.z = self.pack.dogs[idx].position.z.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);

            if !self.pack.dogs[idx].is_in_water
                && !matches!(self.pack.anims[idx].current_anim, AnimId::Jump | AnimId::Backflip)
            {
                let anim = if is_running { AnimId::Run } else { AnimId::Walk };
                self.pack.anims[idx].play(anim, 0.0, &mut self.pack.dogs[idx]);
            }
        } else {
            let k = (dt * 10.0).min(1.0);
            self.pack.dogs[idx].bank_angle += (0.0 - self.pack.dogs[idx].bank_angle) * k;

            if self.is_free_will {
                self.free_will_timer -= dt;
                if self.free_will_timer <= 0.0 {
                    let r1 = self.rand_f32();
                    let r2 = self.rand_f32();
                    self.free_will_timer = 4.0 + r1 * 5.0;
                    if r2 < 0.6 {
                        let targets = ["go_ball", "go_trampoline", "go_lake", "go_carousel", "go_disco", "go_snack"];
                        let ti = (self.rand_f32() * targets.len() as f32) as usize % targets.len();
                        self.brain.execute_action(
                            targets[ti],
                            &mut self.pack,
                            &mut self.world,
                            &mut self.particles,
                            &mut self.audio_events,
                        );
                    } else {
                        let tricks = [AnimId::WagTail, AnimId::Sniff, AnimId::Spin, AnimId::Wave, AnimId::Dance, AnimId::Roll, AnimId::Howl];
                        let ti = (self.rand_f32() * tricks.len() as f32) as usize % tricks.len();
                        self.pack.anims[idx].play(tricks[ti], 2.5, &mut self.pack.dogs[idx]);
                    }
                }
            } else if matches!(self.pack.anims[idx].current_anim, AnimId::Walk | AnimId::Run) {
                self.pack.anims[idx].play(AnimId::Idle, 0.0, &mut self.pack.dogs[idx]);
            }
        }

        // Unified Parabolic Vertical Physics & World Interactions for Player
        let ground_y = self.world.get_height_at(self.pack.dogs[idx].position.x, self.pack.dogs[idx].position.z);
        if !self.pack.dogs[idx].is_in_water {
            if self.pack.dogs[idx].position.y > ground_y + 0.04 || self.pack.dogs[idx].velocity_y != 0.0 {
                self.pack.dogs[idx].velocity_y -= 18.5 * dt;
                self.pack.dogs[idx].position.y += self.pack.dogs[idx].velocity_y * dt;
                if self.pack.dogs[idx].position.y <= ground_y {
                    self.pack.dogs[idx].position.y = ground_y;
                    if self.pack.dogs[idx].velocity_y < -10.0 {
                        self.particles.spawn_burst(self.pack.dogs[idx].position, EmotionId::Happy);
                    }
                    self.pack.dogs[idx].velocity_y = 0.0;
                }
            } else {
                self.pack.dogs[idx].position.y = ground_y;
                self.pack.dogs[idx].velocity_y = 0.0;
            }
        }

        self.world.handle_robot_interactions(
            &mut self.pack.dogs[idx],
            &mut self.pack.anims[idx],
            dt,
            &mut self.audio_events,
        );
    }

    fn update_weather(&mut self, dt: f32) {
        if self.weather == WeatherMode::Clear {
            return;
        }
        let center = self.pack.player().position;
        for p in &mut self.weather_particles {
            p.pos += p.vel * dt;
            if (p.pos.x - center.x).abs() > 50.0 {
                p.pos.x = center.x - (p.pos.x - center.x).signum() * 48.0;
            }
            if (p.pos.z - center.z).abs() > 50.0 {
                p.pos.z = center.z - (p.pos.z - center.z).signum() * 48.0;
            }
            if p.pos.y < -1.0 {
                p.pos.y = 26.0;
            } else if p.pos.y > 28.0 {
                p.pos.y = 1.5;
            }
        }
    }

    fn update_camera(&mut self, dt: f32, input: &InputState) {
        if input.orbit_delta.length_squared() > 1e-6 {
            self.cam_yaw -= input.orbit_delta.x * 0.0055;
            self.cam_pitch = (self.cam_pitch + input.orbit_delta.y * 0.0055).clamp(0.08, 1.48);
            self.cam_user_orbit_timer = 1.8;
        }
        if input.zoom_delta.abs() > 1e-4 {
            self.cam_dist = (self.cam_dist + input.zoom_delta * 0.025).clamp(3.0, 160.0);
        }
        if self.cam_user_orbit_timer > 0.0 {
            self.cam_user_orbit_timer = (self.cam_user_orbit_timer - dt).max(0.0);
        }

        let target = self.pack.player().position;
        let k_pos = (dt * 6.0).min(1.0);
        let k_tgt = (dt * 8.0).min(1.0);

        match self.camera_mode {
            CameraMode::Diagonal => {
                let desired_tgt = target + Vec3::new(0.0, 1.2, 0.0);
                self.cam_target += (desired_tgt - self.cam_target) * k_tgt;
                if self.cam_user_orbit_timer <= 0.0 {
                    // Gently return toward classic 45 deg diagonal offset while respecting zoom distance
                    let desired_pos = target + Vec3::new(14.0, 15.0, 14.0) * (self.cam_dist / 24.0);
                    self.cam_pos += (desired_pos - self.cam_pos) * (dt * 5.0).min(1.0);
                    let off = self.cam_pos - self.cam_target;
                    self.cam_yaw = off.x.atan2(off.z);
                    self.cam_pitch = (off.y / off.length().max(0.1)).asin().clamp(0.08, 1.48);
                } else {
                    let off = Vec3::new(
                        self.cam_dist * self.cam_pitch.cos() * self.cam_yaw.sin(),
                        self.cam_dist * self.cam_pitch.sin(),
                        self.cam_dist * self.cam_pitch.cos() * self.cam_yaw.cos(),
                    );
                    self.cam_pos = self.cam_target + off;
                }
            }
            CameraMode::Follow => {
                let rot_y = self.pack.player().rotation_y;
                let dist = 7.5 * (self.cam_dist / 24.0).clamp(0.5, 2.5);
                let height = 3.6 * (self.cam_dist / 24.0).clamp(0.5, 2.5);
                let desired_tgt = target + Vec3::new(0.0, 1.2, 0.0);
                let desired_pos = Vec3::new(
                    target.x - rot_y.sin() * dist,
                    target.y + height,
                    target.z - rot_y.cos() * dist,
                );
                self.cam_pos += (desired_pos - self.cam_pos) * k_pos;
                self.cam_target += (desired_tgt - self.cam_target) * k_tgt;
            }
            CameraMode::Orbit => {
                let desired_tgt = target + Vec3::new(0.0, 1.2, 0.0);
                self.cam_target += (desired_tgt - self.cam_target) * (dt * 5.0).min(1.0);
                let off = Vec3::new(
                    self.cam_dist * self.cam_pitch.cos() * self.cam_yaw.sin(),
                    self.cam_dist * self.cam_pitch.sin(),
                    self.cam_dist * self.cam_pitch.cos() * self.cam_yaw.cos(),
                );
                self.cam_pos = self.cam_target + off;
            }
            CameraMode::Free => {
                let fly_speed = (if input.shift { 48.0 } else { 24.0 }) * dt;
                let mut fwd = self.cam_target - self.cam_pos;
                fwd.y = 0.0;
                fwd = fwd.normalize_or_zero();
                let side = fwd.cross(Vec3::Y).normalize_or_zero();
                let mut move_v = Vec3::ZERO;
                if input.forward { move_v += fwd * fly_speed; }
                if input.backward { move_v -= fwd * fly_speed; }
                if input.left { move_v -= side * fly_speed; }
                if input.right { move_v += side * fly_speed; }
                if input.up { move_v.y += fly_speed; }
                if input.down { move_v.y -= fly_speed; }
                self.cam_pos += move_v;
                self.cam_target += move_v;
                if input.orbit_delta.length_squared() > 1e-6 || input.zoom_delta.abs() > 1e-4 {
                    let off = Vec3::new(
                        self.cam_dist * self.cam_pitch.cos() * self.cam_yaw.sin(),
                        self.cam_dist * self.cam_pitch.sin(),
                        self.cam_dist * self.cam_pitch.cos() * self.cam_yaw.cos(),
                    );
                    self.cam_pos = self.cam_target + off;
                }
                self.cam_pos.y = self.cam_pos.y.max(1.8);
                self.cam_target.y = self.cam_target.y.max(1.0);
            }
            CameraMode::Eye => {
                let (ep, et) = self.pack.player().eye_camera_transform();
                self.cam_pos = ep;
                self.cam_target = et;
            }
            CameraMode::Drone => {
                self.drone_angle += dt * 0.35;
                let radius = 18.0;
                let height = 10.0;
                self.cam_pos = Vec3::new(
                    target.x + self.drone_angle.sin() * radius,
                    target.y + height,
                    target.z + self.drone_angle.cos() * radius,
                );
                self.cam_target = target + Vec3::new(0.0, 1.2, 0.0);
            }
        }
    }

    pub fn project_overhead_screen(&self, width: f32, height: f32) -> Option<(f32, f32)> {
        let aspect = (width / height.max(1.0)).max(0.1);
        let proj = perspective(50.0f32.to_radians(), aspect, 0.25, 1000.0);
        let eye = self.cam_pos;
        let tgt = if (self.cam_target - eye).length_squared() > 1e-4 {
            self.cam_target
        } else {
            eye + Vec3::NEG_Z
        };
        let view = look_at_mat4(eye, tgt, Vec3::Y);
        let wp = self.pack.player().overhead_world_pos();
        let clip = proj * view * Vec4::new(wp.x, wp.y, wp.z, 1.0);
        if clip.w <= 0.01 {
            return None;
        }
        let ndc = clip.truncate() / clip.w;
        if ndc.z > 1.0 {
            return None;
        }
        let sx = (ndc.x * 0.5 + 0.5) * width;
        let sy = (-ndc.y * 0.5 + 0.5) * height;
        Some((sx, sy))
    }
}
