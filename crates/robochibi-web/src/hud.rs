use crate::net_web::OnlineUser;
use glam::Vec2;
use robochibi_core::{CameraMode, EmotionId, RobotId, SimulationEngine, LAKE_CENTER_X, LAKE_CENTER_Z};
use robochibi_render::{PIP_HEIGHT, PIP_WIDTH};
use serde_json::Value;
use wasm_bindgen::{Clamped, JsCast};
use web_sys::{
    CanvasRenderingContext2d, Document, Element, HtmlCanvasElement, HtmlElement, HtmlInputElement,
    HtmlSelectElement, HtmlTextAreaElement, ImageData, Storage,
};

#[derive(Clone, Debug)]
pub struct MacroStep {
    pub btn_id: String,
    pub label: String,
}

#[derive(Clone, Debug)]
pub struct ChatItem {
    pub kind: &'static str, // "user" | "robot" | "system" | "network"
    pub author: String,
    pub dog_tag: String,
    pub text: String,
}

pub struct HudController {
    pub doc: Document,
    pub active_dog_filter: String,
    pub chat_items: Vec<ChatItem>,
    pub activity_seen_count: usize,
    pub fps_history: Vec<f32>,
    pub frame_count: u32,
    pub last_fps_ms: f64,
    pub api_calls: u32,
    pub minimap_zoom: f32,
    pub minimap_center: Vec2,
    pub pip_enabled: bool,
    pub minimap_enabled: bool,
    pub zen_mode: bool,
    pub last_thought_shown: String,
    pub world_bubble_timer: f32,

    // Macro sequencer state
    pub macro_steps: Vec<MacroStep>,
    pub macro_loop: bool,
    pub macro_running: bool,
    pub macro_run_id: u64,
    pub macro_active_idx: Option<usize>,

    // Telemetry / LLM Settings cache
    pub ai_thinking: bool,
    pub autothink_enabled: bool,
    pub autothink_interval_s: f32,
    pub autothink_timer: f32,
    pub active_backend_label: String,
    pub recent_memories: Vec<String>,
}

impl HudController {
    pub fn new(doc: Document, active_backend_label: String) -> Self {
        let hud = Self {
            doc,
            active_dog_filter: "ALL".to_string(),
            chat_items: Vec::new(),
            activity_seen_count: 0,
            fps_history: vec![60.0; 60],
            frame_count: 0,
            last_fps_ms: 0.0,
            api_calls: 0,
            minimap_zoom: 1.0,
            minimap_center: Vec2::ZERO,
            pip_enabled: false,
            minimap_enabled: false,
            zen_mode: false,
            last_thought_shown: String::new(),
            world_bubble_timer: 0.0,
            macro_steps: Vec::new(),
            macro_loop: false,
            macro_running: false,
            macro_run_id: 0,
            macro_active_idx: None,
            ai_thinking: false,
            autothink_enabled: false,
            autothink_interval_s: 12.0,
            autothink_timer: 0.0,
            active_backend_label,
            recent_memories: Vec::new(),
        };
        hud.update_gfx_badge();
        hud
    }

    pub fn local_storage(&self) -> Option<Storage> {
        web_sys::window()?.local_storage().ok()?
    }

    pub fn el(&self, id: &str) -> Option<Element> {
        self.doc.get_element_by_id(id)
    }

    pub fn html_el(&self, id: &str) -> Option<HtmlElement> {
        self.el(id)?.dyn_into::<HtmlElement>().ok()
    }

    pub fn set_text(&self, id: &str, text: &str) {
        if let Some(el) = self.el(id) {
            el.set_text_content(Some(text));
        }
    }

    pub fn set_visible(&self, id: &str, visible: bool) {
        if let Some(el) = self.el(id) {
            let cl = el.class_list();
            if visible {
                let _ = cl.remove_1("hidden");
            } else {
                let _ = cl.add_1("hidden");
            }
        }
    }

    pub fn set_active_class(&self, id: &str, active: bool) {
        if let Some(el) = self.el(id) {
            let cl = el.class_list();
            if active {
                let _ = cl.add_1("active");
            } else {
                let _ = cl.remove_1("active");
            }
        }
    }

    pub fn update_gfx_badge(&self) {
        self.set_text("gfx-mode-label", &self.active_backend_label);
    }

