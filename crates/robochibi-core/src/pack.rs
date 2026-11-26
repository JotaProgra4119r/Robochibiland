use crate::animations::{AnimId, AnimationController};
use crate::audio_events::{AudioEvent, AudioKind};
use crate::emotions::EmotionId;
use crate::robot::{AiPackState, ChibiRobotDog, RobotId, TagRole};
use crate::world::{WorldState, MAP_PLAY_LIMIT};
use glam::Vec3;

#[inline]
pub fn lerp_angle(current: f32, target: f32, t: f32) -> f32 {
    let diff = (target - current).sin().atan2((target - current).cos());
    current + diff * t.min(1.0)
}

pub struct RobotPackManager {
    pub dogs: [ChibiRobotDog; 5],
    pub anims: [AnimationController; 5],
    pub active_idx: usize,
}

impl RobotPackManager {
    pub fn new(world: &WorldState) -> Self {
        let starts = [
            (RobotId::Sparky, Vec3::new(32.0, 0.0, 32.0), true),
            (RobotId::Bolt, Vec3::new(46.0, 0.0, 36.0), false),
            (RobotId::Pixel, Vec3::new(-45.0, 0.0, -60.0), false),
            (RobotId::Luna, Vec3::new(18.0, 0.0, -15.0), false),
            (RobotId::Rusty, Vec3::new(55.0, 0.0, 48.0), false),
        ];
        let dogs = starts.map(|(id, mut pos, is_p)| {
            pos.y = world.get_height_at(pos.x, pos.z);
            ChibiRobotDog::new(id, is_p, pos)
        });
        let anims = [
            AnimationController::new(),
            AnimationController::new(),
            AnimationController::new(),
            AnimationController::new(),
            AnimationController::new(),
        ];
        let mut mgr = Self {
            dogs,
            anims,
            active_idx: 0,
        };
        for i in 1..5 {
            let mut dummy_logs = Vec::new();
            mgr.pick_new_target(i, world, &mut dummy_logs);
        }
        mgr
    }

    pub fn idx_of(id: RobotId) -> usize {
        match id {
            RobotId::Sparky => 0,
            RobotId::Bolt => 1,
            RobotId::Pixel => 2,
            RobotId::Luna => 3,
            RobotId::Rusty => 4,
        }
    }

    pub fn player(&self) -> &ChibiRobotDog {
        &self.dogs[self.active_idx]
    }

    pub fn player_mut(&mut self) -> &mut ChibiRobotDog {
        &mut self.dogs[self.active_idx]
    }

    pub fn switch_to(
        &mut self,
        id: RobotId,
        world: &mut WorldState,
        audio_out: &mut Vec<AudioEvent>,
    ) -> bool {
        let target_idx = Self::idx_of(id);
        if target_idx == self.active_idx {
            return false;
        }
        let old_idx = self.active_idx;
        self.dogs[old_idx].is_player = false;
        self.dogs[old_idx].ai.state = AiPackState::Wander;
        self.dogs[old_idx].ai.player_greet_cooldown = 6.0;
        let mut logs = Vec::new();
        self.pick_new_target(old_idx, world, &mut logs);
        for l in logs {
            world.log_activity(l);
        }

        self.active_idx = target_idx;
        self.dogs[target_idx].is_player = true;
        self.dogs[target_idx].has_look_target = false;

        let p = self.dogs[target_idx].profile();
        world.log_activity(format!("🎮 ¡Has tomado el control de {} ({})!", p.name, p.title));
        audio_out.push(AudioEvent {
            kind: AudioKind::Boop,
            world_pos: self.dogs[target_idx].position,
            pitch: p.voice_pitch,
        });
        true
    }

    pub fn call_pack_to_player(&mut self, world: &mut WorldState, audio_out: &mut Vec<AudioEvent>) {
        let p_pos = self.dogs[self.active_idx].position;
        let p_rot = self.dogs[self.active_idx].rotation_y;
        world.log_activity("📣 ¡La manada escuchó tu llamado y se reúne a tu alrededor!");
        audio_out.push(AudioEvent {
            kind: AudioKind::HappyJingle,
            world_pos: p_pos,
            pitch: 1.0,
        });

        let mut slot = 0usize;
        for i in 0..5 {
            if i == self.active_idx {
                continue;
            }
            let angle = p_rot + (slot as f32 - 1.5) * 0.55;
            slot += 1;
            let tx = p_pos.x + angle.sin() * 3.6;
            let tz = p_pos.z + angle.cos() * 3.6;
            let mult = self.dogs[i].profile().speed_multiplier;
            self.dogs[i].ai.state = AiPackState::AssemblePack;
            self.dogs[i].ai.target_pos = Vec3::new(tx, 0.0, tz);
            self.dogs[i].ai.speed = 6.0 * mult;
            self.dogs[i].ai.state_timer = 9.0;
            let anim = AnimId::Run;
            let dog = &mut self.dogs[i];
            self.anims[i].play(anim, 0.0, dog);
        }
    }

