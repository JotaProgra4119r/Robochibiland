use crate::robot::ChibiRobotDog;
use crate::world::WorldState;
use glam::Vec3;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct BodyState {
    pub name: &'static str,
    pub position: [f32; 3],
    pub current_area: &'static str,
    pub current_emotion: &'static str,
    pub current_action: &'static str,
    pub energy_level: u32,
    pub curiosity_level: u32,
    pub sociability_level: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct VisualItem {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emotion: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<&'static str>,
    pub distance: String,
    #[serde(skip_serializing)]
    pub dist_num: f32,
    pub direction: &'static str,
}

pub struct RobotVisionSystem {
    pub vision_angle: f32,
    pub vision_range: f32,
}

impl RobotVisionSystem {
    pub fn new() -> Self {
        Self {
            vision_angle: std::f32::consts::PI * 0.58,
            vision_range: 42.0,
        }
    }

    pub fn get_current_location_name(world: &WorldState, pos: Vec3) -> &'static str {
        let mut best_name = "Gran Prado Verde";
        let mut smallest_radius = f32::INFINITY;
        for poi in &world.points_of_interest {
            let d = (pos.x - poi.position.x).hypot(pos.z - poi.position.z);
            if d <= poi.radius && poi.radius < smallest_radius {
                smallest_radius = poi.radius;
                best_name = poi.name;
            }
        }
        best_name
    }

    pub fn get_body_state(
        dog: &ChibiRobotDog,
        current_action: &'static str,
        world: &WorldState,
    ) -> BodyState {
        let p = dog.position;
        BodyState {
            name: dog.id.name(),
            position: [
                (p.x * 10.0).round() / 10.0,
                (p.y * 10.0).round() / 10.0,
                (p.z * 10.0).round() / 10.0,
            ],
            current_area: Self::get_current_location_name(world, p),
            current_emotion: dog.current_emotion.meta().name,
            current_action,
            energy_level: dog.energy.round() as u32,
            curiosity_level: dog.curiosity.round() as u32,
            sociability_level: dog.sociability.round() as u32,
        }
    }

    pub fn get_visual_snapshot(
        &self,
        active_dog: &ChibiRobotDog,
        all_dogs: &[ChibiRobotDog; 5],
        active_idx: usize,
        world: &WorldState,
    ) -> Vec<VisualItem> {
        let rpos = active_dog.position;
        let fwd = Vec3::new(active_dog.rotation_y.sin(), 0.0, active_dog.rotation_y.cos());
        let half_fov = self.vision_angle * 0.5;
        let mut items = Vec::new();

        // 1. Balls & Bones
        for b in &world.balls {
            let to = b.pos - rpos;
            let dist = to.length();
            if dist <= self.vision_range && dist > 0.4 {
                let dir = to / dist;
                let angle = fwd.dot(dir).clamp(-1.0, 1.0).acos();
                if angle <= half_fov {
                    items.push(VisualItem {
                        kind: b.name.to_string(),
                        emotion: None,
                        action: None,
                        distance: format!("{:.1}m", dist),
                        dist_num: dist,
                        direction: Self::relative_direction(fwd, dir),
                    });
                }
            }
        }
        for bone in &world.bone_toys {
            let to = bone.pos - rpos;
            let dist = to.length();
            if dist <= self.vision_range && dist > 0.4 {
                let dir = to / dist;
                let angle = fwd.dot(dir).clamp(-1.0, 1.0).acos();
                if angle <= half_fov {
                    items.push(VisualItem {
                        kind: "Hueso de Energía".to_string(),
                        emotion: None,
                        action: None,
                        distance: format!("{:.1}m", dist),
                        dist_num: dist,
                        direction: Self::relative_direction(fwd, dir),
                    });
                }
            }
        }

        // 2. Snacks
        for s in &world.snacks {
            let to = s.pos - rpos;
            let dist = to.length();
            if dist <= self.vision_range && dist > 1e-3 {
                let dir = to / dist;
                let angle = fwd.dot(dir).clamp(-1.0, 1.0).acos();
                if angle <= half_fov {
                    items.push(VisualItem {
                        kind: "Galleta Energética".to_string(),
                        emotion: None,
                        action: None,
                        distance: format!("{:.1}m", dist),
                        dist_num: dist,
                        direction: Self::relative_direction(fwd, dir),
                    });
                }
            }
        }

        // 3. Undug Treasure Spots
        for spot in &world.treasure_spots {
            if spot.dug {
                continue;
            }
            let to = Vec3::new(spot.x, rpos.y, spot.z) - rpos;
            let dist = to.length();
            if dist <= self.vision_range * 0.8 && dist > 1e-3 {
                let dir = to / dist;
                let angle = fwd.dot(dir).clamp(-1.0, 1.0).acos();
                if angle <= half_fov {
                    items.push(VisualItem {
                        kind: format!("Montículo de Tesoro ({})", spot.name),
                        emotion: None,
                        action: None,
                        distance: format!("{:.1}m", dist),
                        dist_num: dist,
                        direction: Self::relative_direction(fwd, dir),
                    });
                }
            }
        }

        // 4. Other dogs
        for (idx, bot) in all_dogs.iter().enumerate() {
            if idx == active_idx {
                continue;
            }
            let to = bot.position - rpos;
            let dist = to.length();
            if dist <= self.vision_range && dist > 1e-3 {
                let dir = to / dist;
                let angle = fwd.dot(dir).clamp(-1.0, 1.0).acos();
                if angle <= half_fov {
                    items.push(VisualItem {
                        kind: format!("Amigo robot {}", bot.id.name()),
                        emotion: Some(bot.current_emotion.meta().name),
                        action: None,
                        distance: format!("{:.1}m", dist),
                        dist_num: dist,
                        direction: Self::relative_direction(fwd, dir),
                    });
                }
            }
        }

        // 5. Landmarks
        for poi in &world.points_of_interest {
            let to = poi.position - rpos;
            let dist = to.length();
            if dist <= self.vision_range * 1.5 && dist > 2.0 {
                let dir = to / dist;
                let angle = fwd.dot(dir).clamp(-1.0, 1.0).acos();
                if angle <= half_fov {
                    items.push(VisualItem {
                        kind: format!("Lugar: {}", poi.name),
                        emotion: None,
                        action: None,
                        distance: format!("{:.1}m", dist),
                        dist_num: dist,
                        direction: Self::relative_direction(fwd, dir),
                    });
                }
            }
        }

        items.sort_by(|a, b| a.dist_num.partial_cmp(&b.dist_num).unwrap_or(std::cmp::Ordering::Equal));
        items.truncate(5);
        items
    }

    pub fn relative_direction(forward: Vec3, to_target: Vec3) -> &'static str {
        let dot = forward.dot(to_target);
        if dot.abs() > 0.85 {
            if dot > 0.0 {
                "Al frente"
            } else {
                "Atrás"
            }
        } else {
            let cross = forward.cross(to_target);
            if cross.y > 0.0 {
                "A la izquierda"
            } else {
                "A la derecha"
            }
        }
    }
}
