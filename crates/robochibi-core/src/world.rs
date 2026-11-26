use crate::animations::AnimId;
use crate::audio_events::{AudioEvent, AudioKind, FootstepSurface};
use crate::mesh::{
    beveled_box, box_mesh, cylinder_arc_mesh, cylinder_mesh, disc_mesh, hex_to_rgba,
    octahedron_mesh, plane_mesh, ring_mesh, sphere_mesh, torus_mesh, MatStyle, MeshData, Vertex,
};
use crate::robot::ChibiRobotDog;
use glam::{Mat4, Vec3};
use std::collections::HashMap;

pub const MAP_PLAY_LIMIT: f32 = 144.0;
pub const LAKE_CENTER_X: f32 = -80.0;
pub const LAKE_CENTER_Z: f32 = -80.0;
pub const LAKE_RADIUS: f32 = 60.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObstacleShape {
    Cylinder,
    Box,
}

#[derive(Debug, Clone)]
pub struct Obstacle {
    pub tag: &'static str,
    pub shape: ObstacleShape,
    pub x: f32,
    pub z: f32,
    pub radius: f32,
    pub half_w: f32,
    pub half_d: f32,
    pub rot_y: f32,
    pub y_min: f32,
    pub y_max: f32,
}

#[derive(Debug, Clone)]
pub enum SurfaceProfile {
    Flat(f32),
    Bridge { base_y: f32, span: f32, arch_peak: f32 },
    Ramp { base_y: f32, len: f32, top_y: f32 },
}

#[derive(Debug, Clone)]
pub struct ElevatedSurface {
    pub x: f32,
    pub z: f32,
    pub rot_y: f32,
    pub half_w: f32,
    pub half_d: f32,
    pub footstep_surface: FootstepSurface,
    pub profile: SurfaceProfile,
}

