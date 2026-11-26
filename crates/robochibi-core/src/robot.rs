use crate::audio_events::{AudioEvent, AudioKind};
use crate::emotions::{EmotionId, FaceRasterizer};
use crate::mesh::{
    beveled_box, box_mesh, cylinder_mesh, disc_mesh, plane_mesh, sphere_mesh, torus_mesh, MatStyle,
    MeshData,
};
use glam::{EulerRot, Mat4, Vec3};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RobotId {
    Sparky,
    Bolt,
    Pixel,
    Luna,
    Rusty,
}

impl RobotId {
    pub const ALL: [RobotId; 5] = [
        RobotId::Sparky,
        RobotId::Bolt,
        RobotId::Pixel,
        RobotId::Luna,
        RobotId::Rusty,
    ];

    pub fn name(self) -> &'static str {
        self.profile().name
    }

    pub fn from_name(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "sparky" => Some(Self::Sparky),
            "bolt" => Some(Self::Bolt),
            "pixel" => Some(Self::Pixel),
            "luna" => Some(Self::Luna),
            "rusty" => Some(Self::Rusty),
            _ => None,
        }
    }

    pub fn profile(self) -> &'static CharacterProfile {
        match self {
            Self::Sparky => &PROFILE_SPARKY,
            Self::Bolt => &PROFILE_BOLT,
            Self::Pixel => &PROFILE_PIXEL,
            Self::Luna => &PROFILE_LUNA,
            Self::Rusty => &PROFILE_RUSTY,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CharacterProfile {
    pub id: RobotId,
    pub name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub primary_color: u32,
    pub secondary_color: u32,
    pub glow_color: u32,
    pub speed_multiplier: f32,
    pub voice_pitch: f32,
    pub avatar_icon: &'static str,
    pub favorite_place: &'static str,
    pub thoughts: &'static [&'static str],
}

pub static PROFILE_SPARKY: CharacterProfile = CharacterProfile {
    id: RobotId::Sparky,
    name: "Sparky",
    title: "El Explorador Curioso",
    description: "Equilibrado, cariñoso y fascinado por descubrir cada rincón del prado y el lago.",
    primary_color: 0xf8fafc,
    secondary_color: 0x1e293b,
    glow_color: 0x22ff88,
    speed_multiplier: 1.0,
    voice_pitch: 1.0,
    avatar_icon: "🐾",
    favorite_place: "Prado Esmeralda",
    thoughts: &[
        "¡El prado verde huele a flores y aire fresco digital!",
        "¿Qué habrá al otro lado de esa colina?",
        "¡Me encanta pasear con mi manada de amigos!",
        "Siento una gran energía en mis sensores hoy.",
        "El agua del lago refleja el cielo como un espejo cristalino.",
    ],
};

pub static PROFILE_BOLT: CharacterProfile = CharacterProfile {
    id: RobotId::Bolt,
    name: "Bolt",
    title: "El Relámpago Veloz",
    description: "Hiperactivo y supersónico. Vive por y para perseguir pelotas a toda velocidad.",
    primary_color: 0x1e293b,
    secondary_color: 0xfacc15,
    glow_color: 0xffea00,
    speed_multiplier: 1.35,
    voice_pitch: 1.25,
    avatar_icon: "⚡",
    favorite_place: "Parque de Juegos",
    thoughts: &[
        "¡Zuuuum! ¡Nadie me gana en una carrera hacia la pelota!",
        "¡Pásamela, pásamela, goléala fuerte!",
        "¡Mis propulsores jet están que arden de emoción!",
        "¡Mira qué rápido puedo dar la vuelta al parque!",
        "¡Una pelota en movimiento! ¡Allá vooooy!",
    ],
};

pub static PROFILE_PIXEL: CharacterProfile = CharacterProfile {
    id: RobotId::Pixel,
    name: "Pixel",
    title: "El Hacker del Lago",
    description: "Analítico y curioso. Adora escanear el agua, las rocas y calcular trayectorias.",
    primary_color: 0x0f172a,
    secondary_color: 0x00e5ff,
    glow_color: 0x00e5ff,
    speed_multiplier: 1.05,
    voice_pitch: 1.12,
    avatar_icon: "🔍",
    favorite_place: "Lago de Cristal",
    thoughts: &[
        "Analizando refracción de luz en las ondas del lago...",
        "Detecto 99.8% de serenidad en el muelle de madera.",
        "Escaneando objetos interactivos en el cuadrante norte.",
        "¡Qué estructura tan interesante tienen estos nenúfares!",
        "Calibrando compás digital con la orilla.",
    ],
};

pub static PROFILE_LUNA: CharacterProfile = CharacterProfile {
    id: RobotId::Luna,
    name: "Luna",
    title: "La Soñadora Celestial",
    description: "Dulce, tranquila y afectuosa. Le fascina mirar las nubes y tomar siestas acogedoras.",
    primary_color: 0x334155,
    secondary_color: 0xf472b6,
    glow_color: 0xff4081,
    speed_multiplier: 0.95,
    voice_pitch: 1.35,
    avatar_icon: "💖",
    favorite_place: "Estación de Recarga",
    thoughts: &[
        "El cielo está tan bonito hoy... parece un cuadro suave.",
        "Descansar en la estación de recarga me llena de paz.",
        "¡Te mando un saludo lleno de chispas de amor y mimos!",
        "Las flores silvestres huelen delicioso.",
        "A veces es lindo sentarse y simplemente escuchar el viento.",
    ],
};