    pub fn start_tag_game(&mut self, world: &mut WorldState, audio_out: &mut Vec<AudioEvent>) {
        let mut pack_indices = Vec::with_capacity(4);
        for i in 0..5 {
            if i != self.active_idx {
                pack_indices.push(i);
            }
        }
        if pack_indices.len() < 2 {
            return;
        }
        let chaser_idx = pack_indices[0];
        let prey_idx = pack_indices[1];
        let chaser_id = self.dogs[chaser_idx].id;
        let prey_id = self.dogs[prey_idx].id;

        world.log_activity(format!(
            "🏃 ¡Comienza el juego de \"La Traes\"! ¡{} persigue a {}!",
            chaser_id.name(),
            prey_id.name()
        ));
        audio_out.push(AudioEvent {
            kind: AudioKind::Yip,
            world_pos: self.dogs[chaser_idx].position,
            pitch: 1.4,
        });

        let cm = self.dogs[chaser_idx].profile().speed_multiplier;
        self.dogs[chaser_idx].ai.state = AiPackState::PlayTag;
        self.dogs[chaser_idx].ai.tag_role = Some(TagRole::Chaser);
        self.dogs[chaser_idx].ai.tag_target = Some(prey_id);
        self.dogs[chaser_idx].ai.speed = 7.0 * cm;
        self.dogs[chaser_idx].ai.state_timer = 16.0;
        self.anims[chaser_idx].play(AnimId::Run, 0.0, &mut self.dogs[chaser_idx]);

        let pm = self.dogs[prey_idx].profile().speed_multiplier;
        self.dogs[prey_idx].ai.state = AiPackState::PlayTag;
        self.dogs[prey_idx].ai.tag_role = Some(TagRole::Prey);
        self.dogs[prey_idx].ai.tag_target = Some(chaser_id);
        self.dogs[prey_idx].ai.speed = 6.8 * pm;
        self.dogs[prey_idx].ai.state_timer = 16.0;
        self.anims[prey_idx].play(AnimId::Run, 0.0, &mut self.dogs[prey_idx]);
    }

    pub fn start_speed_race(&mut self, world: &mut WorldState, audio_out: &mut Vec<AudioEvent>) -> Vec3 {
        let dests = [
            ("la Portería de Fútbol", Vec3::new(25.0, 0.0, 40.0)),
            ("el Muelle del Lago", Vec3::new(-44.0, 0.0, -75.0)),
            ("la Piscina de Pelotas", Vec3::new(-32.0, 0.0, 48.0)),
        ];
        let r_idx = (self.dogs[self.active_idx].next_rand() * dests.len() as f32) as usize % dests.len();
        let (name, target) = dests[r_idx];
        world.log_activity(format!("🏁 ¡RETO DE VELOCIDAD hacia {}! ¡3... 2... 1... ¡¡YA!! 🐕⚡", name));
        audio_out.push(AudioEvent {
            kind: AudioKind::Bark,
            world_pos: self.dogs[self.active_idx].position,
            pitch: 1.2,
        });

        let mut racers = 0usize;
        for i in 0..5 {
            if i == self.active_idx || racers >= 3 {
                continue;
            }
            let r = self.dogs[i].next_rand();
            let mult = self.dogs[i].profile().speed_multiplier;
            let mut off = target;
            off.x += (racers as f32 - 1.0) * 1.4;
            self.dogs[i].ai.state = AiPackState::SpeedRace;
            self.dogs[i].ai.target_pos = off;
            self.dogs[i].ai.speed = (6.0 + r * 2.2) * mult;
            self.dogs[i].ai.state_timer = 18.0;
            self.anims[i].play(AnimId::Run, 0.0, &mut self.dogs[i]);
            racers += 1;
        }
        target
    }

    pub fn start_pack_gossip(&mut self, world: &mut WorldState, audio_out: &mut Vec<AudioEvent>) {
        let center = self.dogs[self.active_idx].position;
        world.log_activity("💬 ¡Reunión secreta de la manada en círculo para saludarse y charlar!");
        audio_out.push(AudioEvent {
            kind: AudioKind::HappyJingle,
            world_pos: center,
            pitch: 1.0,
        });
        let mut slot = 0usize;
        for i in 0..5 {
            if i == self.active_idx {
                continue;
            }
            let angle = (slot as f32 / 4.0) * std::f32::consts::TAU;
            slot += 1;
            self.dogs[i].ai.state = AiPackState::PackGossip;
            self.dogs[i].ai.target_pos = Vec3::new(center.x + angle.cos() * 2.6, 0.0, center.z + angle.sin() * 2.6);
            self.dogs[i].ai.speed = 4.4;
            self.dogs[i].ai.state_timer = 12.0;
            self.anims[i].play(AnimId::Walk, 0.0, &mut self.dogs[i]);
        }
    }