    pub fn show_toast(&self, msg: &str) {
        let Some(container) = self.el("cyber-toast-container") else {
            return;
        };
        let Ok(el) = self.doc.create_element("div") else {
            return;
        };
        el.set_class_name("cyber-toast");
        el.set_text_content(Some(msg));
        let _ = container.append_child(&el);

        let el_clone = el.clone();
        let cb = wasm_bindgen::closure::Closure::once(move || {
            el_clone.remove();
        });
        if let Some(win) = web_sys::window() {
            let _ = win.set_timeout_with_callback_and_timeout_and_arguments_0(
                cb.as_ref().unchecked_ref(),
                2900,
            );
            cb.forget();
        }
    }

    pub fn push_chat(&mut self, kind: &'static str, author: String, dog_tag: String, text: String) {
        self.chat_items.push(ChatItem {
            kind,
            author,
            dog_tag,
            text,
        });
        if self.chat_items.len() > 80 {
            let excess = self.chat_items.len() - 80;
            self.chat_items.drain(0..excess);
        }
        self.render_chat_feed();
    }

    pub fn clear_chat(&mut self) {
        self.chat_items.clear();
        self.render_chat_feed();
    }

    pub fn render_chat_feed(&self) {
        let Some(feed) = self.el("chat-history-feed") else {
            return;
        };
        feed.set_text_content(Some(""));
        for item in &self.chat_items {
            if self.active_dog_filter != "ALL"
                && !item.dog_tag.is_empty()
                && item.dog_tag != self.active_dog_filter
            {
                continue;
            }
            let Ok(bubble) = self.doc.create_element("div") else {
                continue;
            };
            let cls = match item.kind {
                "user" => "chat-bubble chat-user",
                "robot" => "chat-bubble chat-robot",
                "network" => "chat-bubble chat-network",
                _ => "chat-bubble chat-system",
            };
            bubble.set_class_name(cls);

            if let Ok(author_span) = self.doc.create_element("span") {
                author_span.set_class_name("chat-author");
                author_span.set_text_content(Some(&format!("{}: ", item.author)));
                let _ = bubble.append_child(&author_span);
            }
            if let Ok(body_span) = self.doc.create_element("span") {
                body_span.set_text_content(Some(&item.text));
                let _ = bubble.append_child(&body_span);
            }
            let _ = feed.append_child(&bubble);
        }
        if let Ok(html_feed) = feed.dyn_into::<HtmlElement>() {
            html_feed.set_scroll_top(html_feed.scroll_height());
        }
    }

    pub fn sync_online_users(&self, users: &[OnlineUser], my_id: Option<&str>, my_fallback_name: &str) {
        let count = users.len().max(1);
        self.set_text("online-users-count", &count.to_string());
        self.set_text("mobile-menu-users-count", &count.to_string());

        let Some(list) = self.el("online-users-list") else {
            return;
        };
        list.set_text_content(Some(""));

        if users.is_empty() {
            if let Ok(row) = self.doc.create_element("div") {
                row.set_class_name("user-pill-item current-user");
                if let Ok(av) = self.doc.create_element("span") {
                    av.set_class_name("user-pill-avatar");
                    av.set_text_content(Some("🐾"));
                    let _ = row.append_child(&av);
                }
                if let Ok(nm) = self.doc.create_element("span") {
                    nm.set_class_name("user-pill-name");
                    nm.set_text_content(Some(my_fallback_name));
                    let _ = row.append_child(&nm);
                }
                if let Ok(tag) = self.doc.create_element("span") {
                    tag.set_class_name("user-pill-tag");
                    tag.set_text_content(Some("Local"));
                    let _ = row.append_child(&tag);
                }
                let _ = list.append_child(&row);
            }
            return;
        }

        for u in users {
            let is_me = my_id == Some(u.id.as_str());
            let Ok(row) = self.doc.create_element("div") else {
                continue;
            };
            row.set_class_name(if is_me {
                "user-pill-item current-user"
            } else {
                "user-pill-item"
            });

            if let Ok(dot) = self.doc.create_element("span") {
                dot.set_class_name("user-pill-avatar");
                dot.set_text_content(Some("🐾"));
                let _ = row.append_child(&dot);
            }
            if let Ok(nm) = self.doc.create_element("span") {
                nm.set_class_name("user-pill-name");
                nm.set_text_content(Some(&u.name));
                let _ = row.append_child(&nm);
            }
            if is_me {
                if let Ok(tag) = self.doc.create_element("span") {
                    tag.set_class_name("user-pill-tag");
                    tag.set_text_content(Some("Tú"));
                    let _ = row.append_child(&tag);
                }
            }
            let _ = list.append_child(&row);
        }
    }

