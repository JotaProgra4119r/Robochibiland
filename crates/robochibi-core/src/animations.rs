use crate::audio_events::{AudioEvent, AudioKind, FootstepSurface};
use crate::robot::ChibiRobotDog;
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnimId {
    Idle,
    Walk,
    Run,
    Sit,
    LieDown,
    Jump,
    WagTail,
    Bark,
    Sniff,
    Scratch,
    Backflip,
    Spin,
    Roll,
    Wave,
    Recharge,
    Dig,
    Howl,
    Dance,
    Sneak,
    PlayBow,
    HeadTilt,
    BellyRub,
    Beg,
    ShakeOff,
    Nuzzle,
    PickedUp,
    ChaseTail,
    Dizzy,
    Swimming,
    PatrolLook,
    ScentTrack,
}

impl AnimId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Walk => "walk",
            Self::Run => "run",
            Self::Sit => "sit",
            Self::LieDown => "lieDown",
            Self::Jump => "jump",
            Self::WagTail => "wagTail",
            Self::Bark => "bark",
            Self::Sniff => "sniff",
            Self::Scratch => "scratch",
            Self::Backflip => "backflip",
            Self::Spin => "spin",
            Self::Roll => "roll",
            Self::Wave => "wave",
            Self::Recharge => "recharge",
            Self::Dig => "dig",
            Self::Howl => "howl",
            Self::Dance => "dance",
            Self::Sneak => "sneak",
            Self::PlayBow => "playBow",
            Self::HeadTilt => "headTilt",
            Self::BellyRub => "bellyRub",
            Self::Beg => "beg",
            Self::ShakeOff => "shakeOff",
            Self::Nuzzle => "nuzzle",
            Self::PickedUp => "pickedUp",
            Self::ChaseTail => "chaseTail",
            Self::Dizzy => "dizzy",
            Self::Swimming => "swimming",
            Self::PatrolLook => "patrolLook",
            Self::ScentTrack => "scentTrack",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "idle" => Some(Self::Idle),
            "walk" => Some(Self::Walk),
            "run" => Some(Self::Run),
            "sit" => Some(Self::Sit),
            "lieDown" => Some(Self::LieDown),
            "jump" => Some(Self::Jump),
            "wagTail" => Some(Self::WagTail),
            "bark" => Some(Self::Bark),
            "sniff" => Some(Self::Sniff),
            "scratch" => Some(Self::Scratch),
            "backflip" => Some(Self::Backflip),
            "spin" => Some(Self::Spin),
            "roll" => Some(Self::Roll),
            "wave" => Some(Self::Wave),
            "recharge" => Some(Self::Recharge),
            "dig" => Some(Self::Dig),
            "howl" => Some(Self::Howl),
            "dance" => Some(Self::Dance),
            "sneak" => Some(Self::Sneak),
            "playBow" => Some(Self::PlayBow),
            "headTilt" => Some(Self::HeadTilt),
            "bellyRub" => Some(Self::BellyRub),
            "beg" => Some(Self::Beg),
            "shakeOff" => Some(Self::ShakeOff),
            "nuzzle" => Some(Self::Nuzzle),
            "pickedUp" => Some(Self::PickedUp),
            "chaseTail" => Some(Self::ChaseTail),
            "dizzy" => Some(Self::Dizzy),
            "swimming" => Some(Self::Swimming),
            "patrolLook" => Some(Self::PatrolLook),
            "scentTrack" => Some(Self::ScentTrack),
            _ => None,
        }
    }

    pub fn default_duration(self) -> f32 {
        match self {
            Self::Idle => 1.0,
            Self::Walk | Self::Run | Self::WagTail | Self::Spin => 1.5,
            Self::Sit | Self::Sniff | Self::Wave | Self::Sneak | Self::Nuzzle => 2.0,
            Self::LieDown | Self::Dance | Self::Beg => 2.5,
            Self::Jump => 1.2,
            Self::Bark => 1.0,
            Self::Scratch | Self::Dig | Self::PlayBow | Self::HeadTilt => 2.2,
            Self::Backflip => 1.6,
            Self::Roll | Self::ShakeOff => 1.8,
            Self::Recharge | Self::BellyRub => 3.0,
            Self::Howl => 2.4,
            _ => 1.6,
        }
    }
}

#[inline]
fn damp(current: f32, target: f32, lambda: f32, dt: f32) -> f32 {
    let factor = 1.0 - (-lambda * dt).exp();
    current + (target - current) * factor
}

#[derive(Default)]
struct NeutralOpts {
    keep_body_pos: bool,
    keep_body_rot: bool,
    keep_body_scale: bool,
    keep_neck: bool,
    keep_tail: bool,
    keep_ears: bool,
    keep_legs: bool,
}