    pub fn pick_new_target(&mut self, idx: usize, world: &WorldState, logs_out: &mut Vec<String>) {
        let dog = &mut self.dogs[idx];
        let profile = dog.profile();
        dog.ai.target_ball_idx = None;
        dog.ai.target_snack_id = None;
        dog.energy = (dog.energy - 1.5).max(10.0);
        dog.hydration = (dog.hydration - 2.0).max(15.0);

        let r1 = dog.next_rand();
        if dog.hydration < 35.0 && r1 < 0.75 {
            dog.ai.target_pos = Vec3::new(12.0, 0.0, 10.0);
            dog.ai.state = AiPackState::Wander;
            dog.ai.speed = 3.8 * profile.speed_multiplier;
            dog.ai.state_timer = 9.0;
            self.anims[idx].play(AnimId::Walk, 0.0, dog);
            logs_out.push(format!("💧 {} tiene sed y va a beber a la cibercuenca.", profile.name));
            return;
        }

        let r2 = dog.next_rand();
        if dog.energy < 25.0 && r2 < 0.7 {
            dog.ai.target_pos = Vec3::new(72.0, 0.0, 52.0);
            dog.ai.state = AiPackState::GoRecharge;
            dog.ai.speed = 3.2 * profile.speed_multiplier;
            dog.ai.state_timer = 11.0;
            self.anims[idx].play(AnimId::Walk, 0.0, dog);
            logs_out.push(format!("🔋 {} tiene poca batería y va a la estación de recarga.", profile.name));
            return;
        }

        let r3 = dog.next_rand();
        if !world.snacks.is_empty() && r3 < 0.65 {
            let snack = &world.snacks[0];
            dog.ai.target_snack_id = Some(snack.id);
            dog.ai.target_pos = snack.pos;
            dog.ai.state = AiPackState::ChaseSnack;
            dog.ai.speed = 5.6 * profile.speed_multiplier;
            dog.ai.state_timer = 8.0;
            self.anims[idx].play(AnimId::Run, 0.0, dog);
            logs_out.push(format!("🍪 ¡{} olió una galleta y corre a comérsela!", profile.name));
            return;
        }

        let choice = dog.next_rand();
        let r_extra = dog.next_rand();
        match dog.id {
            RobotId::Bolt => {
                let avail: Vec<usize> = world
                    .balls
                    .iter()
                    .enumerate()
                    .filter(|(_, b)| b.carried_by.is_none())
                    .map(|(bi, _)| bi)
                    .collect();
                if !avail.is_empty() && choice < 0.6 {
                    let bi = avail[(r_extra * avail.len() as f32) as usize % avail.len()];
                    dog.ai.target_ball_idx = Some(bi);
                    dog.ai.target_pos = world.balls[bi].pos;
                    dog.ai.state = AiPackState::ChaseBall;
                    dog.ai.speed = 6.4 * profile.speed_multiplier;
                    dog.ai.state_timer = 9.0;
                    self.anims[idx].play(AnimId::Run, 0.0, dog);
                    logs_out.push("⚡ ¡Bolt corre a toda velocidad hacia la pelota!".into());
                } else {
                    dog.ai.target_pos = Vec3::new(22.0, 0.0, -50.0);
                    dog.ai.state = AiPackState::GoTunnel;
                    dog.ai.speed = 5.8 * profile.speed_multiplier;
                    dog.ai.state_timer = 8.0;
                    self.anims[idx].play(AnimId::Run, 0.0, dog);
                }
            }
            RobotId::Pixel => {
                if choice < 0.45 {
                    let angle = r_extra * std::f32::consts::TAU;
                    let r = 12.0 + dog.next_rand() * 30.0;
                    dog.ai.target_pos = Vec3::new(-80.0 + angle.cos() * r, 0.0, -80.0 + angle.sin() * r);
                    dog.ai.state = AiPackState::Wander;
                } else {
                    dog.ai.target_pos = Vec3::new(76.0, 0.0, 18.0);
                    dog.ai.state = AiPackState::GoTarget;
                }
                dog.ai.speed = 3.6 * profile.speed_multiplier;
                dog.ai.state_timer = 10.0;
                self.anims[idx].play(AnimId::Walk, 0.0, dog);
            }
            RobotId::Luna => {
                if choice < 0.4 {
                    dog.ai.target_pos = Vec3::new(-32.0, 0.0, 48.0);
                    dog.ai.state = AiPackState::GoBallpit;
                } else if choice < 0.7 {
                    dog.ai.target_pos = Vec3::new(72.0, 0.0, 52.0);
                    dog.ai.state = AiPackState::GoRecharge;
                } else {
                    let a = r_extra * std::f32::consts::TAU;
                    dog.ai.target_pos = Vec3::new(a.cos() * 28.0, 0.0, a.sin() * 28.0);
                    dog.ai.state = AiPackState::Wander;
                }
                dog.ai.speed = 3.0 * profile.speed_multiplier;
                dog.ai.state_timer = 10.0;
                self.anims[idx].play(AnimId::Walk, 0.0, dog);
            }
            RobotId::Rusty => {
                if choice < 0.35 {
                    dog.ai.target_pos = Vec3::new(-18.0, 0.0, -32.0);
                    dog.ai.state = AiPackState::GoSlide;
                } else if choice < 0.65 {
                    dog.ai.target_pos = Vec3::new(38.0, 0.0, 22.0);
                    dog.ai.state = AiPackState::GoTrampoline;
                } else {
                    dog.ai.target_pos = Vec3::new(-42.0, 0.0, 14.0);
                    dog.ai.state = AiPackState::GoPinata;
                }
                dog.ai.speed = 5.0 * profile.speed_multiplier;
                dog.ai.state_timer = 9.0;
                self.anims[idx].play(AnimId::Run, 0.0, dog);
            }
            RobotId::Sparky => {
                let dests = [
                    Vec3::new(-32.0, 0.0, 48.0),
                    Vec3::new(-18.0, 0.0, -32.0),
                    Vec3::new(22.0, 0.0, -50.0),
                    Vec3::new(38.0, 0.0, 22.0),
                    Vec3::new(50.0, 0.0, 40.0),
                ];
                let d_idx = (r_extra * dests.len() as f32) as usize % dests.len();
                dog.ai.target_pos = dests[d_idx];
                dog.ai.state = AiPackState::Wander;
                dog.ai.speed = 3.8 * profile.speed_multiplier;
                dog.ai.state_timer = 8.0;
                let anim = if choice < 0.5 { AnimId::Run } else { AnimId::Walk };
                self.anims[idx].play(anim, 0.0, dog);
            }
        }
    }