    pub fn show_thought(&mut self, robot_name: &str, thought: &str) {
        self.last_thought_shown = thought.to_string();
        self.set_text("thought-bubble-text", &format!("[{robot_name}] {thought}"));
        self.set_text("world-speech-bubble", &format!("🐶 {robot_name}: {thought}"));
        self.set_visible("world-speech-bubble", !self.zen_mode);
        self.world_bubble_timer = 4.6;
    }

    pub fn sync_from_engine(&mut self, engine: &SimulationEngine, dt: f32, now_ms: f64, viewport_w: f32, viewport_h: f32) {
        let dog = engine.pack.player();
        let profile = dog.profile();
        let emo_meta = dog.current_emotion.meta();

        self.set_text("robot-name", profile.name);
        self.set_text("header-robot-avatar", profile.avatar_icon);
        self.set_text("robot-title-tag", profile.title);
        self.set_text("stat-emotion", &format!("{} {}", emo_meta.icon, emo_meta.name));

        let energy = dog.energy.clamp(0.0, 100.0).round() as i32;
        let curiosity = dog.curiosity.clamp(0.0, 100.0).round() as i32;
        let affection = dog.affection.clamp(0.0, 100.0).round() as i32;
        let hydration = dog.hydration.clamp(0.0, 100.0).round() as i32;

        self.set_text("stat-energy", &format!("{energy}%"));
        self.set_text("stat-curiosity", &format!("{curiosity}%"));
        self.set_text("stat-affection", &format!("{affection}%"));
        self.set_text("stat-hydration", &format!("{hydration}%"));

        for (id, val) in [
            ("bar-energy", energy),
            ("bar-curiosity", curiosity),
            ("bar-affection", affection),
            ("bar-hydration", hydration),
        ] {
            if let Some(el) = self.html_el(id) {
                let _ = el.style().set_property("width", &format!("{val}%"));
            }
        }

        let poi = robochibi_core::RobotVisionSystem::get_current_location_name(&engine.world, dog.position);
        self.set_text("stat-location", poi);
        self.set_text("soccer-score-num", &engine.world.goal_score.to_string());
        self.set_text("target-score-num", &engine.world.target_score.to_string());

        let cam_label = match engine.camera_mode {
            CameraMode::Diagonal => "Diagonal",
            CameraMode::Follow => "Seguir",
            CameraMode::Orbit => "Órbita",
            CameraMode::Free => "Libre",
            CameraMode::Eye => "Ojos",
            CameraMode::Drone => "Dron",
        };
        self.set_text("cam-current-name", cam_label);

        self.set_active_class("btn-hand-tool", engine.is_hand_tool_active);
        self.set_active_class("pill-toggle-hand", engine.is_hand_tool_active);
        self.set_active_class("quick-bar-hand", engine.is_hand_tool_active);

        if let Some(btn_fw) = self.el("btn-toggle-freewill") {
            btn_fw.set_text_content(Some(if engine.is_free_will {
                "🐾 Modo Libre: ON"
            } else {
                "🐾 Modo Libre: OFF"
            }));
            self.set_active_class("btn-toggle-freewill", engine.is_free_will);
        }

        // Sync pet switcher cards active highlight
        if let Ok(cards) = self.doc.query_selector_all(".robo-switch-card") {
            for i in 0..cards.length() {
                if let Some(node) = cards.get(i) {
                    if let Ok(el) = node.dyn_into::<Element>() {
                        let rname = el.get_attribute("data-robot").unwrap_or_default();
                        if rname.eq_ignore_ascii_case(profile.name) {
                            let _ = el.class_list().add_1("active");
                        } else {
                            let _ = el.class_list().remove_1("active");
                        }
                    }
                }
            }
        }

        // World speech bubble projection over dog head
        if self.world_bubble_timer > 0.0 && !self.zen_mode {
            self.world_bubble_timer -= dt;
            if self.world_bubble_timer <= 0.0 {
                self.set_visible("world-speech-bubble", false);
            } else if let Some((sx, sy)) = engine.project_overhead_screen(viewport_w, viewport_h) {
                if let Some(bubble) = self.html_el("world-speech-bubble") {
                    let st = bubble.style();
                    let _ = st.set_property("left", &format!("{:.1}px", sx));
                    let _ = st.set_property("top", &format!("{:.1}px", (sy - 14.0).max(56.0)));
                }
            }
        }

        // Activity ticker incremental append
        if engine.world.activity_log.len() > self.activity_seen_count {
            if let Some(content) = self.el("activity-ticker-content") {
                for msg in &engine.world.activity_log[self.activity_seen_count..] {
                    if let Ok(div) = self.doc.create_element("div") {
                        div.set_class_name("activity-item");
                        div.set_text_content(Some(msg));
                        let _ = content.append_child(&div);
                    }
                    if content.child_element_count() > 14 {
                        if let Some(first) = content.first_element_child() {
                            first.remove();
                        }
                    }
                }
                if let Ok(hc) = content.dyn_into::<HtmlElement>() {
                    hc.set_scroll_top(hc.scroll_height());
                }
            }
            self.activity_seen_count = engine.world.activity_log.len();
        }

        // FPS & telemetry chart (500ms window)
        self.frame_count += 1;
        if self.last_fps_ms <= 0.0 {
            self.last_fps_ms = now_ms;
        }
        let elapsed_ms = now_ms - self.last_fps_ms;
        if elapsed_ms >= 500.0 {
            let fps = ((self.frame_count as f64 * 1000.0) / elapsed_ms).clamp(1.0, 240.0) as f32;
            let frame_ms = elapsed_ms as f32 / self.frame_count.max(1) as f32;
            self.frame_count = 0;
            self.last_fps_ms = now_ms;

            self.fps_history.push(fps);
            if self.fps_history.len() > 60 {
                self.fps_history.remove(0);
            }

            self.set_text(
                "hud-fps-counter",
                &format!("{} {} FPS", self.active_backend_label, fps.round() as u32),
            );
            self.set_text("t-val-fps", &format!("{}", fps.round() as u32));
            self.set_text("t-val-ms", &format!("{:.1}", frame_ms));
            self.draw_fps_chart();
        }

        // Optical overlay CSS hint class on <body> (actual shader runs in WGSL on GPU!)
        if let Some(body) = self.doc.body() {
            let cl = body.class_list();
            for cls in ["fx-crt", "fx-nightvision", "fx-thermal", "fx-cinema"] {
                let _ = cl.remove_1(cls);
            }
            let active_cls = engine.optical_filter.css_class();
            if !active_cls.is_empty() {
                let _ = cl.add_1(active_cls);
            }
        }

        // Minimap 2D radar draw if visible
        if self.minimap_enabled {
            self.draw_minimap(engine);
        }
    }