impl ElevatedSurface {
    pub fn height_at(&self, local_x: f32, local_z: f32) -> Option<f32> {
        if local_x.abs() > self.half_w || local_z.abs() > self.half_d {
            return None;
        }
        match self.profile {
            SurfaceProfile::Flat(y) => Some(y),
            SurfaceProfile::Bridge {
                base_y,
                span,
                arch_peak,
            } => {
                let t = (local_z / span) + 0.5;
                if !(0.0..=1.0).contains(&t) {
                    None
                } else {
                    Some(base_y + (t * std::f32::consts::PI).sin() * arch_peak + 0.22)
                }
            }
            SurfaceProfile::Ramp {
                base_y,
                len,
                top_y,
            } => {
                let t = 0.5 - (local_z / len);
                if !(0.0..=1.0).contains(&t) {
                    None
                } else {
                    Some(base_y + t * top_y + 0.18)
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct PointOfInterest {
    pub name: &'static str,
    pub position: Vec3,
    pub radius: f32,
    pub kind: &'static str,
}

#[derive(Debug, Clone)]
pub struct BallState {
    pub pos: Vec3,
    pub rot: Vec3,
    pub velocity: Vec3,
    pub radius: f32,
    pub mass: f32,
    pub bounciness: f32,
    pub friction: f32,
    pub is_soccer: bool,
    pub is_neon: bool,
    pub color_hex: u32,
    pub name: &'static str,
    pub carried_by: Option<usize>,
    pub target_hit_cooldown: f32,
}

#[derive(Debug, Clone)]
pub struct SnackState {
    pub id: u64,
    pub pos: Vec3,
    pub age: f32,
}

#[derive(Debug, Clone)]
pub struct BoneToyState {
    pub pos: Vec3,
    pub rot_y: f32,
    pub carried_by: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct SlalomRing {
    pub index: usize,
    pub position: Vec3,
    pub entry_pos: Vec3,
    pub exit_pos: Vec3,
    pub radius: f32,
    pub color_hex: u32,
    pub cooldown: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreasureKind {
    Bone,
    Gear,
    Gem,
    Ball,
}

#[derive(Debug, Clone)]
pub struct TreasureSpot {
    pub x: f32,
    pub z: f32,
    pub y: f32,
    pub dug: bool,
    pub kind: TreasureKind,
    pub name: &'static str,
}

#[derive(Debug, Clone)]
pub struct BallPitBall {
    pub origin: Vec3,
    pub pos: Vec3,
    pub color_hex: u32,
}

#[derive(Debug, Clone)]
pub struct ButterflyState {
    pub base_pos: Vec3,
    pub pos: Vec3,
    pub phase: f32,
    pub speed: f32,
    pub rot_y: f32,
}

#[derive(Debug, Clone)]
pub struct CloudState {
    pub pos: Vec3,
    pub speed: f32,
    pub rot_y: f32,
    pub scale: Vec3,
}

#[derive(Debug, Clone)]
pub struct TreeInstance {
    pub pos: Vec3,
    pub scale: f32,
    pub color_idx: usize,
    pub has_cyber_ring: bool,
}

#[derive(Debug, Clone)]
pub struct FlowerInstance {
    pub pos: Vec3,
    pub scale: f32,
    pub color: [f32; 4],
}

#[derive(Debug, Clone)]
pub struct DiscoTile {
    pub local_pos: Vec3,
    pub color_hex: u32,
    pub emissive: f32,
}

pub struct WorldStaticMeshes {
    pub terrain: MeshData,
    pub grass_paths: MeshData,
    pub plaza_and_paths: MeshData,
    pub wood_structures: MeshData,
    pub tartan_floor: MeshData,
    pub static_props: MeshData,
    pub wireframe_net: MeshData,
    pub water_disc: MeshData,
    pub fountain_water: MeshData,
    pub toy_boat: MeshData,
    pub boat_propeller: MeshData,
    pub carousel_rotor: MeshData,
    pub seesaw_plank: MeshData,
    pub trampoline_mat: MeshData,
    pub disco_ball: MeshData,
    pub disco_tile: MeshData,
    pub target_rotor: MeshData,
    pub pinata_body: MeshData,
    pub fountain_jet: MeshData,
    pub soccer_ball: MeshData,
    pub color_ball: MeshData,
    pub bone_toy: MeshData,
    pub snack: MeshData,
    pub treasure_mound: MeshData,
    pub treasure_sparkle: MeshData,
    pub treasure_bone: MeshData,
    pub treasure_gear: MeshData,
    pub treasure_gem: MeshData,
    pub tree_trunk: MeshData,
    pub tree_foliage: MeshData,
    pub tree_cyber_ring: MeshData,
    pub flower: MeshData,
    pub butterfly: MeshData,
    pub cloud: MeshData,
    pub sparkle_quad: MeshData,
}

pub struct WorldState {
    pub obstacles: Vec<Obstacle>,
    pub spatial_grid: HashMap<(i32, i32), Vec<usize>>,
    pub grid_cell_size: f32,
    pub elevated_surfaces: Vec<ElevatedSurface>,
    pub points_of_interest: Vec<PointOfInterest>,

    pub water_time: f32,
    pub carousel_angle: f32,
    pub carousel_pos: Vec3,
    pub disco_party_active: bool,
    pub disco_timer: f32,
    pub disco_beat_acc: f32,
    pub disco_beat_step: u8,
    pub disco_pad_pos: Vec3,
    pub disco_ball_rot_y: f32,
    pub disco_tiles: Vec<DiscoTile>,

    pub trampoline_pos: Vec3,
    pub trampoline_depress: f32,
    pub trampoline_vel: f32,

    pub fountain_pos: Vec3,
    pub fountain_rot_z: f32,
    pub fountain_jet_scale_y: f32,

    pub seesaw_pos: Vec3,
    pub seesaw_tilt: f32,
    pub seesaw_target_tilt: f32,

    pub boat_pos: Vec3,
    pub boat_rot: Vec3,
    pub boat_prop_rot: f32,

    pub goal_pos: Vec3,
    pub goal_width: f32,
    pub goal_depth: f32,
    pub goal_height: f32,
    pub goal_score: u32,
    pub goal_flash_timer: f32,

    pub target_pos: Vec3,
    pub target_rot_z: f32,
    pub target_radius: f32,
    pub target_score: u32,

    pub pinata_pos: Vec3,
    pub pinata_hits: u32,
    pub pinata_max_hits: u32,
    pub pinata_swing_angle: f32,
    pub pinata_swing_vel: f32,
    pub pinata_hit_cooldown: f32,

    pub slide_top_pos: Vec3,
    pub slide_end_pos: Vec3,
    pub tunnel_start: Vec3,

    pub ballpit_pos: Vec3,
    pub ballpit_balls: Vec<BallPitBall>,

    pub slalom_rings: Vec<SlalomRing>,
    pub treasure_spots: Vec<TreasureSpot>,
    pub balls: Vec<BallState>,
    pub snacks: Vec<SnackState>,
    pub bone_toys: Vec<BoneToyState>,

    pub trees: Vec<TreeInstance>,
    pub flowers: Vec<FlowerInstance>,
    pub butterflies: Vec<ButterflyState>,
    pub clouds: Vec<CloudState>,
    pub ambient_particles: Vec<Vec3>,

    pub activity_log: Vec<String>,
    next_snack_id: u64,
    rng_state: u64,
}

impl WorldState {
    pub fn new() -> Self {
        let mut w = Self {
            obstacles: Vec::with_capacity(512),
            spatial_grid: HashMap::new(),
            grid_cell_size: 20.0,
            elevated_surfaces: Vec::new(),
            points_of_interest: Vec::new(),

            water_time: 0.0,
            carousel_angle: 0.0,
            carousel_pos: Vec3::new(62.0, 0.0, 26.0),
            disco_party_active: false,
            disco_timer: 0.0,
            disco_beat_acc: 0.0,
            disco_beat_step: 0,
            disco_pad_pos: Vec3::new(52.0, 0.0, 56.0),
            disco_ball_rot_y: 0.0,
            disco_tiles: Vec::with_capacity(16),

            trampoline_pos: Vec3::new(38.0, 0.0, 22.0),
            trampoline_depress: 0.0,
            trampoline_vel: 0.0,

            fountain_pos: Vec3::new(12.0, 0.0, 10.0),
            fountain_rot_z: 0.0,
            fountain_jet_scale_y: 1.0,

            seesaw_pos: Vec3::new(48.0, 0.0, 32.0),
            seesaw_tilt: 0.0,
            seesaw_target_tilt: 0.0,

            boat_pos: Vec3::new(-80.0, 0.0, -65.0),
            boat_rot: Vec3::ZERO,
            boat_prop_rot: 0.0,

            goal_pos: Vec3::new(25.0, 0.0, 40.0),
            goal_width: 7.0,
            goal_depth: 3.0,
            goal_height: 3.4,
            goal_score: 0,
            goal_flash_timer: 0.0,

            target_pos: Vec3::new(76.0, 0.0, 18.0),
            target_rot_z: 0.0,
            target_radius: 2.1,
            target_score: 0,

            pinata_pos: Vec3::new(-42.0, 0.0, 14.0),
            pinata_hits: 0,
            pinata_max_hits: 4,
            pinata_swing_angle: 0.0,
            pinata_swing_vel: 0.0,
            pinata_hit_cooldown: 0.0,

            slide_top_pos: Vec3::new(-18.0, 0.0, -32.0),
            slide_end_pos: Vec3::new(-18.0, 0.0, -23.8),
            tunnel_start: Vec3::new(22.0, 0.0, -53.2),

            ballpit_pos: Vec3::new(-32.0, 0.0, 48.0),
            ballpit_balls: Vec::with_capacity(45),

            slalom_rings: Vec::with_capacity(5),
            treasure_spots: Vec::with_capacity(4),
            balls: Vec::with_capacity(6),
            snacks: Vec::new(),
            bone_toys: Vec::with_capacity(3),

            trees: Vec::with_capacity(280),
            flowers: Vec::with_capacity(240),
            butterflies: Vec::with_capacity(24),
            clouds: Vec::with_capacity(12),
            ambient_particles: Vec::with_capacity(120),

            activity_log: Vec::new(),
            next_snack_id: 1,
            rng_state: 0x517cc1b727220a95,
        };

        w.init_world_data();
        w
    }

    fn rand_f32(&mut self) -> f32 {
        self.rng_state ^= self.rng_state << 13;
        self.rng_state ^= self.rng_state >> 7;
        self.rng_state ^= self.rng_state << 17;
        ((self.rng_state & 0xffffff) as f32) / 16777216.0
    }

    pub fn log_activity(&mut self, msg: impl Into<String>) {
        self.activity_log.push(msg.into());
    }

    pub fn get_terrain_height_only(x: f32, z: f32) -> f32 {
        let dist_to_lake = (x - LAKE_CENTER_X).hypot(z - LAKE_CENTER_Z);
        if dist_to_lake < 65.0 {
            let lake_factor = ((dist_to_lake / 65.0) * std::f32::consts::FRAC_PI_2).cos();
            return -4.5 * lake_factor;
        }
        let dist_to_play = (x - 50.0).hypot(z - 40.0);
        let mut y = (x * 0.02).sin() * 2.2
            + (z * 0.025).cos() * 1.8
            + ((x + z) * 0.015).sin() * 1.5;
        if dist_to_play < 55.0 {
            let blend = dist_to_play / 55.0;
            y *= blend * blend;
        }
        y
    }

    pub fn get_height_at(&self, x: f32, z: f32) -> f32 {
        let mut y = Self::get_terrain_height_only(x, z);
        for surf in &self.elevated_surfaces {
            let dx = x - surf.x;
            let dz = z - surf.z;
            let cos = (-surf.rot_y).cos();
            let sin = (-surf.rot_y).sin();
            let lx = dx * cos - dz * sin;
            let lz = dx * sin + dz * cos;
            if let Some(sy) = surf.height_at(lx, lz) {
                if sy > y {
                    y = sy;
                }
            }
        }
        y
    }

    pub fn footstep_surface_at(&self, x: f32, z: f32) -> FootstepSurface {
        let dist_lake = (x - LAKE_CENTER_X).hypot(z - LAKE_CENTER_Z);
        let h = self.get_height_at(x, z);
        if dist_lake < 58.0 && h < -0.1 {
            return FootstepSurface::Water;
        }
        for surf in &self.elevated_surfaces {
            let dx = x - surf.x;
            let dz = z - surf.z;
            let cos = (-surf.rot_y).cos();
            let sin = (-surf.rot_y).sin();
            let lx = dx * cos - dz * sin;
            let lz = dx * sin + dz * cos;
            if surf.height_at(lx, lz).is_some() {
                return surf.footstep_surface;
            }
        }
        if x.hypot(z) < 18.5 || (x - 50.0).hypot(z - 40.0) < 42.0 {
            return FootstepSurface::Stone;
        }
        FootstepSurface::Grass
    }

    pub fn register_obstacle(&mut self, mut obs: Obstacle) {
        let base_y = Self::get_terrain_height_only(obs.x, obs.z);
        if obs.y_min == f32::MIN {
            obs.y_min = base_y - 1.5;
        }
        if obs.y_max == f32::MAX {
            obs.y_max = obs.y_min + 5.5;
        }

        let (ext_x, ext_z) = match obs.shape {
            ObstacleShape::Cylinder => (obs.radius, obs.radius),
            ObstacleShape::Box => {
                let cos = obs.rot_y.cos().abs();
                let sin = obs.rot_y.sin().abs();
                (
                    obs.half_w * cos + obs.half_d * sin,
                    obs.half_w * sin + obs.half_d * cos,
                )
            }
        };

        let idx = self.obstacles.len();
        self.obstacles.push(obs.clone());

        let min_cx = ((obs.x - ext_x) / self.grid_cell_size).floor() as i32;
        let max_cx = ((obs.x + ext_x) / self.grid_cell_size).floor() as i32;
        let min_cz = ((obs.z - ext_z) / self.grid_cell_size).floor() as i32;
        let max_cz = ((obs.z + ext_z) / self.grid_cell_size).floor() as i32;
        for cx in min_cx..=max_cx {
            for cz in min_cz..=max_cz {
                self.spatial_grid.entry((cx, cz)).or_default().push(idx);
            }
        }
    }

    pub fn gather_near_obstacle_indices(&self, x: f32, z: f32, out: &mut Vec<usize>) {
        out.clear();
        let cx = (x / self.grid_cell_size).floor() as i32;
        let cz = (z / self.grid_cell_size).floor() as i32;
        for dx in -1..=1 {
            for dz in -1..=1 {
                if let Some(cell) = self.spatial_grid.get(&(cx + dx, cz + dz)) {
                    for &idx in cell {
                        if !out.contains(&idx) {
                            out.push(idx);
                        }
                    }
                }
            }
        }
    }

    pub fn resolve_obstacle_collisions(
        &self,
        pos: &mut Vec3,
        radius: f32,
        height: f32,
        scratch: &mut Vec<usize>,
    ) -> Option<Vec3> {
        let mut hit_normal: Option<Vec3> = None;
        self.gather_near_obstacle_indices(pos.x, pos.z, scratch);
        let pos_y = pos.y;

        for &idx in scratch.iter() {
            let obs = &self.obstacles[idx];
            if pos_y + height < obs.y_min || pos_y > obs.y_max {
                continue;
            }
            match obs.shape {
                ObstacleShape::Box => {
                    let dx = pos.x - obs.x;
                    let dz = pos.z - obs.z;
                    let cos = (-obs.rot_y).cos();
                    let sin = (-obs.rot_y).sin();
                    let local_x = dx * cos - dz * sin;
                    let local_z = dx * sin + dz * cos;

                    let clamped_x = local_x.clamp(-obs.half_w, obs.half_w);
                    let clamped_z = local_z.clamp(-obs.half_d, obs.half_d);
                    let diff_x = local_x - clamped_x;
                    let diff_z = local_z - clamped_z;
                    let dist_sq = diff_x * diff_x + diff_z * diff_z;

                    if dist_sq < radius * radius {
                        let (push_lx, push_lz, nx_l, nz_l);
                        if dist_sq > 1e-5 {
                            let dist = dist_sq.sqrt();
                            let overlap = radius - dist;
                            nx_l = diff_x / dist;
                            nz_l = diff_z / dist;
                            push_lx = nx_l * overlap;
                            push_lz = nz_l * overlap;
                        } else {
                            let pen_x = obs.half_w - local_x.abs() + radius;
                            let pen_z = obs.half_d - local_z.abs() + radius;
                            if pen_x < pen_z {
                                nx_l = if local_x >= 0.0 { 1.0 } else { -1.0 };
                                nz_l = 0.0;
                                push_lx = nx_l * pen_x;
                                push_lz = 0.0;
                            } else {
                                nx_l = 0.0;
                                nz_l = if local_z >= 0.0 { 1.0 } else { -1.0 };
                                push_lx = 0.0;
                                push_lz = nz_l * pen_z;
                            }
                        }
                        let cos_w = obs.rot_y.cos();
                        let sin_w = obs.rot_y.sin();
                        pos.x += push_lx * cos_w - push_lz * sin_w;
                        pos.z += push_lx * sin_w + push_lz * cos_w;
                        hit_normal = Some(
                            Vec3::new(
                                nx_l * cos_w - nz_l * sin_w,
                                0.0,
                                nx_l * sin_w + nz_l * cos_w,
                            )
                            .normalize_or_zero(),
                        );
                    }
                }
                ObstacleShape::Cylinder => {
                    let dx = pos.x - obs.x;
                    let dz = pos.z - obs.z;
                    let dist = dx.hypot(dz);
                    let min_dist = obs.radius + radius;
                    if dist < min_dist && dist > 1e-4 {
                        let overlap = min_dist - dist;
                        let nx = dx / dist;
                        let nz = dz / dist;
                        pos.x += nx * overlap;
                        pos.z += nz * overlap;
                        hit_normal = Some(Vec3::new(nx, 0.0, nz));
                    }
                }
            }
        }

        // World boundary clamp (circular 238m outer + playable boundary 144m handled by caller)
        let d_origin = pos.x.hypot(pos.z);
        if d_origin > 238.0 {
            let f = 238.0 / d_origin;
            pos.x *= f;
            pos.z *= f;
            hit_normal = Some(Vec3::new(-pos.x / d_origin, 0.0, -pos.z / d_origin));
        }
        hit_normal
    }

    fn init_world_data(&mut self) {
        // 1. Arched Wooden Bridge (-46, -48)
        let b_pos = Vec3::new(-46.0, Self::get_terrain_height_only(-46.0, -48.0), -48.0);
        let b_rot = 0.65f32;
        let span = 18.0f32;
        let width = 4.4f32;
        let arch_peak = 2.6f32;
        for &rx in &[-width * 0.5 + 0.18, width * 0.5 - 0.18] {
            let world_rail = Vec3::new(rx, 0.0, 0.0)
                .rotate_y(b_rot)
                + Vec3::new(b_pos.x, 0.0, b_pos.z);
            self.register_obstacle(Obstacle {
                tag: "bridge_rail",
                shape: ObstacleShape::Box,
                x: world_rail.x,
                z: world_rail.z,
                radius: 0.0,
                half_w: 0.22,
                half_d: span * 0.48,
                rot_y: b_rot,
                y_min: b_pos.y - 0.5,
                y_max: b_pos.y + arch_peak + 2.0,
            });
        }
        self.elevated_surfaces.push(ElevatedSurface {
            x: b_pos.x,
            z: b_pos.z,
            rot_y: b_rot,
            half_w: width * 0.5,
            half_d: span * 0.5,
            footstep_surface: FootstepSurface::Wood,
            profile: SurfaceProfile::Bridge {
                base_y: b_pos.y,
                span,
                arch_peak,
            },
        });

        // 2. Water Fountain (12, 10)
        self.fountain_pos = Vec3::new(12.0, Self::get_terrain_height_only(12.0, 10.0), 10.0);
        self.register_obstacle(Obstacle {
            tag: "water_fountain",
            shape: ObstacleShape::Cylinder,
            x: 12.0,
            z: 10.0,
            radius: 1.65,
            half_w: 0.0,
            half_d: 0.0,
            rot_y: 0.0,
            y_min: self.fountain_pos.y - 1.0,
            y_max: self.fountain_pos.y + 2.0,
        });

        // 3. Cyber Seesaw (48, 32)
        self.seesaw_pos = Vec3::new(48.0, Self::get_terrain_height_only(48.0, 32.0), 32.0);
        self.register_obstacle(Obstacle {
            tag: "seesaw_fulcrum",
            shape: ObstacleShape::Cylinder,
            x: 48.0,
            z: 32.0,
            radius: 1.0,
            half_w: 0.0,
            half_d: 0.0,
            rot_y: 0.0,
            y_min: self.seesaw_pos.y - 1.0,
            y_max: self.seesaw_pos.y + 1.8,
        });

        // 4. Lake Rocks, Pier & Toy Boat
        for i in 0..35 {
            let angle = (i as f32 / 35.0) * std::f32::consts::TAU + (self.rand_f32() - 0.5) * 0.15;
            if angle.abs() < 0.25 {
                continue;
            }
            let rad = LAKE_RADIUS + (self.rand_f32() - 0.5) * 5.0;
            let rx = LAKE_CENTER_X + angle.cos() * rad;
            let rz = LAKE_CENTER_Z + angle.sin() * rad;
            let ry = Self::get_terrain_height_only(rx, rz);
            self.register_obstacle(Obstacle {
                tag: "rock",
                shape: ObstacleShape::Cylinder,
                x: rx,
                z: rz,
                radius: 1.35,
                half_w: 0.0,
                half_d: 0.0,
                rot_y: 0.0,
                y_min: ry - 1.5,
                y_max: ry + 2.2,
            });
        }

        let pier_pos = Vec3::new(-44.0, 0.35, -80.0);
        let pier_rot = 0.28f32;
        for &px in &[-2.8f32, 2.8] {
            for &pz in &[-10.0f32, -3.3, 3.3, 10.0] {
                let wp = Vec3::new(px, 0.0, pz).rotate_y(pier_rot) + pier_pos;
                self.register_obstacle(Obstacle {
                    tag: "pier_post",
                    shape: ObstacleShape::Cylinder,
                    x: wp.x,
                    z: wp.z,
                    radius: 0.32,
                    half_w: 0.0,
                    half_d: 0.0,
                    rot_y: 0.0,
                    y_min: -2.0,
                    y_max: 2.5,
                });
            }
        }
        self.elevated_surfaces.push(ElevatedSurface {
            x: pier_pos.x,
            z: pier_pos.z,
            rot_y: pier_rot,
            half_w: 3.1,
            half_d: 12.1,
            footstep_surface: FootstepSurface::Wood,
            profile: SurfaceProfile::Flat(pier_pos.y + 0.18),
        });

        self.register_obstacle(Obstacle {
            tag: "toy_boat",
            shape: ObstacleShape::Cylinder,
            x: self.boat_pos.x,
            z: self.boat_pos.z,
            radius: 2.3,
            half_w: 0.0,
            half_d: 0.0,
            rot_y: 0.0,
            y_min: -1.5,
            y_max: 2.2,
        });

        // 5. Playground: Ramp, Tunnel, Trampoline, Carousel, Goal, Disco, Doghouse
        let ramp_pos = Vec3::new(45.0, Self::get_terrain_height_only(45.0, 45.0), 45.0);
        let ramp_len = 12.0f32;
        let ramp_w = 4.6f32;
        let ramp_angle = 0.22f32;
        let ramp_top_y = ramp_angle.sin() * ramp_len;
        self.elevated_surfaces.push(ElevatedSurface {
            x: ramp_pos.x,
            z: ramp_pos.z,
            rot_y: 0.0,
            half_w: ramp_w * 0.5,
            half_d: ramp_len * 0.5,
            footstep_surface: FootstepSurface::Stone,
            profile: SurfaceProfile::Ramp {
                base_y: ramp_pos.y,
                len: ramp_len,
                top_y: ramp_top_y,
            },
        });

        // Playground crawl tunnel side walls
        let t_pos = Vec3::new(56.0, Self::get_terrain_height_only(56.0, 24.0), 24.0);
        let t_rot = -0.55f32;
        for &wx in &[-2.15f32, 2.15] {
            let ww = Vec3::new(wx, 0.0, 0.0).rotate_y(t_rot) + t_pos;
            self.register_obstacle(Obstacle {
                tag: "playground_tunnel_wall",
                shape: ObstacleShape::Box,
                x: ww.x,
                z: ww.z,
                radius: 0.0,
                half_w: 0.25,
                half_d: 5.0,
                rot_y: t_rot,
                y_min: t_pos.y - 1.0,
                y_max: t_pos.y + 2.4,
            });
        }

        // Trampoline
        self.trampoline_pos = Vec3::new(38.0, Self::get_terrain_height_only(38.0, 22.0), 22.0);
        // Carousel
        self.carousel_pos = Vec3::new(62.0, Self::get_terrain_height_only(62.0, 26.0), 26.0);
        self.register_obstacle(Obstacle {
            tag: "carousel_mast",
            shape: ObstacleShape::Cylinder,
            x: 62.0,
            z: 26.0,
            radius: 0.55,
            half_w: 0.0,
            half_d: 0.0,
            rot_y: 0.0,
            y_min: self.carousel_pos.y - 1.0,
            y_max: self.carousel_pos.y + 3.2,
        });

        // Soccer Goal (25, 40) + crossbar collider!
        let gy = Self::get_terrain_height_only(25.0, 40.0);
        self.goal_pos = Vec3::new(25.0, gy, 40.0);
        let hw = self.goal_width * 0.5;
        self.register_obstacle(Obstacle {
            tag: "goal_post_l",
            shape: ObstacleShape::Cylinder,
            x: 25.0,
            z: 40.0 - hw,
            radius: 0.25,
            half_w: 0.0,
            half_d: 0.0,
            rot_y: 0.0,
            y_min: gy - 1.0,
            y_max: gy + self.goal_height,
        });
        self.register_obstacle(Obstacle {
            tag: "goal_post_r",
            shape: ObstacleShape::Cylinder,
            x: 25.0,
            z: 40.0 + hw,
            radius: 0.25,
            half_w: 0.0,
            half_d: 0.0,
            rot_y: 0.0,
            y_min: gy - 1.0,
            y_max: gy + self.goal_height,
        });
        self.register_obstacle(Obstacle {
            tag: "goal_crossbar",
            shape: ObstacleShape::Box,
            x: 25.0,
            z: 40.0,
            radius: 0.0,
            half_w: 0.2,
            half_d: hw,
            rot_y: 0.0,
            y_min: gy + self.goal_height - 0.2,
            y_max: gy + self.goal_height + 0.3,
        });
        self.register_obstacle(Obstacle {
            tag: "goal_net_back",
            shape: ObstacleShape::Box,
            x: 25.0 - self.goal_depth,
            z: 40.0,
            radius: 0.0,
            half_w: 0.2,
            half_d: hw,
            rot_y: 0.0,
            y_min: gy - 1.0,
            y_max: gy + self.goal_height,
        });
        self.register_obstacle(Obstacle {
            tag: "goal_net_side_n",
            shape: ObstacleShape::Box,
            x: 25.0 - self.goal_depth * 0.5,
            z: 40.0 - hw,
            radius: 0.0,
            half_w: self.goal_depth * 0.5,
            half_d: 0.2,
            rot_y: 0.0,
            y_min: gy - 1.0,
            y_max: gy + self.goal_height,
        });
        self.register_obstacle(Obstacle {
            tag: "goal_net_side_s",
            shape: ObstacleShape::Box,
            x: 25.0 - self.goal_depth * 0.5,
            z: 40.0 + hw,
            radius: 0.0,
            half_w: self.goal_depth * 0.5,
            half_d: 0.2,
            rot_y: 0.0,
            y_min: gy - 1.0,
            y_max: gy + self.goal_height,
        });

        // Disco Pad (52, 56)
        let dy = Self::get_terrain_height_only(52.0, 56.0);
        self.disco_pad_pos = Vec3::new(52.0, dy, 56.0);
        let tile_colors = [0xff1744, 0x00e5ff, 0x76ff03, 0xffea00, 0xd500f9, 0xff9100];
        for ix in -2..=1 {
            for iz in -2..=1 {
                let col = tile_colors[((ix + 2) * 4 + (iz + 2)) as usize % tile_colors.len()];
                self.disco_tiles.push(DiscoTile {
                    local_pos: Vec3::new(ix as f32 * 1.5 + 0.75, 0.1, iz as f32 * 1.5 + 0.75),
                    color_hex: col,
                    emissive: 0.25,
                });
            }
        }
        for &(cx, cz) in &[(-3.15f32, -3.15), (3.15, -3.15), (-3.15, 3.15), (3.15, 3.15)] {
            self.register_obstacle(Obstacle {
                tag: "disco_pillar",
                shape: ObstacleShape::Cylinder,
                x: 52.0 + cx,
                z: 56.0 + cz,
                radius: 0.25,
                half_w: 0.0,
                half_d: 0.0,
                rot_y: 0.0,
                y_min: dy - 1.0,
                y_max: dy + 5.0,
            });
        }

        // Cyber Doghouse (72, 52)
        let hy = Self::get_terrain_height_only(72.0, 52.0);
        let dw = 6.4f32;
        let dh = 4.6f32;
        let dd = 6.4f32;
        let wt = 0.4f32;
        let door_w = 3.0f32;
        let pillar_w = (dw - door_w) * 0.5;
        self.register_obstacle(Obstacle {
            tag: "doghouse_wall_back",
            shape: ObstacleShape::Box,
            x: 72.0,
            z: 52.0 - dd * 0.5 + wt * 0.5,
            radius: 0.0,
            half_w: dw * 0.5,
            half_d: wt * 0.5,
            rot_y: 0.0,
            y_min: hy - 1.0,
            y_max: hy + dh,
        });
        self.register_obstacle(Obstacle {
            tag: "doghouse_wall_left",
            shape: ObstacleShape::Box,
            x: 72.0 - dw * 0.5 + wt * 0.5,
            z: 52.0,
            radius: 0.0,
            half_w: wt * 0.5,
            half_d: dd * 0.5,
            rot_y: 0.0,
            y_min: hy - 1.0,
            y_max: hy + dh,
        });
        self.register_obstacle(Obstacle {
            tag: "doghouse_wall_right",
            shape: ObstacleShape::Box,
            x: 72.0 + dw * 0.5 - wt * 0.5,
            z: 52.0,
            radius: 0.0,
            half_w: wt * 0.5,
            half_d: dd * 0.5,
            rot_y: 0.0,
            y_min: hy - 1.0,
            y_max: hy + dh,
        });
        self.register_obstacle(Obstacle {
            tag: "doghouse_pillar_l",
            shape: ObstacleShape::Box,
            x: 72.0 - dw * 0.5 + pillar_w * 0.5,
            z: 52.0 + dd * 0.5 - wt * 0.5,
            radius: 0.0,
            half_w: pillar_w * 0.5,
            half_d: wt * 0.5,
            rot_y: 0.0,
            y_min: hy - 1.0,
            y_max: hy + dh,
        });
        self.register_obstacle(Obstacle {
            tag: "doghouse_pillar_r",
            shape: ObstacleShape::Box,
            x: 72.0 + dw * 0.5 - pillar_w * 0.5,
            z: 52.0 + dd * 0.5 - wt * 0.5,
            radius: 0.0,
            half_w: pillar_w * 0.5,
            half_d: wt * 0.5,
            rot_y: 0.0,
            y_min: hy - 1.0,
            y_max: hy + dh,
        });

        // 6. Ball Pit (-32, 48)
        let bpy = Self::get_terrain_height_only(-32.0, 48.0);
        self.ballpit_pos = Vec3::new(-32.0, bpy, 48.0);
        let bp_cols = [0x00e5ff, 0xff3399, 0xffea00, 0x22ff88, 0xa855f7, 0xff9100];
        for i in 0..45 {
            let rx = (self.rand_f32() - 0.5) * 6.0;
            let rz = (self.rand_f32() - 0.5) * 6.0;
            let ry = 0.28 + self.rand_f32() * 0.28;
            let o = Vec3::new(-32.0 + rx, bpy + ry, 48.0 + rz);
            self.ballpit_balls.push(BallPitBall {
                origin: o,
                pos: o,
                color_hex: bp_cols[i % bp_cols.len()],
            });
        }
        for (tag, ox, oz, hw_v, hd_v) in [
            ("ballpit_wall_n", -32.0, 44.5, 3.6, 0.25),
            ("ballpit_wall_s", -32.0, 51.5, 3.6, 0.25),
            ("ballpit_wall_w", -35.5, 48.0, 0.25, 3.6),
            ("ballpit_wall_e", -28.5, 48.0, 0.25, 3.6),
        ] {
            self.register_obstacle(Obstacle {
                tag,
                shape: ObstacleShape::Box,
                x: ox,
                z: oz,
                radius: 0.0,
                half_w: hw_v,
                half_d: hd_v,
                rot_y: 0.0,
                y_min: bpy,
                y_max: bpy + 0.55,
            });
        }

        // 7. Agility Slide (-18, -32)
        let sly = Self::get_terrain_height_only(-18.0, -32.0);
        self.slide_top_pos = Vec3::new(-18.0, sly + 4.2, -32.0);
        self.slide_end_pos = Vec3::new(-18.0, sly + 0.25, -23.8);
        self.register_obstacle(Obstacle {
            tag: "slide_tower",
            shape: ObstacleShape::Box,
            x: -18.0,
            z: -32.0,
            radius: 0.0,
            half_w: 1.35,
            half_d: 1.35,
            rot_y: 0.0,
            y_min: sly - 1.0,
            y_max: sly + 4.0,
        });
        self.register_obstacle(Obstacle {
            tag: "slide_chute",
            shape: ObstacleShape::Box,
            x: -18.0,
            z: -27.5,
            radius: 0.0,
            half_w: 0.95,
            half_d: 3.2,
            rot_y: 0.0,
            y_min: sly - 1.0,
            y_max: sly + 2.2,
        });

        // 8. Agility Obstacle Course (22, -50)
        let ocy = Self::get_terrain_height_only(22.0, -50.0);
        self.tunnel_start = Vec3::new(22.0, ocy, -53.2);
        for &wx in &[-1.1f32, 1.1] {
            self.register_obstacle(Obstacle {
                tag: "agility_tunnel_side",
                shape: ObstacleShape::Box,
                x: 22.0 + wx,
                z: -50.0,
                radius: 0.0,
                half_w: 0.18,
                half_d: 3.1,
                rot_y: 0.0,
                y_min: ocy - 1.0,
                y_max: ocy + 2.1,
            });
        }
        for &hz in &[6.0f32, 10.0, 14.0] {
            for &hx in &[-1.3f32, 1.3] {
                self.register_obstacle(Obstacle {
                    tag: "hurdle_post",
                    shape: ObstacleShape::Cylinder,
                    x: 22.0 + hx,
                    z: -50.0 + hz,
                    radius: 0.18,
                    half_w: 0.0,
                    half_d: 0.0,
                    rot_y: 0.0,
                    y_min: ocy - 1.0,
                    y_max: ocy + 1.1,
                });
            }
        }

        // 9. Target Toss (76, 18)
        let ty = Self::get_terrain_height_only(76.0, 18.0);
        self.target_pos = Vec3::new(76.0, ty + 3.2, 18.0);
        for &sx in &[-2.2f32, 2.2] {
            self.register_obstacle(Obstacle {
                tag: "target_post",
                shape: ObstacleShape::Cylinder,
                x: 76.0 + sx,
                z: 18.0,
                radius: 0.28,
                half_w: 0.0,
                half_d: 0.0,
                rot_y: 0.0,
                y_min: ty - 1.0,
                y_max: ty + 5.9,
            });
        }

        // 10. Cyber Piñata (-42, 14)
        let py = Self::get_terrain_height_only(-42.0, 14.0);
        self.pinata_pos = Vec3::new(-42.0, py + 2.4, 14.0);
        for &ax in &[-1.7f32, 1.7] {
            self.register_obstacle(Obstacle {
                tag: "pinata_post",
                shape: ObstacleShape::Cylinder,
                x: -42.0 + ax,
                z: 14.0,
                radius: 0.25,
                half_w: 0.0,
                half_d: 0.0,
                rot_y: 0.0,
                y_min: py - 1.0,
                y_max: py + 4.2,
            });
        }

        // 11. Slalom Rings (-6, -18)
        let ring_cfgs = [
            (-8.0f32, -10.0f32, 0x00e5ff, 0.2f32),
            (-3.0, -4.0, 0xffea00, -0.15),
            (3.0, 3.0, 0xff007f, 0.3),
            (-2.0, 10.0, 0x22ff88, -0.2),
            (6.0, 16.0, 0xff9100, 0.25),
        ];
        for (idx, (ox, oz, col, rot_y)) in ring_cfgs.into_iter().enumerate() {
            let wx = -6.0 + ox;
            let wz = -18.0 + oz;
            let gy_r = Self::get_terrain_height_only(wx, wz);
            for &px in &[-1.3f32, 1.3] {
                let wp = Vec3::new(px, 0.0, 0.0).rotate_y(rot_y) + Vec3::new(wx, gy_r, wz);
                self.register_obstacle(Obstacle {
                    tag: "slalom_post",
                    shape: ObstacleShape::Cylinder,
                    x: wp.x,
                    z: wp.z,
                    radius: 0.2,
                    half_w: 0.0,
                    half_d: 0.0,
                    rot_y: 0.0,
                    y_min: gy_r - 1.0,
                    y_max: gy_r + 1.8,
                });
            }
            self.slalom_rings.push(SlalomRing {
                index: idx,
                position: Vec3::new(wx, gy_r + 1.6, wz),
                entry_pos: Vec3::new(wx - rot_y.sin() * 2.5, gy_r, wz - rot_y.cos() * 2.5),
                exit_pos: Vec3::new(wx + rot_y.sin() * 2.5, gy_r, wz + rot_y.cos() * 2.5),
                radius: 1.3,
                color_hex: col,
                cooldown: 0.0,
            });
        }

        // 12. Treasure Spots
        for (x, z, kind, name) in [
            (-28.0, 12.0, TreasureKind::Bone, "Hueso Dorado Ancestral"),
            (18.0, -24.0, TreasureKind::Gear, "Micro-Engranaje de Titanio"),
            (68.0, 28.0, TreasureKind::Gem, "Cristal Cuántico Resplandeciente"),
            (-16.0, -46.0, TreasureKind::Ball, "Mini-Pelota Neón Secreta"),
        ] {
            self.treasure_spots.push(TreasureSpot {
                x,
                z,
                y: Self::get_terrain_height_only(x, z),
                dug: false,
                kind,
                name,
            });
        }

        // 13. Balls & Bone Toys
        self.balls.push(BallState {
            pos: Vec3::new(42.0, 1.2, 38.0),
            rot: Vec3::ZERO,
            velocity: Vec3::ZERO,
            radius: 1.2,
            mass: 1.2 * 1.8,
            bounciness: 0.8,
            friction: 0.975,
            is_soccer: true,
            is_neon: false,
            color_hex: 0xffffff,
            name: "Pelota de Fútbol",
            carried_by: None,
            target_hit_cooldown: 0.0,
        });
        for (pos, rad, col, is_neon, name) in [
            (Vec3::new(52.0, 1.0, 42.0), 0.95, 0xffeb3b, true, "Pelota Neón"),
            (Vec3::new(58.0, 0.8, 38.0), 0.75, 0xff4081, false, "Pelota Saltarina"),
            (Vec3::new(40.0, 0.8, 48.0), 0.75, 0x00e5ff, false, "Pelota Saltarina"),
        ] {
            self.balls.push(BallState {
                pos,
                rot: Vec3::ZERO,
                velocity: Vec3::ZERO,
                radius: rad,
                mass: rad * 1.4,
                bounciness: 0.82,
                friction: 0.97,
                is_soccer: false,
                is_neon,
                color_hex: col,
                name,
                carried_by: None,
                target_hit_cooldown: 0.0,
            });
        }

        for pos in [
            Vec3::new(48.0, 0.45, 46.0),
            Vec3::new(63.0, 0.45, 34.0),
            Vec3::new(34.0, 0.45, 38.0),
        ] {
            self.bone_toys.push(BoneToyState {
                pos,
                rot_y: 0.0,
                carried_by: None,
            });
        }

        // 14. Inner & Outer Trees (FIXED: outer forest NEVER spawns inside Lake of Crystal!)
        for _ in 0..95 {
            let angle = self.rand_f32() * std::f32::consts::TAU;
            let dist = 32.0 + self.rand_f32() * 210.0;
            let x = angle.cos() * dist;
            let z = angle.sin() * dist;
            if (x - LAKE_CENTER_X).hypot(z - LAKE_CENTER_Z) < 70.0 {
                continue;
            }
            if (x - 50.0).hypot(z - 40.0) < 46.0 {
                continue;
            }
            if (x + 46.0).hypot(z + 48.0) < 14.0 {
                continue;
            }
            if (x + 32.0).hypot(z - 48.0) < 10.0 {
                continue;
            }
            if (x + 18.0).hypot(z + 32.0) < 12.0 {
                continue;
            }
            if (x - 22.0).hypot(z + 50.0) < 16.0 {
                continue;
            }
            let ty_t = Self::get_terrain_height_only(x, z);
            let sc = 0.85 + self.rand_f32() * 0.55;
            let cidx = (self.rand_f32() * 3.0) as usize % 3;
            self.trees.push(TreeInstance {
                pos: Vec3::new(x, ty_t, z),
                scale: sc,
                color_idx: cidx,
                has_cyber_ring: false,
            });
            self.register_obstacle(Obstacle {
                tag: "tree",
                shape: ObstacleShape::Cylinder,
                x,
                z,
                radius: 0.85,
                half_w: 0.0,
                half_d: 0.0,
                rot_y: 0.0,
                y_min: ty_t - 1.0,
                y_max: ty_t + 7.0,
            });
        }

        for i in 0..185 {
            let angle = (i as f32 / 185.0) * std::f32::consts::TAU + (self.rand_f32() - 0.5) * 0.12;
            let dist = 148.0 + self.rand_f32() * 115.0;
            let x = angle.cos() * dist;
            let z = angle.sin() * dist;
            // Crucial fix: never place outer trees inside the Lake of Crystal!
            if (x - LAKE_CENTER_X).hypot(z - LAKE_CENTER_Z) < 72.0 {
                continue;
            }
            let ty_t = Self::get_terrain_height_only(x, z);
            let sc = 1.15 + self.rand_f32() * 0.85;
            self.trees.push(TreeInstance {
                pos: Vec3::new(x, ty_t, z),
                scale: sc,
                color_idx: i % 4,
                has_cyber_ring: i % 5 == 0,
            });
        }

        // 15. Wildflowers (240)
        let flw_cols = [0xffeb3b, 0xff4081, 0x00e5ff, 0xab47bc, 0xff7043, 0x76ff03];
        for i in 0..240 {
            let x = (self.rand_f32() - 0.5) * 340.0;
            let z = (self.rand_f32() - 0.5) * 340.0;
            if (x - LAKE_CENTER_X).hypot(z - LAKE_CENTER_Z) < 66.0 {
                continue;
            }
            let y = Self::get_terrain_height_only(x, z) + 0.16;
            let f_scale = 0.7 + self.rand_f32() * 0.6;
            self.flowers.push(FlowerInstance {
                pos: Vec3::new(x, y, z),
                scale: f_scale,
                color: hex_to_rgba(flw_cols[i % flw_cols.len()], 1.0),
            });
        }

        // 16. Cyber Butterflies (24)
        for _ in 0..24 {
            let bx = (self.rand_f32() - 0.5) * 220.0;
            let bz = (self.rand_f32() - 0.5) * 220.0;
            let by = Self::get_terrain_height_only(bx, bz) + 1.5 + self.rand_f32() * 2.5;
            let base = Vec3::new(bx, by, bz);
            let b_phase = self.rand_f32() * std::f32::consts::TAU;
            let b_speed = 1.6 + self.rand_f32();
            self.butterflies.push(ButterflyState {
                base_pos: base,
                pos: base,
                phase: b_phase,
                speed: b_speed,
                rot_y: 0.0,
            });
        }

        // 17. Low-Poly Clouds (12)
        for c in 0..12 {
            let angle = (c as f32 / 12.0) * std::f32::consts::TAU;
            let dist = 60.0 + self.rand_f32() * 120.0;
            let s = 0.8 + self.rand_f32() * 0.6;
            let cy = 52.0 + self.rand_f32() * 18.0;
            let c_speed = 0.35 + self.rand_f32() * 0.45;
            let c_rot = self.rand_f32() * std::f32::consts::TAU;
            self.clouds.push(CloudState {
                pos: Vec3::new(angle.cos() * dist, cy, angle.sin() * dist),
                speed: c_speed,
                rot_y: c_rot,
                scale: Vec3::new(s, s * 0.75, s),
            });
        }

        // 18. Ambient Fireflies/Sparkles (120)
        for _ in 0..120 {
            let x = (self.rand_f32() - 0.5) * 240.0;
            let y = 1.0 + self.rand_f32() * 12.0;
            let z = (self.rand_f32() - 0.5) * 240.0;
            self.ambient_particles.push(Vec3::new(x, y, z));
        }

        // 19. Points of Interest (exact names + radii so smallest-radius wins)
        self.points_of_interest = vec![
            PointOfInterest { name: "Lago de Cristal", position: Vec3::new(-80.0, 0.0, -80.0), radius: 65.0, kind: "lake" },
            PointOfInterest { name: "Parque de Juegos", position: Vec3::new(50.0, 0.0, 40.0), radius: 36.0, kind: "playground" },
            PointOfInterest { name: "Trampolín de Salto", position: Vec3::new(38.0, 0.0, 22.0), radius: 5.0, kind: "trampoline" },
            PointOfInterest { name: "Carrusel Giratorio", position: Vec3::new(62.0, 0.0, 26.0), radius: 6.0, kind: "carousel" },
            PointOfInterest { name: "Pista de Baile Disco", position: Vec3::new(52.0, 0.0, 56.0), radius: 5.0, kind: "disco" },
            PointOfInterest { name: "Estación de Recarga", position: Vec3::new(72.0, 0.0, 52.0), radius: 9.0, kind: "recharge" },
            PointOfInterest { name: "Muelle de Madera", position: Vec3::new(-44.0, 0.0, -80.0), radius: 14.0, kind: "pier" },
            PointOfInterest { name: "Prado Esmeralda", position: Vec3::new(0.0, 0.0, 0.0), radius: 28.0, kind: "meadow" },
            PointOfInterest { name: "Fuente de Agua Canina", position: Vec3::new(12.0, 0.0, 10.0), radius: 6.0, kind: "fountain" },
            PointOfInterest { name: "Puente de Madera", position: Vec3::new(-46.0, 0.0, -48.0), radius: 8.0, kind: "bridge" },
            PointOfInterest { name: "Balancín Cibernético", position: Vec3::new(48.0, 0.0, 32.0), radius: 6.0, kind: "seesaw" },
            PointOfInterest { name: "Piscina de Pelotas", position: Vec3::new(-32.0, 0.0, 48.0), radius: 6.0, kind: "ballpit" },
            PointOfInterest { name: "Tobogán de Agilidad", position: Vec3::new(-18.0, 0.0, -32.0), radius: 8.0, kind: "slide" },
            PointOfInterest { name: "Túnel de Agilidad", position: Vec3::new(22.0, 0.0, -50.0), radius: 7.0, kind: "tunnel" },
            PointOfInterest { name: "Diana de Tiro", position: Vec3::new(76.0, 0.0, 18.0), radius: 6.0, kind: "target" },
            PointOfInterest { name: "Piñata Canina", position: Vec3::new(-42.0, 0.0, 14.0), radius: 6.0, kind: "pinata" },
        ];
    }

    pub fn spawn_cyber_snack(&mut self, pos: Vec3, audio_out: &mut Vec<AudioEvent>) {
        let id = self.next_snack_id;
        self.next_snack_id += 1;
        let y = self.get_height_at(pos.x, pos.z) + 0.4;
        self.snacks.push(SnackState {
            id,
            pos: Vec3::new(pos.x, y, pos.z),
            age: 0.0,
        });
        self.log_activity("🍪 ¡Apareció una galleta energética en el parque!");
        audio_out.push(AudioEvent {
            kind: AudioKind::Boop,
            world_pos: pos,
            pitch: 1.4,
        });
    }

    pub fn trigger_disco_party(&mut self, audio_out: &mut Vec<AudioEvent>) {
        self.disco_party_active = true;
        self.disco_timer = 12.0;
        self.disco_beat_acc = 0.46875; // trigger first beat right away
        self.disco_beat_step = 0;
        self.log_activity("🪩 ¡FIESTA DISCO ACTIVADA! ¡A bailar todos!");
        audio_out.push(AudioEvent {
            kind: AudioKind::TrickSuccess,
            world_pos: self.disco_pad_pos,
            pitch: 1.0,
        });
    }

    pub fn throw_ball(&mut self, origin: Vec3, direction: Vec3, force: f32, audio_out: &mut Vec<AudioEvent>) -> bool {
        if self.balls.is_empty() {
            return false;
        }
        let mut dir = Vec3::new(direction.x, 0.0, direction.z);
        if dir.length_squared() < 1e-4 {
            dir = Vec3::Z;
        }
        dir = dir.normalize();

        let b = &mut self.balls[0];
        b.carried_by = None;
        b.pos = Vec3::new(
            origin.x + dir.x * 2.2,
            origin.y + 1.2,
            origin.z + dir.z * 2.2,
        );
        b.velocity = Vec3::new(dir.x * force, 8.5, dir.z * force);
        audio_out.push(AudioEvent {
            kind: AudioKind::Whine,
            world_pos: origin,
            pitch: 1.2,
        });
        self.log_activity("🎾 ¡Lanzaste la pelota de fútbol! ¡A buscarla!");
        true
    }

    pub fn reveal_dug_treasure(
        &mut self,
        dog_name: &str,
        spot_idx: usize,
        audio_out: &mut Vec<AudioEvent>,
    ) -> Option<&'static str> {
        let spot = self.treasure_spots.get_mut(spot_idx)?;
        if spot.dug {
            return None;
        }
        spot.dug = true;
        let name = spot.name;
        let pos = Vec3::new(spot.x, spot.y + 0.6, spot.z);
        audio_out.push(AudioEvent {
            kind: AudioKind::TrickSuccess,
            world_pos: pos,
            pitch: 1.0,
        });
        self.log_activity(format!("💎 ¡{} desenterró un tesoro oculto: {}!", dog_name, name));
        Some(name)
    }

    pub fn update(&mut self, dt: f32, audio_out: &mut Vec<AudioEvent>) {
        self.water_time += dt;
        if self.goal_flash_timer > 0.0 {
            self.goal_flash_timer = (self.goal_flash_timer - dt).max(0.0);
        }
        if self.pinata_hit_cooldown > 0.0 {
            self.pinata_hit_cooldown = (self.pinata_hit_cooldown - dt).max(0.0);
        }
        for r in &mut self.slalom_rings {
            if r.cooldown > 0.0 {
                r.cooldown = (r.cooldown - dt).max(0.0);
            }
        }

        // Trampoline spring recovery
        self.trampoline_vel += (-self.trampoline_depress * 68.0) * dt;
        self.trampoline_vel *= (-8.5 * dt).exp();
        self.trampoline_depress += self.trampoline_vel * dt;

        // Clouds
        for c in &mut self.clouds {
            c.rot_y += dt * 0.012 * c.speed;
        }

        // Target rotor
        self.target_rot_z += dt * 0.85;

        // Piñata pendulum
        self.pinata_swing_vel += (-self.pinata_swing_angle * 14.0) * dt;
        self.pinata_swing_vel *= (-2.2 * dt).exp();
        self.pinata_swing_angle += self.pinata_swing_vel * dt;

        // Ball pit gentle wave + settle back to origin
        let wt = self.water_time;
        for b in &mut self.ballpit_balls {
            let target_y = b.origin.y + (wt * 3.0 + b.origin.x).sin() * 0.035;
            b.pos.y = target_y;
            let k = (dt * 1.5).min(1.0);
            b.pos.x += (b.origin.x - b.pos.x) * k;
            b.pos.z += (b.origin.z - b.pos.z) * k;
        }

        // Speedboat bobbing + wake
        self.boat_pos.y = (wt * 1.8).sin() * 0.12;
        self.boat_rot.z = (wt * 1.4).sin() * 0.06;
        self.boat_rot.y += dt * 0.15;
        self.boat_prop_rot += dt * 11.0;

        // Carousel
        self.carousel_angle += dt * 1.2;

        // Disco party beat-clock sequencer (128 BPM -> 0.46875s per beat; 16-step subdivision every 0.234s)
        if self.disco_party_active {
            self.disco_timer -= dt;
            self.disco_ball_rot_y += dt * 4.0;
            self.disco_beat_acc += dt;
            if self.disco_beat_acc >= 0.234375 {
                self.disco_beat_acc -= 0.234375;
                audio_out.push(AudioEvent {
                    kind: AudioKind::DiscoBeat(self.disco_beat_step),
                    world_pos: self.disco_pad_pos,
                    pitch: 1.0,
                });
                self.disco_beat_step = (self.disco_beat_step + 1) % 16;
            }
            for (idx, tile) in self.disco_tiles.iter_mut().enumerate() {
                tile.emissive = 0.4 + (wt * 10.0 + idx as f32).sin() * 0.6;
            }
            if self.disco_timer <= 0.0 {
                self.disco_party_active = false;
                for tile in &mut self.disco_tiles {
                    tile.emissive = 0.25;
                }
            }
        }

        // Bone toys spin
        for bone in &mut self.bone_toys {
            if bone.carried_by.is_none() {
                bone.rot_y += dt * 1.2;
            }
        }

        // Butterflies
        for b in &mut self.butterflies {
            b.phase += dt * b.speed;
            let new_x = b.base_pos.x + b.phase.sin() * 3.0;
            let new_z = b.base_pos.z + (b.phase * 0.7).cos() * 3.0;
            b.rot_y = (new_x - b.pos.x).atan2(new_z - b.pos.z);
            b.pos.x = new_x;
            b.pos.z = new_z;
            b.pos.y = b.base_pos.y + (b.phase * 2.5).sin() * 0.6;
        }

        // Fountain
        self.fountain_rot_z += dt * 0.75;
        self.fountain_jet_scale_y = 1.0 + (wt * 6.0).sin() * 0.22;

        // Seesaw smooth tilt (computed once per frame, then decayed if untouched!)
        let k_see = (dt * 3.5).min(1.0);
        self.seesaw_tilt += (self.seesaw_target_tilt - self.seesaw_tilt) * k_see;
        self.seesaw_target_tilt *= (-1.8 * dt).exp();

        // Balls physics (2 substeps + water buoyancy + obstacles + goal + target + ball-to-ball!)
        let mut scratch = Vec::with_capacity(32);
        let mut goal_scored_idx: Option<usize> = None;
        let mut target_hit: Option<(usize, u32)> = None;

        for bi in 0..self.balls.len() {
            if self.balls[bi].target_hit_cooldown > 0.0 {
                self.balls[bi].target_hit_cooldown = (self.balls[bi].target_hit_cooldown - dt).max(0.0);
            }
            if self.balls[bi].carried_by.is_some() {
                continue;
            }
            let sub_steps = 2;
            let sub_dt = dt / sub_steps as f32;
            for _ in 0..sub_steps {
                let mut pos = self.balls[bi].pos;
                let mut vel = self.balls[bi].velocity;
                let rad = self.balls[bi].radius;
                let bounciness = self.balls[bi].bounciness;

                vel.y -= 9.8 * sub_dt;
                pos += vel * sub_dt;

                if let Some(hit_n) = self.resolve_obstacle_collisions(&mut pos, rad, rad * 2.0, &mut scratch) {
                    let vel_dot = vel.x * hit_n.x + vel.z * hit_n.z;
                    if vel_dot < 0.0 {
                        vel.x -= (1.0 + bounciness) * vel_dot * hit_n.x;
                        vel.z -= (1.0 + bounciness) * vel_dot * hit_n.z;
                    } else {
                        vel.x *= -0.75;
                        vel.z *= -0.75;
                    }
                }

                // Water buoyancy if ball lands in Lake of Crystal
                let dist_lake = (pos.x - LAKE_CENTER_X).hypot(pos.z - LAKE_CENTER_Z);
                let ground_h = self.get_height_at(pos.x, pos.z);
                if dist_lake < 58.0 && ground_h < -0.15 {
                    let water_surface_y = -0.15 + rad * 0.35;
                    if pos.y < water_surface_y {
                        let submerge = (water_surface_y - pos.y).min(rad * 2.0);
                        vel.y += submerge * 28.0 * sub_dt;
                        vel *= (-2.6 * sub_dt).exp();
                    }
                } else {
                    let ground_y = ground_h + rad;
                    if pos.y <= ground_y {
                        pos.y = ground_y;
                        if vel.y < -2.0 {
                            audio_out.push(AudioEvent {
                                kind: AudioKind::Bounce((-vel.y / 14.0).clamp(0.15, 1.0)),
                                world_pos: pos,
                                pitch: 1.0 / rad.max(0.5),
                            });
                        }
                        if vel.y.abs() > 0.5 {
                            vel.y = -vel.y * bounciness;
                        } else {
                            vel.y = 0.0;
                        }
                    }
                }
                self.balls[bi].pos = pos;
                self.balls[bi].velocity = vel;
            }

            let fric = self.balls[bi].friction.powf(dt * 60.0);
            self.balls[bi].velocity.x *= fric;
            self.balls[bi].velocity.z *= fric;

            let speed_xz = self.balls[bi].velocity.x.hypot(self.balls[bi].velocity.z);
            if speed_xz > 0.05 {
                let r = self.balls[bi].radius;
                self.balls[bi].rot.x += self.balls[bi].velocity.z * dt / r;
                self.balls[bi].rot.z -= self.balls[bi].velocity.x * dt / r;
            }

            // Soccer goal check
            if self.balls[bi].is_soccer {
                let p = self.balls[bi].pos;
                if p.x < self.goal_pos.x + 0.3
                    && p.x > self.goal_pos.x - self.goal_depth
                    && (p.z - self.goal_pos.z).abs() < self.goal_width * 0.46
                    && p.y < self.goal_pos.y + self.goal_height
                {
                    goal_scored_idx = Some(bi);
                }
            }

            // Target board check
            if self.balls[bi].target_hit_cooldown <= 0.0 {
                let p = self.balls[bi].pos;
                let dist_xz = (p.x - self.target_pos.x).hypot(p.z - self.target_pos.z);
                let dist_y = (p.y - self.target_pos.y).abs();
                if dist_xz < self.target_radius && dist_y < 2.2 {
                    let hit_r = (p.x - self.target_pos.x).hypot(p.y - self.target_pos.y);
                    let pts = if hit_r < 0.65 {
                        50
                    } else if hit_r < 1.35 {
                        25
                    } else {
                        10
                    };
                    target_hit = Some((bi, pts));
                }
            }
        }

        if let Some(bi) = goal_scored_idx {
            self.goal_score += 1;
            self.goal_flash_timer = 3.0;
            let score = self.goal_score;
            self.log_activity(format!("⚽ ¡¡¡GOOOOOOLAZO!!! Marcador: {}", score));
            audio_out.push(AudioEvent {
                kind: AudioKind::GoalFanfare,
                world_pos: self.goal_pos,
                pitch: 1.0,
            });
            self.balls[bi].pos = Vec3::new(45.0, Self::get_terrain_height_only(45.0, 40.0) + 1.5, 40.0);
            self.balls[bi].velocity = Vec3::new(0.0, 2.0, 0.0);
        }

        if let Some((bi, pts)) = target_hit {
            self.balls[bi].target_hit_cooldown = 0.8;
            self.balls[bi].velocity.x *= -1.1;
            self.balls[bi].velocity.z *= -1.1;
            self.balls[bi].velocity.y = 4.5;
            self.target_score += pts;
            let ts = self.target_score;
            self.log_activity(format!("🎯 ¡DIANA ACERTADA! +{} PUNTOS | Total: {}", pts, ts));
            audio_out.push(AudioEvent {
                kind: AudioKind::TargetHit,
                world_pos: self.target_pos,
                pitch: 1.0 + pts as f32 * 0.01,
            });
        }

        // Ball-to-Ball Elastic Collisions
        for i in 0..self.balls.len() {
            for j in (i + 1)..self.balls.len() {
                if self.balls[i].carried_by.is_some() || self.balls[j].carried_by.is_some() {
                    continue;
                }
                let diff = self.balls[j].pos - self.balls[i].pos;
                let dist = diff.length();
                let min_dist = self.balls[i].radius + self.balls[j].radius;
                if dist < min_dist && dist > 1e-3 {
                    let normal = diff / dist;
                    let overlap = min_dist - dist;
                    self.balls[i].pos -= normal * (overlap * 0.5);
                    self.balls[j].pos += normal * (overlap * 0.5);
                    let rel_vel = self.balls[j].velocity - self.balls[i].velocity;
                    let sep_vel = rel_vel.dot(normal);
                    if sep_vel < 0.0 {
                        let m1 = self.balls[i].mass;
                        let m2 = self.balls[j].mass;
                        let impulse = -(1.0 + 0.8) * sep_vel / (1.0 / m1 + 1.0 / m2);
                        self.balls[i].velocity -= normal * (impulse / m1);
                        self.balls[j].velocity += normal * (impulse / m2);
                    }
                }
            }
        }

        // Snacks bobbing
        for idx in 0..self.snacks.len() {
            let (sx, sz) = (self.snacks[idx].pos.x, self.snacks[idx].pos.z);
            let ground_y = self.get_height_at(sx, sz);
            let s = &mut self.snacks[idx];
            s.age += dt;
            s.pos.y = ground_y + 0.35 + (s.age * 3.0).sin() * 0.1;
        }
    }

    pub fn apply_seesaw_from_dogs(&mut self, dogs: &[ChibiRobotDog]) {
        let mut total_torque = 0.0f32;
        let mut any_near = false;
        for dog in dogs {
            let dist = (dog.position.x - self.seesaw_pos.x).hypot(dog.position.z - self.seesaw_pos.z);
            if dist < 5.4 {
                any_near = true;
                total_torque += -(dog.position.x - self.seesaw_pos.x) * 0.055;
            }
        }
        if any_near {
            self.seesaw_target_tilt = total_torque.clamp(-0.26, 0.26);
        }
    }

    pub fn handle_robot_interactions(
        &mut self,
        dog: &mut ChibiRobotDog,
        anim_ctrl: &mut crate::animations::AnimationController,
        dt: f32,
        audio_out: &mut Vec<AudioEvent>,
    ) {
        let mut scratch = Vec::with_capacity(24);
        self.resolve_obstacle_collisions(&mut dog.position, 0.75, 1.2, &mut scratch);

        // 1. Lake Swimming & Drying Shake-off (respects Bridge & Pier!)
        let dist_lake = (dog.position.x - LAKE_CENTER_X).hypot(dog.position.z - LAKE_CENTER_Z);
        let surface_y = self.get_height_at(dog.position.x, dog.position.z);
        if dist_lake < 58.0 && surface_y < -0.1 {
            dog.is_in_water = true;
            dog.position.y = -0.52;
            if !dog.was_in_water {
                dog.was_in_water = true;
                audio_out.push(AudioEvent {
                    kind: AudioKind::Splash,
                    world_pos: dog.position,
                    pitch: 1.0,
                });
                self.log_activity(format!("🏊 ¡{} se zambulló en el Lago de Cristal y está nadando!", dog.id.name()));
                if anim_ctrl.current_anim != AnimId::Swimming {
                    anim_ctrl.play(AnimId::Swimming, 0.0, dog);
                }
            }
        } else if dog.was_in_water {
            dog.was_in_water = false;
            dog.is_in_water = false;
            audio_out.push(AudioEvent {
                kind: AudioKind::Splash,
                world_pos: dog.position,
                pitch: 1.15,
            });
            self.log_activity(format!("🐕 ¡{} salió del lago a tierra firme y se sacude para secarse!", dog.id.name()));
            anim_ctrl.play(AnimId::ShakeOff, 2.0, dog);
        }

        // 2. Slalom Rings
        let mut passed_ring: Option<usize> = None;
        for r in &mut self.slalom_rings {
            let d = dog.position.distance(r.position);
            if d < r.radius + 0.4 && r.cooldown <= 0.0 {
                r.cooldown = 3.0;
                audio_out.push(AudioEvent {
                    kind: AudioKind::Boop,
                    world_pos: dog.position,
                    pitch: 1.4 + r.index as f32 * 0.12,
                });
                passed_ring = Some(r.index);
            }
        }
        if let Some(ring_idx) = passed_ring {
            self.log_activity(format!("⭕ ¡{} atravesó con precisión el aro #{}!", dog.id.name(), ring_idx + 1));
        }

        // 3. Water Fountain
        let f_dist = (dog.position.x - self.fountain_pos.x).hypot(dog.position.z - self.fountain_pos.z);
        if f_dist < 2.9 && dog.last_drink_cooldown <= 0.0 {
            dog.last_drink_cooldown = 7.0;
            dog.quench_thirst(audio_out);
            self.log_activity(format!("💧 ¡{} tomó agua fresca en la cibercuenca y calmó su sed!", dog.id.name()));
        }

        // 4. Trampoline Bounce
        let t_dist = (dog.position.x - self.trampoline_pos.x).hypot(dog.position.z - self.trampoline_pos.z);
        if t_dist < 2.8 && dog.last_tramp_cooldown <= 0.0 {
            dog.last_tramp_cooldown = 1.2;
            dog.tramp_consecutive_hits = (dog.tramp_consecutive_hits % 4) + 1;
            let boost = 7.5 + dog.tramp_consecutive_hits as f32 * 2.1;
            dog.velocity_y = boost;
            dog.position.y += 0.2;
            self.trampoline_depress = -0.32;
            audio_out.push(AudioEvent {
                kind: AudioKind::Trampoline,
                world_pos: self.trampoline_pos,
                pitch: 1.0 + dog.tramp_consecutive_hits as f32 * 0.06,
            });
            anim_ctrl.play(AnimId::Backflip, 1.8, dog);
            dog.energy = (dog.energy + 10.0).min(100.0);
            self.log_activity(format!(
                "🤸 ¡{} dio su rebote #{} en el trampolín (+{}% de impulso)!",
                dog.id.name(),
                dog.tramp_consecutive_hits,
                (boost * 10.0).round() as i32
            ));
        }

        // 5. Carousel Ride
        let c_dist = (dog.position.x - self.carousel_pos.x).hypot(dog.position.z - self.carousel_pos.z);
        if c_dist < 3.6 && c_dist > 0.6 {
            let a = (dog.position.z - self.carousel_pos.z).atan2(dog.position.x - self.carousel_pos.x);
            let new_a = a + dt * 1.2;
            dog.position.x = self.carousel_pos.x + new_a.cos() * c_dist;
            dog.position.z = self.carousel_pos.z + new_a.sin() * c_dist;
            dog.rotation_y += dt * 1.2;
        }

        // 6. Ball Pit Splash
        let bp_dist = (dog.position.x - self.ballpit_pos.x).hypot(dog.position.z - self.ballpit_pos.z);
        if bp_dist < 3.2 {
            for b in &mut self.ballpit_balls {
                let dx = b.pos.x - dog.position.x;
                let dz = b.pos.z - dog.position.z;
                let d = dx.hypot(dz);
                if d < 1.4 && d > 0.01 {
                    b.pos.x = (b.pos.x + (dx / d) * 0.18).clamp(self.ballpit_pos.x - 3.1, self.ballpit_pos.x + 3.1);
                    b.pos.z = (b.pos.z + (dz / d) * 0.18).clamp(self.ballpit_pos.z - 3.1, self.ballpit_pos.z + 3.1);
                }
            }
            if dog.last_ballpit_cooldown <= 0.0 {
                dog.last_ballpit_cooldown = 3.5;
                audio_out.push(AudioEvent {
                    kind: AudioKind::Boop,
                    world_pos: dog.position,
                    pitch: 1.4,
                });
                self.log_activity(format!("🏊 ¡{} se zambulló en la piscina de pelotas de colores!", dog.id.name()));
                dog.playfulness = 100.0;
                dog.energy = (dog.energy + 8.0).min(100.0);
            }
        }

        // 7. Agility Slide (FIXED: height-checked so walking past ground tower does NOT teleport!)
        if dog.is_sliding {
            dog.slide_progress += dt * 0.72;
            if dog.slide_progress >= 1.0 {
                dog.is_sliding = false;
                dog.slide_progress = 0.0;
                dog.position = self.slide_end_pos;
                anim_ctrl.play(AnimId::Backflip, 1.5, dog);
                audio_out.push(AudioEvent {
                    kind: AudioKind::Boop,
                    world_pos: dog.position,
                    pitch: 1.6,
                });
                self.log_activity(format!("🤸 ¡{} aterrizó en la colchoneta del tobogán con estilo!", dog.id.name()));
            } else {
                dog.position = self.slide_top_pos.lerp(self.slide_end_pos, dog.slide_progress);
            }
        } else {
            let d_slide_xz = (dog.position.x - self.slide_top_pos.x).hypot(dog.position.z - self.slide_top_pos.z);
            if d_slide_xz < 1.6 && dog.position.y >= self.slide_top_pos.y - 1.2 {
                dog.is_sliding = true;
                dog.slide_progress = 0.0;
                self.log_activity(format!("🎢 ¡{} se subió al tobogán y se desliza a toda velocidad!", dog.id.name()));
                audio_out.push(AudioEvent {
                    kind: AudioKind::Yip,
                    world_pos: dog.position,
                    pitch: 1.3,
                });
                anim_ctrl.play(AnimId::Roll, 1.4, dog);
            }
        }

        // 8. Agility Tunnel
        if dog.in_tunnel {
            dog.tunnel_timer -= dt;
            if dog.tunnel_timer <= 0.0 {
                dog.in_tunnel = false;
                anim_ctrl.play(AnimId::Howl, 1.5, dog);
            }
        } else {
            let t_dist = (dog.position.x - self.tunnel_start.x).hypot(dog.position.z - self.tunnel_start.z);
            if t_dist < 1.5 {
                dog.in_tunnel = true;
                dog.tunnel_timer = 1.6;
                self.log_activity(format!("🌀 ¡{} se agachó y pasó velozmente por el túnel de agilidad!", dog.id.name()));
                anim_ctrl.play(AnimId::Sneak, 2.0, dog);
                audio_out.push(AudioEvent {
                    kind: AudioKind::Boop,
                    world_pos: dog.position,
                    pitch: 1.2,
                });
            }
        }

        // 9. Cyber Piñata Strike
        let p_dist = (dog.position.x - self.pinata_pos.x).hypot(dog.position.z - self.pinata_pos.z);
        let gy_p = self.get_height_at(dog.position.x, dog.position.z);
        if p_dist < 2.0 && dog.position.y > gy_p + 0.3 && self.pinata_hit_cooldown <= 0.0 {
            self.pinata_hit_cooldown = 1.0;
            self.pinata_hits += 1;
            self.pinata_swing_vel = 4.2;
            audio_out.push(AudioEvent {
                kind: AudioKind::Boop,
                world_pos: self.pinata_pos,
                pitch: 1.4,
            });
            self.log_activity(format!(
                "🪅 ¡{} golpeó la piñata! (Golpe {}/{})",
                dog.id.name(),
                self.pinata_hits,
                self.pinata_max_hits
            ));
            if self.pinata_hits >= self.pinata_max_hits {
                self.pinata_hits = 0;
                self.log_activity("🎊 ¡¡¡LA PIÑATA EXPLOTÓ EN GALLETAS PARA TODA LA MANADA!!! 🍪");
                audio_out.push(AudioEvent {
                    kind: AudioKind::TrickSuccess,
                    world_pos: self.pinata_pos,
                    pitch: 1.0,
                });
                for k in 0..5 {
                    let a = (k as f32 / 5.0) * std::f32::consts::TAU;
                    let r = 2.0 + self.rand_f32() * 2.0;
                    let sp = Vec3::new(self.pinata_pos.x + a.cos() * r, 0.0, self.pinata_pos.z + a.sin() * r);
                    self.spawn_cyber_snack(sp, audio_out);
                }
            }
        }

        // 10. Disco Pad Trigger
        if !self.disco_party_active {
            let d_disco = (dog.position.x - self.disco_pad_pos.x).hypot(dog.position.z - self.disco_pad_pos.z);
            if d_disco < 2.8 {
                self.trigger_disco_party(audio_out);
            }
        }

        // 11. Eat Snacks
        let mut ate_any = false;
        let mut i = self.snacks.len();
        while i > 0 {
            i -= 1;
            let d = (dog.position.x - self.snacks[i].pos.x).hypot(dog.position.z - self.snacks[i].pos.z);
            if d < 1.4 {
                let spos = self.snacks[i].pos;
                self.snacks.swap_remove(i);
                dog.energy = 100.0;
                audio_out.push(AudioEvent {
                    kind: AudioKind::SnackMunch,
                    world_pos: spos,
                    pitch: 1.0,
                });
                ate_any = true;
            }
        }
        if ate_any {
            self.log_activity(format!("😋 ¡{} se comió una galleta y recuperó 100% de energía!", dog.id.name()));
        }

        // 12. Kick Balls
        for ball in &mut self.balls {
            if ball.carried_by.is_some() {
                continue;
            }
            let dx = ball.pos.x - dog.position.x;
            let dz = ball.pos.z - dog.position.z;
            let dist = dx.hypot(dz);
            let min_dist = 0.95 + ball.radius;
            if dist < min_dist && (dog.position.y - ball.pos.y).abs() < 2.2 {
                let dir = if dist > 1e-4 {
                    Vec3::new(dx / dist, 0.0, dz / dist)
                } else {
                    Vec3::new(dog.rotation_y.sin(), 0.0, dog.rotation_y.cos())
                };
                let overlap = min_dist - dist;
                ball.pos.x += dir.x * overlap;
                ball.pos.z += dir.z * overlap;
                ball.velocity.x += dir.x * 6.2;
                ball.velocity.z += dir.z * 6.2;
                ball.velocity.y += 2.2;
                audio_out.push(AudioEvent {
                    kind: AudioKind::Boop,
                    world_pos: ball.pos,
                    pitch: dog.profile().voice_pitch,
                });
            }
        }
    }

    /// Generates all static & reusable prototype meshes for the upgraded 3D world!
    pub fn build_static_meshes(&self) -> WorldStaticMeshes {
        // 1. Detailed Terrain (128x128 grid with biome vertex colors)
        let mut terrain = build_terrain_mesh();
        let mtn_mat = MatStyle::from_hex(0x1b5e20, 0.92, 0.02, 0.0, 0.0);
        let mut mtn = cylinder_mesh(340.0, 360.0, 48.0, 32, true, mtn_mat);
        mtn.translate(Vec3::new(0.0, 18.0, 0.0));
        // Flip inward normals for distant mountain ring
        for tri in mtn.indices.chunks_exact_mut(3) {
            tri.swap(1, 2);
        }
        for v in &mut mtn.vertices {
            v.normal = [-v.normal[0], -v.normal[1], -v.normal[2]];
        }
        terrain.merge(&mtn);

        // 2. Cobblestone Plaza & Path Ribbons
        let mut plaza_and_paths = MeshData::new();
        let base_h = Self::get_terrain_height_only(0.0, 0.0);
        let plaza_mat = MatStyle::from_hex(0xffffff, 0.72, 0.08, 0.0, 0.0);
        let mut plaza = cylinder_mesh(18.0, 18.2, 0.14, 32, false, plaza_mat);
        plaza.translate(Vec3::new(0.0, base_h + 0.07, 0.0));
        plaza_and_paths.merge(&plaza);

        for (sx, sz, ex, ez, w) in [
            (0.0f32, 0.0f32, 30.0f32, 26.0f32, 4.2f32),
            (0.0, 0.0, -36.0, -68.0, 4.0),
            (0.0, 0.0, 56.0, 44.0, 3.8),
            (0.0, 0.0, -44.0, -46.0, 3.6),
            (0.0, 0.0, 12.0, 10.0, 3.8),
        ] {
            plaza_and_paths.merge(&build_path_ribbon(
                Vec3::new(sx, 0.0, sz),
                Vec3::new(ex, 0.0, ez),
                w,
                28,
            ));
        }

        // 3. Wood structures (Bridge deck + Pier deck)
        let mut wood_structures = MeshData::new();
        let wood_mat = MatStyle::from_hex(0xffffff, 0.75, 0.02, 0.0, 0.0);
        let b_y = Self::get_terrain_height_only(-46.0, -48.0);
        let mut bridge_wood = MeshData::new();
        let arch_segs = 18;
        let span = 18.0f32;
        let width = 4.4f32;
        let arch_peak = 2.6f32;
        for i in 0..arch_segs {
            let t = i as f32 / (arch_segs - 1) as f32;
            let z = (t - 0.5) * span;
            let ah = (t * std::f32::consts::PI).sin() * arch_peak;
            let slope = -(t * std::f32::consts::PI).cos() * (arch_peak * std::f32::consts::PI / span);
            let mut plank = box_mesh(width, 0.22, (span / arch_segs as f32) * 1.05, wood_mat);
            plank.transform(Mat4::from_translation(Vec3::new(0.0, ah + 0.11, z)) * Mat4::from_rotation_x(slope));
            bridge_wood.merge(&plank);
        }
        bridge_wood.transform(Mat4::from_translation(Vec3::new(-46.0, b_y, -48.0)) * Mat4::from_rotation_y(0.65));
        wood_structures.merge(&bridge_wood);

        let mut pier_deck = box_mesh(6.0, 0.35, 24.0, wood_mat);
        pier_deck.transform(Mat4::from_translation(Vec3::new(-44.0, 0.35, -80.0)) * Mat4::from_rotation_y(0.28));
        wood_structures.merge(&pier_deck);

        // 4. Tartan Playground Floor (50, 40)
        let tartan_mat = MatStyle::from_hex(0xffffff, 0.78, 0.05, 0.0, 0.0);
        let mut tartan_floor = cylinder_mesh(42.0, 42.0, 0.12, 48, false, tartan_mat);
        tartan_floor.translate(Vec3::new(50.0, Self::get_terrain_height_only(50.0, 40.0) + 0.06, 40.0));

        // 5. Static Props (Plaza ring + star, Bridge rails/lanterns, Lake rim & rocks, Pier posts, Fountain base,
        // Seesaw stands, Ramp, Hoops, Crawl tunnel, Trampoline frame/legs, Carousel base, Goal frame, Disco truss,
        // Doghouse walls & roof, Ballpit frame, Slide tower/ladder/chute/cushion, Obstacle course, Target gantry,
        // Pinata gantry, Slalom arches)
        let mut static_props = MeshData::new();
        let mut wireframe_net = MeshData::new();
        self.populate_static_props(&mut static_props, &mut wireframe_net);

        // 6. Lake water disc & fountain water
        let water_mat = MatStyle::from_hex_alpha(0xffffff, 0.86, 0.08, 0.85, 0.12, 0.9);
        let mut water_disc = disc_mesh(LAKE_RADIUS, 64, water_mat);
        water_disc.transform(
            Mat4::from_translation(Vec3::new(LAKE_CENTER_X, -0.15, LAKE_CENTER_Z))
                * Mat4::from_rotation_x(-std::f32::consts::FRAC_PI_2),
        );

        let f_water_mat = MatStyle::from_hex_alpha(0x00b0ff, 0.88, 0.05, 0.9, 0.4, 0.9);
        let mut fountain_water = disc_mesh(1.5, 32, f_water_mat);
        fountain_water.transform(Mat4::from_rotation_x(-std::f32::consts::FRAC_PI_2));

        // 7. Dynamic Sub-Models (Upgraded 3D models!)
        let (toy_boat, boat_propeller) = build_upgraded_speedboat();
        let carousel_rotor = build_carousel_rotor();
        let seesaw_plank = build_seesaw_plank();
        let trampoline_mat = cylinder_mesh(
            3.4,
            3.4,
            0.12,
            32,
            false,
            MatStyle::from_hex(0x00e5ff, 0.35, 0.1, 0.55, 0.2),
        );
        let disco_ball = sphere_mesh(0.8, 22, 16, MatStyle::from_hex(0xffffff, 0.08, 0.96, 0.2, 1.0));
        let disco_tile = beveled_box(1.4, 0.14, 1.4, 0.03, 2, MatStyle::from_hex(0xffffff, 0.2, 0.1, 0.4, 0.5));
        let target_rotor = build_target_rotor();
        let pinata_body = build_pinata_body();
        let fountain_jet = cylinder_mesh(
            0.05,
            0.4,
            1.2,
            16,
            false,
            MatStyle::from_hex_alpha(0xe0f7fa, 0.75, 0.1, 0.0, 0.6, 0.4),
        );

        let soccer_ball = sphere_mesh(1.2, 28, 20, MatStyle::from_hex(0xffffff, 0.35, 0.1, 0.0, 0.4));
        let color_ball = sphere_mesh(1.0, 22, 16, MatStyle::from_hex(0xffffff, 0.3, 0.1, 0.25, 0.5));
        let bone_toy = build_bone_toy_mesh();
        let snack = build_snack_mesh();
        let treasure_mound = cylinder_mesh(
            1.2,
            1.4,
            0.12,
            16,
            false,
            MatStyle::from_hex(0x5d4037, 0.9, 0.0, 0.0, 0.0),
        );
        let treasure_sparkle = sphere_mesh(
            0.12,
            10,
            8,
            MatStyle::from_hex(0xffea00, 0.2, 0.0, 1.2, 0.0),
        );
        let mut treasure_bone = cylinder_mesh(
            0.08,
            0.08,
            0.9,
            12,
            false,
            MatStyle::from_hex(0xffd700, 0.2, 0.9, 0.5, 0.6),
        );
        treasure_bone.transform(Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
        let treasure_gear = torus_mesh(
            0.28,
            0.08,
            12,
            24,
            std::f32::consts::TAU,
            MatStyle::from_hex(0x00e5ff, 0.1, 0.95, 0.6, 0.8),
        );
        let treasure_gem = octahedron_mesh(0.32, MatStyle::from_hex(0xf43f5e, 0.1, 0.3, 0.9, 0.9));

        // Tree prototype parts (for GPU Instancing!)
        let mut tree_trunk = cylinder_mesh(0.38, 0.55, 5.0, 8, false, MatStyle::from_hex(0x6d4c41, 0.85, 0.0, 0.0, 0.0));
        tree_trunk.translate(Vec3::new(0.0, 2.5, 0.0));

        let leaf_mat = MatStyle::from_hex(0xffffff, 0.65, 0.02, 0.0, 0.0);
        let mut tree_foliage = MeshData::new();
        for l in 0..3 {
            let mut tier = cylinder_mesh(0.05, 3.4 - l as f32 * 0.8, 3.2, 8, false, leaf_mat);
            tier.translate(Vec3::new(0.0, 5.0 + l as f32 * 1.9, 0.0));
            tree_foliage.merge(&tier);
        }

        let mut tree_cyber_ring = torus_mesh(
            0.7,
            0.08,
            8,
            16,
            std::f32::consts::TAU,
            MatStyle::from_hex(0x00f2fe, 0.2, 0.1, 0.95, 0.3),
        );
        tree_cyber_ring.transform(
            Mat4::from_translation(Vec3::new(0.0, 2.2, 0.0))
                * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
        );

        let flower = sphere_mesh(0.2, 8, 6, MatStyle::from_hex(0xffffff, 0.4, 0.0, 0.25, 0.0));

        // Butterfly 2-wing V mesh
        let b_mat = MatStyle::from_hex(0x00e5ff, 0.2, 0.0, 0.95, 0.3);
        let mut butterfly = MeshData::new();
        let mut wl = plane_mesh(0.28, 0.22, 1, 1, b_mat);
        wl.transform(Mat4::from_translation(Vec3::new(-0.14, 0.0, 0.0)) * Mat4::from_rotation_y(0.35));
        let mut wr = plane_mesh(0.28, 0.22, 1, 1, b_mat);
        wr.transform(Mat4::from_translation(Vec3::new(0.14, 0.0, 0.0)) * Mat4::from_rotation_y(-0.35));
        butterfly.merge(&wl);
        butterfly.merge(&wr);

        let cloud_mat = MatStyle::from_hex_alpha(0xffffff, 0.9, 0.95, 0.02, 0.05, 0.0);
        let mut cloud = MeshData::new();
        for (px, py, pz, r) in [
            (-5.0, 0.0, 0.0, 4.0),
            (-1.5, 1.2, 0.5, 5.0),
            (2.5, 0.6, -0.8, 4.6),
            (5.8, -0.3, 0.6, 3.6),
        ] {
            let mut puff = sphere_mesh(r, 10, 7, cloud_mat);
            puff.translate(Vec3::new(px, py, pz));
            cloud.merge(&puff);
        }

        let sparkle_quad = sphere_mesh(0.22, 8, 6, MatStyle::from_hex(0xffffff, 0.1, 0.0, 1.4, 0.0));

        WorldStaticMeshes {
            terrain,
            grass_paths: MeshData::new(),
            plaza_and_paths,
            wood_structures,
            tartan_floor,
            static_props,
            wireframe_net,
            water_disc,
            fountain_water,
            toy_boat,
            boat_propeller,
            carousel_rotor,
            seesaw_plank,
            trampoline_mat,
            disco_ball,
            disco_tile,
            target_rotor,
            pinata_body,
            fountain_jet,
            soccer_ball,
            color_ball,
            bone_toy,
            snack,
            treasure_mound,
            treasure_sparkle,
            treasure_bone,
            treasure_gear,
            treasure_gem,
            tree_trunk,
            tree_foliage,
            tree_cyber_ring,
            flower,
            butterfly,
            cloud,
            sparkle_quad,
        }
    }

    fn populate_static_props(&self, props: &mut MeshData, net_out: &mut MeshData) {
        let base_h = Self::get_terrain_height_only(0.0, 0.0);
        let border_mat = MatStyle::from_hex(0x475569, 0.6, 0.2, 0.0, 0.0);
        let mut border = torus_mesh(18.2, 0.25, 10, 32, std::f32::consts::TAU, border_mat);
        border.transform(
            Mat4::from_translation(Vec3::new(0.0, base_h + 0.12, 0.0))
                * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
        );
        props.merge(&border);

        let cyan_glow = MatStyle::from_hex(0x00e5ff, 0.2, 0.1, 0.9, 0.3);
        let mut star = cylinder_mesh(2.4, 2.4, 0.18, 8, false, cyan_glow);
        star.translate(Vec3::new(0.0, base_h + 0.1, 0.0));
        props.merge(&star);

        // Wooden Bridge rails & lanterns
        let b_pos = Vec3::new(-46.0, Self::get_terrain_height_only(-46.0, -48.0), -48.0);
        let b_xf = Mat4::from_translation(b_pos) * Mat4::from_rotation_y(0.65);
        let rail_mat = MatStyle::from_hex(0x3e2723, 0.8, 0.0, 0.0, 0.0);
        let lantern_mat = MatStyle::from_hex(0xffea00, 0.2, 0.0, 1.2, 0.0);
        let span = 18.0f32;
        let width = 4.4f32;
        let arch_peak = 2.6f32;
        let arch_segs = 18;
        let mut post_heights = Vec::with_capacity(arch_segs);
        let mut bridge_props = MeshData::new();
        for i in 0..arch_segs {
            let t = i as f32 / (arch_segs - 1) as f32;
            let z = (t - 0.5) * span;
            let ah = (t * std::f32::consts::PI).sin() * arch_peak;
            post_heights.push((z, ah));
            if i % 2 == 0 || i == arch_segs - 1 {
                for &x in &[-width * 0.5 + 0.18, width * 0.5 - 0.18] {
                    let mut post = cylinder_mesh(0.11, 0.12, 1.35, 8, false, rail_mat);
                    post.translate(Vec3::new(x, ah + 0.75, z));
                    bridge_props.merge(&post);
                }
            }
        }
        for &x in &[-width * 0.5 + 0.18, width * 0.5 - 0.18] {
            for i in 0..(post_heights.len() - 1) {
                let (z1, h1) = post_heights[i];
                let (z2, h2) = post_heights[i + 1];
                let dz = z2 - z1;
                let dy = h2 - h1;
                let seg_len = dz.hypot(dy);
                let angle = -dy.atan2(dz);
                let mut top_rail = box_mesh(0.16, 0.14, seg_len + 0.08, rail_mat);
                top_rail.transform(
                    Mat4::from_translation(Vec3::new(x, (h1 + h2) * 0.5 + 1.38, (z1 + z2) * 0.5))
                        * Mat4::from_rotation_x(angle),
                );
                bridge_props.merge(&top_rail);
                let mut mid_rail = box_mesh(0.12, 0.10, seg_len + 0.05, rail_mat);
                mid_rail.transform(
                    Mat4::from_translation(Vec3::new(x, (h1 + h2) * 0.5 + 0.75, (z1 + z2) * 0.5))
                        * Mat4::from_rotation_x(angle),
                );
                bridge_props.merge(&mid_rail);
            }
            for &z in &[-span * 0.48, span * 0.48] {
                let mut lantern = box_mesh(0.34, 0.44, 0.34, lantern_mat);
                lantern.translate(Vec3::new(x, 1.65, z));
                bridge_props.merge(&lantern);
            }
        }
        bridge_props.transform(b_xf);
        props.merge(&bridge_props);

        // Lake Sandy Rim & Rocks
        let rim_mat = MatStyle::from_hex(0xd7ccc8, 0.85, 0.0, 0.0, 0.0);
        let mut rim = ring_mesh(LAKE_RADIUS - 1.5, LAKE_RADIUS + 7.0, 64, rim_mat);
        rim.transform(
            Mat4::from_translation(Vec3::new(LAKE_CENTER_X, 0.06, LAKE_CENTER_Z))
                * Mat4::from_rotation_x(-std::f32::consts::FRAC_PI_2),
        );
        props.merge(&rim);

        let rock_mat = MatStyle::from_hex(0x64748b, 0.75, 0.05, 0.0, 0.0);
        for obs in &self.obstacles {
            if obs.tag == "rock" {
                let ry = Self::get_terrain_height_only(obs.x, obs.z);
                let mut rock = sphere_mesh(1.05, 8, 6, rock_mat);
                rock.transform(
                    Mat4::from_translation(Vec3::new(obs.x, ry + 0.3, obs.z))
                        * Mat4::from_scale(Vec3::new(1.2, 0.8, 1.1)),
                );
                props.merge(&rock);
            }
        }

        // Pier Posts & Lanterns
        let pier_xf = Mat4::from_translation(Vec3::new(-44.0, 0.35, -80.0)) * Mat4::from_rotation_y(0.28);
        let post_mat = MatStyle::from_hex(0x4e342e, 0.8, 0.0, 0.0, 0.0);
        for &x in &[-2.8f32, 2.8] {
            for &z in &[-10.0f32, -3.3, 3.3, 10.0] {
                let mut post = cylinder_mesh(0.18, 0.18, 4.2, 8, false, post_mat);
                post.transform(pier_xf * Mat4::from_translation(Vec3::new(x, -0.3, z)));
                props.merge(&post);
                let mut lant = box_mesh(0.3, 0.35, 0.3, lantern_mat);
                lant.transform(pier_xf * Mat4::from_translation(Vec3::new(x, 1.95, z)));
                props.merge(&lant);
            }
        }

        // Water Fountain Basin
        let bowl_mat = MatStyle::from_hex(0x94a3b8, 0.2, 0.85, 0.0, 0.3);
        let mut bowl = cylinder_mesh(1.6, 1.3, 0.55, 28, false, bowl_mat);
        bowl.translate(self.fountain_pos + Vec3::new(0.0, 0.28, 0.0));
        props.merge(&bowl);

        let mut f_rim = torus_mesh(1.62, 0.1, 12, 28, std::f32::consts::TAU, cyan_glow);
        f_rim.transform(
            Mat4::from_translation(self.fountain_pos + Vec3::new(0.0, 0.56, 0.0))
                * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
        );
        props.merge(&f_rim);

        let mut nozzle = cylinder_mesh(0.18, 0.24, 0.5, 14, false, cyan_glow);
        nozzle.translate(self.fountain_pos + Vec3::new(0.0, 0.65, 0.0));
        props.merge(&nozzle);

        let mut sign_post = cylinder_mesh(0.05, 0.05, 0.45, 8, false, bowl_mat);
        sign_post.translate(self.fountain_pos + Vec3::new(0.0, 0.72, 1.52));
        props.merge(&sign_post);

        let mut f_sign = box_mesh(0.85, 0.26, 0.1, cyan_glow);
        f_sign.translate(self.fountain_pos + Vec3::new(0.0, 0.96, 1.52));
        props.merge(&f_sign);

        // Seesaw Stands & Axle
        let dark_metal = MatStyle::from_hex(0x1e293b, 0.3, 0.75, 0.0, 0.2);
        let chrome_mat = MatStyle::from_hex(0xe2e8f0, 0.15, 0.9, 0.0, 0.5);
        for &z_off in &[-0.75f32, 0.75] {
            let mut stand = cylinder_mesh(0.05, 0.85, 1.55, 4, false, dark_metal);
            stand.transform(
                Mat4::from_translation(self.seesaw_pos + Vec3::new(0.0, 0.77, z_off))
                    * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_4),
            );
            props.merge(&stand);
        }
        let mut axle = cylinder_mesh(0.14, 0.14, 2.0, 14, false, chrome_mat);
        axle.transform(
            Mat4::from_translation(self.seesaw_pos + Vec3::new(0.0, 1.5, 0.0))
                * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
        );
        props.merge(&axle);

        // Ramp (45, 45)
        let ramp_pos = Vec3::new(45.0, Self::get_terrain_height_only(45.0, 45.0), 45.0);
        let ramp_len = 12.0f32;
        let ramp_w = 4.6f32;
        let ramp_angle = 0.22f32;
        let ramp_mid_y = ramp_angle.sin() * (ramp_len * 0.5);
        let ramp_top_y = ramp_angle.sin() * ramp_len;
        let ramp_mat = MatStyle::from_hex(0xff9800, 0.45, 0.1, 0.0, 0.2);
        let mut ramp_xf = Mat4::from_translation(ramp_pos + Vec3::new(0.0, ramp_mid_y, 0.0))
            * Mat4::from_rotation_x(-ramp_angle);
        let mut ramp_bed = box_mesh(ramp_w, 0.28, ramp_len, ramp_mat);
        ramp_bed.transform(ramp_xf);
        props.merge(&ramp_bed);
        for &cx in &[-ramp_w * 0.5 + 0.12, ramp_w * 0.5 - 0.12] {
            let mut curb = box_mesh(0.2, 0.28, ramp_len, cyan_glow);
            curb.transform(ramp_xf * Mat4::from_translation(Vec3::new(cx, 0.2, 0.0)));
            props.merge(&curb);
        }
        for s in 0..8 {
            let sz = -5.2 + s as f32 * 1.48;
            let mut strip = box_mesh(ramp_w - 0.5, 0.08, 0.24, dark_metal);
            strip.transform(ramp_xf * Mat4::from_translation(Vec3::new(0.0, 0.16, sz)));
            props.merge(&strip);
        }
        ramp_xf = Mat4::from_translation(ramp_pos);
        for &px in &[-ramp_w * 0.42, ramp_w * 0.42] {
            for &pz in &[-ramp_len * 0.42, 0.0] {
                let t = 0.5 - (pz / ramp_len);
                let h = (t * ramp_top_y).max(0.3);
                let mut pil = cylinder_mesh(0.14, 0.16, h, 10, false, dark_metal);
                pil.transform(ramp_xf * Mat4::from_translation(Vec3::new(px, h * 0.5, pz)));
                props.merge(&pil);
            }
        }

        // 3 Pulsing Agility Hoops (x=36, z=16, 26, 36)
        let ring_cols = [0x00e5ff, 0xff4081, 0x76ff03];
        for (idx, offset) in [-10.0f32, 0.0, 10.0].into_iter().enumerate() {
            let hx = 36.0;
            let hz = 26.0 + offset;
            let hy = Self::get_terrain_height_only(hx, hz);
            let h_xf = Mat4::from_translation(Vec3::new(hx, hy, hz)) * Mat4::from_rotation_y(0.3);
            let r_mat = MatStyle::from_hex(ring_cols[idx], 0.2, 0.1, 0.95, 0.3);
            let mut hoop = torus_mesh(1.75, 0.14, 12, 32, std::f32::consts::TAU, r_mat);
            hoop.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, 2.1, 0.0)));
            props.merge(&hoop);
            for &lx in &[-1.75f32, 1.75] {
                let mut leg = cylinder_mesh(0.09, 0.11, 2.1, 10, false, dark_metal);
                leg.transform(h_xf * Mat4::from_translation(Vec3::new(lx, 1.05, 0.0)));
                props.merge(&leg);
            }
            let mut base = box_mesh(3.8, 0.12, 0.45, dark_metal);
            base.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, 0.06, 0.0)));
            props.merge(&base);
        }

        // Playground Crawl Tunnel (56, 24)
        let pt_pos = Vec3::new(56.0, Self::get_terrain_height_only(56.0, 24.0), 24.0);
        let pt_xf = Mat4::from_translation(pt_pos) * Mat4::from_rotation_y(-0.55);
        let pt_mat = MatStyle::from_hex(0x7c4dff, 0.4, 0.2, 0.0, 0.2);
        let mut pt_shell = cylinder_arc_mesh(2.2, 2.2, 10.0, 20, true, 0.0, std::f32::consts::PI, pt_mat);
        pt_shell.transform(
            pt_xf * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_2) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2),
        );
        props.merge(&pt_shell);
        for &tz in &[-4.9f32, 0.0, 4.9] {
            let mut rib = torus_mesh(2.22, 0.1, 10, 24, std::f32::consts::PI, cyan_glow);
            rib.transform(pt_xf * Mat4::from_translation(Vec3::new(0.0, 0.0, tz)));
            props.merge(&rib);
        }

        // Trampoline Frame & Legs
        let tr_xf = Mat4::from_translation(self.trampoline_pos);
        let mut tr_frame = torus_mesh(3.6, 0.24, 12, 32, std::f32::consts::TAU, dark_metal);
        tr_frame.transform(
            tr_xf * Mat4::from_translation(Vec3::new(0.0, 1.0, 0.0)) * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2),
        );
        props.merge(&tr_frame);
        for i in 0..6 {
            let a = (i as f32 / 6.0) * std::f32::consts::TAU;
            let mut leg = cylinder_mesh(0.12, 0.14, 1.0, 10, false, dark_metal);
            leg.transform(tr_xf * Mat4::from_translation(Vec3::new(a.cos() * 3.4, 0.5, a.sin() * 3.4)));
            props.merge(&leg);
        }

        // Carousel Base
        let mut car_base = cylinder_mesh(4.2, 4.4, 0.25, 32, false, dark_metal);
        car_base.translate(self.carousel_pos + Vec3::new(0.0, 0.12, 0.0));
        props.merge(&car_base);

        // Soccer Goal Frame + Wireframe Net
        let g_xf = Mat4::from_translation(self.goal_pos) * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_2);
        let white_mat = MatStyle::from_hex(0xffffff, 0.2, 0.3, 0.0, 0.4);
        let net_mat = MatStyle::from_hex_alpha(0xe2e8f0, 0.65, 0.5, 0.0, 0.2, 0.0);
        let ghw = self.goal_width * 0.5;
        let gh = self.goal_height;
        let gd = self.goal_depth;
        for &sx in &[-ghw, ghw] {
            let mut p = cylinder_mesh(0.12, 0.12, gh, 10, false, white_mat);
            p.transform(g_xf * Mat4::from_translation(Vec3::new(sx, gh * 0.5, 0.0)));
            props.merge(&p);
            let mut bp = cylinder_mesh(0.08, 0.08, gh, 8, false, white_mat);
            bp.transform(g_xf * Mat4::from_translation(Vec3::new(sx, gh * 0.5, -gd)));
            props.merge(&bp);
            let mut ts = cylinder_mesh(0.08, 0.08, gd, 8, false, white_mat);
            ts.transform(g_xf * Mat4::from_translation(Vec3::new(sx, gh, -gd * 0.5)) * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));
            props.merge(&ts);
            let mut bs = cylinder_mesh(0.08, 0.08, gd, 8, false, white_mat);
            bs.transform(g_xf * Mat4::from_translation(Vec3::new(sx, 0.08, -gd * 0.5)) * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));
            props.merge(&bs);
        }
        let mut cross = cylinder_mesh(0.12, 0.12, self.goal_width + 0.24, 12, false, white_mat);
        cross.transform(g_xf * Mat4::from_translation(Vec3::new(0.0, gh, 0.0)) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
        props.merge(&cross);
        let mut btop = cylinder_mesh(0.08, 0.08, self.goal_width, 10, false, white_mat);
        btop.transform(g_xf * Mat4::from_translation(Vec3::new(0.0, gh, -gd)) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
        props.merge(&btop);

        // Net grid strands (clean 3D mesh bars so net looks crisp in WebGL2 & Vulkan!)
        for i in 0..=8 {
            let x = -ghw + (i as f32 / 8.0) * self.goal_width;
            let mut strand_b = box_mesh(0.025, gh, 0.025, net_mat);
            strand_b.transform(g_xf * Mat4::from_translation(Vec3::new(x, gh * 0.5, -gd)));
            net_out.merge(&strand_b);
            let mut strand_t = box_mesh(0.025, 0.025, gd, net_mat);
            strand_t.transform(g_xf * Mat4::from_translation(Vec3::new(x, gh, -gd * 0.5)));
            net_out.merge(&strand_t);
        }
        for j in 0..=4 {
            let y = (j as f32 / 4.0) * gh;
            let mut hbar = box_mesh(self.goal_width, 0.025, 0.025, net_mat);
            hbar.transform(g_xf * Mat4::from_translation(Vec3::new(0.0, y, -gd)));
            net_out.merge(&hbar);
        }

        // Disco Pad Base & Truss Frame
        let d_xf = Mat4::from_translation(self.disco_pad_pos);
        let mut d_frame = box_mesh(6.6, 0.1, 6.6, dark_metal);
        d_frame.transform(d_xf * Mat4::from_translation(Vec3::new(0.0, 0.05, 0.0)));
        props.merge(&d_frame);
        let truss_h = 5.0f32;
        for &(cx, cz) in &[(-3.15f32, -3.15), (3.15, -3.15), (-3.15, 3.15), (3.15, 3.15)] {
            let mut pil = cylinder_mesh(0.12, 0.14, truss_h, 10, false, dark_metal);
            pil.transform(d_xf * Mat4::from_translation(Vec3::new(cx, truss_h * 0.5, cz)));
            props.merge(&pil);
        }
        let diag_len = 6.3 * std::f32::consts::SQRT_2;
        for &r in &[std::f32::consts::FRAC_PI_4, -std::f32::consts::FRAC_PI_4] {
            let mut beam = box_mesh(diag_len, 0.14, 0.14, dark_metal);
            beam.transform(d_xf * Mat4::from_translation(Vec3::new(0.0, truss_h, 0.0)) * Mat4::from_rotation_y(r));
            props.merge(&beam);
        }
        let mut cable = cylinder_mesh(0.03, 0.03, 0.8, 8, false, dark_metal);
        cable.transform(d_xf * Mat4::from_translation(Vec3::new(0.0, truss_h - 0.4, 0.0)));
        props.merge(&cable);

        // Hollow Cyber Doghouse (72, 52)
        let h_xf = Mat4::from_translation(Vec3::new(72.0, Self::get_terrain_height_only(72.0, 52.0), 52.0));
        let wall_mat = MatStyle::from_hex(0x334155, 0.35, 0.45, 0.0, 0.1);
        let roof_mat = MatStyle::from_hex(0x0284c7, 0.2, 0.6, 0.0, 0.5);
        let pad_mat = MatStyle::from_hex(0x22ff88, 0.2, 0.1, 0.95, 0.4);
        let (dw, dh, dd, wt, door_w, door_h) = (6.4f32, 4.6f32, 6.4f32, 0.4f32, 3.0f32, 3.4f32);
        let pil_w = (dw - door_w) * 0.5;
        let mut slab = box_mesh(dw, 0.16, dd, dark_metal);
        slab.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, 0.08, 0.0)));
        props.merge(&slab);
        let mut back = box_mesh(dw, dh, wt, wall_mat);
        back.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, dh * 0.5, -dd * 0.5 + wt * 0.5)));
        props.merge(&back);
        for &wx in &[-dw * 0.5 + wt * 0.5, dw * 0.5 - wt * 0.5] {
            let mut sw = box_mesh(wt, dh, dd, wall_mat);
            sw.transform(h_xf * Mat4::from_translation(Vec3::new(wx, dh * 0.5, 0.0)));
            props.merge(&sw);
        }
        for &px in &[-dw * 0.5 + pil_w * 0.5, dw * 0.5 - pil_w * 0.5] {
            let mut fp = box_mesh(pil_w, dh, wt, wall_mat);
            fp.transform(h_xf * Mat4::from_translation(Vec3::new(px, dh * 0.5, dd * 0.5 - wt * 0.5)));
            props.merge(&fp);
        }
        let mut lintel = box_mesh(door_w, dh - door_h, wt, wall_mat);
        lintel.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, door_h + (dh - door_h) * 0.5, dd * 0.5 - wt * 0.5)));
        props.merge(&lintel);
        let mut d_top = box_mesh(door_w + 0.2, 0.12, wt + 0.08, cyan_glow);
        d_top.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, door_h, dd * 0.5 - wt * 0.5)));
        props.merge(&d_top);
        for &dx in &[-door_w * 0.5, door_w * 0.5] {
            let mut d_side = box_mesh(0.12, door_h, wt + 0.08, cyan_glow);
            d_side.transform(h_xf * Mat4::from_translation(Vec3::new(dx, door_h * 0.5, dd * 0.5 - wt * 0.5)));
            props.merge(&d_side);
        }
        let mut r_pad = cylinder_mesh(1.85, 1.95, 0.14, 24, false, pad_mat);
        r_pad.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, 0.2, 0.0)));
        props.merge(&r_pad);
        let mut roof = cylinder_mesh(0.05, 5.4, 2.4, 4, false, roof_mat);
        roof.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, dh + 1.2, 0.0)) * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_4));
        props.merge(&roof);
        let mut h_sign = box_mesh(3.4, 0.7, 0.18, cyan_glow);
        h_sign.transform(h_xf * Mat4::from_translation(Vec3::new(0.0, dh - 0.55, dd * 0.5 + 0.05)));
        props.merge(&h_sign);

        // Ball Pit Enclosure (-32, 48)
        let bp_xf = Mat4::from_translation(self.ballpit_pos);
        let mut bp_floor = box_mesh(7.2, 0.2, 7.2, dark_metal);
        bp_floor.transform(bp_xf * Mat4::from_translation(Vec3::new(0.0, 0.1, 0.0)));
        props.merge(&bp_floor);
        for (lx, lz, w_v, d_v) in [
            (0.0f32, -3.5f32, 7.4f32, 0.35f32),
            (0.0, 3.5, 7.4, 0.35),
            (-3.5, 0.0, 0.35, 7.4),
            (3.5, 0.0, 0.35, 7.4),
        ] {
            let mut w = box_mesh(w_v, 0.65, d_v, cyan_glow);
            w.transform(bp_xf * Mat4::from_translation(Vec3::new(lx, 0.35, lz)));
            props.merge(&w);
        }

        // Agility Slide (-18, -32)
        let sly = Self::get_terrain_height_only(-18.0, -32.0);
        let s_xf = Mat4::from_translation(Vec3::new(-18.0, sly, -32.0));
        let chute_mat = MatStyle::from_hex(0x0284c7, 0.15, 0.4, 0.0, 0.6);
        for &px in &[-1.2f32, 1.2] {
            for &pz in &[-1.2f32, 1.2] {
                let mut pil = cylinder_mesh(0.1, 0.12, 4.8, 10, false, dark_metal);
                pil.transform(s_xf * Mat4::from_translation(Vec3::new(px, 2.4, pz)));
                props.merge(&pil);
            }
            let mut top_r = box_mesh(0.1, 0.1, 2.5, cyan_glow);
            top_r.transform(s_xf * Mat4::from_translation(Vec3::new(px, 4.8, 0.0)));
            props.merge(&top_r);
        }
        let mut top_fl = box_mesh(2.6, 0.2, 2.6, dark_metal);
        top_fl.transform(s_xf * Mat4::from_translation(Vec3::new(0.0, 4.0, 0.0)));
        props.merge(&top_fl);
        for &lx in &[-0.85f32, 0.85] {
            let mut strg = cylinder_mesh(0.055, 0.055, 4.4, 8, false, dark_metal);
            strg.transform(s_xf * Mat4::from_translation(Vec3::new(lx, 2.2, -1.25)));
            props.merge(&strg);
        }
        for i in 0..7 {
            let sy = 0.45 + i as f32 * 0.52;
            let mut step = cylinder_mesh(0.04, 0.04, 1.7, 8, false, cyan_glow);
            step.transform(s_xf * Mat4::from_translation(Vec3::new(0.0, sy, -1.25)) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
            props.merge(&step);
        }
        let dy_s = 4.0f32 - 0.22;
        let dz_s = 7.8f32 - 1.2;
        let chute_len = dy_s.hypot(dz_s);
        let chute_ang = dy_s.atan2(dz_s);
        let c_xf = s_xf * Mat4::from_translation(Vec3::new(0.0, 2.11, 4.5)) * Mat4::from_rotation_x(chute_ang);
        let mut bed = box_mesh(1.6, 0.14, chute_len, chute_mat);
        bed.transform(c_xf);
        props.merge(&bed);
        for &rx in &[-0.82f32, 0.82] {
            let mut sw = box_mesh(0.12, 0.36, chute_len, chute_mat);
            sw.transform(c_xf * Mat4::from_translation(Vec3::new(rx, 0.18, 0.0)));
            props.merge(&sw);
            let mut rl = cylinder_mesh(0.05, 0.05, chute_len, 8, false, cyan_glow);
            rl.transform(c_xf * Mat4::from_translation(Vec3::new(rx, 0.38, 0.0)) * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));
            props.merge(&rl);
        }
        let mut cushion = box_mesh(2.4, 0.24, 2.6, MatStyle::from_hex(0xffea00, 0.6, 0.0, 0.0, 0.0));
        cushion.transform(s_xf * Mat4::from_translation(Vec3::new(0.0, 0.12, 8.2)));
        props.merge(&cushion);

        // Agility Obstacle Course (22, -50)
        let oc_xf = Mat4::from_translation(Vec3::new(22.0, Self::get_terrain_height_only(22.0, -50.0), -50.0));
        let yellow_glow = MatStyle::from_hex(0xffea00, 0.2, 0.1, 0.85, 0.2);
        for i in 0..7 {
            let tz = -3.0 + i as f32;
            let mut rib = torus_mesh(1.08, 0.07, 10, 20, std::f32::consts::TAU, yellow_glow);
            rib.transform(oc_xf * Mat4::from_translation(Vec3::new(0.0, 1.05, tz)));
            props.merge(&rib);
        }
        let mut tube = cylinder_mesh(
            1.04,
            1.04,
            6.2,
            20,
            true,
            MatStyle::from_hex_alpha(0x0284c7, 0.65, 0.2, 0.1, 0.15, 0.4),
        );
        tube.transform(oc_xf * Mat4::from_translation(Vec3::new(0.0, 1.05, 0.0)) * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));
        props.merge(&tube);
        for &hz in &[6.0f32, 10.0, 14.0] {
            for &hx in &[-1.3f32, 1.3] {
                let mut post = cylinder_mesh(0.07, 0.08, 1.1, 10, false, dark_metal);
                post.transform(oc_xf * Mat4::from_translation(Vec3::new(hx, 0.55, hz)));
                props.merge(&post);
            }
            let mut bar = cylinder_mesh(0.05, 0.05, 2.6, 10, false, yellow_glow);
            bar.transform(oc_xf * Mat4::from_translation(Vec3::new(0.0, 0.65, hz)) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
            props.merge(&bar);
        }

        // Target Toss Gantry (76, 18)
        let tg_xf = Mat4::from_translation(Vec3::new(76.0, Self::get_terrain_height_only(76.0, 18.0), 18.0));
        for &sx in &[-2.2f32, 2.2] {
            let mut leg = cylinder_mesh(0.11, 0.13, 5.9, 10, false, chrome_mat);
            leg.transform(tg_xf * Mat4::from_translation(Vec3::new(sx, 2.95, 0.0)));
            props.merge(&leg);
        }
        for &by in &[3.2f32, 5.8] {
            let mut bar = cylinder_mesh(0.085, 0.085, 4.6, 10, false, chrome_mat);
            bar.transform(tg_xf * Mat4::from_translation(Vec3::new(0.0, by, 0.0)) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
            props.merge(&bar);
        }
        let mut board = box_mesh(2.8, 0.85, 0.24, dark_metal);
        board.transform(tg_xf * Mat4::from_translation(Vec3::new(0.0, 5.8, 0.0)));
        props.merge(&board);
        let mut board_rim = box_mesh(2.9, 0.95, 0.18, cyan_glow);
        board_rim.transform(tg_xf * Mat4::from_translation(Vec3::new(0.0, 5.8, 0.0)));
        props.merge(&board_rim);

        // Piñata Gantry (-42, 14)
        let pn_xf = Mat4::from_translation(Vec3::new(-42.0, Self::get_terrain_height_only(-42.0, 14.0), 14.0));
        let mut pn_top = cylinder_mesh(0.09, 0.09, 3.6, 10, false, dark_metal);
        pn_top.transform(pn_xf * Mat4::from_translation(Vec3::new(0.0, 4.2, 0.0)) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
        props.merge(&pn_top);
        for &ax in &[-1.7f32, 1.7] {
            let mut p = cylinder_mesh(0.1, 0.12, 4.2, 10, false, dark_metal);
            p.transform(pn_xf * Mat4::from_translation(Vec3::new(ax, 2.1, 0.0)));
            props.merge(&p);
        }

        // Slalom Rings
        for r in &self.slalom_rings {
            let rot_y = (r.exit_pos.x - r.entry_pos.x).atan2(r.exit_pos.z - r.entry_pos.z);
            let r_xf = Mat4::from_translation(Vec3::new(r.position.x, r.position.y - 1.6, r.position.z))
                * Mat4::from_rotation_y(rot_y);
            for &px in &[-1.3f32, 1.3] {
                let mut post = cylinder_mesh(0.08, 0.09, 1.8, 10, false, dark_metal);
                post.transform(r_xf * Mat4::from_translation(Vec3::new(px, 0.9, 0.0)));
                props.merge(&post);
            }
            let r_mat = MatStyle::from_hex(r.color_hex, 0.2, 0.1, 0.85, 0.3);
            let mut torus = torus_mesh(1.3, 0.1, 12, 28, std::f32::consts::TAU, r_mat);
            torus.transform(r_xf * Mat4::from_translation(Vec3::new(0.0, 1.6, 0.0)));
            props.merge(&torus);
        }
    }
}

fn build_terrain_mesh() -> MeshData {
    let segs = 128u32;
    let size = 600.0f32;
    let half = size * 0.5;
    let mut vertices = Vec::with_capacity(((segs + 1) * (segs + 1)) as usize);
    let mut indices = Vec::with_capacity((segs * segs * 6) as usize);

    for iz in 0..=segs {
        let vz = iz as f32 / segs as f32;
        let z = -half + vz * size;
        for ix in 0..=segs {
            let ux = ix as f32 / segs as f32;
            let x = -half + ux * size;
            let y = WorldState::get_terrain_height_only(x, z);
            // Sand tint near lake shore, darker lush emerald at outer hills
            let d_lake = (x - LAKE_CENTER_X).hypot(z - LAKE_CENTER_Z);
            let col = if d_lake < 67.0 {
                let t = ((d_lake - 56.0) / 11.0).clamp(0.0, 1.0);
                [0.92 * (1.0 - t) + t, 0.86 * (1.0 - t) + t, 0.72 * (1.0 - t) + t, 1.0]
            } else {
                [1.0, 1.0, 1.0, 1.0]
            };
            vertices.push(Vertex {
                pos: [x, y, z],
                normal: [0.0, 1.0, 0.0],
                uv: [ux * 40.0, vz * 40.0],
                color: col,
                mat_params: [0.78, 0.04, 0.0, 0.0],
            });
        }
    }
    let stride = segs + 1;
    for iz in 0..segs {
        for ix in 0..segs {
            let a = iz * stride + ix;
            let b = a + 1;
            let c = a + stride;
            let d = c + 1;
            indices.extend_from_slice(&[a, c, b, b, c, d]);
        }
    }
    let mut mesh = MeshData { vertices, indices };
    mesh.compute_flat_or_smooth_normals();
    mesh
}

fn build_path_ribbon(start: Vec3, end: Vec3, width: f32, segments: u32) -> MeshData {
    let mut dir = Vec3::new(end.x - start.x, 0.0, end.z - start.z);
    let len = dir.length();
    if len < 0.1 {
        return MeshData::new();
    }
    dir /= len;
    let normal = Vec3::new(-dir.z, 0.0, dir.x) * (width * 0.5);
    let mut mesh = MeshData::new();
    for i in 0..=segments {
        let t = i as f32 / segments as f32;
        let mut center = start.lerp(end, t);
        let curve = (t * std::f32::consts::PI).sin() * 1.8;
        center.x += -dir.z * curve;
        center.z += dir.x * curve;
        let mut p_l = center + normal;
        let mut p_r = center - normal;
        p_l.y = WorldState::get_terrain_height_only(p_l.x, p_l.z) + 0.09;
        p_r.y = WorldState::get_terrain_height_only(p_r.x, p_r.z) + 0.09;
        let v_coord = t * (len / 3.0);
        mesh.vertices.push(Vertex {
            pos: p_l.to_array(),
            normal: [0.0, 1.0, 0.0],
            uv: [0.0, v_coord],
            color: [1.0, 1.0, 1.0, 1.0],
            mat_params: [0.75, 0.08, 0.0, 0.0],
        });
        mesh.vertices.push(Vertex {
            pos: p_r.to_array(),
            normal: [0.0, 1.0, 0.0],
            uv: [1.0, v_coord],
            color: [1.0, 1.0, 1.0, 1.0],
            mat_params: [0.75, 0.08, 0.0, 0.0],
        });
        if i < segments {
            let b = i * 2;
            mesh.indices.extend_from_slice(&[b, b + 1, b + 2, b + 1, b + 3, b + 2]);
        }
    }
    mesh.compute_flat_or_smooth_normals();
    mesh
}

fn build_upgraded_speedboat() -> (MeshData, MeshData) {
    let hull_mat = MatStyle::from_hex(0xff1744, 0.22, 0.3, 0.0, 0.8);
    let deck_mat = MatStyle::from_hex(0xf8fafc, 0.25, 0.1, 0.0, 0.6);
    let glass_mat = MatStyle::from_hex_alpha(0x00e5ff, 0.78, 0.08, 0.8, 0.4, 1.0);
    let dark_mat = MatStyle::from_hex(0x1e293b, 0.3, 0.8, 0.0, 0.2);
    let cyan_glow = MatStyle::from_hex(0x00e5ff, 0.2, 0.1, 0.95, 0.3);

    let mut boat = MeshData::new();
    let mut hull = beveled_box(2.5, 0.75, 3.6, 0.12, 3, hull_mat);
    hull.translate(Vec3::new(0.0, 0.22, -0.3));
    boat.merge(&hull);

    let mut bow = cylinder_mesh(0.05, 1.77, 1.8, 4, false, hull_mat);
    bow.transform(
        Mat4::from_translation(Vec3::new(0.0, 0.22, 2.4))
            * Mat4::from_scale(Vec3::new(1.0, 0.42, 1.0))
            * Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2)
            * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_4),
    );
    boat.merge(&bow);

    let mut deck = beveled_box(2.3, 0.15, 3.4, 0.04, 2, deck_mat);
    deck.translate(Vec3::new(0.0, 0.62, -0.3));
    boat.merge(&deck);

    let mut cabin = beveled_box(1.75, 0.75, 1.8, 0.09, 2, deck_mat);
    cabin.translate(Vec3::new(0.0, 1.0, -0.4));
    boat.merge(&cabin);

    let mut wind = beveled_box(1.68, 0.55, 0.85, 0.04, 2, glass_mat);
    wind.transform(Mat4::from_translation(Vec3::new(0.0, 0.98, 0.6)) * Mat4::from_rotation_x(-0.45));
    boat.merge(&wind);

    let mut motor = beveled_box(0.55, 0.75, 0.6, 0.05, 2, dark_mat);
    motor.translate(Vec3::new(0.0, 0.45, -2.25));
    boat.merge(&motor);

    let mut ant = cylinder_mesh(0.035, 0.035, 1.3, 8, false, cyan_glow);
    ant.translate(Vec3::new(0.0, 1.9, -0.6));
    boat.merge(&ant);

    // Spinning outboard propeller
    let mut prop = MeshData::new();
    prop.merge(&sphere_mesh(0.09, 8, 8, dark_mat));
    prop.merge(&box_mesh(0.55, 0.09, 0.03, cyan_glow));
    prop.merge(&box_mesh(0.09, 0.55, 0.03, cyan_glow));

    (boat, prop)
}