    pub fn compute_avoidance_dir(world: &WorldState, pos: Vec3, desired_dir: Vec3) -> Vec3 {
        let look_ahead = 2.4f32;
        let probe_x = pos.x + desired_dir.x * look_ahead;
        let probe_z = pos.z + desired_dir.z * look_ahead;
        let mut scratch = Vec::with_capacity(24);
        world.gather_near_obstacle_indices(probe_x, probe_z, &mut scratch);

        for &idx in &scratch {
            let obs = &world.obstacles[idx];
            if pos.y + 1.1 < obs.y_min || pos.y > obs.y_max {
                continue;
            }
            let dx = probe_x - obs.x;
            let dz = probe_z - obs.z;
            let r = if obs.radius > 0.0 {
                obs.radius
            } else {
                obs.half_w.max(obs.half_d)
            } + 1.1;
            let dist = dx.hypot(dz);
            if dist < r && dist > 1e-3 {
                let steer = Vec3::new(dx / dist, 0.0, dz / dist);
                return (desired_dir + steer * 1.35).normalize_or_zero();
            }
        }
        desired_dir
    }

    pub fn update(&mut self, dt: f32, world: &mut WorldState, audio_out: &mut Vec<AudioEvent>) {
        // Sync seesaw tilt once across all 5 dogs!
        world.apply_seesaw_from_dogs(&self.dogs);

        let player_pos = self.dogs[self.active_idx].position;
        let player_name = self.dogs[self.active_idx].id.name();

        let mut logs_to_push = Vec::new();
        let mut scratch = Vec::with_capacity(16);

        for i in 0..5 {
            if i == self.active_idx {
                continue;
            }

            let surface = world.footstep_surface_at(self.dogs[i].position.x, self.dogs[i].position.z);
            self.dogs[i].update_secondary(dt);
            self.anims[i].update(dt, &mut self.dogs[i], surface, audio_out);

            if self.dogs[i].is_picked_up || self.dogs[i].is_sliding {
                continue;
            }

            self.dogs[i].ai.state_timer -= dt;
            if self.dogs[i].ai.player_greet_cooldown > 0.0 {
                self.dogs[i].ai.player_greet_cooldown = (self.dogs[i].ai.player_greet_cooldown - dt).max(0.0);
            }
            if self.dogs[i].ai.dog_greet_cooldown > 0.0 {
                self.dogs[i].ai.dog_greet_cooldown = (self.dogs[i].ai.dog_greet_cooldown - dt).max(0.0);
            }

            // Dynamic tracking
            if self.dogs[i].ai.state == AiPackState::ChaseBall {
                if let Some(bi) = self.dogs[i].ai.target_ball_idx {
                    if let Some(ball) = world.balls.get(bi) {
                        if ball.carried_by.is_some() {
                            self.pick_new_target(i, world, &mut logs_to_push);
                            continue;
                        }
                        self.dogs[i].ai.target_pos = ball.pos;
                    } else {
                        self.pick_new_target(i, world, &mut logs_to_push);
                        continue;
                    }
                }
            } else if self.dogs[i].ai.state == AiPackState::ChaseSnack {
                if let Some(sid) = self.dogs[i].ai.target_snack_id {
                    if let Some(s) = world.snacks.iter().find(|s| s.id == sid) {
                        self.dogs[i].ai.target_pos = s.pos;
                    } else {
                        self.pick_new_target(i, world, &mut logs_to_push);
                        continue;
                    }
                }
            }

            // Play Tag
            if self.dogs[i].ai.state == AiPackState::PlayTag {
                let Some(t_id) = self.dogs[i].ai.tag_target else {
                    self.pick_new_target(i, world, &mut logs_to_push);
                    continue;
                };
                let t_idx = Self::idx_of(t_id);
                let t_pos = self.dogs[t_idx].position;
                if self.dogs[i].ai.tag_role == Some(TagRole::Chaser) {
                    self.dogs[i].ai.target_pos = t_pos;
                    let d = self.dogs[i].position.distance(t_pos);
                    if d < 1.5 {
                        audio_out.push(AudioEvent {
                            kind: AudioKind::Boop,
                            world_pos: self.dogs[i].position,
                            pitch: 1.5,
                        });
                        let my_id = self.dogs[i].id;
                        logs_to_push.push(format!(
                            "⚡ ¡{} tocó a {}! ¡Ahora la trae {}! 🐾",
                            my_id.name(),
                            t_id.name(),
                            t_id.name()
                        ));
                        self.dogs[i].ai.tag_role = Some(TagRole::Prey);
                        self.dogs[i].ai.state_timer = 8.0;

                        self.dogs[t_idx].ai.tag_role = Some(TagRole::Chaser);
                        self.dogs[t_idx].ai.tag_target = Some(my_id);
                        self.dogs[t_idx].ai.state_timer = 8.0;
                        self.anims[t_idx].play(AnimId::Jump, 1.0, &mut self.dogs[t_idx]);
                    }
                } else {
                    let mut flee = self.dogs[i].position - t_pos;
                    flee.y = 0.0;
                    flee = if flee.length_squared() > 1e-3 {
                        flee.normalize()
                    } else {
                        Vec3::X
                    };
                    self.dogs[i].ai.target_pos = self.dogs[i].position + flee * 8.0;
                }
                if self.dogs[i].ai.state_timer <= 0.0 {
                    self.dogs[i].ai.state = AiPackState::Wander;
                    self.pick_new_target(i, world, &mut logs_to_push);
                    continue;
                }
            }

            // Speed race winner check
            if self.dogs[i].ai.state == AiPackState::SpeedRace {
                let d = (self.dogs[i].position.x - self.dogs[i].ai.target_pos.x)
                    .hypot(self.dogs[i].position.z - self.dogs[i].ai.target_pos.z);
                if d < 2.8 {
                    logs_to_push.push(format!(
                        "🏆 ¡¡{} GANÓ LA CARRERA!! ¡Es el perrito más veloz del parque! 🥇",
                        self.dogs[i].id.name()
                    ));
                    audio_out.push(AudioEvent {
                        kind: AudioKind::GoalFanfare,
                        world_pos: self.dogs[i].position,
                        pitch: 1.0,
                    });
                    self.anims[i].play(AnimId::Backflip, 2.0, &mut self.dogs[i]);
                    self.dogs[i].set_emotion(EmotionId::Proud, audio_out, false);
                    for j in 0..5 {
                        if self.dogs[j].ai.state == AiPackState::SpeedRace {
                            self.dogs[j].ai.state = AiPackState::Pause;
                            self.dogs[j].ai.state_timer = 3.0;
                        }
                    }
                    continue;
                }
            }

            // Pack Gossip circle
            if self.dogs[i].ai.state == AiPackState::PackGossip {
                let d = (self.dogs[i].position.x - self.dogs[i].ai.target_pos.x)
                    .hypot(self.dogs[i].position.z - self.dogs[i].ai.target_pos.z);
                if d < 1.8 {
                    self.anims[i].play(AnimId::WagTail, 0.0, &mut self.dogs[i]);
                    if self.dogs[i].next_rand() < 0.04 {
                        let anim = if self.dogs[i].next_rand() < 0.5 {
                            AnimId::HeadTilt
                        } else {
                            AnimId::PlayBow
                        };
                        self.anims[i].play(anim, 1.8, &mut self.dogs[i]);
                        audio_out.push(AudioEvent {
                            kind: AudioKind::Boop,
                            world_pos: self.dogs[i].position,
                            pitch: self.dogs[i].profile().voice_pitch,
                        });
                    }
                }
                if self.dogs[i].ai.state_timer <= 0.0 {
                    self.pick_new_target(i, world, &mut logs_to_push);
                    continue;
                }
            }

            // Greet Active Player Robot
            if self.dogs[i].ai.player_greet_cooldown <= 0.0 {
                let dist_p = self.dogs[i].position.distance(player_pos);
                if dist_p < 4.0
                    && !matches!(
                        self.dogs[i].ai.state,
                        AiPackState::InteractPlayer
                            | AiPackState::PlayTag
                            | AiPackState::SpeedRace
                            | AiPackState::AssemblePack
                    )
                {
                    self.dogs[i].ai.state = AiPackState::InteractPlayer;
                    self.dogs[i].ai.state_timer = 3.2;
                    self.dogs[i].ai.player_greet_cooldown = 18.0;
                    self.dogs[i].look_at(player_pos);
                    let emos = [EmotionId::Happy, EmotionId::Loving, EmotionId::Excited, EmotionId::Proud];
                    let e_i = (self.dogs[i].next_rand() * emos.len() as f32) as usize % emos.len();
                    self.dogs[i].set_emotion(emos[e_i], audio_out, false);
                    let moves = [AnimId::Wave, AnimId::WagTail, AnimId::Bark, AnimId::Spin, AnimId::Dance];
                    let m_i = (self.dogs[i].next_rand() * moves.len() as f32) as usize % moves.len();
                    self.anims[i].play(moves[m_i], 2.5, &mut self.dogs[i]);
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Bark,
                        world_pos: self.dogs[i].position,
                        pitch: self.dogs[i].profile().voice_pitch,
                    });
                    let greeting = match self.dogs[i].id {
                        RobotId::Bolt => format!("⚡ Bolt: \"¡Hola {}! ¿Listo para una carrera hacia la portería?\"", player_name),
                        RobotId::Pixel => format!("🔍 Pixel: \"He sincronizado mis sensores contigo, {}.\"", player_name),
                        RobotId::Luna => format!("💖 Luna: \"¡Qué lindo verte, {}! Te mando mimos cibernéticos.\"", player_name),
                        RobotId::Rusty => format!("🤸 Rusty: \"¡Mírame, {}! ¡Mira qué truco acabo de inventar!\"", player_name),
                        RobotId::Sparky => "🐾 Sparky: \"¡Hola compañero! El día está perfecto para explorar juntos.\"".to_string(),
                    };
                    logs_to_push.push(greeting);
                }
            }