pub struct AnimationController {
    pub current_anim: AnimId,
    pub anim_time: f32,
    pub anim_speed: f32,
    pub action_queue: VecDeque<AnimId>,
    pub action_timer: f32,
    pub action_duration: f32,
    pub sequence_finished_pending: bool,
    pub base_body_y: f32,
    pub step_timer: f32,
    sound_triggered_this_action: bool,
    flip_sound_played: bool,
}

impl AnimationController {
    pub fn new() -> Self {
        Self {
            current_anim: AnimId::Idle,
            anim_time: 0.0,
            anim_speed: 1.0,
            action_queue: VecDeque::new(),
            action_timer: 0.0,
            action_duration: 0.0,
            sequence_finished_pending: false,
            base_body_y: 0.95,
            step_timer: 0.0,
            sound_triggered_this_action: false,
            flip_sound_played: false,
        }
    }

    pub fn play(&mut self, anim: AnimId, duration: f32, dog: &mut ChibiRobotDog) {
        if self.current_anim == anim && duration <= 0.0 {
            return;
        }
        let tau = std::f32::consts::TAU;
        dog.pose.body_rot.x %= tau;
        dog.pose.body_rot.z %= tau;

        self.current_anim = anim;
        self.anim_time = 0.0;
        self.action_timer = 0.0;
        self.action_duration = duration.max(0.0);
        self.sound_triggered_this_action = false;
        self.flip_sound_played = false;
    }

    pub fn play_sequence(&mut self, actions: Vec<AnimId>, dog: &mut ChibiRobotDog) {
        self.action_queue = actions.into();
        self.sequence_finished_pending = false;
        self.advance_sequence(dog);
    }

    pub fn advance_sequence(&mut self, dog: &mut ChibiRobotDog) {
        if let Some(next) = self.action_queue.pop_front() {
            let dur = next.default_duration();
            self.play(next, dur, dog);
        } else {
            let was_sequenced = self.action_duration > 0.0;
            self.play(AnimId::Idle, 0.0, dog);
            if was_sequenced {
                self.sequence_finished_pending = true;
            }
        }
    }

    fn damp_to_neutral(&self, dog: &mut ChibiRobotDog, dt: f32, speed: f32, opts: NeutralOpts) {
        let p = &mut dog.pose;
        if !opts.keep_body_pos {
            p.body_pos.y = damp(p.body_pos.y, self.base_body_y, speed, dt);
        }
        if !opts.keep_body_rot {
            p.body_rot.x = damp(p.body_rot.x, 0.0, speed, dt);
            p.body_rot.y = damp(p.body_rot.y, 0.0, speed, dt);
            p.body_rot.z = damp(p.body_rot.z, dog.bank_angle, speed, dt);
        }
        if !opts.keep_body_scale {
            p.body_scale.x = damp(p.body_scale.x, 1.0, speed, dt);
            p.body_scale.y = damp(p.body_scale.y, 1.0, speed, dt);
            p.body_scale.z = damp(p.body_scale.z, 1.0, speed, dt);
        }
        if !opts.keep_neck && !dog.has_look_target {
            p.neck_rot.x = damp(p.neck_rot.x, 0.0, speed, dt);
            p.neck_rot.y = damp(p.neck_rot.y, 0.0, speed, dt);
            p.neck_rot.z = damp(p.neck_rot.z, 0.0, speed, dt);
        }
        if !opts.keep_tail {
            p.tail_rot.x = damp(p.tail_rot.x, 0.55, speed, dt);
            p.tail_rot.y = damp(p.tail_rot.y, 0.0, speed, dt);
            p.tail_rot.z = damp(p.tail_rot.z, 0.0, speed, dt);
        }
        if !opts.keep_ears {
            p.ear_l_rot.x = damp(p.ear_l_rot.x, 0.0, speed, dt);
            p.ear_r_rot.x = damp(p.ear_r_rot.x, 0.0, speed, dt);
        }
        if !opts.keep_legs {
            for leg in &mut p.legs {
                leg.hip_rot.x = damp(leg.hip_rot.x, 0.0, speed, dt);
                leg.hip_rot.y = damp(leg.hip_rot.y, 0.0, speed, dt);
                leg.hip_rot.z = damp(leg.hip_rot.z, 0.0, speed, dt);
                leg.knee_rot_x = damp(leg.knee_rot_x, 0.0, speed, dt);
                leg.paw_rot_x = damp(leg.paw_rot_x, 0.0, speed, dt);
            }
        }
    }