fn build_carousel_rotor() -> MeshData {
    let mut rotor = MeshData::new();
    let plat_mat = MatStyle::from_hex(0xff4081, 0.35, 0.2, 0.0, 0.4);
    let pole_mat = MatStyle::from_hex(0xffeb3b, 0.3, 0.5, 0.0, 0.2);
    let cyan_glow = MatStyle::from_hex(0x00e5ff, 0.2, 0.1, 0.7, 0.3);
    let dark_mat = MatStyle::from_hex(0x263238, 0.3, 0.7, 0.0, 0.0);

    rotor.merge(&cylinder_mesh(3.8, 3.8, 0.16, 32, false, plat_mat));
    let mut pole = cylinder_mesh(0.22, 0.26, 2.8, 14, false, pole_mat);
    pole.translate(Vec3::new(0.0, 1.4, 0.0));
    rotor.merge(&pole);
    let mut cap = cylinder_mesh(0.05, 1.8, 0.85, 16, false, cyan_glow);
    cap.translate(Vec3::new(0.0, 3.05, 0.0));
    rotor.merge(&cap);
    for i in 0..4 {
        let a = (i as f32 / 4.0) * std::f32::consts::TAU;
        let hx = a.cos() * 2.5;
        let hz = a.sin() * 2.5;
        let mut bar = torus_mesh(0.55, 0.07, 10, 20, std::f32::consts::TAU, cyan_glow);
        bar.transform(Mat4::from_translation(Vec3::new(hx, 0.95, hz)) * Mat4::from_rotation_y(-a));
        rotor.merge(&bar);
        let mut strut = cylinder_mesh(0.06, 0.06, 0.9, 8, false, dark_mat);
        strut.translate(Vec3::new(hx, 0.45, hz));
        rotor.merge(&strut);
    }
    rotor
}