            // Greet between autonomous dogs
            if self.dogs[i].ai.dog_greet_cooldown <= 0.0 && self.dogs[i].ai.state != AiPackState::InteractDog {
                for j in 0..5 {
                    if j == i || j == self.active_idx {
                        continue;
                    }
                    let dist_b = self.dogs[i].position.distance(self.dogs[j].position);
                    if dist_b < 3.4
                        && self.dogs[i].ai.last_interacted_dog != Some(self.dogs[j].id)
                        && self.dogs[j].ai.dog_greet_cooldown <= 0.0
                    {
                        self.dogs[i].ai.state = AiPackState::InteractDog;
                        self.dogs[i].ai.state_timer = 3.0;
                        self.dogs[i].ai.dog_greet_cooldown = 16.0;
                        self.dogs[i].ai.last_interacted_dog = Some(self.dogs[j].id);
                        self.dogs[j].ai.dog_greet_cooldown = 16.0;

                        let pos_i = self.dogs[i].position;
                        let pos_j = self.dogs[j].position;
                        self.dogs[i].look_at(pos_j);
                        self.dogs[j].look_at(pos_i);

                        let r = self.dogs[i].next_rand();
                        if r < 0.45 {
                            self.dogs[i].set_emotion(EmotionId::Excited, audio_out, false);
                            self.anims[i].play(AnimId::PlayBow, 2.5, &mut self.dogs[i]);
                            self.anims[j].play(AnimId::WagTail, 2.5, &mut self.dogs[j]);
                            audio_out.push(AudioEvent {
                                kind: AudioKind::Yip,
                                world_pos: pos_i,
                                pitch: self.dogs[i].profile().voice_pitch,
                            });
                            logs_to_push.push(format!(
                                "🐶 ¡{} hizo una reverencia de juego (play-bow) ante {}!",
                                self.dogs[i].id.name(),
                                self.dogs[j].id.name()
                            ));
                        } else {
                            self.dogs[i].set_emotion(EmotionId::Happy, audio_out, false);
                            let a = if self.dogs[i].next_rand() < 0.5 {
                                AnimId::Sniff
                            } else {
                                AnimId::Nuzzle
                            };
                            self.anims[i].play(a, 2.2, &mut self.dogs[i]);
                            audio_out.push(AudioEvent {
                                kind: AudioKind::Boop,
                                world_pos: pos_i,
                                pitch: self.dogs[i].profile().voice_pitch,
                            });
                            logs_to_push.push(format!(
                                "🐾 {} y {} se saludaron con un boop de hocicos.",
                                self.dogs[i].id.name(),
                                self.dogs[j].id.name()
                            ));
                        }
                        break;
                    }
                }
            }