    pub fn draw_fps_chart(&self) {
        let Some(el) = self.el("telemetry-chart-canvas") else {
            return;
        };
        let Ok(canvas) = el.dyn_into::<HtmlCanvasElement>() else {
            return;
        };
        let Ok(Some(ctx_obj)) = canvas.get_context("2d") else {
            return;
        };
        let Ok(ctx) = ctx_obj.dyn_into::<CanvasRenderingContext2d>() else {
            return;
        };

        let w = canvas.width() as f64;
        let h = canvas.height() as f64;
        ctx.clear_rect(0.0, 0.0, w, h);
        ctx.set_stroke_style_str("#00f2fe");
        ctx.set_line_width(2.0);
        ctx.begin_path();
        let len = (self.fps_history.len().saturating_sub(1)).max(1) as f64;
        for (i, &fps) in self.fps_history.iter().enumerate() {
            let x = (i as f64 / len) * w;
            let y = h - (fps as f64 / 120.0).clamp(0.0, 1.0) * (h - 10.0) - 5.0;
            if i == 0 {
                ctx.move_to(x, y);
            } else {
                ctx.line_to(x, y);
            }
        }
        ctx.stroke();
    }

    pub fn draw_minimap(&self, engine: &SimulationEngine) {
        let Some(el) = self.el("minimap-canvas") else {
            return;
        };
        let Ok(canvas) = el.dyn_into::<HtmlCanvasElement>() else {
            return;
        };
        let Ok(Some(ctx_obj)) = canvas.get_context("2d") else {
            return;
        };
        let Ok(ctx) = ctx_obj.dyn_into::<CanvasRenderingContext2d>() else {
            return;
        };

        let w = canvas.width() as f64;
        let h = canvas.height() as f64;
        ctx.set_fill_style_str("#091628");
        ctx.fill_rect(0.0, 0.0, w, h);

        let scale = (0.62 * self.minimap_zoom) as f64;
        let cx = w * 0.5;
        let cy = h * 0.5;
        let ox = self.minimap_center.x as f64;
        let oz = self.minimap_center.y as f64;

        let map_pt = |wx: f32, wz: f32| -> (f64, f64) {
            (cx + (wx as f64 - ox) * scale, cy + (wz as f64 - oz) * scale)
        };

        // Subtle grid
        ctx.set_stroke_style_str("rgba(0, 229, 255, 0.12)");
        ctx.set_line_width(1.0);
        for g in (-140..=140).step_by(40) {
            let (gx, _) = map_pt(g as f32, 0.0);
            ctx.begin_path();
            ctx.move_to(gx, 0.0);
            ctx.line_to(gx, h);
            ctx.stroke();
            let (_, gz) = map_pt(0.0, g as f32);
            ctx.begin_path();
            ctx.move_to(0.0, gz);
            ctx.line_to(w, gz);
            ctx.stroke();
        }

        // Lake of Crystal
        let (lx, ly) = map_pt(LAKE_CENTER_X, LAKE_CENTER_Z);
        ctx.set_fill_style_str("rgba(0, 176, 255, 0.35)");
        ctx.begin_path();
        let _ = ctx.arc(lx, ly, 60.0 * scale, 0.0, std::f64::consts::TAU);
        ctx.fill();

        // Playground Circle (50, 40)
        let (px, py) = map_pt(50.0, 40.0);
        ctx.set_fill_style_str("rgba(255, 112, 67, 0.25)");
        ctx.begin_path();
        let _ = ctx.arc(px, py, 42.0 * scale, 0.0, std::f64::consts::TAU);
        ctx.fill();

        // Plaza (0, 0)
        let (plx, ply) = map_pt(0.0, 0.0);
        ctx.set_stroke_style_str("rgba(148, 163, 184, 0.45)");
        ctx.begin_path();
        let _ = ctx.arc(plx, ply, 18.0 * scale, 0.0, std::f64::consts::TAU);
        ctx.stroke();

        // Waypoint
        if let Some(wp) = engine.target_waypoint {
            let (wx, wy) = map_pt(wp.x, wp.z);
            ctx.set_stroke_style_str("#00f2fe");
            ctx.set_line_width(2.0);
            ctx.begin_path();
            let _ = ctx.arc(wx, wy, 6.0, 0.0, std::f64::consts::TAU);
            ctx.stroke();
        }

        // Balls
        ctx.set_fill_style_str("#fde047");
        for b in &engine.world.balls {
            let (bx, by) = map_pt(b.pos.x, b.pos.z);
            ctx.fill_rect(bx - 1.5, by - 1.5, 3.0, 3.0);
        }

        // 5 Chibi Robot Dogs
        for (i, dog) in engine.pack.dogs.iter().enumerate() {
            let (dx, dy) = map_pt(dog.position.x, dog.position.z);
            let col = match dog.id {
                RobotId::Sparky => "#00e5ff",
                RobotId::Bolt => "#fde047",
                RobotId::Pixel => "#34d399",
                RobotId::Luna => "#f472b6",
                RobotId::Rusty => "#fb923c",
            };
            ctx.set_fill_style_str(col);
            ctx.begin_path();
            let _ = ctx.arc(dx, dy, if i == engine.pack.active_idx { 4.8 } else { 3.4 }, 0.0, std::f64::consts::TAU);
            ctx.fill();

            if i == engine.pack.active_idx {
                ctx.set_stroke_style_str("#ffffff");
                ctx.set_line_width(1.6);
                ctx.begin_path();
                let _ = ctx.arc(dx, dy, 6.8, 0.0, std::f64::consts::TAU);
                ctx.stroke();
                ctx.begin_path();
                ctx.move_to(dx, dy);
                ctx.line_to(
                    dx + (dog.rotation_y.sin() as f64) * 10.0,
                    dy + (dog.rotation_y.cos() as f64) * 10.0,
                );
                ctx.stroke();
            }
        }
    }