pub static PROFILE_RUSTY: CharacterProfile = CharacterProfile {
    id: RobotId::Rusty,
    name: "Rusty",
    title: "El Acróbata Ágil",
    description: "Gimnasta intrépido y juguetón. Siempre está inventando saltos, giros y volteretas.",
    primary_color: 0x1e293b,
    secondary_color: 0xf97316,
    glow_color: 0xff9100,
    speed_multiplier: 1.15,
    voice_pitch: 0.88,
    avatar_icon: "🤸",
    favorite_place: "Parque de Juegos",
    thoughts: &[
        "¿Viste mi voltereta triple sobre el trampolín?",
        "¡Acrobacia completada con un 10 perfecto!",
        "¡Voy a subirme al carrusel a dar vueltas!",
        "¡Hagamos un truco nuevo juntos, mira cómo giro!",
        "¡El suelo es lava cibernética! ¡A saltar alto!",
    ],
};

#[derive(Debug, Clone, Copy)]
pub struct LegPose {
    pub hip_rot: Vec3,
    pub knee_rot_x: f32,
    pub paw_rot_x: f32,
}

impl Default for LegPose {
    fn default() -> Self {
        Self {
            hip_rot: Vec3::ZERO,
            knee_rot_x: 0.0,
            paw_rot_x: 0.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RobotPose {
    pub body_pos: Vec3,
    pub body_rot: Vec3,
    pub body_scale: Vec3,
    pub neck_rot: Vec3,
    pub ear_l_rot: Vec3,
    pub ear_r_rot: Vec3,
    pub tail_rot: Vec3,
    /// [FL, FR, BL, BR]
    pub legs: [LegPose; 4],
}

impl Default for RobotPose {
    fn default() -> Self {
        Self {
            body_pos: Vec3::new(0.0, 0.95, 0.0),
            body_rot: Vec3::ZERO,
            body_scale: Vec3::ONE,
            neck_rot: Vec3::ZERO,
            ear_l_rot: Vec3::new(0.0, 0.0, 0.25),
            ear_r_rot: Vec3::new(0.0, 0.0, -0.25),
            tail_rot: Vec3::new(0.55, 0.0, 0.0),
            legs: [LegPose::default(); 4],
        }
    }
}

#[derive(Debug, Clone)]
pub struct DialogueEntry {
    pub role: String,
    pub author: String,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiPackState {
    Wander,
    ChaseBall,
    ChaseSnack,
    GoRecharge,
    Recharging,
    GoTrampoline,
    GoBallpit,
    GoSlide,
    GoTunnel,
    GoTarget,
    GoPinata,
    AssemblePack,
    PlayTag,
    SpeedRace,
    PackGossip,
    InteractPlayer,
    InteractDog,
    Pause,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TagRole {
    Chaser,
    Prey,
}

#[derive(Debug, Clone)]
pub struct PackAiState {
    pub state: AiPackState,
    pub target_pos: Vec3,
    pub target_ball_idx: Option<usize>,
    pub target_snack_id: Option<u64>,
    pub state_timer: f32,
    pub speed: f32,
    pub last_interacted_dog: Option<RobotId>,
    pub player_greet_cooldown: f32,
    pub dog_greet_cooldown: f32,
    pub tag_role: Option<TagRole>,
    pub tag_target: Option<RobotId>,
    pub stuck_timer: f32,
    pub last_pos: Vec3,
}

pub struct ChibiRobotDog {
    pub id: RobotId,
    pub is_player: bool,
    pub position: Vec3,
    pub rotation_y: f32,
    pub bank_angle: f32,
    pub velocity_y: f32,

    pub current_emotion: EmotionId,
    pub face: FaceRasterizer,
    pub pose: RobotPose,

    // Drives
    pub energy: f32,
    pub curiosity: f32,
    pub sociability: f32,
    pub affection: f32,
    pub hydration: f32,
    pub playfulness: f32,

    pub carried_ball_idx: Option<usize>,
    pub tail_helicopter_timer: f32,
    pub ear_spring_vel_l: f32,
    pub ear_spring_vel_r: f32,
    pub last_position: Vec3,
    pub speed_scalar: f32,

    // Dynamic visual animation extras
    pub halo_spin: f32,
    pub halo_bob_y: f32,
    pub power_core_spin: f32,
    pub compass_needle_rot: f32,
    pub turbo_flame_visible: bool,
    pub turbo_flame_scale: f32,
    pub wing_l_rot_y: f32,
    pub wing_r_rot_y: f32,
    pub tail_propeller_rot: f32,
    pub sat_dish_spin: f32,
    pub neon_pulse: f32,

    // Head look-at
    pub look_target: Vec3,
    pub has_look_target: bool,

    // States & timers
    pub is_picked_up: bool,
    pub is_sliding: bool,
    pub slide_progress: f32,
    pub in_tunnel: bool,
    pub tunnel_timer: f32,
    pub is_in_water: bool,
    pub was_in_water: bool,
    pub last_tramp_cooldown: f32,
    pub tramp_consecutive_hits: u32,
    pub last_drink_cooldown: f32,
    pub last_ballpit_cooldown: f32,

    pub dialogue_history: Vec<DialogueEntry>,
    pub ai: PackAiState,
    rng_seed: u64,
}

impl ChibiRobotDog {
    pub fn new(id: RobotId, is_player: bool, start_pos: Vec3) -> Self {
        let seed_offset = match id {
            RobotId::Sparky => 0.1,
            RobotId::Bolt => 1.3,
            RobotId::Pixel => 2.7,
            RobotId::Luna => 4.1,
            RobotId::Rusty => 5.5,
        };
        let profile = id.profile();
        Self {
            id,
            is_player,
            position: start_pos,
            rotation_y: 0.0,
            bank_angle: 0.0,
            velocity_y: 0.0,
            current_emotion: EmotionId::Happy,
            face: FaceRasterizer::new(seed_offset),
            pose: RobotPose::default(),
            energy: 100.0,
            curiosity: 85.0,
            sociability: 90.0,
            affection: 88.0,
            hydration: 90.0,
            playfulness: 80.0,
            carried_ball_idx: None,
            tail_helicopter_timer: 0.0,
            ear_spring_vel_l: 0.0,
            ear_spring_vel_r: 0.0,
            last_position: start_pos,
            speed_scalar: 0.0,
            halo_spin: 0.0,
            halo_bob_y: 2.32,
            power_core_spin: 0.0,
            compass_needle_rot: 0.0,
            turbo_flame_visible: false,
            turbo_flame_scale: 1.0,
            wing_l_rot_y: 0.25,
            wing_r_rot_y: -0.25,
            tail_propeller_rot: 0.0,
            sat_dish_spin: 0.0,
            neon_pulse: 1.2,
            look_target: Vec3::ZERO,
            has_look_target: false,
            is_picked_up: false,
            is_sliding: false,
            slide_progress: 0.0,
            in_tunnel: false,
            tunnel_timer: 0.0,
            is_in_water: false,
            was_in_water: false,
            last_tramp_cooldown: 0.0,
            tramp_consecutive_hits: 0,
            last_drink_cooldown: 0.0,
            last_ballpit_cooldown: 0.0,
            dialogue_history: Vec::new(),
            ai: PackAiState {
                state: AiPackState::Wander,
                target_pos: start_pos,
                target_ball_idx: None,
                target_snack_id: None,
                state_timer: 2.0 + seed_offset,
                speed: 3.4 * profile.speed_multiplier,
                last_interacted_dog: None,
                player_greet_cooldown: 0.0,
                dog_greet_cooldown: 0.0,
                tag_role: None,
                tag_target: None,
                stuck_timer: 0.0,
                last_pos: start_pos,
            },
            rng_seed: (id as u64 + 1).wrapping_mul(0x9e3779b97f4a7c15),
        }
    }

    pub fn profile(&self) -> &'static CharacterProfile {
        self.id.profile()
    }

    pub fn next_rand(&mut self) -> f32 {
        self.rng_seed ^= self.rng_seed << 13;
        self.rng_seed ^= self.rng_seed >> 7;
        self.rng_seed ^= self.rng_seed << 17;
        ((self.rng_seed & 0xffffff) as f32) / 16777216.0
    }

    pub fn random_thought(&mut self) -> &'static str {
        let thoughts = self.profile().thoughts;
        let idx = (self.next_rand() * thoughts.len() as f32) as usize % thoughts.len();
        thoughts[idx]
    }

    pub fn add_dialogue(&mut self, role: &str, author: &str, text: &str) {
        self.dialogue_history.push(DialogueEntry {
            role: role.to_string(),
            author: author.to_string(),
            text: text.to_string(),
        });
        if self.dialogue_history.len() > 60 {
            self.dialogue_history.remove(0);
        }
    }

    pub fn set_emotion(&mut self, emotion: EmotionId, audio_out: &mut Vec<AudioEvent>, play_sound: bool) {
        self.current_emotion = emotion;
        self.face.draw_face(emotion, false);

        if play_sound && self.is_player {
            let pitch = self.profile().voice_pitch;
            let (kind, p) = match emotion {
                EmotionId::Happy => (AudioKind::HappyJingle, 1.0),
                EmotionId::Curious => (AudioKind::Curious, 1.0),
                EmotionId::Excited => (AudioKind::Bark, 1.3 * pitch),
                EmotionId::Loving => (AudioKind::Boop, 1.1 * pitch),
                EmotionId::Alert => (AudioKind::Bark, 0.9 * pitch),
                EmotionId::Sleepy => (AudioKind::Boop, 0.8 * pitch),
                EmotionId::Mischievous => (AudioKind::Bark, 1.4 * pitch),
                EmotionId::Proud => (AudioKind::TrickSuccess, 1.0),
                EmotionId::Scared => (AudioKind::Bark, 0.7 * pitch),
                EmotionId::Hungry => (AudioKind::Curious, 1.0),
                EmotionId::Party => (AudioKind::DiscoBeat(0), 1.0),
                EmotionId::Confused => (AudioKind::Confused, 1.0),
            };
            audio_out.push(AudioEvent {
                kind,
                world_pos: self.position,
                pitch: p,
            });
        }
    }

    pub fn pet(&mut self, audio_out: &mut Vec<AudioEvent>) {
        self.set_emotion(EmotionId::Loving, audio_out, false);
        self.curiosity = (self.curiosity + 15.0).min(100.0);
        self.energy = (self.energy + 25.0).min(100.0);
        self.affection = (self.affection + 15.0).min(100.0);
        audio_out.push(AudioEvent {
            kind: AudioKind::Boop,
            world_pos: self.position,
            pitch: 1.2 * self.profile().voice_pitch,
        });
    }

    pub fn praise(&mut self, audio_out: &mut Vec<AudioEvent>) {
        self.set_emotion(EmotionId::Loving, audio_out, false);
        self.affection = (self.affection + 25.0).min(100.0);
        self.curiosity = (self.curiosity + 10.0).min(100.0);
        self.energy = (self.energy + 15.0).min(100.0);
        self.tail_helicopter_timer = 4.0;
        audio_out.push(AudioEvent {
            kind: AudioKind::HappyJingle,
            world_pos: self.position,
            pitch: 1.0,
        });
    }

    pub fn quench_thirst(&mut self, audio_out: &mut Vec<AudioEvent>) {
        self.hydration = 100.0;
        self.energy = (self.energy + 20.0).min(100.0);
        self.set_emotion(EmotionId::Curious, audio_out, false);
        audio_out.push(AudioEvent {
            kind: AudioKind::Splash,
            world_pos: self.position,
            pitch: 1.0,
        });
    }

    pub fn look_at(&mut self, target: Vec3) {
        self.look_target = target;
        self.has_look_target = true;
    }

    pub fn update_secondary(&mut self, dt: f32) {
        self.face.update(dt, self.current_emotion);

        if self.last_tramp_cooldown > 0.0 {
            self.last_tramp_cooldown = (self.last_tramp_cooldown - dt).max(0.0);
        }
        if self.last_drink_cooldown > 0.0 {
            self.last_drink_cooldown = (self.last_drink_cooldown - dt).max(0.0);
        }
        if self.last_ballpit_cooldown > 0.0 {
            self.last_ballpit_cooldown = (self.last_ballpit_cooldown - dt).max(0.0);
        }

        let moved_dist = self.position.distance(self.last_position);
        let inst_speed = moved_dist / dt.max(0.001);
        self.speed_scalar += (inst_speed - self.speed_scalar) * (dt * 8.0).min(1.0);
        self.last_position = self.position;

        // Halo & neon pulse
        if self.is_player {
            self.halo_spin += dt * 1.6;
            self.halo_bob_y = 2.32 + (self.face.anim_time * 4.0).sin() * 0.08;
        }
        self.neon_pulse = 1.2 + (self.face.anim_time * 3.5).sin() * 0.25;
        self.power_core_spin += dt * (2.5 + self.speed_scalar * 1.4);

        // Body bank angle smoothing
        self.pose.body_rot.z += (self.bank_angle - self.pose.body_rot.z) * (dt * 8.0).min(1.0);

        // Floppy ears spring dynamics
        let ear_rest_l = 0.25f32;
        let ear_rest_r = -0.25f32;
        let ear_excite = self.speed_scalar * 0.035
            + if self.current_emotion == EmotionId::Excited {
                0.2
            } else {
                0.0
            };
        let ear_osc = (self.face.anim_time * 12.0).sin() * ear_excite;

        self.ear_spring_vel_l += (ear_rest_l + ear_osc - self.pose.ear_l_rot.z) * 22.0 * dt;
        self.ear_spring_vel_l *= (-9.0 * dt).exp();
        self.pose.ear_l_rot.z += self.ear_spring_vel_l * dt;

        self.ear_spring_vel_r += (ear_rest_r - ear_osc - self.pose.ear_r_rot.z) * 22.0 * dt;
        self.ear_spring_vel_r *= (-9.0 * dt).exp();
        self.pose.ear_r_rot.z += self.ear_spring_vel_r * dt;

        // Character-specific animated gadgets
        match self.id {
            RobotId::Sparky => {
                // Compass points toward world North (-Z) relative to robot heading
                self.compass_needle_rot = -self.rotation_y + (self.face.anim_time * 2.0).sin() * 0.04;
            }
            RobotId::Bolt => {
                self.turbo_flame_visible = self.speed_scalar > 4.6;
                self.turbo_flame_scale = 0.85 + (self.face.anim_time * 38.0).sin().abs() * 0.55;
            }
            RobotId::Pixel => {
                self.sat_dish_spin += dt * (1.8 + self.speed_scalar * 0.4);
            }
            RobotId::Luna => {
                let flap = (self.face.anim_time * 6.5).sin() * 0.28;
                self.wing_l_rot_y = 0.25 + flap;
                self.wing_r_rot_y = -0.25 - flap;
            }
            RobotId::Rusty => {
                self.tail_propeller_rot += dt * (9.0 + self.speed_scalar * 4.0);
            }
        }

        // Helicopter tail wagging
        if self.tail_helicopter_timer > 0.0 {
            self.tail_helicopter_timer = (self.tail_helicopter_timer - dt).max(0.0);
            self.pose.tail_rot.z += dt * 28.0;
        }

        // Head look-at target (FIXED pitch math using horizontal distance so target behind never flips!)
        if self.has_look_target {
            let root_inv = self.root_matrix().inverse();
            let local = root_inv.transform_point3(self.look_target);
            let angle_y = local.x.atan2(local.z).clamp(-0.85, 0.85);
            let horiz = (local.x * local.x + local.z * local.z).sqrt().max(0.25);
            let angle_x = (-(local.y - 1.2).atan2(horiz)).clamp(-0.4, 0.4);
            let t = (dt * 5.0).min(1.0);
            self.pose.neck_rot.y += (angle_y - self.pose.neck_rot.y) * t;
            self.pose.neck_rot.x += (angle_x - self.pose.neck_rot.x) * t;
        }
    }

    pub fn root_matrix(&self) -> Mat4 {
        Mat4::from_translation(self.position) * Mat4::from_rotation_y(self.rotation_y)
    }

    pub fn body_matrix(&self) -> Mat4 {
        self.root_matrix()
            * Mat4::from_translation(self.pose.body_pos)
            * Mat4::from_euler(
                EulerRot::XYZ,
                self.pose.body_rot.x,
                self.pose.body_rot.y,
                self.pose.body_rot.z,
            )
            * Mat4::from_scale(self.pose.body_scale)
    }

    pub fn neck_matrix(&self) -> Mat4 {
        self.body_matrix()
            * Mat4::from_translation(Vec3::new(0.0, 0.38, 0.65))
            * Mat4::from_euler(
                EulerRot::XYZ,
                self.pose.neck_rot.x,
                self.pose.neck_rot.y,
                self.pose.neck_rot.z,
            )
    }

    pub fn head_matrix(&self) -> Mat4 {
        self.neck_matrix()
    }

    pub fn eye_camera_transform(&self) -> (Vec3, Vec3) {
        let head = self.head_matrix();
        // Eye camera sits cleanly ahead of visor & nose so the dog never clips its own head
        let eye_pos = head.transform_point3(Vec3::new(0.0, 0.56, 1.05));
        let forward = head.transform_vector3(Vec3::new(0.0, -0.04, 1.0)).normalize_or_zero();
        (eye_pos, eye_pos + forward * 10.0)
    }

    pub fn mouth_world_pos(&self) -> Vec3 {
        self.head_matrix().transform_point3(Vec3::new(0.0, 0.17, 0.98))
    }

    pub fn overhead_world_pos(&self) -> Vec3 {
        self.position + Vec3::new(0.0, 2.58, 0.0)
    }

    pub fn hip_matrix(&self, leg_idx: usize) -> Mat4 {
        let (x, z) = match leg_idx {
            0 => (-0.46, 0.46),  // FL
            1 => (0.46, 0.46),   // FR
            2 => (-0.46, -0.46), // BL
            _ => (0.46, -0.46),  // BR
        };
        let l = self.pose.legs[leg_idx];
        self.body_matrix()
            * Mat4::from_translation(Vec3::new(x, -0.18, z))
            * Mat4::from_euler(EulerRot::XYZ, l.hip_rot.x, l.hip_rot.y, l.hip_rot.z)
    }

    pub fn knee_matrix(&self, leg_idx: usize) -> Mat4 {
        let l = self.pose.legs[leg_idx];
        self.hip_matrix(leg_idx)
            * Mat4::from_translation(Vec3::new(0.0, -0.44, 0.0))
            * Mat4::from_rotation_x(l.knee_rot_x)
    }

    pub fn paw_matrix(&self, leg_idx: usize) -> Mat4 {
        let l = self.pose.legs[leg_idx];
        self.knee_matrix(leg_idx)
            * Mat4::from_translation(Vec3::new(0.0, -0.40, 0.08))
            * Mat4::from_rotation_x(l.paw_rot_x)
    }

    pub fn ear_matrix(&self, is_left: bool) -> Mat4 {
        let sign = if is_left { -1.0 } else { 1.0 };
        let r = if is_left {
            self.pose.ear_l_rot
        } else {
            self.pose.ear_r_rot
        };
        self.head_matrix()
            * Mat4::from_translation(Vec3::new(sign * 0.56, 0.90, 0.18))
            * Mat4::from_euler(EulerRot::XYZ, r.x, r.y, r.z)
    }

    pub fn tail_matrix(&self) -> Mat4 {
        self.body_matrix()
            * Mat4::from_translation(Vec3::new(0.0, 0.24, -0.68))
            * Mat4::from_euler(
                EulerRot::XYZ,
                self.pose.tail_rot.x,
                self.pose.tail_rot.y,
                self.pose.tail_rot.z,
            )
    }
}

/// Pre-built high-detail static part meshes for each Chibi Robot Dog!
/// Separating rigid-joint sub-meshes allows smooth skeletal animation at zero per-frame mesh rebuild cost.
pub struct RobotMeshSet {
    pub torso: MeshData,
    pub power_turbine: MeshData,
    pub neck_and_head: MeshData,
    pub face_quad: MeshData,
    pub ear: MeshData,
    pub tail: MeshData,
    pub upper_leg_l: MeshData,
    pub upper_leg_r: MeshData,
    pub lower_leg: MeshData,
    pub paw: MeshData,
    pub halo_ring: MeshData,
    // Character hero accessories
    pub sparky_compass_needle: Option<MeshData>,
    pub bolt_turbo_flame: Option<MeshData>,
    pub pixel_sat_dish: Option<MeshData>,
    pub luna_wing_l: Option<MeshData>,
    pub luna_wing_r: Option<MeshData>,
    pub rusty_tail_propeller: Option<MeshData>,
}

pub fn build_robot_mesh_set(id: RobotId, emotion: EmotionId) -> RobotMeshSet {
    let profile = id.profile();
    let neon_hex = emotion.meta().color_hex;

    let main_mat = MatStyle::from_hex(profile.primary_color, 0.18, 0.25, 0.0, 0.9);
    let dark_mat = MatStyle::from_hex(profile.secondary_color, 0.34, 0.72, 0.0, 0.3);
    let joint_mat = MatStyle::from_hex(0x64748b, 0.22, 0.85, 0.0, 0.2);
    let chrome_mat = MatStyle::from_hex(0xf1f5f9, 0.08, 0.95, 0.0, 0.6);
    let neon_mat = MatStyle::from_hex(neon_hex, 0.15, 0.1, 1.35, 0.4);
    let blush_mat = MatStyle::from_hex_alpha(0xff3399, 0.85, 0.2, 0.0, 0.9, 0.2);
    let glass_mat = MatStyle::from_hex_alpha(0x0f172a, 0.26, 0.05, 0.1, 0.0, 1.0);

    // 1. TORSO (rounded super-smooth chibi chassis + armor plates + backpack + thrusters + collar)
    let mut torso = MeshData::new();
    torso.merge(&beveled_box(0.94, 0.74, 1.38, 0.16, 4, main_mat));

    let mut belly = beveled_box(0.76, 0.24, 1.14, 0.09, 3, dark_mat);
    belly.translate(Vec3::new(0.0, -0.28, 0.0));
    torso.merge(&belly);

    let mut side_armor = beveled_box(0.99, 0.46, 1.06, 0.09, 3, dark_mat);
    side_armor.translate(Vec3::new(0.0, 0.04, 0.0));
    torso.merge(&side_armor);

    let mut stripe = beveled_box(1.02, 0.08, 0.92, 0.025, 2, neon_mat);
    stripe.translate(Vec3::new(0.0, 0.04, 0.0));
    torso.merge(&stripe);

    // Chest Arc Reactor housing
    let mut core_rim = cylinder_mesh(0.21, 0.23, 0.07, 24, false, chrome_mat);
    core_rim.transform(
        Mat4::from_translation(Vec3::new(0.0, 0.05, 0.68))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
    );
    torso.merge(&core_rim);

    let mut core_inner = cylinder_mesh(0.14, 0.14, 0.09, 24, false, neon_mat);
    core_inner.transform(
        Mat4::from_translation(Vec3::new(0.0, 0.05, 0.69))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
    );
    torso.merge(&core_inner);

    // Arc reactor spinning turbine blades
    let mut power_turbine = MeshData::new();
    for b in 0..3 {
        let a = (b as f32 / 3.0) * std::f32::consts::PI;
        let mut blade = box_mesh(0.24, 0.025, 0.02, chrome_mat);
        blade.transform(Mat4::from_rotation_z(a));
        power_turbine.merge(&blade);
    }

    // Cyber Collar + Neon Halo + Dog Tag
    let mut collar = torus_mesh(0.38, 0.065, 14, 28, std::f32::consts::TAU, dark_mat);
    collar.transform(
        Mat4::from_translation(Vec3::new(0.0, 0.36, 0.56))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2 + 0.35),
    );
    torso.merge(&collar);

    let mut collar_glow = torus_mesh(0.39, 0.022, 10, 28, std::f32::consts::TAU, neon_mat);
    collar_glow.transform(
        Mat4::from_translation(Vec3::new(0.0, 0.36, 0.56))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2 + 0.35),
    );
    torso.merge(&collar_glow);

    let mut tag = cylinder_mesh(0.09, 0.09, 0.035, 20, false, neon_mat);
    tag.transform(
        Mat4::from_translation(Vec3::new(0.0, 0.25, 0.77))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
    );
    torso.merge(&tag);

    // Backpack Power Cell + Battery Bars + Dual Jet Thrusters
    let mut pack = beveled_box(0.66, 0.33, 0.80, 0.09, 3, dark_mat);
    pack.translate(Vec3::new(0.0, 0.45, -0.08));
    torso.merge(&pack);

    for b in [-0.18, -0.06, 0.06, 0.18] {
        let mut bar = beveled_box(0.42, 0.03, 0.05, 0.01, 2, neon_mat);
        bar.translate(Vec3::new(0.0, 0.62, -0.08 + b));
        torso.merge(&bar);
    }
    for tx in [-0.22, 0.22] {
        let mut thr = cylinder_mesh(0.09, 0.135, 0.28, 16, false, chrome_mat);
        thr.transform(
            Mat4::from_translation(Vec3::new(tx, 0.47, -0.52))
                * Mat4::from_rotation_x(-std::f32::consts::FRAC_PI_3),
        );
        torso.merge(&thr);

        let mut noz = cylinder_mesh(0.068, 0.085, 0.08, 16, false, neon_mat);
        noz.transform(
            Mat4::from_translation(Vec3::new(tx, 0.40, -0.60))
                * Mat4::from_rotation_x(-std::f32::consts::FRAC_PI_3),
        );
        torso.merge(&noz);
    }

    // Hero torso accessories
    let mut sparky_compass_needle = None;
    let mut bolt_turbo_flame = None;
    let mut luna_wing_l = None;
    let mut luna_wing_r = None;

    match id {
        RobotId::Sparky => {
            let mut compass = cylinder_mesh(0.10, 0.10, 0.035, 20, false, chrome_mat);
            compass.transform(
                Mat4::from_translation(Vec3::new(0.0, 0.20, 0.72))
                    * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
            );
            torso.merge(&compass);
            let mut needle = box_mesh(0.025, 0.14, 0.02, neon_mat);
            needle.translate(Vec3::new(0.0, 0.02, 0.0));
            sparky_compass_needle = Some(needle);
        }
        RobotId::Bolt => {
            let mut fin = beveled_box(0.07, 0.48, 0.70, 0.02, 2, neon_mat);
            fin.transform(
                Mat4::from_translation(Vec3::new(0.0, 0.74, -0.22)) * Mat4::from_rotation_x(-0.38),
            );
            torso.merge(&fin);
            let flame_mat = MatStyle::from_hex_alpha(0xffea00, 0.9, 0.1, 0.0, 1.8, 0.0);
            let mut flame = cylinder_mesh(0.01, 0.085, 0.34, 14, false, flame_mat);
            flame.transform(Mat4::from_rotation_x(-std::f32::consts::FRAC_PI_2));
            bolt_turbo_flame = Some(flame);
        }
        RobotId::Luna => {
            let wing_mat = MatStyle::from_hex_alpha(0xff80ab, 0.88, 0.15, 0.1, 0.85, 1.0);
            let build_wing = |sign: f32| {
                let mut w = MeshData::new();
                for f in 0..3 {
                    let mut feather = beveled_box(
                        0.045,
                        0.14 - f as f32 * 0.02,
                        0.64 - f as f32 * 0.12,
                        0.018,
                        2,
                        wing_mat,
                    );
                    feather.transform(
                        Mat4::from_translation(Vec3::new(
                            0.0,
                            0.1 - f as f32 * 0.11,
                            -(f as f32) * 0.06,
                        )) * Mat4::from_euler(EulerRot::YXZ, sign * 0.26, 0.15, 0.0),
                    );
                    w.merge(&feather);
                }
                w
            };
            luna_wing_l = Some(build_wing(-1.0));
            luna_wing_r = Some(build_wing(1.0));

            let heart_mat = MatStyle::from_hex(0xff3399, 0.15, 0.1, 1.2, 0.5);
            let mut amulet = sphere_mesh(0.09, 16, 12, heart_mat);
            amulet.translate(Vec3::new(0.0, 0.26, 0.78));
            torso.merge(&amulet);
        }
        _ => {}
    }

    // 2. NECK & HEAD
    let mut neck_and_head = MeshData::new();
    let mut neck_joint = cylinder_mesh(0.18, 0.22, 0.22, 16, false, joint_mat);
    neck_joint.translate(Vec3::new(0.0, 0.08, 0.05));
    neck_and_head.merge(&neck_joint);

    let mut head_shell = beveled_box(1.14, 0.96, 1.04, 0.20, 4, main_mat);
    head_shell.translate(Vec3::new(0.0, 0.48, 0.22));
    neck_and_head.merge(&head_shell);

    for bx in [-0.34, 0.34] {
        let mut blush = disc_mesh(0.065, 16, blush_mat);
        blush.translate(Vec3::new(bx, 0.32, 0.76));
        neck_and_head.merge(&blush);
    }

    for cx in [-0.58, 0.58] {
        let mut disc = cylinder_mesh(0.22, 0.22, 0.06, 20, false, dark_mat);
        disc.transform(
            Mat4::from_translation(Vec3::new(cx, 0.46, 0.22))
                * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2),
        );
        neck_and_head.merge(&disc);

        let mut ring = torus_mesh(0.16, 0.022, 10, 20, std::f32::consts::TAU, neon_mat);
        ring.transform(
            Mat4::from_translation(Vec3::new(cx + if cx > 0.0 { 0.03 } else { -0.03 }, 0.46, 0.22))
                * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_2),
        );
        neck_and_head.merge(&ring);
    }

    let mut bezel = beveled_box(0.98, 0.64, 0.08, 0.04, 2, dark_mat);
    bezel.translate(Vec3::new(0.0, 0.48, 0.71));
    neck_and_head.merge(&bezel);

    // Glossy glass visor overlay slightly in front of face screen
    let mut glass_visor = beveled_box(0.94, 0.60, 0.015, 0.02, 2, glass_mat);
    glass_visor.translate(Vec3::new(0.0, 0.48, 0.762));
    neck_and_head.merge(&glass_visor);

    // Forehead brow shield
    let mut brow = beveled_box(1.12, 0.13, 0.46, 0.04, 2, dark_mat);
    brow.translate(Vec3::new(0.0, 0.91, 0.49));
    neck_and_head.merge(&brow);

    // Snout & nose
    let mut snout = beveled_box(0.48, 0.25, 0.34, 0.08, 3, dark_mat);
    snout.translate(Vec3::new(0.0, 0.25, 0.76));
    neck_and_head.merge(&snout);

    let mut nose = sphere_mesh(0.095, 18, 14, neon_mat);
    nose.transform(
        Mat4::from_translation(Vec3::new(0.0, 0.33, 0.94))
            * Mat4::from_scale(Vec3::new(1.15, 0.85, 0.95)),
    );
    neck_and_head.merge(&nose);

    // Cyber Antenna + Signal Halo + Glowing Orb
    let mut ant_base = cylinder_mesh(0.01, 0.09, 0.10, 14, false, dark_mat);
    ant_base.translate(Vec3::new(0.0, 0.98, 0.05));
    neck_and_head.merge(&ant_base);

    let mut ant_stem = cylinder_mesh(0.02, 0.03, 0.34, 12, false, chrome_mat);
    ant_stem.translate(Vec3::new(0.0, 1.15, 0.05));
    neck_and_head.merge(&ant_stem);

    let mut ant_ring = torus_mesh(0.09, 0.02, 10, 20, std::f32::consts::TAU, neon_mat);
    ant_ring.transform(
        Mat4::from_translation(Vec3::new(0.0, 1.26, 0.05))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
    );
    neck_and_head.merge(&ant_ring);

    let mut ant_ball = sphere_mesh(0.085, 16, 12, neon_mat);
    ant_ball.translate(Vec3::new(0.0, 1.36, 0.05));
    neck_and_head.merge(&ant_ball);

    // Hero head accessories
    let mut pixel_sat_dish = None;
    match id {
        RobotId::Sparky => {
            let mut strap = beveled_box(1.18, 0.09, 0.98, 0.02, 2, dark_mat);
            strap.translate(Vec3::new(0.0, 0.88, 0.42));
            neck_and_head.merge(&strap);
            let lens_mat = MatStyle::from_hex_alpha(0x22ff88, 0.88, 0.05, 0.1, 0.75, 1.0);
            for gx in [-0.26, 0.26] {
                let mut rim = cylinder_mesh(0.19, 0.19, 0.09, 22, false, chrome_mat);
                rim.transform(
                    Mat4::from_translation(Vec3::new(gx, 0.94, 0.64))
                        * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
                );
                neck_and_head.merge(&rim);
                let mut lens = cylinder_mesh(0.15, 0.15, 0.10, 20, false, lens_mat);
                lens.transform(
                    Mat4::from_translation(Vec3::new(gx, 0.94, 0.65))
                        * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
                );
                neck_and_head.merge(&lens);
            }
        }
        RobotId::Pixel => {
            let visor_mat = MatStyle::from_hex_alpha(0x00e5ff, 0.78, 0.05, 0.2, 1.15, 1.0);
            let mut scouter = beveled_box(0.50, 0.28, 0.06, 0.02, 2, visor_mat);
            scouter.translate(Vec3::new(-0.24, 0.56, 0.79));
            neck_and_head.merge(&scouter);

            let mut dish = cylinder_mesh(0.095, 0.02, 0.05, 16, false, chrome_mat);
            dish.transform(Mat4::from_rotation_x(0.5));
            pixel_sat_dish = Some(dish);
        }
        RobotId::Rusty => {
            let mut headband = beveled_box(1.18, 0.13, 1.08, 0.03, 2, neon_mat);
            headband.translate(Vec3::new(0.0, 0.79, 0.22));
            neck_and_head.merge(&headband);
        }
        _ => {}
    }

    // OLED Face Quad (textured separately with dynamic FaceRasterizer RGBA texture)
    let face_style = MatStyle::from_hex(0xffffff, 0.2, 0.0, 1.1, 0.0);
    let mut face_quad = plane_mesh(0.92, 0.58, 1, 1, face_style);
    face_quad.translate(Vec3::new(0.0, 0.48, 0.753));

    // 3. EAR MESH (pivot at hinge origin)
    let mut ear = MeshData::new();
    let mut ear_hinge = cylinder_mesh(0.095, 0.095, 0.18, 16, false, chrome_mat);
    ear_hinge.transform(Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));
    ear.merge(&ear_hinge);

    let mut ear_outer = beveled_box(0.24, 0.58, 0.14, 0.06, 3, dark_mat);
    ear_outer.translate(Vec3::new(0.0, -0.28, 0.0));
    ear.merge(&ear_outer);

    let mut ear_inner = beveled_box(0.14, 0.42, 0.03, 0.01, 2, neon_mat);
    ear_inner.translate(Vec3::new(0.0, -0.28, 0.072));
    ear.merge(&ear_inner);

    // 4. TAIL MESH (pivot at tail hinge)
    let mut tail = MeshData::new();
    tail.merge(&sphere_mesh(0.115, 14, 10, joint_mat));
    let mut seg1 = cylinder_mesh(0.045, 0.068, 0.38, 12, false, dark_mat);
    seg1.translate(Vec3::new(0.0, 0.19, 0.0));
    tail.merge(&seg1);

    for ry in [0.14, 0.28] {
        let mut t_ring = torus_mesh(0.062, 0.016, 8, 16, std::f32::consts::TAU, neon_mat);
        t_ring.transform(
            Mat4::from_translation(Vec3::new(0.0, ry, 0.0))
                * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
        );
        tail.merge(&t_ring);
    }
    let mut tail_tip = sphere_mesh(0.125, 16, 12, neon_mat);
    tail_tip.translate(Vec3::new(0.0, 0.48, 0.0));
    tail.merge(&tail_tip);

    let rusty_tail_propeller = if id == RobotId::Rusty {
        let mut prop = MeshData::new();
        prop.merge(&sphere_mesh(0.065, 12, 10, chrome_mat));
        prop.merge(&box_mesh(0.44, 0.048, 0.022, neon_mat));
        prop.merge(&box_mesh(0.048, 0.44, 0.022, neon_mat));
        Some(prop)
    } else {
        None
    };

    // 5. ARTICULATED LEGS (Upper Hip, Lower Knee, Sculpted Paw with Toe Beans)
    let build_upper_leg = |is_left: bool| {
        let mut u = MeshData::new();
        u.merge(&sphere_mesh(0.155, 16, 12, joint_mat));
        let mut led_ring = torus_mesh(0.145, 0.017, 10, 20, std::f32::consts::TAU, neon_mat);
        led_ring.transform(
            Mat4::from_translation(Vec3::new(if is_left { -0.05 } else { 0.05 }, 0.0, 0.0))
                * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_2),
        );
        u.merge(&led_ring);

        let mut thigh = cylinder_mesh(0.115, 0.095, 0.44, 14, false, dark_mat);
        thigh.translate(Vec3::new(0.0, -0.22, 0.0));
        u.merge(&thigh);

        let mut piston = cylinder_mesh(0.025, 0.025, 0.36, 10, false, chrome_mat);
        piston.translate(Vec3::new(0.0, -0.22, -0.09));
        u.merge(&piston);
        u
    };

    let mut lower_leg = MeshData::new();
    let mut knee_drum = cylinder_mesh(0.105, 0.105, 0.17, 14, false, chrome_mat);
    knee_drum.transform(Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
    lower_leg.merge(&knee_drum);

    let mut shin = cylinder_mesh(0.095, 0.115, 0.40, 14, false, main_mat);
    shin.translate(Vec3::new(0.0, -0.20, 0.0));
    lower_leg.merge(&shin);

    let mut paw = MeshData::new();
    paw.merge(&beveled_box(0.28, 0.16, 0.38, 0.055, 3, dark_mat));
    let mut main_pad = cylinder_mesh(0.085, 0.085, 0.03, 14, false, neon_mat);
    main_pad.transform(
        Mat4::from_translation(Vec3::new(0.0, -0.075, -0.02))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
    );
    paw.merge(&main_pad);

    for toe in [-1.0f32, 0.0, 1.0] {
        let mut toe_beam = sphere_mesh(0.045, 10, 8, main_mat);
        toe_beam.translate(Vec3::new(toe * 0.085, -0.02, 0.17));
        paw.merge(&toe_beam);

        let mut toe_pad = cylinder_mesh(0.035, 0.035, 0.03, 10, false, neon_mat);
        toe_pad.transform(
            Mat4::from_translation(Vec3::new(toe * 0.085, -0.075, 0.14))
                * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
        );
        paw.merge(&toe_pad);
    }

    // 6. PLAYER SELECTION HALO RING
    let mut halo_ring = torus_mesh(0.85, 0.038, 12, 36, std::f32::consts::TAU, neon_mat);
    halo_ring.transform(Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));

    RobotMeshSet {
        torso,
        power_turbine,
        neck_and_head,
        face_quad,
        ear,
        tail,
        upper_leg_l: build_upper_leg(true),
        upper_leg_r: build_upper_leg(false),
        lower_leg,
        paw,
        halo_ring,
        sparky_compass_needle,
        bolt_turbo_flame,
        pixel_sat_dish,
        luna_wing_l,
        luna_wing_r,
        rusty_tail_propeller,
    }
}