            if self.dogs[i].ai.state == AiPackState::InteractPlayer {
                self.dogs[i].look_at(player_pos);
                if self.dogs[i].ai.state_timer <= 0.0 {
                    self.pick_new_target(i, world, &mut logs_to_push);
                }
                continue;
            }
            if self.dogs[i].ai.state == AiPackState::InteractDog {
                if self.dogs[i].ai.state_timer <= 0.0 {
                    self.dogs[i].ai.last_interacted_dog = None;
                    self.pick_new_target(i, world, &mut logs_to_push);
                }
                continue;
            }

            if self.dogs[i].ai.state == AiPackState::GoRecharge {
                let d_station = (self.dogs[i].position.x - 72.0).hypot(self.dogs[i].position.z - 52.0);
                if d_station < 2.5 {
                    self.dogs[i].ai.state = AiPackState::Recharging;
                    self.dogs[i].ai.state_timer = 6.0;
                    self.dogs[i].energy = 100.0;
                    self.dogs[i].set_emotion(EmotionId::Sleepy, audio_out, false);
                    self.anims[i].play(AnimId::LieDown, 0.0, &mut self.dogs[i]);
                    audio_out.push(AudioEvent {
                        kind: AudioKind::Boop,
                        world_pos: self.dogs[i].position,
                        pitch: self.dogs[i].profile().voice_pitch,
                    });
                }
            }
            if self.dogs[i].ai.state == AiPackState::Recharging {
                if self.dogs[i].ai.state_timer <= 0.0 {
                    self.dogs[i].set_emotion(EmotionId::Happy, audio_out, false);
                    self.pick_new_target(i, world, &mut logs_to_push);
                }
                continue;
            }