    pub fn minimap_click_to_world(&self, offset_x: f32, offset_y: f32, width: f32, height: f32) -> (f32, f32) {
        let scale = 0.62 * self.minimap_zoom;
        let wx = self.minimap_center.x + (offset_x - width * 0.5) / scale;
        let wz = self.minimap_center.y + (offset_y - height * 0.5) / scale;
        (wx, wz)
    }

    pub fn blit_pip_rgba(&self, rgba: &[u8]) {
        if rgba.len() != (PIP_WIDTH * PIP_HEIGHT * 4) as usize {
            return;
        }
        let Some(el) = self.el("pip-canvas") else {
            return;
        };
        let Ok(canvas) = el.dyn_into::<HtmlCanvasElement>() else {
            return;
        };
        if canvas.width() != PIP_WIDTH || canvas.height() != PIP_HEIGHT {
            canvas.set_width(PIP_WIDTH);
            canvas.set_height(PIP_HEIGHT);
        }
        let Ok(Some(ctx_obj)) = canvas.get_context("2d") else {
            return;
        };
        let Ok(ctx) = ctx_obj.dyn_into::<CanvasRenderingContext2d>() else {
            return;
        };
        if let Ok(img) = ImageData::new_with_u8_clamped_array_and_sh(
            Clamped(rgba),
            PIP_WIDTH,
            PIP_HEIGHT,
        ) {
            let _ = ctx.put_image_data(&img, 0.0, 0.0);
        }
    }

