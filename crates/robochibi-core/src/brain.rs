use crate::animations::AnimId;
use crate::audio_events::{AudioEvent, AudioKind};
use crate::emotions::{EmotionId, EmotionParticleSystem};
use crate::pack::{lerp_angle, RobotPackManager};
use crate::robot::RobotId;
use crate::vision::RobotVisionSystem;
use crate::world::{WorldState, MAP_PLAY_LIMIT};
use glam::Vec3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventedMovement {
    pub name: String,
    pub sequence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainDecision {
    pub thought: String,
    pub emotion: String,
    pub action: String,
    pub interaction: Option<String>,
    pub invent_movement: Option<InventedMovement>,
    pub remember: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ArrivalTask {
    None,
    FetchToBall { human_pos: [f32; 3], ball_idx: usize },
    FetchReturn { ball_idx: usize },
    ScentFind,
    PatrolStep(usize),
    SlalomRing(usize),
    SlalomLeap { ring_idx: usize, progress: f32 },
    SoccerKick,
    TrampolineBounce(u8),
    SlideApproach,
    SlideClimbWait(f32),
    LakeEntry,
    LakeSwimming(f32),
    LakeExit,
    SpeedRaceFinish,
    DigTreasure(Option<usize>),
    DigRevealWait { spot_idx: Option<usize>, timer: f32 },
    HuntButterfly,
    ShadeNapWalk,
    ShadeNapSpin(f32),
    GoPlayground,
    GoTrampoline,
    GoCarousel,
    GoBall,
    GoDisco,
    GoSnack,
    GoDoghouse,
    GoFountain,
    GoBridge,
    GoSeesaw,
    GoBallpit,
    GoTunnel,
    GoTarget,
    GoPinata,
    GoRobot(RobotId),
}

#[derive(Debug, Clone)]
pub enum BrainUiEvent {
    ThoughtUpdated { robot_name: String, thought: String },
    ChatResponse { robot_name: String, thought: String, action: String },
    JournalEntry { author: String, emotion: String, thought: String },
    LearnedTrick { name: String, description: String, sequence: Vec<String>, created_by: String },
    SpeakThought { thought: String, pitch: f32 },
}

pub struct RobotBrain {
    pub last_thought: String,
    pub is_navigating: bool,
    pub nav_target: Option<Vec3>,
    pub nav_speed: f32,
    pub nav_timer: f32,
    pub nav_max_time: f32,
    pub nav_stuck_time: f32,
    pub nav_last_pos: Vec3,
    pub arrival_task: ArrivalTask,
    pub active_subtask: ArrivalTask,
    pub chase_tail_timer: Option<f32>,
    pub chorus_pending: Vec<(RobotId, f32, Vec3)>,
    pub ui_events: Vec<BrainUiEvent>,
    rng: u64,
}

impl RobotBrain {
    pub fn new() -> Self {
        Self {
            last_thought: "Iniciando mis sensores en el prado verde...".into(),
            is_navigating: false,
            nav_target: None,
            nav_speed: 4.8,
            nav_timer: 0.0,
            nav_max_time: 16.0,
            nav_stuck_time: 0.0,
            nav_last_pos: Vec3::ZERO,
            arrival_task: ArrivalTask::None,
            active_subtask: ArrivalTask::None,
            chase_tail_timer: None,
            chorus_pending: Vec::new(),
            ui_events: Vec::new(),
            rng: 0xfeedfacecafebeef,
        }
    }

    fn rand_f32(&mut self) -> f32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        ((self.rng & 0xffffff) as f32) / 16777216.0
    }

    pub fn cancel_navigation(&mut self) {
        self.is_navigating = false;
        self.nav_target = None;
        self.arrival_task = ArrivalTask::None;
        self.active_subtask = ArrivalTask::None;
        self.chase_tail_timer = None;
        self.chorus_pending.clear();
    }

    pub fn build_sensory_context_json(
        &self,
        pack: &RobotPackManager,
        world: &WorldState,
        vision: &RobotVisionSystem,
        recent_memories: &[String],
        user_command: Option<&str>,
    ) -> serde_json::Value {
        let dog = pack.player();
        let anim_str = pack.anims[pack.active_idx].current_anim.as_str();
        let body = RobotVisionSystem::get_body_state(dog, anim_str, world);
        let sees = vision.get_visual_snapshot(dog, &pack.dogs, pack.active_idx, world);
        serde_json::json!({
            "robot_active": dog.id.name(),
            "title": dog.profile().title,
            "body": body,
            "canine_drives": {
                "energy": dog.energy.round() as i32,
                "affection": dog.affection.round() as i32,
                "hydration": dog.hydration.round() as i32,
                "curiosity": dog.curiosity.round() as i32,
                "playfulness": dog.playfulness.round() as i32
            },
            "sees": sees,
            "holding_in_mouth": if dog.carried_ball_idx.is_some() { "Pelota de juego" } else { "nada" },
            "recent_memories": recent_memories,
            "user_command": user_command
        })
    }

    pub fn build_system_prompt(dog_id: RobotId, custom_system_prompt: &str, drives_json: &str) -> String {
        let p = dog_id.profile();
        let base = format!(
            "Eres {} ({}), un perrito robot inteligente con cognición canina avanzada, etología y libre albedrío en un mundo virtual 3D.\n\
            Tu personalidad: {}.\n\
            Tus impulsos biológicos caninos actuales son: {}.\n\
            Lugares interactivos en el mundo:\n\
            - \"lago\": Lago de Cristal con agua fresca reflectante y bote flotante.\n\
            - \"trampolin\": Cama elástica para dar súper saltos en el aire.\n\
            - \"carrusel\": Carrusel mecánico giratorio para pasear.\n\
            - \"porteria\": Cancha con pelota de fútbol interactiva.\n\
            - \"disco\": Pista de baile con luces neón y música.\n\
            - \"snack\": Estación de galletas cibernéticas que recargan energía al 100%.\n\
            - \"casita\": Estación de recarga y descanso.\n\
            - \"manada\": Tus amigos perros robots (Sparky, Bolt, Pixel, Luna, Rusty).\n\n\
            Acciones y comportamientos caninos que puedes ejecutar:\n\
            - Conducta canina natural: playBow, headTilt, bellyRub, beg, shakeOff, nuzzle, fetch_ball, praise_burst, chorus_howl, scent_track.\n\
            - Movimientos: walk, run, sit, lieDown, jump, wagTail, bark, sniff, scratch, backflip, spin, roll, wave, recharge, dig, howl, dance, sneak.\n\
            - Navegación: go_lake, go_playground, go_ball, go_trampoline, go_carousel, go_soccer_goal, go_disco, go_snack, go_doghouse, go_fountain, go_bridge, go_seesaw, go_ballpit, go_slide, go_tunnel, go_target, go_pinata, go_robot_Sparky, go_robot_Bolt, go_robot_Pixel, go_robot_Luna, go_robot_Rusty, call_pack.\n\
            - Emociones: HAPPY, CURIOUS, LOVING, EXCITED, SLEEPY, ALERT, MISCHIEVOUS, PROUD, SCARED, HUNGRY, PARTY, CONFUSED.\n\n\
            Responde SIEMPRE con un objeto JSON válido con este formato exacto:\n\
            {{\n  \"thought\": \"Tu pensamiento o ladrido en primera persona acorde a tu psicología canina\",\n  \"emotion\": \"HAPPY\",\n  \"action\": \"playBow\",\n  \"interaction\": \"bounce_trampoline | kick_ball | eat_snack | drink_water | none\",\n  \"invent_movement\": {{\"name\": \"Nombre Truco\", \"sequence\": [\"jump\", \"spin\", \"backflip\"]}},\n  \"remember\": \"recuerdo clave para guardar en disco\"\n}}",
            p.name, p.title, p.description, drives_json
        );
        if custom_system_prompt.trim().is_empty() {
            base
        } else {
            format!("{}\n\n{}", custom_system_prompt.trim(), base)
        }
    }

    pub fn clean_thought(raw: &str) -> String {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return "¡Guau guau! ¡Entendido!".into();
        }
        // Try extracting "thought": "..."
        if let Some(idx) = trimmed.to_ascii_lowercase().find("thought") {
            let after = &trimmed[idx + 7..];
            if let Some(colon) = after.find(':') {
                let val_part = after[colon + 1..].trim_start();
                let quote = val_part.chars().next();
                if quote == Some('"') || quote == Some('\'') {
                    let q = quote.unwrap();
                    let rest = &val_part[1..];
                    if let Some(end_q) = rest.find(q) {
                        let candidate = rest[..end_q].trim();
                        if !candidate.is_empty() {
                            return candidate.to_string();
                        }
                    }
                } else {
                    let end = val_part.find([',', '}', '\n']).unwrap_or(val_part.len());
                    let candidate = val_part[..end].trim().trim_matches('"').trim_matches('\'');
                    if !candidate.is_empty() {
                        return candidate.to_string();
                    }
                }
            }
        }
        let cleaned: String = trimmed
            .replace(['{', '}', '"', '\\'], "")
            .trim()
            .to_string();
        if cleaned.is_empty() {
            "¡Guau guau!".into()
        } else {
            cleaned
        }
    }

    pub fn parse_llm_response(&mut self, content: &str, robot_id: RobotId, user_cmd: Option<&str>) -> BrainDecision {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return self.heuristic_decision(robot_id, user_cmd);
        }

        let mut json_slice = "";
        if let Some(start_fence) = trimmed.find("```") {
            let after = &trimmed[start_fence + 3..];
            let body = if let Some(rest) = after.strip_prefix("json") {
                rest
            } else {
                after
            };
            if let Some(end_fence) = body.find("```") {
                json_slice = body[..end_fence].trim();
            }
        }
        if json_slice.is_empty() {
            if let (Some(fb), Some(lb)) = (trimmed.find('{'), trimmed.rfind('}')) {
                if lb > fb {
                    json_slice = trimmed[fb..=lb].trim();
                }
            }
        }

        if !json_slice.is_empty() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_slice) {
                if let Some(obj) = val.as_object() {
                    let thought_raw = obj
                        .get("thought")
                        .and_then(|v| v.as_str())
                        .unwrap_or_else(|| &trimmed[..trimmed.len().min(120)]);
                    let mut emotion = obj
                        .get("emotion")
                        .and_then(|v| v.as_str())
                        .unwrap_or("HAPPY")
                        .to_ascii_uppercase();
                    if EmotionId::from_str_loose(&emotion).is_none() {
                        emotion = "HAPPY".into();
                    }
                    let action = obj
                        .get("action")
                        .and_then(|v| v.as_str())
                        .unwrap_or("wagTail")
                        .to_string();
                    let interaction = obj
                        .get("interaction")
                        .and_then(|v| v.as_str())
                        .filter(|s| *s != "none" && !s.is_empty())
                        .map(|s| s.to_string());
                    let remember = obj
                        .get("remember")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                    let invent_movement = obj.get("invent_movement").and_then(|im| {
                        let name = im.get("name")?.as_str()?.to_string();
                        let seq: Vec<String> = im
                            .get("sequence")?
                            .as_array()?
                            .iter()
                            .filter_map(|x| x.as_str().map(|s| s.to_string()))
                            .collect();
                        if seq.is_empty() {
                            None
                        } else {
                            Some(InventedMovement { name, sequence: seq })
                        }
                    });
                    return BrainDecision {
                        thought: Self::clean_thought(thought_raw),
                        emotion,
                        action,
                        interaction,
                        invent_movement,
                        remember,
                    };
                }
            }
        }

        self.extract_intent_from_text(robot_id, Some(trimmed), user_cmd)
    }

    pub fn extract_intent_from_text(
        &mut self,
        robot_id: RobotId,
        text: Option<&str>,
        user_cmd: Option<&str>,
    ) -> BrainDecision {
        let combined = format!("{} {}", user_cmd.unwrap_or(""), text.unwrap_or("")).to_lowercase();
        let has_any = |needles: &[&str]| needles.iter().any(|n| combined.contains(n));

        let mut thought = text
            .map(Self::clean_thought)
            .unwrap_or_else(|| "¡Guau! ¡Enseguida lo hago!".into());
        let mut emotion = "HAPPY".to_string();
        let mut action = "wagTail".to_string();
        let mut interaction: Option<String> = None;
        let mut invent: Option<InventedMovement> = None;
        let remember: Option<String> = None;

        if has_any(&[
            "buen chico", "buena chica", "good boy", "good girl", "hermoso", "precioso",
            "te quiero", "te amo", "lindo perro", "crack", "campeón", "campeon", "bien hecho", "buen perrito",
        ]) {
            return BrainDecision {
                thought: "¡Guau guau! ❤️ ¡Gracias humano! ¡Me siento el cachorro más feliz y leal del mundo!".into(),
                emotion: "LOVING".into(),
                action: "praise_burst".into(),
                interaction: None,
                invent_movement: None,
                remember: Some("Mi humano me dijo \"buen chico\"; sentí una gran felicidad.".into()),
            };
        }

        if has_any(&[
            "busca la pelota", "trae la pelota", "ve por la pelota", "juega a la pelota",
            "fetch", "ve por el balón", "ve por el balon", "tráemela", "traemela",
        ]) {
            return BrainDecision {
                thought: "¡Allá voy! ¡Voy a perseguir la pelota a toda velocidad, la atraparé y te la traeré a tus pies!".into(),
                emotion: "EXCITED".into(),
                action: "fetch_ball".into(),
                interaction: None,
                invent_movement: None,
                remember: Some("Jugamos a traer la pelota.".into()),
            };
        }

        if has_any(&["juguemos", "a jugar", "reverencia", "postura de juego", "play bow"]) {
            action = "playBow".into();
            emotion = "EXCITED".into();
            thought = "¡Hago una reverencia de juego! ¡Bajo el pecho y levanto la colita para invitarte a jugar!".into();
        } else if has_any(&["ladea la cabeza", "qué dices", "que dices", "escucha", "atento", "head tilt"]) {
            action = "headTilt".into();
            emotion = "CURIOUS".into();
            thought = "Ladeo mi cabecita a 25 grados y oriento mis orejas para escucharte con atención.".into();
        } else if has_any(&["panza arriba", "barriga", "cosquillas", "belly rub", "acaricia la panza"]) {
            action = "bellyRub".into();
            emotion = "LOVING".into();
            thought = "Me tiro de espaldas panza arriba con las patitas al aire... ¡Mimos por favor!".into();
        } else if has_any(&["pide", "dos patas", "suplica", "beg"]) {
            action = "beg".into();
            emotion = "HUNGRY".into();
            thought = "Me siento sobre mis patitas traseras y levanto las delanteras pidiendo con ternura.".into();
        } else if has_any(&["sacúdete", "sacudete", "sacudida", "shake off"]) {
            action = "shakeOff".into();
            emotion = "HAPPY".into();
            thought = "Me sacudo enérgicamente de cabeza a cola para liberar energía.".into();
        } else if has_any(&["hocico", "beso", "mimos", "boop", "nuzzle"]) {
            action = "nuzzle".into();
            emotion = "LOVING".into();
            thought = "Acerco mi hocico húmedo suavemente para darte un cariñoso \"boop\".".into();
        } else if has_any(&["aúllen todos", "aullen todos", "aullido de manada", "coro", "chorus"]) {
            action = "chorus_howl".into();
            emotion = "EXCITED".into();
            thought = "¡Auuuú! ¡Convoco a toda la manada a un coro de aullidos al cielo!".into();
        } else if has_any(&["rastrea", "olfatea el suelo", "sigue el rastro", "scent"]) {
            action = "scent_track".into();
            emotion = "CURIOUS".into();
            thought = "Bajo mi nariz cibernética al suelo para seguir los rastros de olor en la hierba.".into();
        } else if has_any(&["patrull", "perímetro", "perimetro", "vigil"]) {
            action = "patrol_perimeter".into();
            emotion = "ALERT".into();
            thought = "¡Iniciando ronda de vigilancia por los límites y pinos del parque!".into();
        } else if has_any(&["persigue tu cola", "muérdete la cola", "muerdete la cola", "cola gira", "chase tail"]) {
            action = "chase_tail".into();
            emotion = "EXCITED".into();
            thought = "¡A ver si atrapo mi propia cola! ¡Gira, gira sin parar!".into();
        } else if has_any(&["aros", "slalom", "salto de aros"]) {
            action = "slalom_rings".into();
            emotion = "EXCITED".into();
            thought = "¡Voy directo a cruzar el circuito de aros con saltos parabólicos!".into();
        } else if has_any(&["remata", "chuta", "golpe fuerte", "patea a portería", "patea a porteria", "mete gol"]) {
            action = "soccer_kick".into();
            emotion = "EXCITED".into();
            thought = "¡Me coloco detrás del balón gigante y suelto un cañonazo a la portería!".into();
        } else if has_any(&["salta en el trampolín", "salta en el trampolin", "pirueta trampolín", "pirueta trampolin", "súper salto", "super salto"]) {
            action = "trampoline_trick".into();
            emotion = "EXCITED".into();
            thought = "¡A la cama elástica a dar rebotes cada vez más altos con voltereta!".into();
        } else if has_any(&["sube al tobogán", "sube al tobogan", "deslízate", "deslizate", "lánzate por el tobogán", "lanzate por el tobogan"]) {
            action = "slide_down".into();
            emotion = "EXCITED".into();
            thought = "¡Subo la torre del tobogán y me lanzo deslizándome hasta abajo!".into();
        } else if has_any(&["nada en el lago", "chapotear", "al agua", "báñate", "banate"]) {
            action = "lake_swim".into();
            emotion = "HAPPY".into();
            thought = "¡Al lago a chapotear y nadar con mis patitas bajo el agua fresca!".into();
        } else if has_any(&["la traes", "juguemos a la traes", "atrápame", "atrapame", "tag"]) {
            action = "play_tag".into();
            emotion = "EXCITED".into();
            thought = "¡Juguemos a la traes! ¡Toco a un amigo y salgo corriendo!".into();
        } else if has_any(&["carrera", "competencia", "reto de velocidad", "race"]) {
            action = "speed_race".into();
            emotion = "EXCITED".into();
            thought = "¡Desafío de carrera! ¡Nos alineamos y a toda velocidad a la meta!".into();
        } else if has_any(&["chismorreo", "reunión en círculo", "reunion en circulo", "júntense", "juntense"]) {
            action = "pack_gossip".into();
            emotion = "HAPPY".into();
            thought = "¡Reunión secreta de la manada en círculo para saludarnos y charlar!".into();
        } else if has_any(&["desentierra", "tesoro", "cava tesoro", "busca tesoro"]) {
            action = "dig_treasure".into();
            emotion = "CURIOUS".into();
            thought = "¡Mis sensores olfatean algo enterrado cerca de un pino! ¡A cavar!".into();
        } else if has_any(&["caza mariposa", "atrapa la mariposa", "mariposa"]) {
            action = "hunt_butterfly".into();
            emotion = "CURIOUS".into();
            thought = "¡Veo una mariposa brillante flotando bajo! Modo sigilo activado... ¡y salto!".into();
        } else if has_any(&["siesta", "sombra", "descansa bajo el pino", "recarga en la sombra"]) {
            action = "shade_nap".into();
            emotion = "SLEEPY".into();
            thought = "Mis baterías piden una siesta relajante bajo la sombra fresca de un pino... Zzz.".into();
        } else if has_any(&["mimos a la cámara", "mimos a la camara", "panza arriba cámara", "acércate a mí", "acercate a mi"]) {
            action = "beg_pets".into();
            emotion = "LOVING".into();
            thought = "¡Voy corriendo hacia ti para pedirte mimos con la pancita arriba!".into();
        }

        if has_any(&["fiesta", "disco", "bail", "música", "musica", "dj"]) {
            emotion = "PARTY".into();
        } else if has_any(&["travies", "broma", "pícaro", "picaro", "mischief"]) {
            emotion = "MISCHIEVOUS".into();
        } else if has_any(&["pro", "crack", "orgull", "campeón", "campeon", "sunglasses"]) {
            emotion = "PROUD".into();
        } else if has_any(&["miedo", "asust", "peligro", "cuidado", "scared"]) {
            emotion = "SCARED".into();
        } else if has_any(&["hambre", "galleta", "snack", "com", "rico", "delici"]) {
            emotion = "HUNGRY".into();
        } else if has_any(&["qué", "que ", "cómo", "como ", "dónde", "donde", "confund", "despist"]) {
            emotion = "CONFUSED".into();
        } else if has_any(&["amor", "te quiero", "lindo", "hermoso", "cariñ", "carin"]) {
            emotion = "LOVING".into();
        } else if has_any(&["explor", "qué ves", "que ves", "busca", "mira", "observ"]) {
            emotion = "CURIOUS".into();
        } else if has_any(&["rápido", "rapido", "corre", "vamos", "salta", "gol", "fútbol", "futbol"]) {
            emotion = "EXCITED".into();
        }

        if action == "wagTail" {
            if has_any(&["lago", "orilla", "bote", "nadar", "lake"]) {
                action = "go_lake".into();
                interaction = Some("drink_water".into());
                thought = "¡Voy corriendo hacia el Lago de Cristal!".into();
            } else if has_any(&["trampolín", "trampolin", "cama elástica", "cama elastica", "rebot"]) {
                action = "go_trampoline".into();
                interaction = Some("bounce_trampoline".into());
                emotion = "EXCITED".into();
                thought = "¡Vamos al trampolín a saltar hasta las nubes!".into();
            } else if has_any(&["carrusel", "rueda", "giratorio", "carousel"]) {
                action = "go_carousel".into();
                interaction = Some("ride_carousel".into());
                thought = "¡Al carrusel giratorio a dar vueltas!".into();
            } else if has_any(&["pelota", "balón", "balon", "fútbol", "futbol", "portería", "porteria", "arco", "patea"]) {
                action = "go_ball".into();
                interaction = Some("kick_ball".into());
                emotion = "EXCITED".into();
                thought = "¡A jugar al fútbol! ¡Voy por el balón para meter gol!".into();
            } else if has_any(&["disco", "fiesta", "pista de baile", "perrea"]) {
                action = "go_disco".into();
                interaction = Some("dance_disco".into());
                emotion = "PARTY".into();
                thought = "¡Activando modo fiesta en la pista de baile disco!".into();
            } else if has_any(&["galleta", "snack", "comer", "comida", "hambre"]) {
                action = "go_snack".into();
                interaction = Some("eat_snack".into());
                emotion = "HUNGRY".into();
                thought = "¡Qué rico! ¡Voy por una ciborgalleta energética!".into();
            } else if has_any(&["parque", "juegos", "playground"]) {
                action = "go_playground".into();
                thought = "¡Rumbo al centro del parque de juegos!".into();
            } else if has_any(&["casita", "doghouse", "estación", "estacion", "recarg"]) {
                action = "go_doghouse".into();
                interaction = Some("recharge".into());
                emotion = "SLEEPY".into();
                thought = "Voy a mi casita cibernética para recargar baterías.".into();
            } else if has_any(&["fuente", "agua fresca", "sed", "bebe agua", "hidrat"]) {
                action = "go_fountain".into();
                interaction = Some("drink_water".into());
                emotion = "HAPPY".into();
                thought = "¡Voy a la fuente cibernética a beber agua fresca!".into();
            } else if has_any(&["puente", "cruza el puente", "bridge"]) {
                action = "go_bridge".into();
                interaction = Some("cross_bridge".into());
                emotion = "CURIOUS".into();
                thought = "¡Vamos a cruzar el puente arqueado de madera!".into();
            } else if has_any(&["sube y baja", "balancín", "balancin", "seesaw"]) {
                action = "go_seesaw".into();
                interaction = Some("ride_seesaw".into());
                emotion = "EXCITED".into();
                thought = "¡Al balancín cibernético a balancearnos!".into();
            } else if has_any(&["piscina", "alberca", "pelotitas", "ballpit"]) {
                action = "go_ballpit".into();
                emotion = "EXCITED".into();
                thought = "¡A zambullirme en la piscina de pelotas de colores!".into();
            } else if has_any(&["tobogán", "tobogan", "resbaladilla", "slide"]) {
                action = "go_slide".into();
                emotion = "EXCITED".into();
                thought = "¡Voy al tobogán de agilidad!".into();
            } else if has_any(&["túnel", "tunel", "valla", "obstáculo", "obstaculo", "circuito"]) {
                action = "go_tunnel".into();
                emotion = "CURIOUS".into();
                thought = "¡A cruzar a toda velocidad el túnel de agilidad!".into();
            } else if has_any(&["diana", "tiro al blanco", "puntería", "punteria", "target"]) {
                action = "go_target".into();
                emotion = "PROUD".into();
                thought = "¡Vamos a la diana de tiro a probar mi puntería!".into();
            } else if has_any(&["piñata", "pinata", "golpea la piñata"]) {
                action = "go_pinata".into();
                emotion = "EXCITED".into();
                thought = "¡A saltar bajo la piñata para que suelte galletas!".into();
            } else if has_any(&["bolt"]) {
                action = "go_robot_Bolt".into();
                thought = "¡Voy a buscar a mi veloz amigo Bolt!".into();
            } else if has_any(&["pixel"]) {
                action = "go_robot_Pixel".into();
                thought = "¡Voy a saludar a Pixel!".into();
            } else if has_any(&["luna"]) {
                action = "go_robot_Luna".into();
                thought = "¡Voy corriendo a ver a mi amiga Luna!".into();
            } else if has_any(&["rusty"]) {
                action = "go_robot_Rusty".into();
                thought = "¡Vamos a ver qué acrobacias hace Rusty!".into();
            } else if has_any(&["sparky"]) {
                action = "go_robot_Sparky".into();
                thought = "¡Voy con Sparky!".into();
            } else if has_any(&["todos", "manada", "vengan", "reunión", "reunion", "pack"]) {
                action = "call_pack".into();
                thought = "¡Auuuú! ¡Llamando a toda la manada!".into();
            } else if has_any(&["rueda", "maroma", "roll", "ruédate", "ruedate"]) {
                action = "roll".into();
            } else if has_any(&["saluda", "la pata", "chócalas", "chocalas", "wave", "hola"]) {
                action = "wave".into();
            } else if has_any(&["aúlla", "aulla", "aullido", "howl"]) {
                action = "howl".into();
            } else if has_any(&["cava", "entierra", "rasca"]) {
                action = "dig".into();
            } else if has_any(&["baila", "dance", "meneate"]) {
                action = "dance".into();
                emotion = "PARTY".into();
            } else if has_any(&["sigilo", "espía", "espia", "agachado", "sneak"]) {
                action = "sneak".into();
            } else if has_any(&["voltereta", "mortal", "backflip"]) {
                action = "backflip".into();
                emotion = "PROUD".into();
            } else if has_any(&["gira", "vuelta", "spin"]) {
                action = "spin".into();
            } else if has_any(&["salta", "brinca", "jump"]) {
                action = "jump".into();
            } else if has_any(&["ladra", "guau", "bark"]) {
                action = "bark".into();
            } else if has_any(&["siéntate", "sientate", "sentado", "sit"]) {
                action = "sit".into();
            } else if has_any(&["acuéstate", "acuestate", "échate", "echate", "túmbate", "tumbate", "dormir"]) {
                action = "lieDown".into();
                emotion = "SLEEPY".into();
            } else if has_any(&["olfatea", "huele", "sniff"]) {
                action = "sniff".into();
            }
        }

        if has_any(&["aprende", "inventa", "nuevo truco", "coreografía", "coreografia"]) {
            let p_name = robot_id.name();
            let titles = [
                format!("Tornado Cibernético de {}", p_name),
                format!("Súper Combo Lunar de {}", p_name),
                format!("Acrobacia Rayo de {}", p_name),
                format!("Baile Sónico de {}", p_name),
            ];
            let moves = ["jump", "spin", "backflip", "wave", "dance", "roll", "howl"];
            let r_title = titles[(self.rand_f32() * titles.len() as f32) as usize % titles.len()].clone();
            let m1 = moves[(self.rand_f32() * moves.len() as f32) as usize % moves.len()].to_string();
            let m2 = moves[(self.rand_f32() * moves.len() as f32) as usize % moves.len()].to_string();
            thought = format!("¡He inventado un nuevo truco llamado \"{}\"!", r_title);
            emotion = "PROUD".into();
            invent = Some(InventedMovement {
                name: r_title,
                sequence: vec![m1, m2, "wagTail".into()],
            });
        }

        BrainDecision {
            thought,
            emotion,
            action,
            interaction,
            invent_movement: invent,
            remember,
        }
    }

    pub fn heuristic_decision(&mut self, robot_id: RobotId, user_cmd: Option<&str>) -> BrainDecision {
        if let Some(cmd) = user_cmd.filter(|s| !s.trim().is_empty()) {
            return self.extract_intent_from_text(robot_id, None, Some(cmd));
        }

        let p = robot_id.profile();
        let (mut thought, mut emotion, action, interaction) = match robot_id {
            RobotId::Bolt => (
                "¡Mis propulsores están al máximo! ¡A toda velocidad hacia la pelota!".to_string(),
                "EXCITED".to_string(),
                "go_ball".to_string(),
                Some("kick_ball".to_string()),
            ),
            RobotId::Pixel => (
                "Escaneando las ondas límpidas del lago de cristal.".to_string(),
                "CURIOUS".to_string(),
                "go_lake".to_string(),
                Some("drink_water".to_string()),
            ),
            RobotId::Luna => (
                "Qué hermoso es pasear bajo este cielo tranquilo.".to_string(),
                "LOVING".to_string(),
                "sit".to_string(),
                None,
            ),
            RobotId::Rusty => (
                "¡Voy a dar un salto acrobático triple en el trampolín!".to_string(),
                "EXCITED".to_string(),
                "go_trampoline".to_string(),
                Some("bounce_trampoline".to_string()),
            ),
            RobotId::Sparky => {
                let idx = (self.rand_f32() * p.thoughts.len() as f32) as usize % p.thoughts.len();
                (
                    p.thoughts[idx].to_string(),
                    "HAPPY".to_string(),
                    "wagTail".to_string(),
                    None,
                )
            }
        };

        let mut invent = None;
        if self.rand_f32() < 0.2 {
            let names = [
                format!("Salto Estelar de {}", p.name),
                format!("Giro Veloz {}", p.name),
                "Ola Robótica".to_string(),
            ];
            let seqs = [
                vec!["jump".into(), "backflip".into(), "wagTail".into()],
                vec!["dance".into(), "spin".into(), "wave".into()],
                vec!["roll".into(), "howl".into(), "wagTail".into()],
            ];
            let r = (self.rand_f32() * 3.0) as usize % 3;
            thought = format!("¡Acabo de crear: {}!", names[r]);
            emotion = "PROUD".into();
            invent = Some(InventedMovement {
                name: names[r].clone(),
                sequence: seqs[r].clone(),
            });
        }

        BrainDecision {
            thought,
            emotion,
            action,
            interaction,
            invent_movement: invent,
            remember: None,
        }
    }

    pub fn apply_decision(
        &mut self,
        dec: &BrainDecision,
        already_dispatched_action: Option<&str>,
        pack: &mut RobotPackManager,
        world: &mut WorldState,
        particles: &mut EmotionParticleSystem,
        audio_out: &mut Vec<AudioEvent>,
    ) {
        let idx = pack.active_idx;
        let robot_name = pack.dogs[idx].id.name().to_string();
        let robot_pitch = pack.dogs[idx].profile().voice_pitch;

        if let Some(emo) = EmotionId::from_str_loose(&dec.emotion) {
            pack.dogs[idx].set_emotion(emo, audio_out, true);
            particles.spawn_burst(pack.dogs[idx].position, emo);
        }

        self.last_thought = if dec.thought.is_empty() {
            "Explorando...".into()
        } else {
            dec.thought.clone()
        };

        self.ui_events.push(BrainUiEvent::ThoughtUpdated {
            robot_name: robot_name.clone(),
            thought: self.last_thought.clone(),
        });

        if let Some(im) = &dec.invent_movement {
            if !im.name.is_empty() && !im.sequence.is_empty() {
                self.ui_events.push(BrainUiEvent::LearnedTrick {
                    name: im.name.clone(),
                    description: format!("Inventado por {}", robot_name),
                    sequence: im.sequence.clone(),
                    created_by: robot_name.clone(),
                });
                audio_out.push(AudioEvent {
                    kind: AudioKind::TrickSuccess,
                    world_pos: pack.dogs[idx].position,
                    pitch: 1.0,
                });
                let seq: Vec<AnimId> = im
                    .sequence
                    .iter()
                    .filter_map(|s| AnimId::from_str(s))
                    .collect();
                if !seq.is_empty() {
                    pack.anims[idx].play_sequence(seq, &mut pack.dogs[idx]);
                }
            }
        }

        let journal_emo = if dec.emotion.is_empty() {
            "Curioso".to_string()
        } else {
            dec.emotion.clone()
        };
        let journal_txt = dec
            .remember
            .clone()
            .unwrap_or_else(|| dec.thought.clone());
        if !journal_txt.is_empty() {
            self.ui_events.push(BrainUiEvent::JournalEntry {
                author: robot_name.clone(),
                emotion: journal_emo,
                thought: journal_txt,
            });
        }

        if !dec.thought.is_empty() {
            self.ui_events.push(BrainUiEvent::ChatResponse {
                robot_name,
                thought: dec.thought.clone(),
                action: dec.action.clone(),
            });
            self.ui_events.push(BrainUiEvent::SpeakThought {
                thought: dec.thought.clone(),
                pitch: robot_pitch,
            });
        }

        if already_dispatched_action != Some(dec.action.as_str()) {
            self.execute_action(&dec.action, pack, world, particles, audio_out);
        }
    }

    pub fn navigate_toward(
        &mut self,
        target: Vec3,
        speed: f32,
        anim: AnimId,
        task: ArrivalTask,
        pack: &mut RobotPackManager,
    ) {
        let idx = pack.active_idx;
        let mult = pack.dogs[idx].profile().speed_multiplier;
        pack.anims[idx].play(anim, 0.0, &mut pack.dogs[idx]);
        self.nav_target = Some(target);
        self.nav_speed = speed * mult;
        self.is_navigating = true;
        self.nav_timer = 0.0;
        self.nav_max_time = 16.0;
        self.nav_stuck_time = 0.0;
        self.nav_last_pos = pack.dogs[idx].position;
        self.arrival_task = task;
    }

    pub fn execute_action(
        &mut self,
        action: &str,
        pack: &mut RobotPackManager,
        world: &mut WorldState,
        particles: &mut EmotionParticleSystem,
        audio_out: &mut Vec<AudioEvent>,
    ) {
        if action.is_empty() {
            return;
        }
        self.cancel_navigation();
        let idx = pack.active_idx;
        let active_pos = pack.dogs[idx].position;
        let active_name = pack.dogs[idx].id.name().to_string();
        let active_pitch = pack.dogs[idx].profile().voice_pitch;

        match action {
            "call_pack" => {
                pack.call_pack_to_player(world, audio_out);
                audio_out.push(AudioEvent { kind: AudioKind::Howl, world_pos: active_pos, pitch: active_pitch });
                pack.anims[idx].play(AnimId::Howl, 2.5, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: active_name,
                    emotion: "Orgulloso".into(),
                    thought: "¡Llamé a toda mi manada y nos reunimos en formación!".into(),
                });
            }
            "praise_burst" => {
                pack.dogs[idx].praise(audio_out);
                particles.spawn_burst(active_pos, EmotionId::Loving);
                let anim = if self.rand_f32() < 0.5 { AnimId::BellyRub } else { AnimId::PlayBow };
                pack.anims[idx].play(anim, 3.0, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: active_name,
                    emotion: "Cariñoso".into(),
                    thought: "¡Mi humano me elogió! Sentí una oleada de amor y lealtad perruna.".into(),
                });
            }
            "fetch_ball" => {
                if !world.balls.is_empty() {
                    let bpos = world.balls[0].pos;
                    pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                    audio_out.push(AudioEvent { kind: AudioKind::Yip, world_pos: active_pos, pitch: 1.3 });
                    self.navigate_toward(
                        bpos,
                        7.2,
                        AnimId::Run,
                        ArrivalTask::FetchToBall {
                            human_pos: active_pos.to_array(),
                            ball_idx: 0,
                        },
                        pack,
                    );
                }
            }
            "chorus_howl" => {
                audio_out.push(AudioEvent { kind: AudioKind::Howl, world_pos: active_pos, pitch: active_pitch });
                pack.anims[idx].play(AnimId::Howl, 3.0, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                let mut delay = 0.35f32;
                for i in 0..5 {
                    if i != idx {
                        self.chorus_pending.push((pack.dogs[i].id, delay, active_pos));
                        delay += 0.30;
                    }
                }
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: active_name,
                    emotion: "Emocionado".into(),
                    thought: "¡Iniciamos un coro de aullidos en manada bajo el cielo virtual!".into(),
                });
            }
            "scent_track" => {
                pack.anims[idx].play(AnimId::Sniff, 3.0, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Curious, audio_out, false);
                audio_out.push(AudioEvent { kind: AudioKind::Boop, world_pos: active_pos, pitch: 1.1 });
                let mut nearest = None;
                let mut min_d = f32::INFINITY;
                for s in &world.snacks {
                    let d = active_pos.distance(s.pos);
                    if d < min_d && d > 1.2 {
                        min_d = d;
                        nearest = Some(s.pos);
                    }
                }
                for b in &world.balls {
                    let d = active_pos.distance(b.pos);
                    if d < min_d && d > 1.2 {
                        min_d = d;
                        nearest = Some(b.pos);
                    }
                }
                if let Some(np) = nearest {
                    self.navigate_toward(np, 3.8, AnimId::Walk, ArrivalTask::ScentFind, pack);
                }
            }
            "patrol_perimeter" => {
                self.navigate_toward(Vec3::new(70.0, 0.0, 70.0), 4.2, AnimId::Walk, ArrivalTask::PatrolStep(0), pack);
            }
            "chase_tail" => {
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                pack.anims[idx].play(AnimId::ChaseTail, 3.6, &mut pack.dogs[idx]);
                audio_out.push(AudioEvent { kind: AudioKind::Yip, world_pos: active_pos, pitch: 1.4 });
                self.chase_tail_timer = Some(3.6);
            }
            "slalom_rings" => {
                if !world.slalom_rings.is_empty() {
                    let entry = world.slalom_rings[0].entry_pos;
                    self.navigate_toward(entry, 6.2, AnimId::Run, ArrivalTask::SlalomRing(0), pack);
                }
            }
            "soccer_kick" => {
                if !world.balls.is_empty() {
                    let goal_pos = Vec3::new(25.0, 1.0, 40.0);
                    let ball_pos = world.balls[0].pos;
                    let kick_dir = (goal_pos - ball_pos).normalize_or_zero();
                    let mut approach = ball_pos - kick_dir * 2.0;
                    approach.y = world.get_height_at(approach.x, approach.z);
                    self.navigate_toward(approach, 7.0, AnimId::Run, ArrivalTask::SoccerKick, pack);
                }
            }
            "trampoline_trick" => {
                self.navigate_toward(Vec3::new(38.0, 0.0, 22.0), 6.0, AnimId::Run, ArrivalTask::TrampolineBounce(0), pack);
            }
            "slide_down" | "go_slide" => {
                self.navigate_toward(Vec3::new(-18.0, 0.0, -34.0), 5.8, AnimId::Run, ArrivalTask::SlideApproach, pack);
            }
            "lake_swim" | "go_lake" => {
                self.navigate_toward(Vec3::new(-55.0, 0.0, -55.0), 5.2, AnimId::Run, ArrivalTask::LakeEntry, pack);
            }
            "play_tag" => pack.start_tag_game(world, audio_out),
            "speed_race" => {
                let dest = pack.start_speed_race(world, audio_out);
                self.navigate_toward(dest, 7.2, AnimId::Run, ArrivalTask::SpeedRaceFinish, pack);
            }
            "pack_gossip" => {
                pack.start_pack_gossip(world, audio_out);
                pack.anims[idx].play(AnimId::WagTail, 3.0, &mut pack.dogs[idx]);
            }
            "dig_treasure" => {
                let mut best: Option<(usize, f32, Vec3)> = None;
                for (si, s) in world.treasure_spots.iter().enumerate() {
                    if !s.dug {
                        let d = (active_pos.x - s.x).hypot(active_pos.z - s.z);
                        if best.map_or(true, |(_, bd, _)| d < bd) {
                            best = Some((si, d, Vec3::new(s.x, 0.0, s.z)));
                        }
                    }
                }
                let (spot_idx, tp) = best
                    .map(|(si, _, p)| (Some(si), p))
                    .unwrap_or((None, active_pos + Vec3::new(2.0, 0.0, 2.0)));
                self.navigate_toward(tp, 4.8, AnimId::Run, ArrivalTask::DigTreasure(spot_idx), pack);
            }
            "hunt_butterfly" => {
                if let Some(bf) = world
                    .butterflies
                    .iter()
                    .min_by(|a, b| a.pos.distance(active_pos).total_cmp(&b.pos.distance(active_pos)))
                {
                    let dest = Vec3::new(bf.pos.x, 0.0, bf.pos.z);
                    self.navigate_toward(dest, 3.2, AnimId::Sneak, ArrivalTask::HuntButterfly, pack);
                }
            }
            "shade_nap" => {
                self.navigate_toward(Vec3::new(-22.0, 0.0, 18.0), 4.0, AnimId::Walk, ArrivalTask::ShadeNapWalk, pack);
            }
            "beg_pets" => {
                let target_look = active_pos + Vec3::new(1.0, 1.0, 2.0);
                pack.dogs[idx].look_at(target_look);
                pack.anims[idx].play(AnimId::BellyRub, 4.0, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Loving, audio_out, false);
                particles.spawn_burst(active_pos, EmotionId::Loving);
                audio_out.push(AudioEvent { kind: AudioKind::Boop, world_pos: active_pos, pitch: 1.4 });
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: active_name,
                    emotion: "Cariñoso".into(),
                    thought: "¡Me puse panza arriba con las patitas al aire esperando tus caricias!".into(),
                });
            }
            "go_playground" => self.navigate_toward(Vec3::new(50.0, 0.0, 40.0), 5.5, AnimId::Run, ArrivalTask::GoPlayground, pack),
            "go_trampoline" => self.navigate_toward(Vec3::new(38.0, 0.0, 22.0), 5.8, AnimId::Run, ArrivalTask::GoTrampoline, pack),
            "go_carousel" => self.navigate_toward(Vec3::new(62.0, 0.0, 26.0), 4.8, AnimId::Walk, ArrivalTask::GoCarousel, pack),
            "go_ball" | "go_soccer_goal" => {
                let bp = world.balls.first().map(|b| b.pos).unwrap_or(Vec3::new(42.0, 0.5, 38.0));
                self.navigate_toward(bp, 6.4, AnimId::Run, ArrivalTask::GoBall, pack);
            }
            "go_disco" => self.navigate_toward(Vec3::new(52.0, 0.0, 56.0), 5.4, AnimId::Run, ArrivalTask::GoDisco, pack),
            "go_snack" => {
                let sp = world.snacks.first().map(|s| s.pos).unwrap_or(Vec3::new(46.0, 0.0, 48.0));
                self.navigate_toward(sp, 5.8, AnimId::Run, ArrivalTask::GoSnack, pack);
            }
            "go_doghouse" => self.navigate_toward(Vec3::new(72.0, 0.0, 52.0), 4.2, AnimId::Walk, ArrivalTask::GoDoghouse, pack),
            "go_fountain" => self.navigate_toward(Vec3::new(12.0, 0.0, 10.0), 5.0, AnimId::Walk, ArrivalTask::GoFountain, pack),
            "go_bridge" => self.navigate_toward(Vec3::new(-46.0, 0.0, -48.0), 4.8, AnimId::Walk, ArrivalTask::GoBridge, pack),
            "go_seesaw" => self.navigate_toward(Vec3::new(48.0, 0.0, 32.0), 5.2, AnimId::Run, ArrivalTask::GoSeesaw, pack),
            "go_ballpit" => self.navigate_toward(Vec3::new(-32.0, 0.0, 48.0), 5.6, AnimId::Run, ArrivalTask::GoBallpit, pack),
            "go_tunnel" => self.navigate_toward(Vec3::new(22.0, 0.0, -50.0), 5.4, AnimId::Run, ArrivalTask::GoTunnel, pack),
            "go_target" => self.navigate_toward(Vec3::new(76.0, 0.0, 18.0), 5.6, AnimId::Run, ArrivalTask::GoTarget, pack),
            "go_pinata" => self.navigate_toward(Vec3::new(-42.0, 0.0, 14.0), 6.0, AnimId::Run, ArrivalTask::GoPinata, pack),
            other if other.starts_with("go_robot_") => {
                if let Some(tid) = RobotId::from_name(&other["go_robot_".len()..]) {
                    let tpos = pack.dogs[RobotPackManager::idx_of(tid)].position;
                    self.navigate_toward(tpos, 5.2, AnimId::Run, ArrivalTask::GoRobot(tid), pack);
                }
            }
            other => {
                if let Some(anim) = AnimId::from_str(other) {
                    if anim == AnimId::Jump {
                        pack.dogs[idx].velocity_y = 7.0;
                        pack.dogs[idx].position.y += 0.15;
                    }
                    pack.anims[idx].play(anim, 2.5, &mut pack.dogs[idx]);
                }
            }
        }
    }

    pub fn update(
        &mut self,
        dt: f32,
        pack: &mut RobotPackManager,
        world: &mut WorldState,
        particles: &mut EmotionParticleSystem,
        audio_out: &mut Vec<AudioEvent>,
    ) {
        let idx = pack.active_idx;
        let name = pack.dogs[idx].id.name().to_string();

        // 1. Chorus howl delayed triggers
        if !self.chorus_pending.is_empty() {
            let mut i = self.chorus_pending.len();
            while i > 0 {
                i -= 1;
                self.chorus_pending[i].1 -= dt;
                if self.chorus_pending[i].1 <= 0.0 {
                    let (rid, _, look_p) = self.chorus_pending.swap_remove(i);
                    let ri = RobotPackManager::idx_of(rid);
                    pack.anims[ri].play(AnimId::Howl, 2.8, &mut pack.dogs[ri]);
                    pack.dogs[ri].set_emotion(EmotionId::Excited, audio_out, false);
                    pack.dogs[ri].look_at(look_p);
                }
            }
        }

        // 2. Chase tail dizzy transition
        if let Some(ref mut ctt) = self.chase_tail_timer {
            *ctt -= dt;
            if *ctt <= 0.0 {
                self.chase_tail_timer = None;
                pack.dogs[idx].set_emotion(EmotionId::Confused, audio_out, false);
                pack.anims[idx].play(AnimId::Dizzy, 2.5, &mut pack.dogs[idx]);
                particles.spawn_burst(pack.dogs[idx].position, EmotionId::Confused);
                audio_out.push(AudioEvent { kind: AudioKind::Confused, world_pos: pack.dogs[idx].position, pitch: 1.0 });
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name.clone(),
                    emotion: "Juguetón".into(),
                    thought: "¡Giré tanto persiguiéndome la cola que me mareé y caí sentado!".into(),
                });
            }
        }

        // 3. Sub-tasks (leaping rings, tramp bounces, lake swim wait, dig wait, shade nap spin)
        match self.active_subtask {
            ArrivalTask::SlalomLeap { ring_idx, progress } => {
                let next_p = progress + dt * 2.2;
                if next_p >= 1.0 {
                    let next_ring = ring_idx + 1;
                    if next_ring >= world.slalom_rings.len() {
                        self.active_subtask = ArrivalTask::None;
                        pack.dogs[idx].set_emotion(EmotionId::Proud, audio_out, false);
                        pack.anims[idx].play(AnimId::Backflip, 1.6, &mut pack.dogs[idx]);
                        audio_out.push(AudioEvent { kind: AudioKind::GoalFanfare, world_pos: pack.dogs[idx].position, pitch: 1.0 });
                        self.ui_events.push(BrainUiEvent::JournalEntry {
                            author: name.clone(),
                            emotion: "Orgulloso".into(),
                            thought: "¡Completé el circuito de aros de agilidad con saltos perfectos!".into(),
                        });
                    } else {
                        self.active_subtask = ArrivalTask::None;
                        let entry = world.slalom_rings[next_ring].entry_pos;
                        self.navigate_toward(entry, 6.2, AnimId::Run, ArrivalTask::SlalomRing(next_ring), pack);
                    }
                } else {
                    let r = &world.slalom_rings[ring_idx];
                    let mut p = r.entry_pos.lerp(r.exit_pos, next_p);
                    p.y = r.entry_pos.y + 1.6 * (4.0 * next_p * (1.0 - next_p));
                    pack.dogs[idx].position = p;
                    self.active_subtask = ArrivalTask::SlalomLeap { ring_idx, progress: next_p };
                }
            }
            ArrivalTask::TrampolineBounce(bounces) => {
                if pack.dogs[idx].position.y <= world.get_height_at(pack.dogs[idx].position.x, pack.dogs[idx].position.z) + 0.15
                    && pack.dogs[idx].velocity_y <= 0.0
                {
                    let next_b = bounces + 1;
                    let force = 5.5 + next_b as f32 * 1.8;
                    pack.dogs[idx].velocity_y = force;
                    pack.dogs[idx].position.y += 0.25;
                    world.trampoline_depress = -0.32;
                    audio_out.push(AudioEvent { kind: AudioKind::Trampoline, world_pos: pack.dogs[idx].position, pitch: 1.0 + next_b as f32 * 0.08 });
                    pack.anims[idx].play(AnimId::Backflip, 1.5, &mut pack.dogs[idx]);
                    pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                    if next_b < 3 {
                        self.active_subtask = ArrivalTask::TrampolineBounce(next_b);
                    } else {
                        self.active_subtask = ArrivalTask::None;
                        self.ui_events.push(BrainUiEvent::JournalEntry {
                            author: name.clone(),
                            emotion: "Juguetón".into(),
                            thought: "¡Hice 3 rebotes consecutivos cada vez más altos con piruetas 360°!".into(),
                        });
                    }
                }
            }
            ArrivalTask::SlideClimbWait(rem) => {
                let nr = rem - dt;
                if nr <= 0.0 {
                    self.active_subtask = ArrivalTask::None;
                    pack.dogs[idx].is_sliding = true;
                    pack.dogs[idx].slide_progress = 0.0;
                    pack.anims[idx].play(AnimId::Roll, 1.4, &mut pack.dogs[idx]);
                    world.log_activity(format!("🎢 ¡{} se lanzó por el tobogán a gran velocidad!", name));
                } else {
                    self.active_subtask = ArrivalTask::SlideClimbWait(nr);
                }
            }
            ArrivalTask::LakeSwimming(rem) => {
                let nr = rem - dt;
                if nr <= 0.0 {
                    self.active_subtask = ArrivalTask::None;
                    self.navigate_toward(Vec3::new(-55.0, 0.0, -55.0), 3.5, AnimId::Swimming, ArrivalTask::LakeExit, pack);
                } else {
                    self.active_subtask = ArrivalTask::LakeSwimming(nr);
                }
            }
            ArrivalTask::DigRevealWait { spot_idx, timer } => {
                let nt = timer - dt;
                if nt <= 0.0 {
                    self.active_subtask = ArrivalTask::None;
                    if let Some(si) = spot_idx {
                        world.reveal_dug_treasure(&name, si, audio_out);
                    }
                    pack.anims[idx].play(AnimId::WagTail, 2.0, &mut pack.dogs[idx]);
                    pack.dogs[idx].set_emotion(EmotionId::Proud, audio_out, false);
                } else {
                    self.active_subtask = ArrivalTask::DigRevealWait { spot_idx, timer: nt };
                }
            }
            ArrivalTask::ShadeNapSpin(ang) => {
                let na = ang + dt * 5.0;
                pack.dogs[idx].rotation_y += dt * 5.0;
                if na >= std::f32::consts::TAU * 2.0 {
                    self.active_subtask = ArrivalTask::None;
                    pack.anims[idx].play(AnimId::LieDown, 6.0, &mut pack.dogs[idx]);
                    pack.dogs[idx].set_emotion(EmotionId::Sleepy, audio_out, false);
                    particles.spawn_burst(pack.dogs[idx].position, EmotionId::Sleepy);
                    pack.dogs[idx].energy = 100.0;
                    self.ui_events.push(BrainUiEvent::JournalEntry {
                        author: name.clone(),
                        emotion: "Somnoliento".into(),
                        thought: "Di dos vueltas sobre mí mismo y me eché a dormir una rica siesta bajo la sombra del pino.".into(),
                    });
                } else {
                    self.active_subtask = ArrivalTask::ShadeNapSpin(na);
                }
            }
            _ => {}
        }

        // 4. Active navigation steering
        if !self.is_navigating {
            return;
        }
        let Some(target) = self.nav_target else {
            self.is_navigating = false;
            return;
        };

        self.nav_timer += dt;
        if self.nav_timer >= self.nav_max_time {
            self.is_navigating = false;
            self.nav_target = None;
            self.arrival_task = ArrivalTask::None;
            pack.anims[idx].play(AnimId::Idle, 0.0, &mut pack.dogs[idx]);
            world.log_activity(format!("🐾 {} completó su misión y queda libre para explorar.", name));
            return;
        }

        let cur_pos = pack.dogs[idx].position;
        let mut diff = target - cur_pos;
        diff.y = 0.0;
        let dist = diff.length();

        let moved = (cur_pos.x - self.nav_last_pos.x).hypot(cur_pos.z - self.nav_last_pos.z);
        self.nav_last_pos = cur_pos;
        let mut arrived = dist < 2.0;

        if moved < 0.045 {
            self.nav_stuck_time += dt;
            if self.nav_stuck_time > 0.65 && dist > 1e-3 {
                let tangent = Vec3::new(-diff.z, 0.0, diff.x).normalize_or_zero();
                pack.dogs[idx].position += tangent * (dt * 4.2);
            }
            if self.nav_stuck_time > 2.2 {
                arrived = true;
            }
        } else {
            self.nav_stuck_time = (self.nav_stuck_time - dt * 2.0).max(0.0);
        }

        if arrived {
            let task = self.arrival_task;
            self.is_navigating = false;
            self.nav_target = None;
            self.arrival_task = ArrivalTask::None;
            pack.anims[idx].play(AnimId::Idle, 0.0, &mut pack.dogs[idx]);
            self.on_arrival(task, pack, world, particles, audio_out);
            return;
        }

        let raw_dir = diff / dist;
        let steered = RobotPackManager::compute_avoidance_dir(world, cur_pos, raw_dir);
        let target_angle = steered.x.atan2(steered.z);
        pack.dogs[idx].rotation_y = lerp_angle(pack.dogs[idx].rotation_y, target_angle, dt * 7.0);
        pack.dogs[idx].position += steered * (self.nav_speed * dt);

        let mut scratch = Vec::with_capacity(16);
        world.resolve_obstacle_collisions(&mut pack.dogs[idx].position, 0.75, 1.2, &mut scratch);
        pack.dogs[idx].position.x = pack.dogs[idx].position.x.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
        pack.dogs[idx].position.z = pack.dogs[idx].position.z.clamp(-MAP_PLAY_LIMIT, MAP_PLAY_LIMIT);
        if !pack.dogs[idx].is_in_water {
            pack.dogs[idx].position.y = world.get_height_at(pack.dogs[idx].position.x, pack.dogs[idx].position.z);
        }
        world.handle_robot_interactions(&mut pack.dogs[idx], &mut pack.anims[idx], dt, audio_out);
    }

    fn on_arrival(
        &mut self,
        task: ArrivalTask,
        pack: &mut RobotPackManager,
        world: &mut WorldState,
        particles: &mut EmotionParticleSystem,
        audio_out: &mut Vec<AudioEvent>,
    ) {
        let idx = pack.active_idx;
        let name = pack.dogs[idx].id.name().to_string();
        let pos = pack.dogs[idx].position;
        let pitch = pack.dogs[idx].profile().voice_pitch;

        match task {
            ArrivalTask::FetchToBall { human_pos, ball_idx } => {
                if let Some(ball) = world.balls.get_mut(ball_idx) {
                    ball.carried_by = Some(idx);
                    pack.dogs[idx].carried_ball_idx = Some(ball_idx);
                    audio_out.push(AudioEvent { kind: AudioKind::Grumble, world_pos: pos, pitch: 1.1 });
                    self.ui_events.push(BrainUiEvent::JournalEntry {
                        author: name,
                        emotion: "Juguetón".into(),
                        thought: "¡Atrapé la pelota en mi hocico! Llevándosela a mi humano.".into(),
                    });
                    self.navigate_toward(
                        Vec3::from(human_pos),
                        6.6,
                        AnimId::Run,
                        ArrivalTask::FetchReturn { ball_idx },
                        pack,
                    );
                }
            }
            ArrivalTask::FetchReturn { ball_idx } => {
                pack.dogs[idx].carried_ball_idx = None;
                let ground_y = world.get_height_at(pos.x, pos.z);
                if let Some(ball) = world.balls.get_mut(ball_idx) {
                    ball.carried_by = None;
                    ball.pos = pos;
                    ball.pos.y = ground_y + ball.radius;
                    ball.velocity = Vec3::ZERO;
                }
                pack.anims[idx].play(AnimId::PlayBow, 2.8, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Happy, audio_out, false);
                audio_out.push(AudioEvent { kind: AudioKind::HappyJingle, world_pos: pos, pitch: 1.0 });
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Feliz".into(),
                    thought: "¡Te traje la pelota y la dejé a tus pies! ¡Lánzamela otra vez!".into(),
                });
            }
            ArrivalTask::ScentFind => {
                pack.anims[idx].play(AnimId::WagTail, 2.0, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Happy, audio_out, false);
                audio_out.push(AudioEvent { kind: AudioKind::HappyJingle, world_pos: pos, pitch: 1.0 });
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Curioso".into(),
                    thought: "¡Mi olfato cibernético siguió el rastro y encontré un objeto en el prado!".into(),
                });
            }
            ArrivalTask::PatrolStep(step) => {
                pack.anims[idx].play(AnimId::PatrolLook, 2.8, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Alert, audio_out, false);
                audio_out.push(AudioEvent { kind: AudioKind::Boop, world_pos: pos, pitch: 1.2 });
                let wps = [
                    Vec3::new(70.0, 0.0, -70.0),
                    Vec3::new(-70.0, 0.0, -70.0),
                    Vec3::new(-70.0, 0.0, 70.0),
                ];
                if step < wps.len() {
                    self.navigate_toward(wps[step], 4.2, AnimId::Walk, ArrivalTask::PatrolStep(step + 1), pack);
                } else {
                    pack.anims[idx].play(AnimId::WagTail, 2.0, &mut pack.dogs[idx]);
                    pack.dogs[idx].set_emotion(EmotionId::Proud, audio_out, false);
                    self.ui_events.push(BrainUiEvent::JournalEntry {
                        author: name,
                        emotion: "Alerta".into(),
                        thought: "¡Ronda de patrullaje perimetral completada sin novedades!".into(),
                    });
                }
            }
            ArrivalTask::SlalomRing(ri) => {
                audio_out.push(AudioEvent { kind: AudioKind::Trampoline, world_pos: pos, pitch: 1.1 });
                pack.anims[idx].play(AnimId::Jump, 1.2, &mut pack.dogs[idx]);
                self.active_subtask = ArrivalTask::SlalomLeap { ring_idx: ri, progress: 0.0 };
            }
            ArrivalTask::SoccerKick => {
                let goal_pos = Vec3::new(25.0, 1.0, 40.0);
                pack.dogs[idx].look_at(goal_pos);
                pack.anims[idx].play(AnimId::Jump, 1.2, &mut pack.dogs[idx]);
                audio_out.push(AudioEvent { kind: AudioKind::Bark, world_pos: pos, pitch: 1.3 });
                if let Some(ball) = world.balls.first_mut() {
                    let kick_dir = (goal_pos - ball.pos).normalize_or_zero();
                    ball.velocity = kick_dir * 26.0;
                    ball.velocity.y = 8.5;
                }
                pack.dogs[idx].set_emotion(EmotionId::Proud, audio_out, false);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Orgulloso".into(),
                    thought: "¡Alineé el tiro y rematé el balón directo al centro de la portería!".into(),
                });
            }
            ArrivalTask::TrampolineBounce(_) => {
                self.active_subtask = ArrivalTask::TrampolineBounce(0);
            }
            ArrivalTask::SlideApproach => {
                pack.dogs[idx].position = world.slide_top_pos;
                pack.dogs[idx].look_at(Vec3::new(-18.0, 0.0, -20.0));
                pack.anims[idx].play(AnimId::HeadTilt, 1.2, &mut pack.dogs[idx]);
                self.active_subtask = ArrivalTask::SlideClimbWait(0.95);
            }
            ArrivalTask::LakeEntry => {
                self.navigate_toward(Vec3::new(-66.0, -0.52, -66.0), 3.2, AnimId::Swimming, ArrivalTask::LakeSwimming(3.5), pack);
            }
            ArrivalTask::LakeSwimming(_) => {
                audio_out.push(AudioEvent { kind: AudioKind::Splash, world_pos: pos, pitch: 1.0 });
                pack.dogs[idx].is_in_water = true;
                pack.anims[idx].play(AnimId::Swimming, 0.0, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Happy, audio_out, false);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Feliz".into(),
                    thought: "¡Nadando en el Lago de Cristal moviendo las patitas bajo la superficie!".into(),
                });
                self.active_subtask = ArrivalTask::LakeSwimming(3.5);
            }
            ArrivalTask::LakeExit => {
                pack.dogs[idx].is_in_water = false;
                pack.dogs[idx].was_in_water = false;
                pack.anims[idx].play(AnimId::ShakeOff, 2.0, &mut pack.dogs[idx]);
                audio_out.push(AudioEvent { kind: AudioKind::Splash, world_pos: pos, pitch: 1.15 });
                particles.spawn_burst(pos, EmotionId::Happy);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Feliz".into(),
                    thought: "¡Salí del agua a tierra firme y me sacudí con fuerza para secarme!".into(),
                });
            }
            ArrivalTask::SpeedRaceFinish => {
                pack.anims[idx].play(AnimId::Backflip, 1.8, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Proud, audio_out, false);
            }
            ArrivalTask::DigTreasure(spot_idx) => {
                pack.anims[idx].play(AnimId::Dig, 3.2, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Curious, audio_out, false);
                audio_out.push(AudioEvent { kind: AudioKind::Boop, world_pos: pos, pitch: 1.2 });
                particles.spawn_burst(pos, EmotionId::Curious);
                self.active_subtask = ArrivalTask::DigRevealWait { spot_idx, timer: 3.2 };
            }
            ArrivalTask::HuntButterfly => {
                pack.anims[idx].play(AnimId::Jump, 1.4, &mut pack.dogs[idx]);
                pack.dogs[idx].velocity_y = 6.5;
                pack.dogs[idx].position.y += 0.2;
                audio_out.push(AudioEvent { kind: AudioKind::Yip, world_pos: pos, pitch: 1.5 });
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Curioso".into(),
                    thought: "¡Me acerqué en sigilo y salté alto intentando atrapar la mariposa!".into(),
                });
            }
            ArrivalTask::ShadeNapWalk => {
                self.active_subtask = ArrivalTask::ShadeNapSpin(0.0);
            }
            ArrivalTask::GoPlayground => {
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                pack.anims[idx].play(AnimId::WagTail, 2.0, &mut pack.dogs[idx]);
            }
            ArrivalTask::GoTrampoline => {
                pack.dogs[idx].velocity_y = 9.5;
                pack.dogs[idx].position.y += 0.25;
                world.trampoline_depress = -0.35;
                audio_out.push(AudioEvent { kind: AudioKind::Trampoline, world_pos: pos, pitch: 1.0 });
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                pack.anims[idx].play(AnimId::Backflip, 1.8, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Juguetón".into(),
                    thought: "¡Reboté súper alto en el trampolín cibernético!".into(),
                });
            }
            ArrivalTask::GoCarousel => {
                pack.dogs[idx].set_emotion(EmotionId::Happy, audio_out, false);
                pack.anims[idx].play(AnimId::Spin, 3.0, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Feliz".into(),
                    thought: "Me subí al carrusel a dar alegres vueltas.".into(),
                });
            }
            ArrivalTask::GoBall => {
                let goal_pos = Vec3::new(25.0, 1.0, 40.0);
                if let Some(ball) = world.balls.first_mut() {
                    let kick_dir = (goal_pos - ball.pos).normalize_or_zero();
                    ball.velocity = kick_dir * 22.0;
                    ball.velocity.y = 7.0;
                    audio_out.push(AudioEvent { kind: AudioKind::Bark, world_pos: pos, pitch: 1.2 });
                    pack.anims[idx].play(AnimId::Jump, 1.2, &mut pack.dogs[idx]);
                    pack.dogs[idx].set_emotion(EmotionId::Proud, audio_out, false);
                    self.ui_events.push(BrainUiEvent::JournalEntry {
                        author: name,
                        emotion: "Orgulloso".into(),
                        thought: "¡Pateé la pelota de fútbol con toda la potencia hacia la portería!".into(),
                    });
                }
            }
            ArrivalTask::GoDisco => {
                world.trigger_disco_party(audio_out);
                pack.dogs[idx].set_emotion(EmotionId::Party, audio_out, false);
                pack.anims[idx].play(AnimId::Dance, 3.5, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Fiestero".into(),
                    thought: "¡Llegué a la pista disco a poner el mejor ambiente!".into(),
                });
            }
            ArrivalTask::GoSnack => {
                pack.dogs[idx].energy = 100.0;
                audio_out.push(AudioEvent { kind: AudioKind::SnackMunch, world_pos: pos, pitch: 1.0 });
                pack.dogs[idx].set_emotion(EmotionId::Hungry, audio_out, false);
                pack.anims[idx].play(AnimId::Sniff, 2.0, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Glotón".into(),
                    thought: "¡Me comí una rica ciborgalleta y recargué mi energía al 100%!".into(),
                });
            }
            ArrivalTask::GoDoghouse => {
                pack.dogs[idx].energy = 100.0;
                pack.dogs[idx].set_emotion(EmotionId::Sleepy, audio_out, false);
                pack.anims[idx].play(AnimId::LieDown, 3.0, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Somnoliento".into(),
                    thought: "Descansando plácidamente en la estación de recarga.".into(),
                });
            }
            ArrivalTask::GoFountain => {
                pack.dogs[idx].quench_thirst(audio_out);
                pack.dogs[idx].set_emotion(EmotionId::Happy, audio_out, false);
                pack.anims[idx].play(AnimId::WagTail, 2.5, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Feliz".into(),
                    thought: "Bebí agua fresca y deliciosa en la fuente cibernética.".into(),
                });
            }
            ArrivalTask::GoBridge => {
                pack.dogs[idx].set_emotion(EmotionId::Curious, audio_out, false);
                pack.anims[idx].play(AnimId::HeadTilt, 2.0, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Curioso".into(),
                    thought: "Crucé el puente de madera sobre el arroyo del lago.".into(),
                });
            }
            ArrivalTask::GoSeesaw => {
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                pack.anims[idx].play(AnimId::Jump, 1.8, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Juguetón".into(),
                    thought: "Me subí al balancín cibernético para balancearme con mis amigos.".into(),
                });
            }
            ArrivalTask::GoBallpit => {
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                pack.anims[idx].play(AnimId::Jump, 1.8, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Juguetón".into(),
                    thought: "¡Me zambullí de lleno en la piscina de pelotas!".into(),
                });
            }
            ArrivalTask::GoTunnel => {
                pack.dogs[idx].set_emotion(EmotionId::Curious, audio_out, false);
                pack.anims[idx].play(AnimId::Sneak, 2.0, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Curioso".into(),
                    thought: "¡Pasé a toda velocidad por el túnel de agilidad!".into(),
                });
            }
            ArrivalTask::GoTarget => {
                pack.dogs[idx].set_emotion(EmotionId::Proud, audio_out, false);
                pack.anims[idx].play(AnimId::Bark, 2.0, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Orgulloso".into(),
                    thought: "¡Llegué a la diana de tiro al blanco a probar mi puntería!".into(),
                });
            }
            ArrivalTask::GoPinata => {
                pack.dogs[idx].set_emotion(EmotionId::Excited, audio_out, false);
                pack.dogs[idx].velocity_y = 6.5;
                pack.dogs[idx].position.y += 0.35;
                pack.anims[idx].play(AnimId::Jump, 1.5, &mut pack.dogs[idx]);
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Juguetón".into(),
                    thought: "¡Salté a golpear la piñata de galletas!".into(),
                });
            }
            ArrivalTask::GoRobot(tid) => {
                let ti = RobotPackManager::idx_of(tid);
                let tpos = pack.dogs[ti].position;
                pack.dogs[idx].look_at(tpos);
                pack.anims[idx].play(AnimId::Wave, 2.0, &mut pack.dogs[idx]);
                pack.dogs[idx].set_emotion(EmotionId::Loving, audio_out, false);

                pack.dogs[ti].look_at(pos);
                pack.anims[ti].play(AnimId::WagTail, 2.0, &mut pack.dogs[ti]);
                pack.dogs[ti].set_emotion(EmotionId::Happy, audio_out, false);
                audio_out.push(AudioEvent { kind: AudioKind::Bark, world_pos: pos, pitch });
                self.ui_events.push(BrainUiEvent::JournalEntry {
                    author: name,
                    emotion: "Cariñoso".into(),
                    thought: format!("Fui a saludar a mi amigo {} y jugamos juntos.", tid.name()),
                });
            }
            _ => {}
        }
    }
}
