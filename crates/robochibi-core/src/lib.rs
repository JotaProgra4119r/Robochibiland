pub mod animations;
pub mod audio_events;
pub mod brain;
pub mod emotions;
pub mod engine;
pub mod mesh;
pub mod pack;
pub mod robot;
pub mod textures;
pub mod vision;
pub mod world;

pub use animations::{AnimId, AnimationController};
pub use audio_events::{AudioEvent, AudioKind, FootstepSurface};
pub use brain::{BrainDecision, BrainUiEvent, RobotBrain};
pub use emotions::{EmotionId, EmotionParticleSystem, FaceRasterizer, FACE_H, FACE_W};
pub use engine::{CameraMode, InputState, OpticalFilter, SimulationEngine, TimeOfDay, WeatherMode};
pub use mesh::{MeshData, Vertex};
pub use pack::RobotPackManager;
pub use robot::{build_robot_mesh_set, ChibiRobotDog, RobotId, RobotMeshSet};
pub use textures::ProceduralTextures;
pub use vision::RobotVisionSystem;
pub use world::{WorldState, WorldStaticMeshes, LAKE_CENTER_X, LAKE_CENTER_Z, LAKE_RADIUS, MAP_PLAY_LIMIT};

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Vec3;

    #[test]
    fn outer_forest_never_spawns_inside_lake() {
        let world = WorldState::new();
        for t in &world.trees {
            let d = (t.pos.x - LAKE_CENTER_X).hypot(t.pos.z - LAKE_CENTER_Z);
            assert!(
                d >= 69.0,
                "Tree spawned inside or too close to Lake of Crystal at ({}, {}), dist={}",
                t.pos.x,
                t.pos.z,
                d
            );
        }
    }

    #[test]
    fn slide_ground_walk_does_not_teleport() {
        let mut engine = SimulationEngine::new();
        let ground = engine.world.get_height_at(-18.0, -32.0);
        let idx = engine.pack.active_idx;
        engine.pack.dogs[idx].position = Vec3::new(-18.0, ground, -32.0);
        let mut audio = Vec::new();
        engine.world.handle_robot_interactions(
            &mut engine.pack.dogs[idx],
            &mut engine.pack.anims[idx],
            0.016,
            &mut audio,
        );
        assert!(
            !engine.pack.dogs[idx].is_sliding,
            "Walking near the ground base of the slide must not trigger sliding!"
        );
    }

    #[test]
    fn all_12_emotions_rasterize_clean_nonempty_faces() {
        let mut face = FaceRasterizer::new(0.5);
        for &emo in &EmotionId::ALL {
            face.draw_face(emo, false);
            assert!(face.dirty);
            let bright_pixels = face
                .pixels
                .chunks_exact(4)
                .filter(|px| px[0] > 40 || px[1] > 40 || px[2] > 40)
                .count();
            assert!(
                bright_pixels > 50,
                "Emotion {:?} produced too few lit OLED pixels ({})",
                emo,
                bright_pixels
            );
        }
        face.draw_face(EmotionId::Happy, true);
        assert!(face.pixels.len() == FACE_W * FACE_H * 4);
    }

    #[test]
    fn all_5_robot_mesh_sets_build_with_valid_normals_and_indices() {
        for &id in &RobotId::ALL {
            let set = build_robot_mesh_set(id, EmotionId::Happy);
            assert!(!set.torso.vertices.is_empty());
            assert!(!set.neck_and_head.vertices.is_empty());
            assert!(!set.paw.vertices.is_empty());
            for idx in &set.torso.indices {
                assert!((*idx as usize) < set.torso.vertices.len());
            }
        }
    }

    #[test]
    fn smallest_radius_poi_selected_inside_playground() {
        let world = WorldState::new();
        let loc = RobotVisionSystem::get_current_location_name(&world, Vec3::new(38.0, 0.0, 22.0));
        assert_eq!(loc, "Trampolín de Salto");
        let loc_disco = RobotVisionSystem::get_current_location_name(&world, Vec3::new(52.0, 0.0, 56.0));
        assert_eq!(loc_disco, "Pista de Baile Disco");
    }

    #[test]
    fn intent_parser_and_malformed_llm_recovery() {
        let mut brain = RobotBrain::new();
        let d1 = brain.extract_intent_from_text(RobotId::Sparky, None, Some("¡Buen chico! Haz una voltereta"));
        assert_eq!(d1.action, "praise_burst");
        assert_eq!(d1.emotion, "LOVING");

        let d2 = brain.parse_llm_response(
            "```json\n{\"thought\": \"¡Al lago!\", \"emotion\": \"EXCITED\", \"action\": \"lake_swim\"}\n```",
            RobotId::Pixel,
            None,
        );
        assert_eq!(d2.thought, "¡Al lago!");
        assert_eq!(d2.emotion, "EXCITED");
        assert_eq!(d2.action, "lake_swim");

        let d3 = brain.parse_llm_response("thought: ¡Corriendo al trampolín!, emotion: INVALID", RobotId::Rusty, Some("ve al trampolin"));
        assert_eq!(d3.action, "go_trampoline");
        assert_eq!(d3.emotion, "EXCITED");
    }

    #[test]
    fn simulation_steps_smoothly_and_goal_triggers() {
        let mut engine = SimulationEngine::new();
        let input = InputState {
            forward: true,
            shift: true,
            ..Default::default()
        };
        for _ in 0..120 {
            engine.step(1.0 / 60.0, &input);
        }
        assert!(engine.pack.player().speed_scalar > 1.0);

        // Place soccer ball inside goal box and step once
        engine.world.balls[0].pos = Vec3::new(24.0, 1.0, 40.0);
        engine.world.balls[0].velocity = Vec3::new(-1.0, 0.0, 0.0);
        engine.step(0.016, &InputState::default());
        assert_eq!(engine.world.goal_score, 1);
    }

    #[test]
    fn disco_party_emits_beat_clock_not_every_frame() {
        let mut engine = SimulationEngine::new();
        let mut audio = Vec::new();
        engine.world.trigger_disco_party(&mut audio);
        audio.clear();
        for _ in 0..60 {
            engine.world.update(1.0 / 60.0, &mut audio);
        }
        let beats = audio
            .iter()
            .filter(|e| matches!(e.kind, AudioKind::DiscoBeat(_)))
            .count();
        assert!(
            (3..=6).contains(&beats),
            "Expected ~4-5 disco steps per second at 128 BPM, got {}",
            beats
        );
    }

    #[test]
    fn neck_look_at_behind_does_not_flip_pitch_sign() {
        let mut dog = ChibiRobotDog::new(RobotId::Sparky, true, Vec3::ZERO);
        dog.look_at(Vec3::new(0.0, 3.0, -5.0)); // high target directly behind
        for _ in 0..30 {
            dog.update_secondary(0.05);
        }
        // Looking UP (y=3.0 > 1.2) should pitch neck negative (looking up), NOT inverted positive
        assert!(dog.pose.neck_rot.x < 0.0, "Expected upward neck pitch (<0), got {}", dog.pose.neck_rot.x);
    }
}