    pub fn render_macro_timeline(&self) {
        let Some(tl) = self.el("macro-timeline") else {
            return;
        };
        tl.set_text_content(Some(""));
        if self.macro_steps.is_empty() {
            if let Ok(sp) = self.doc.create_element("span") {
                sp.set_text_content(Some("Añade acciones abajo para programar una coreografía..."));
                if let Ok(he) = sp.clone().dyn_into::<HtmlElement>() {
                    let _ = he.style().set_property("color", "#64748b");
                    let _ = he.style().set_property("font-size", "0.78rem");
                }
                let _ = tl.append_child(&sp);
            }
            return;
        }

        for (idx, step) in self.macro_steps.iter().enumerate() {
            let Ok(chip) = self.doc.create_element("span") else {
                continue;
            };
            let is_active = self.macro_active_idx == Some(idx);
            chip.set_class_name(if is_active {
                "macro-step-chip active-step"
            } else {
                "macro-step-chip"
            });
            chip.set_text_content(Some(&format!("{}. {}", idx + 1, step.label)));
            let _ = tl.append_child(&chip);
        }
    }

    pub fn update_memory_viewer(&mut self, mem: &Value) {
        if let Some(pre) = self.el("memory-display") {
            let pretty = serde_json::to_string_pretty(mem).unwrap_or_default();
            pre.set_text_content(Some(&pretty));
        }

        self.recent_memories.clear();
        if let Some(j) = mem.get("journal").and_then(|v| v.as_array()) {
            for entry in j.iter().rev().take(6) {
                if let Some(th) = entry.get("thought").and_then(|v| v.as_str()) {
                    self.recent_memories.push(th.to_string());
                }
            }
        }

        if let Some(list) = self.el("learned-tricks-list") {
            list.set_text_content(Some(""));
            if let Some(arr) = mem.get("learned_movements").and_then(|v| v.as_array()) {
                for item in arr {
                    let Some(name) = item.get("name").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let seq_str = item
                        .get("sequence")
                        .and_then(|v| v.as_array())
                        .map(|a| {
                            a.iter()
                                .filter_map(|x| x.as_str())
                                .collect::<Vec<_>>()
                                .join(",")
                        })
                        .unwrap_or_default();
                    if let Ok(btn) = self.doc.create_element("button") {
                        btn.set_class_name("trick-chip-btn");
                        btn.set_text_content(Some(&format!("✨ {name}")));
                        let _ = btn.set_attribute("data-seq", &seq_str);
                        let _ = btn.set_attribute("data-trick-name", name);
                        let _ = list.append_child(&btn);
                    }
                }
            }
        }
    }