fn build_seesaw_plank() -> MeshData {
    let mut mesh = MeshData::new();
    let plank_mat = MatStyle::from_hex(0x334155, 0.4, 0.3, 0.0, 0.2);
    mesh.merge(&beveled_box(10.0, 0.18, 1.45, 0.04, 2, plank_mat));
    for (hx, col) in [(-4.3f32, 0x00e5ff), (4.3, 0xff4081)] {
        let h_mat = MatStyle::from_hex(col, 0.2, 0.1, 0.85, 0.3);
        let mut handle = torus_mesh(0.35, 0.06, 10, 20, std::f32::consts::TAU, h_mat);
        handle.transform(Mat4::from_translation(Vec3::new(hx * 0.88, 0.38, 0.0)) * Mat4::from_rotation_y(std::f32::consts::FRAC_PI_2));
        mesh.merge(&handle);
        let mut pad = beveled_box(1.25, 0.08, 1.25, 0.02, 2, h_mat);
        pad.translate(Vec3::new(hx, 0.12, 0.0));
        mesh.merge(&pad);
    }
    mesh
}

fn build_target_rotor() -> MeshData {
    let mut mesh = MeshData::new();
    for (r, thick, col) in [
        (2.1f32, 0.12f32, 0x00e5ff),
        (1.35, 0.18, 0xffea00),
        (0.65, 0.24, 0xff1744),
    ] {
        let mat = MatStyle::from_hex(col, 0.2, 0.1, 0.75, 0.3);
        let mut ring = cylinder_mesh(r, r, thick, 28, false, mat);
        ring.transform(Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2));
        mesh.merge(&ring);
    }
    mesh
}