            let cur_pos = self.dogs[i].position;
            let dist_target = (cur_pos.x - self.dogs[i].ai.target_pos.x)
                .hypot(cur_pos.z - self.dogs[i].ai.target_pos.z);

            if self.dogs[i].ai.state == AiPackState::AssemblePack && dist_target < 1.8 {
                self.dogs[i].look_at(player_pos);
                self.dogs[i].set_emotion(EmotionId::Loving, audio_out, false);
                self.anims[i].play(AnimId::PlayBow, 2.5, &mut self.dogs[i]);
                audio_out.push(AudioEvent {
                    kind: AudioKind::Boop,
                    world_pos: cur_pos,
                    pitch: self.dogs[i].profile().voice_pitch,
                });
                self.dogs[i].ai.state = AiPackState::Pause;
                self.dogs[i].ai.state_timer = 4.0;
            } else if dist_target < 2.0 || self.dogs[i].ai.state_timer <= 0.0 {
                if self.dogs[i].next_rand() < 0.35 && self.dogs[i].ai.state != AiPackState::Pause {
                    let tricks = [
                        AnimId::Sniff,
                        AnimId::Sit,
                        AnimId::WagTail,
                        AnimId::Bark,
                        AnimId::Spin,
                        AnimId::Backflip,
                        AnimId::Dance,
                    ];
                    let t_i = (self.dogs[i].next_rand() * tricks.len() as f32) as usize % tricks.len();
                    self.anims[i].play(tricks[t_i], 2.5, &mut self.dogs[i]);
                    self.dogs[i].ai.state = AiPackState::Pause;
                    self.dogs[i].ai.state_timer = 2.5;
                } else {
                    self.pick_new_target(i, world, &mut logs_to_push);
                }
            }