    pub fn update(
        &mut self,
        dt: f32,
        dog: &mut ChibiRobotDog,
        surface: FootstepSurface,
        audio_out: &mut Vec<AudioEvent>,
    ) {
        self.anim_time += dt * self.anim_speed;

        if self.action_duration > 0.0 {
            self.action_timer += dt;
            if self.action_timer >= self.action_duration {
                self.advance_sequence(dog);
                return;
            }
        }

        let t = self.anim_time;
        let pitch = dog.profile().voice_pitch;

        match self.current_anim {
            AnimId::Idle => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_tail: true,
                        keep_ears: true,
                        ..Default::default()
                    },
                );
                let breath = (t * 2.4).sin();
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y + breath * 0.028, 8.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, breath * 0.018, 6.0, dt);
                if !dog.has_look_target {
                    dog.pose.neck_rot.x =
                        damp(dog.pose.neck_rot.x, -breath * 0.03 + (t * 1.1).sin() * 0.04, 6.0, dt);
                    dog.pose.neck_rot.y = damp(dog.pose.neck_rot.y, (t * 0.7).sin() * 0.06, 5.0, dt);
                }
                let ear_twitch = (t * 1.7).sin().max(0.0).powi(6) * 0.22;
                dog.pose.ear_l_rot.x = damp(dog.pose.ear_l_rot.x, (t * 1.5).sin() * 0.06 + ear_twitch, 10.0, dt);
                dog.pose.ear_r_rot.x = damp(dog.pose.ear_r_rot.x, (t * 1.5 + 0.8).sin() * 0.06, 10.0, dt);
                dog.pose.tail_rot.x = damp(dog.pose.tail_rot.x, 0.55 + (t * 2.2).cos() * 0.08, 8.0, dt);
                dog.pose.tail_rot.y = damp(dog.pose.tail_rot.y, (t * 3.6).sin() * 0.38, 10.0, dt);
                dog.pose.tail_rot.z = damp(dog.pose.tail_rot.z, (t * 1.8).cos() * 0.12, 8.0, dt);
            }
            AnimId::Walk | AnimId::Run => {
                let is_run = self.current_anim == AnimId::Run;
                self.damp_to_neutral(
                    dog,
                    dt,
                    10.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                let freq = if is_run { 10.5 } else { 6.8 };
                let g = t * freq;
                let stride_amp = if is_run { 0.78 } else { 0.48 };
                let knee_lift_amp = if is_run { 0.85 } else { 0.55 };

                let phases = [
                    (0.0, true),
                    (std::f32::consts::PI, true),
                    (std::f32::consts::PI + if is_run { 0.35 } else { 0.15 }, false),
                    (if is_run { 0.35 } else { 0.15 }, false),
                ];
                for (idx, (phase, is_front)) in phases.into_iter().enumerate() {
                    let cycle = g + phase;
                    let hip_t = cycle.sin() * stride_amp;
                    let swing = cycle.cos().max(0.0);
                    let knee_t = if is_front {
                        swing * knee_lift_amp
                    } else {
                        -swing * knee_lift_amp * 0.85
                    };
                    let paw_t = -swing * 0.35 + cycle.sin() * 0.15;
                    let leg = &mut dog.pose.legs[idx];
                    leg.hip_rot.x = damp(leg.hip_rot.x, hip_t, 18.0, dt);
                    leg.hip_rot.z = damp(leg.hip_rot.z, 0.0, 12.0, dt);
                    leg.knee_rot_x = damp(leg.knee_rot_x, knee_t, 18.0, dt);
                    leg.paw_rot_x = damp(leg.paw_rot_x, paw_t, 18.0, dt);
                }

                let bob = g.sin().abs() * if is_run { 0.13 } else { 0.065 };
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y + bob, 16.0, dt);
                dog.pose.body_rot.x = damp(
                    dog.pose.body_rot.x,
                    if is_run { g.cos() * 0.09 } else { (g * 2.0).cos() * 0.025 },
                    14.0,
                    dt,
                );
                dog.pose.body_rot.z =
                    damp(dog.pose.body_rot.z, dog.bank_angle + g.sin() * 0.035, 12.0, dt);
                dog.pose.body_rot.y = damp(dog.pose.body_rot.y, g.cos() * 0.025, 12.0, dt);

                if !dog.has_look_target {
                    dog.pose.neck_rot.x = damp(
                        dog.pose.neck_rot.x,
                        -(g * 2.0).sin() * 0.06 + if is_run { 0.12 } else { 0.0 },
                        14.0,
                        dt,
                    );
                }
                dog.pose.tail_rot.x = damp(dog.pose.tail_rot.x, if is_run { 0.25 } else { 0.65 }, 10.0, dt);
                dog.pose.tail_rot.y = (g * 1.5).sin() * if is_run { 0.55 } else { 0.75 };

                self.step_timer += dt * freq;
                if self.step_timer >= std::f32::consts::PI {
                    self.step_timer -= std::f32::consts::PI;
                    if dog.is_player {
                        audio_out.push(AudioEvent {
                            kind: AudioKind::Step(surface),
                            world_pos: dog.position,
                            pitch,
                        });
                    }
                }
            }
            AnimId::Sit => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.58, 7.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, -0.44, 7.0, dt);
                dog.pose.body_rot.z = damp(dog.pose.body_rot.z, 0.0, 7.0, dt);
                for i in 0..2 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, 0.42, 7.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 0.0, 7.0, dt);
                    dog.pose.legs[i].paw_rot_x = damp(dog.pose.legs[i].paw_rot_x, 0.05, 7.0, dt);
                }
                for i in 2..4 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -1.22, 7.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 1.45, 7.0, dt);
                    dog.pose.legs[i].paw_rot_x = damp(dog.pose.legs[i].paw_rot_x, 0.2, 7.0, dt);
                }
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, 0.42 + (t * 2.2).sin() * 0.04, 7.0, dt);
                dog.pose.neck_rot.z = damp(dog.pose.neck_rot.z, (t * 1.5).sin() * 0.05, 6.0, dt);
                dog.pose.tail_rot.y = (t * 5.5).sin() * 0.55;
            }
            AnimId::LieDown => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    6.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.32 + (t * 1.8).sin() * 0.015, 6.0, dt);
                for i in 0..2 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -1.15, 6.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 0.25, 6.0, dt);
                }
                for i in 2..4 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -1.25, 6.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 1.4, 6.0, dt);
                }
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.15 + (t * 1.8).sin() * 0.03, 5.0, dt);
                dog.pose.tail_rot.y = (t * 2.0).sin() * 0.25;
            }
            AnimId::Jump => {
                let dur = if self.action_duration > 0.0 { self.action_duration } else { 1.2 };
                let progress = ((t % dur) / dur).min(1.0);
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Jump,
                        world_pos: dog.position,
                        pitch,
                    });
                }
                if progress < 0.18 {
                    dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y - 0.22, 18.0, dt);
                    dog.pose.body_scale = glam::Vec3::new(1.06, 0.92, 1.04);
                    dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.22, 15.0, dt);
                    dog.pose.legs[0].hip_rot.x = 0.65;
                    dog.pose.legs[1].hip_rot.x = 0.65;
                    dog.pose.legs[2].hip_rot.x = -0.65;
                    dog.pose.legs[3].hip_rot.x = -0.65;
                } else if progress < 0.82 {
                    let air_p = (progress - 0.18) / 0.64;
                    let jump_h = (air_p * std::f32::consts::PI).sin() * 1.85;
                    dog.pose.body_pos.y = self.base_body_y + jump_h;
                    dog.pose.body_scale = glam::Vec3::new(0.96, 1.06, 1.02);
                    dog.pose.body_rot.x = -0.38 + (0.28 + 0.38) * air_p;
                    dog.pose.neck_rot.x = -0.2;
                    for i in 0..2 {
                        dog.pose.legs[i].hip_rot.x = -0.55;
                        dog.pose.legs[i].knee_rot_x = 0.45;
                    }
                    for i in 2..4 {
                        dog.pose.legs[i].hip_rot.x = 0.7;
                    }
                } else {
                    dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y - 0.08, 16.0, dt);
                    dog.pose.body_scale = glam::Vec3::new(1.04, 0.95, 1.02);
                    dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.0, 12.0, dt);
                }
                dog.pose.tail_rot.y = (t * 14.0).sin() * 0.9;
            }
            AnimId::WagTail => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_tail: true,
                        keep_ears: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = self.base_body_y + (t * 9.0).sin().abs() * 0.045;
                dog.pose.body_rot.y = (t * 16.0).sin() * 0.06;
                dog.pose.tail_rot.y = (t * 18.0).sin() * 1.15;
                dog.pose.tail_rot.x = 0.75;
                dog.pose.ear_l_rot.z = 0.35 + (t * 9.0).sin() * 0.12;
                dog.pose.ear_r_rot.z = -0.35 - (t * 9.0).sin() * 0.12;
            }
            AnimId::Bark => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_neck: true,
                        keep_body_rot: true,
                        ..Default::default()
                    },
                );
                let progress = (t % 0.45) / 0.45;
                let pulse = (progress * std::f32::consts::PI).sin();
                dog.pose.neck_rot.x = pulse * 0.38;
                dog.pose.body_pos.y = self.base_body_y + pulse * 0.09;
                dog.pose.body_rot.x = -pulse * 0.12;
                dog.pose.ear_l_rot.x = -pulse * 0.25;
                dog.pose.ear_r_rot.x = -pulse * 0.25;
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Bark,
                        world_pos: dog.position,
                        pitch: pitch * 1.05,
                    });
                }
            }
            AnimId::Sniff => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_neck: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y - 0.14, 7.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.18, 7.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.42 + (t * 14.0).sin() * 0.04, 8.0, dt);
                dog.pose.neck_rot.y = (t * 4.2).sin() * 0.45;
                dog.pose.tail_rot.y = (t * 6.0).sin() * 0.35;
            }
            AnimId::Scratch => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_rot.z = damp(dog.pose.body_rot.z, -0.32, 7.0, dt);
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.66, 7.0, dt);
                dog.pose.neck_rot.z = damp(dog.pose.neck_rot.z, 0.28, 7.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.2, 7.0, dt);
                let sf = (t * 20.0).sin() * 0.55;
                dog.pose.legs[2].hip_rot.x = 1.05 + sf;
                dog.pose.legs[2].hip_rot.z = 0.45;
                dog.pose.legs[2].knee_rot_x = -0.75 + sf * 0.4;
            }
            AnimId::Backflip => {
                let dur = if self.action_duration > 0.0 { self.action_duration } else { 1.6 };
                let progress = ((t % dur) / dur).min(1.0);
                dog.pose.body_pos.y = self.base_body_y + (progress * std::f32::consts::PI).sin() * 2.35;
                let eased = if progress < 0.5 {
                    2.0 * progress * progress
                } else {
                    1.0 - (-2.0 * progress + 2.0).powi(2) / 2.0
                };
                dog.pose.body_rot.x = eased * std::f32::consts::TAU;
                let tuck = (progress * std::f32::consts::PI).sin();
                for leg in &mut dog.pose.legs {
                    leg.hip_rot.x = tuck * 0.6;
                    leg.knee_rot_x = tuck * 0.8;
                }
                if progress > 0.92 && dog.is_player && !self.flip_sound_played {
                    self.flip_sound_played = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::TrickSuccess,
                        world_pos: dog.position,
                        pitch: 1.0,
                    });
                } else if progress < 0.1 {
                    self.flip_sound_played = false;
                }
            }
            AnimId::Spin => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_legs: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.rotation_y += dt * 6.5;
                dog.pose.body_pos.y = self.base_body_y + (t * 10.0).sin().abs() * 0.06;
                dog.pose.tail_rot.y = (t * 15.0).sin() * 0.95;
                dog.pose.legs[0].hip_rot.x = (t * 12.0).sin() * 0.45;
                dog.pose.legs[1].hip_rot.x = (t * 12.0 + std::f32::consts::PI).sin() * 0.45;
                dog.pose.legs[2].hip_rot.x = (t * 12.0).cos() * 0.45;
                dog.pose.legs[3].hip_rot.x = (t * 12.0 + std::f32::consts::PI).cos() * 0.45;
            }
            AnimId::Roll => {
                let dur = if self.action_duration > 0.0 { self.action_duration } else { 1.8 };
                let progress = ((t % dur) / dur).min(1.0);
                dog.pose.body_pos.y =
                    damp(dog.pose.body_pos.y, 0.45 + (progress * std::f32::consts::PI).sin() * 0.32, 10.0, dt);
                dog.pose.body_rot.z = progress * std::f32::consts::TAU;
                dog.pose.legs[0].hip_rot.x = 0.55;
                dog.pose.legs[1].hip_rot.x = 0.55;
                dog.pose.legs[2].hip_rot.x = 0.75;
                dog.pose.legs[3].hip_rot.x = 0.75;
                dog.pose.tail_rot.y = (t * 12.0).sin() * 0.8;
            }
            AnimId::Wave => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 1.15, 7.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, -0.68, 7.0, dt);
                dog.pose.legs[0].hip_rot.x = damp(dog.pose.legs[0].hip_rot.x, 0.5, 7.0, dt);
                dog.pose.legs[1].hip_rot.x = -1.25 + (t * 10.0).sin() * 0.35;
                dog.pose.legs[1].hip_rot.z = -0.2 + (t * 10.0).cos() * 0.2;
                dog.pose.legs[1].knee_rot_x = 0.75 + (t * 10.0).sin() * 0.3;
                for i in 2..4 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -1.1, 7.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 1.3, 7.0, dt);
                }
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, 0.45, 7.0, dt);
                dog.pose.neck_rot.y = (t * 3.5).sin() * 0.2;
                dog.pose.tail_rot.y = (t * 11.0).sin() * 0.85;
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::WaveSound,
                        world_pos: dog.position,
                        pitch,
                    });
                }
            }
            AnimId::Recharge => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    5.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.28 + (t * 1.4).sin() * 0.012, 5.0, dt);
                dog.pose.legs[0].hip_rot.x = damp(dog.pose.legs[0].hip_rot.x, 1.25, 5.0, dt);
                dog.pose.legs[1].hip_rot.x = damp(dog.pose.legs[1].hip_rot.x, 1.25, 5.0, dt);
                dog.pose.legs[2].hip_rot.x = damp(dog.pose.legs[2].hip_rot.x, -1.25, 5.0, dt);
                dog.pose.legs[3].hip_rot.x = damp(dog.pose.legs[3].hip_rot.x, -1.25, 5.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.38, 5.0, dt);
                dog.pose.tail_rot.y = damp(dog.pose.tail_rot.y, 0.0, 5.0, dt);
            }
            AnimId::Dig => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.72, 8.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.36, 8.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.45, 8.0, dt);
                let dl = (t * 19.0).sin();
                let dr = (t * 19.0 + std::f32::consts::PI).sin();
                dog.pose.legs[0].hip_rot.x = 0.45 + dl * 0.65;
                dog.pose.legs[0].knee_rot_x = (-dl * 0.8).max(0.0);
                dog.pose.legs[1].hip_rot.x = 0.45 + dr * 0.65;
                dog.pose.legs[1].knee_rot_x = (-dr * 0.8).max(0.0);
                dog.pose.tail_rot.x = 0.85;
                dog.pose.tail_rot.y = (t * 15.0).sin() * 0.9;
            }
            AnimId::Howl => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    6.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.62, 6.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, -0.38, 6.0, dt);
                for i in 2..4 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -1.15, 6.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 1.35, 6.0, dt);
                }
                for i in 0..2 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, 0.35, 6.0, dt);
                }
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, 0.85, 7.0, dt);
                dog.pose.neck_rot.y = (t * 2.5).sin() * 0.08;
                dog.pose.tail_rot.y = (t * 6.0).sin() * 0.3;
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Howl,
                        world_pos: dog.position,
                        pitch,
                    });
                }
            }
            AnimId::Dance => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                let dt9 = t * 9.2;
                dog.pose.body_pos.y = self.base_body_y + dt9.sin().abs() * 0.22;
                dog.pose.body_rot.z = (dt9 * 0.5).sin() * 0.24;
                dog.pose.body_rot.y = (dt9 * 0.5).cos() * 0.15;
                dog.pose.neck_rot.z = -(dt9 * 0.5).sin() * 0.22;
                dog.pose.neck_rot.x = dt9.sin() * 0.16;
                dog.pose.legs[0].hip_rot.x = dt9.sin() * 0.6;
                dog.pose.legs[0].knee_rot_x = (dt9.cos() * 0.6).max(0.0);
                dog.pose.legs[3].hip_rot.x = -dt9.sin() * 0.6;
                dog.pose.legs[1].hip_rot.x = -dt9.sin() * 0.6;
                dog.pose.legs[1].knee_rot_x = (-dt9.cos() * 0.6).max(0.0);
                dog.pose.legs[2].hip_rot.x = dt9.sin() * 0.6;
                dog.pose.tail_rot.y = (dt9 * 2.0).sin() * 1.2;
            }
            AnimId::Sneak => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        ..Default::default()
                    },
                );
                let s = t * 3.8;
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.55 + (s * 2.0).sin() * 0.025, 8.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.14, 8.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.24, 8.0, dt);
                dog.pose.legs[0].hip_rot.x = s.sin() * 0.35;
                dog.pose.legs[3].hip_rot.x = s.sin() * 0.35;
                dog.pose.legs[1].hip_rot.x = (s + std::f32::consts::PI).sin() * 0.35;
                dog.pose.legs[2].hip_rot.x = (s + std::f32::consts::PI).sin() * 0.35;
                dog.pose.tail_rot.y = s.sin() * 0.3;
            }
            AnimId::PlayBow => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.52, 8.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.46, 8.0, dt);
                for i in 0..2 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, 0.95, 8.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, -0.6, 8.0, dt);
                }
                for i in 2..4 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -0.2, 8.0, dt);
                }
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.42, 8.0, dt);
                dog.pose.tail_rot.x = 0.85;
                dog.pose.tail_rot.y = (t * 18.0).sin() * 1.1;
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Yip,
                        world_pos: dog.position,
                        pitch,
                    });
                }
            }
            AnimId::HeadTilt => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_neck: true,
                        keep_ears: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                let tilt = (t * 3.5).sin();
                dog.pose.neck_rot.z = damp(dog.pose.neck_rot.z, tilt * 0.44, 7.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, 0.18, 6.0, dt);
                dog.pose.ear_l_rot.z = 0.25 + if tilt > 0.0 { 0.35 } else { -0.15 };
                dog.pose.ear_r_rot.z = -0.25 + if tilt < 0.0 { -0.35 } else { 0.15 };
                dog.pose.tail_rot.y = (t * 5.0).sin() * 0.4;
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Whine,
                        world_pos: dog.position,
                        pitch,
                    });
                }
            }
            AnimId::BellyRub => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    6.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.34, 6.0, dt);
                dog.pose.body_rot.z = damp(dog.pose.body_rot.z, std::f32::consts::PI * 0.92, 6.0, dt);
                let pad = (t * 6.5).sin() * 0.35;
                dog.pose.legs[0].hip_rot.x = 0.75 + pad;
                dog.pose.legs[1].hip_rot.x = 0.75 - pad;
                dog.pose.legs[0].knee_rot_x = 0.45;
                dog.pose.legs[1].knee_rot_x = 0.45;
                dog.pose.legs[2].hip_rot.x = -0.5 + pad;
                dog.pose.legs[3].hip_rot.x = -0.5 - pad;
                dog.pose.neck_rot.x = 0.2;
                dog.pose.tail_rot.y = (t * 14.0).sin() * 0.7;
            }
            AnimId::Beg => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_legs: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 1.24, 7.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, -0.76, 7.0, dt);
                let bob = (t * 8.5).sin() * 0.22;
                for i in 0..2 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -0.65 + bob, 8.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 0.92, 8.0, dt);
                }
                for i in 2..4 {
                    dog.pose.legs[i].hip_rot.x = damp(dog.pose.legs[i].hip_rot.x, -1.2, 7.0, dt);
                    dog.pose.legs[i].knee_rot_x = damp(dog.pose.legs[i].knee_rot_x, 1.35, 7.0, dt);
                }
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, 0.52, 7.0, dt);
                dog.pose.tail_rot.y = (t * 12.0).sin() * 0.8;
            }
            AnimId::ShakeOff => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    8.0,
                    NeutralOpts {
                        keep_body_rot: true,
                        keep_neck: true,
                        keep_tail: true,
                        keep_ears: true,
                        ..Default::default()
                    },
                );
                let dur = if self.action_duration > 0.0 { self.action_duration } else { 1.8 };
                let env = ((t / dur).min(1.0) * std::f32::consts::PI).sin();
                let sf = (t * 34.0).sin() * env;
                dog.pose.body_rot.z = sf * 0.36;
                dog.pose.neck_rot.z = -sf * 0.48;
                dog.pose.tail_rot.y = -sf * 0.85;
                dog.pose.ear_l_rot.z = 0.25 + sf * 0.55;
                dog.pose.ear_r_rot.z = -0.25 + sf * 0.55;
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Grumble,
                        world_pos: dog.position,
                        pitch: 1.2,
                    });
                }
            }
            AnimId::Nuzzle => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y - 0.08, 7.0, dt);
                dog.pose.body_rot.z = damp(dog.pose.body_rot.z, (t * 3.0).sin() * 0.14, 7.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, 0.26, 7.0, dt);
                dog.pose.neck_rot.y = (t * 3.2).sin() * 0.26;
                dog.pose.tail_rot.y = (t * 9.0).sin() * 0.75;
                if !self.sound_triggered_this_action && dog.is_player {
                    self.sound_triggered_this_action = true;
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Boop,
                        world_pos: dog.position,
                        pitch: 1.4,
                    });
                }
            }
            AnimId::PickedUp => {
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y + 0.15, 7.0, dt);
                dog.pose.body_rot.z = (t * 4.0).sin() * 0.08;
                dog.pose.body_rot.x = (t * 3.0).sin() * 0.06;
                let ps = 12.0;
                dog.pose.legs[0].hip_rot.x = (t * ps).sin() * 0.55;
                dog.pose.legs[1].hip_rot.x = -(t * ps).sin() * 0.55;
                dog.pose.legs[2].hip_rot.x = -(t * ps).cos() * 0.44;
                dog.pose.legs[3].hip_rot.x = (t * ps).cos() * 0.44;
                dog.pose.legs[0].knee_rot_x = 0.4 + (t * ps).sin() * 0.3;
                dog.pose.legs[1].knee_rot_x = 0.4 - (t * ps).sin() * 0.3;
                dog.pose.legs[2].knee_rot_x = 0.4 - (t * ps).cos() * 0.3;
                dog.pose.legs[3].knee_rot_x = 0.4 + (t * ps).cos() * 0.3;
                dog.pose.neck_rot.x = 0.15 + (t * 5.0).sin() * 0.1;
                dog.pose.tail_rot.y = (t * 14.0).sin() * 0.85;
            }
            AnimId::ChaseTail => {
                dog.rotation_y += dt * 8.5;
                dog.pose.body_rot.y = (t * 24.0).sin() * 0.2;
                dog.pose.body_rot.z = -0.15;
                dog.pose.body_pos.y = self.base_body_y;
                dog.pose.neck_rot.y = 0.75;
                dog.pose.neck_rot.x = 0.3;
                dog.pose.tail_rot.y = -0.85;
                let lf = t * 18.0;
                dog.pose.legs[0].hip_rot.x = lf.sin() * 0.6;
                dog.pose.legs[1].hip_rot.x = -lf.sin() * 0.6;
                dog.pose.legs[2].hip_rot.x = -lf.sin() * 0.6;
                dog.pose.legs[3].hip_rot.x = lf.sin() * 0.6;
            }
            AnimId::Dizzy => {
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.55, 8.0, dt);
                dog.pose.legs[2].hip_rot.x = -1.1;
                dog.pose.legs[3].hip_rot.x = -1.1;
                dog.pose.legs[0].hip_rot.x = 0.2;
                dog.pose.legs[1].hip_rot.x = 0.2;
                dog.pose.neck_rot.z = (t * 6.0).sin() * 0.35;
                dog.pose.neck_rot.y = (t * 4.5).cos() * 0.3;
                dog.pose.neck_rot.x = 0.25;
                dog.pose.body_rot.z = (t * 5.0).sin() * 0.12;
                dog.pose.tail_rot.y = (t * 2.0).sin() * 0.2;
            }
            AnimId::Swimming => {
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, 0.45 + (t * 4.0).sin() * 0.04, 6.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.14, 6.0, dt);
                dog.pose.body_rot.z = (t * 6.0).sin() * 0.08;
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.36, 6.0, dt);
                dog.pose.neck_rot.y = (t * 3.0).sin() * 0.1;
                let ps = 8.5;
                dog.pose.legs[0].hip_rot.x = (t * ps).sin() * 0.65;
                dog.pose.legs[0].knee_rot_x = 0.5 + (t * ps).cos() * 0.4;
                dog.pose.legs[1].hip_rot.x = -(t * ps).sin() * 0.65;
                dog.pose.legs[1].knee_rot_x = 0.5 - (t * ps).cos() * 0.4;
                dog.pose.legs[2].hip_rot.x = -(t * ps).cos() * 0.5;
                dog.pose.legs[3].hip_rot.x = (t * ps).cos() * 0.5;
                dog.pose.tail_rot.y = (t * 10.0).sin() * 0.65;
            }
            AnimId::PatrolLook => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_neck: true,
                        keep_tail: true,
                        ..Default::default()
                    },
                );
                dog.pose.neck_rot.y = damp(dog.pose.neck_rot.y, (t * 2.0).sin() * 0.75, 5.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, -0.15, 5.0, dt);
                dog.pose.tail_rot.y = (t * 4.0).sin() * 0.25;
            }
            AnimId::ScentTrack => {
                self.damp_to_neutral(
                    dog,
                    dt,
                    7.0,
                    NeutralOpts {
                        keep_body_pos: true,
                        keep_body_rot: true,
                        keep_neck: true,
                        keep_legs: true,
                        ..Default::default()
                    },
                );
                dog.pose.body_pos.y = damp(dog.pose.body_pos.y, self.base_body_y - 0.14, 6.0, dt);
                dog.pose.body_rot.x = damp(dog.pose.body_rot.x, 0.18, 6.0, dt);
                dog.pose.neck_rot.x = damp(dog.pose.neck_rot.x, 0.48, 6.0, dt);
                dog.pose.neck_rot.y = (t * 4.0).sin() * 0.22;
                let s = t * 4.2;
                dog.pose.legs[0].hip_rot.x = s.sin() * 0.4;
                dog.pose.legs[1].hip_rot.x = -s.sin() * 0.4;
                dog.pose.legs[2].hip_rot.x = -s.sin() * 0.4;
                dog.pose.legs[3].hip_rot.x = s.sin() * 0.4;
                dog.pose.tail_rot.y = (t * 5.0).sin() * 0.35;
            }
        }
    }
}