fn build_pinata_body() -> MeshData {
    let mut mesh = MeshData::new();
    let rope_mat = MatStyle::from_hex(0x475569, 0.5, 0.6, 0.0, 0.0);
    let p_mat = MatStyle::from_hex(0xff3399, 0.25, 0.1, 0.85, 0.3);
    let mut rope = cylinder_mesh(0.025, 0.025, 1.8, 8, false, rope_mat);
    rope.translate(Vec3::new(0.0, -0.9, 0.0));
    mesh.merge(&rope);

    let mut shaft = cylinder_mesh(0.2, 0.2, 1.1, 12, false, p_mat);
    shaft.transform(Mat4::from_translation(Vec3::new(0.0, -1.8, 0.0)) * Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
    mesh.merge(&shaft);
    for bx in [-0.55f32, 0.55] {
        for by in [-0.18f32, 0.18] {
            let mut k = sphere_mesh(0.22, 12, 10, p_mat);
            k.translate(Vec3::new(bx, -1.8 + by, 0.0));
            mesh.merge(&k);
        }
    }
    mesh
}

fn build_bone_toy_mesh() -> MeshData {
    let mut mesh = MeshData::new();
    let mat = MatStyle::from_hex(0x00e5ff, 0.2, 0.1, 0.8, 0.4);
    let mut shaft = cylinder_mesh(0.12, 0.12, 1.25, 12, false, mat);
    shaft.transform(Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2));
    mesh.merge(&shaft);
    for x in [-0.65f32, 0.65] {
        for y in [-0.15f32, 0.15] {
            let mut k = sphere_mesh(0.22, 12, 10, mat);
            k.translate(Vec3::new(x, y, 0.0));
            mesh.merge(&k);
        }
    }
    mesh
}

fn build_snack_mesh() -> MeshData {
    let mat = MatStyle::from_hex(0xffea00, 0.3, 0.1, 0.75, 0.3);
    let mut m = cylinder_mesh(0.26, 0.26, 0.09, 16, false, mat);
    let chip_mat = MatStyle::from_hex(0x78350f, 0.6, 0.0, 0.0, 0.0);
    for (cx, cz) in [(-0.08, 0.07), (0.09, -0.05), (-0.04, -0.10), (0.06, 0.09)] {
        let mut chip = sphere_mesh(0.045, 6, 5, chip_mat);
        chip.translate(Vec3::new(cx, 0.045, cz));
        m.merge(&chip);
    }
    m
}