            let is_moving = matches!(
                self.dogs[i].ai.state,
                AiPackState::Wander
                    | AiPackState::ChaseBall
                    | AiPackState::ChaseSnack
                    | AiPackState::GoRecharge
                    | AiPackState::GoTrampoline
                    | AiPackState::GoBallpit
                    | AiPackState::GoSlide
                    | AiPackState::GoTunnel
                    | AiPackState::GoTarget
                    | AiPackState::GoPinata
                    | AiPackState::AssemblePack
                    | AiPackState::PlayTag
                    | AiPackState::SpeedRace
                    | AiPackState::PackGossip
            );

            if is_moving {
                let mut raw_dir = self.dogs[i].ai.target_pos - self.dogs[i].position;
                raw_dir.y = 0.0;
                if raw_dir.length_squared() > 1e-4 {
                    raw_dir = raw_dir.normalize();
                } else {
                    raw_dir = Vec3::Z;
                }
                let dir = Self::compute_avoidance_dir(world, self.dogs[i].position, raw_dir);
                let target_angle = dir.x.atan2(dir.z);
                self.dogs[i].rotation_y = lerp_angle(self.dogs[i].rotation_y, target_angle, dt * 6.0);

                // Unstuck detector
                let moved = (self.dogs[i].position.x - self.dogs[i].ai.last_pos.x)
                    .hypot(self.dogs[i].position.z - self.dogs[i].ai.last_pos.z);
                self.dogs[i].ai.last_pos = self.dogs[i].position;
                if moved < 0.035 && dist_target > 2.0 {
                    self.dogs[i].ai.stuck_timer += dt;
                    if self.dogs[i].ai.stuck_timer > 0.65 {
                        let tan = Vec3::new(-raw_dir.z, 0.0, raw_dir.x).normalize_or_zero();
                        self.dogs[i].position += tan * (dt * 3.8);
                    }
                    if self.dogs[i].ai.stuck_timer > 1.8 {
                        self.dogs[i].ai.stuck_timer = 0.0;
                        self.pick_new_target(i, world, &mut logs_to_push);
                    }
                } else {
                    self.dogs[i].ai.stuck_timer = (self.dogs[i].ai.stuck_timer - dt * 2.0).max(0.0);
                }

                let spd = self.dogs[i].ai.speed;
                self.dogs[i].position += dir * (spd * dt);

                world.resolve_obstacle_collisions(&mut self.dogs[i].position, 0.75, 1.2, &mut scratch);
                self.dogs[i].position.x = self.dogs[i].position.x.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
                self.dogs[i].position.z = self.dogs[i].position.z.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);

                let ground_y = world.get_height_at(self.dogs[i].position.x, self.dogs[i].position.z);
                if !self.dogs[i].is_in_water {
                    if self.dogs[i].position.y > ground_y + 0.05 || self.dogs[i].velocity_y > 0.0 {
                        self.dogs[i].velocity_y -= 18.0 * dt;
                        self.dogs[i].position.y += self.dogs[i].velocity_y * dt;
                        if self.dogs[i].position.y <= ground_y {
                            self.dogs[i].position.y = ground_y;
                            self.dogs[i].velocity_y = 0.0;
                        }
                    } else {
                        self.dogs[i].position.y = ground_y;
                        self.dogs[i].velocity_y = 0.0;
                    }
                }

                let (dog_split, anim_split) = (&mut self.dogs[i], &mut self.anims[i]);
                world.handle_robot_interactions(dog_split, anim_split, dt, audio_out);
            }
        }

        // Solid Robot-to-Robot XZ pushout WITH post-pushout obstacle re-clamp so dogs NEVER get pushed into trees/walls!
        for a in 0..5 {
            for b in (a + 1)..5 {
                if (self.dogs[a].position.y - self.dogs[b].position.y).abs() >= 1.2 {
                    continue;
                }
                let dx = self.dogs[a].position.x - self.dogs[b].position.x;
                let dz = self.dogs[a].position.z - self.dogs[b].position.z;
                let dist = dx.hypot(dz);
                let min_d = if a == self.active_idx || b == self.active_idx {
                    1.4
                } else {
                    1.35
                };
                if dist < min_d && dist > 1e-3 {
                    let overlap = (min_d - dist) * 0.5;
                    let nx = dx / dist;
                    let nz = dz / dist;
                    self.dogs[a].position.x += nx * overlap;
                    self.dogs[a].position.z += nz * overlap;
                    self.dogs[b].position.x -= nx * overlap;
                    self.dogs[b].position.z -= nz * overlap;

                    world.resolve_obstacle_collisions(&mut self.dogs[a].position, 0.75, 1.2, &mut scratch);
                    world.resolve_obstacle_collisions(&mut self.dogs[b].position, 0.75, 1.2, &mut scratch);
                }
            }
        }

        for msg in logs_to_push {
            world.log_activity(msg);
        }
    }
}