    pub fn load_llm_settings_into_dom(&mut self) {
        let Some(ls) = self.local_storage() else {
            return;
        };
        let ep = ls
            .get_item("freellm_endpoint")
            .ok()
            .flatten()
            .unwrap_or_else(|| "http://127.0.0.1:31415/v1/chat/completions".into());
        let key = ls
            .get_item("freellm_apikey")
            .ok()
            .flatten()
            .unwrap_or_else(|| "freellmapi-dc6415f70139118055e4065b767a1d8acb930795eb3d1384".into());
        let model = ls
            .get_item("freellm_model")
            .ok()
            .flatten()
            .unwrap_or_else(|| "auto".into());
        let sys_p = ls.get_item("freellm_system_prompt").ok().flatten().unwrap_or_default();
        let interval = ls
            .get_item("freellm_interval")
            .ok()
            .flatten()
            .and_then(|s| s.parse::<f32>().ok())
            .unwrap_or(12.0);
        self.autothink_interval_s = interval;

        if let Some(i) = self.el("cfg-endpoint").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
            i.set_value(&ep);
        }
        if let Some(i) = self.el("cfg-apikey").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
            i.set_value(&key);
        }
        if let Some(sel) = self.el("cfg-model-select").and_then(|e| e.dyn_into::<HtmlSelectElement>().ok()) {
            sel.set_value(&model);
        }
        if let Some(t) = self.el("cfg-system-prompt").and_then(|e| e.dyn_into::<HtmlTextAreaElement>().ok()) {
            t.set_value(&sys_p);
        }
        if let Some(r) = self.el("cfg-interval").and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
            r.set_value(&format!("{}", interval as i32));
        }
        self.set_text("cfg-interval-val", &format!("{}s", interval as i32));
    }

    pub fn read_llm_settings(&self) -> (String, String, String, String, f32) {
        let ep = self
            .el("cfg-endpoint")
            .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
            .map(|i| i.value())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "http://127.0.0.1:31415/v1/chat/completions".into());
        let key = self
            .el("cfg-apikey")
            .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
            .map(|i| i.value())
            .unwrap_or_default();
        let sel_m = self
            .el("cfg-model-select")
            .and_then(|e| e.dyn_into::<HtmlSelectElement>().ok())
            .map(|s| s.value())
            .unwrap_or_else(|| "auto".into());
        let model = if sel_m == "custom" {
            self.el("cfg-model-custom")
                .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                .map(|i| i.value())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| "auto".into())
        } else {
            sel_m
        };
        let sys_p = self
            .el("cfg-system-prompt")
            .and_then(|e| e.dyn_into::<HtmlTextAreaElement>().ok())
            .map(|t| t.value())
            .unwrap_or_default();
        let interval = self
            .el("cfg-interval")
            .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
            .and_then(|i| i.value().parse::<f32>().ok())
            .unwrap_or(12.0);
        (ep, key, model, sys_p, interval)
    }

    pub fn emotion_btn_id_to_enum(id: &str) -> Option<EmotionId> {
        match id {
            "btn-emo-happy" => Some(EmotionId::Happy),
            "btn-emo-curious" => Some(EmotionId::Curious),
            "btn-emo-loving" => Some(EmotionId::Loving),
            "btn-emo-excited" => Some(EmotionId::Excited),
            "btn-emo-sleepy" => Some(EmotionId::Sleepy),
            "btn-emo-alert" => Some(EmotionId::Alert),
            "btn-emo-mischievous" => Some(EmotionId::Mischievous),
            "btn-emo-proud" => Some(EmotionId::Proud),
            "btn-emo-scared" => Some(EmotionId::Scared),
            "btn-emo-hungry" => Some(EmotionId::Hungry),
            "btn-emo-party" => Some(EmotionId::Party),
            "btn-emo-confused" => Some(EmotionId::Confused),
            _ => None,
        }
    }
}
