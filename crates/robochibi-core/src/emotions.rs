use glam::Vec3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EmotionId {
    Happy,
    Curious,
    Loving,
    Excited,
    Sleepy,
    Alert,
    Mischievous,
    Proud,
    Scared,
    Hungry,
    Party,
    Confused,
}

#[derive(Debug, Clone, Copy)]
pub struct EmotionMeta {
    pub id: EmotionId,
    pub id_str: &'static str,
    pub name: &'static str,
    pub color_hex: u32,
    pub secondary_hex: u32,
    pub css_color: &'static str,
    pub glow_rgb: [u8; 3],
    pub face_expression: &'static str,
    pub icon: &'static str,
    pub description: &'static str,
    pub animated: bool,
}

impl EmotionId {
    pub const ALL: [EmotionId; 12] = [
        EmotionId::Happy,
        EmotionId::Curious,
        EmotionId::Loving,
        EmotionId::Excited,
        EmotionId::Sleepy,
        EmotionId::Alert,
        EmotionId::Mischievous,
        EmotionId::Proud,
        EmotionId::Scared,
        EmotionId::Hungry,
        EmotionId::Party,
        EmotionId::Confused,
    ];

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.trim().to_ascii_uppercase().as_str() {
            "HAPPY" | "FELIZ" => Some(Self::Happy),
            "CURIOUS" | "CURIOSO" => Some(Self::Curious),
            "LOVING" | "CARIÑOSO" | "CARINOSO" => Some(Self::Loving),
            "EXCITED" | "JUGUETÓN" | "JUGUETON" | "EMOCIONADO" => Some(Self::Excited),
            "SLEEPY" | "SOMNOLIENTO" | "DORMIR" => Some(Self::Sleepy),
            "ALERT" | "ALERTA" => Some(Self::Alert),
            "MISCHIEVOUS" | "PÍCARO" | "PICARO" => Some(Self::Mischievous),
            "PROUD" | "ORGULLOSO" => Some(Self::Proud),
            "SCARED" | "ASUSTADIZO" => Some(Self::Scared),
            "HUNGRY" | "GLOTÓN" | "GLOTON" => Some(Self::Hungry),
            "PARTY" | "FIESTERO" => Some(Self::Party),
            "CONFUSED" | "DESPISTADO" => Some(Self::Confused),
            _ => None,
        }
    }

    pub fn meta(self) -> EmotionMeta {
        match self {
            Self::Happy => EmotionMeta {
                id: self,
                id_str: "HAPPY",
                name: "Feliz",
                color_hex: 0x22ff88,
                secondary_hex: 0xffea00,
                css_color: "#22ff88",
                glow_rgb: [57, 255, 20],
                face_expression: "happy",
                icon: "😊",
                description: "Lleno de energía y alegría con sus amigos",
                animated: false,
            },
            Self::Curious => EmotionMeta {
                id: self,
                id_str: "CURIOUS",
                name: "Curioso",
                color_hex: 0x00e5ff,
                secondary_hex: 0x7c4dff,
                css_color: "#00e5ff",
                glow_rgb: [0, 229, 255],
                face_expression: "curious",
                icon: "🧐",
                description: "Investigando objetos y descubriendo el entorno",
                animated: false,
            },
            Self::Loving => EmotionMeta {
                id: self,
                id_str: "LOVING",
                name: "Cariñoso",
                color_hex: 0xff3399,
                secondary_hex: 0xff80ab,
                css_color: "#ff3399",
                glow_rgb: [255, 20, 147],
                face_expression: "loving",
                icon: "💖",
                description: "Siente afecto por ti y por sus amigos",
                animated: true,
            },
            Self::Excited => EmotionMeta {
                id: self,
                id_str: "EXCITED",
                name: "Juguetón",
                color_hex: 0xff9100,
                secondary_hex: 0xffd600,
                css_color: "#ff9100",
                glow_rgb: [255, 109, 0],
                face_expression: "excited",
                icon: "⚡",
                description: "Listo para correr, saltar y jugar a la pelota",
                animated: true,
            },
            Self::Sleepy => EmotionMeta {
                id: self,
                id_str: "SLEEPY",
                name: "Somnoliento",
                color_hex: 0x5c6bc0,
                secondary_hex: 0x26c6da,
                css_color: "#7986cb",
                glow_rgb: [63, 81, 181],
                face_expression: "sleepy",
                icon: "😴",
                description: "Recargando baterías y descansando tranquilamente",
                animated: true,
            },
            Self::Alert => EmotionMeta {
                id: self,
                id_str: "ALERT",
                name: "Alerta",
                color_hex: 0xff3d00,
                secondary_hex: 0xff9e80,
                css_color: "#ff3d00",
                glow_rgb: [255, 23, 68],
                face_expression: "alert",
                icon: "⚠️",
                description: "Percibió algo inusual o un movimiento rápido",
                animated: false,
            },
            Self::Mischievous => EmotionMeta {
                id: self,
                id_str: "MISCHIEVOUS",
                name: "Pícaro",
                color_hex: 0xa855f7,
                secondary_hex: 0xd8b4fe,
                css_color: "#a855f7",
                glow_rgb: [192, 132, 252],
                face_expression: "mischievous",
                icon: "😈",
                description: "Tramando travesuras y juegos traviesos con sus amigos",
                animated: false,
            },
            Self::Proud => EmotionMeta {
                id: self,
                id_str: "PROUD",
                name: "Orgulloso",
                color_hex: 0xfbbf24,
                secondary_hex: 0xfef08a,
                css_color: "#fbbf24",
                glow_rgb: [245, 158, 11],
                face_expression: "proud",
                icon: "😎",
                description: "Luce sus mejores trucos y piruetas con estilo",
                animated: false,
            },
            Self::Scared => EmotionMeta {
                id: self,
                id_str: "SCARED",
                name: "Asustadizo",
                color_hex: 0x38bdf8,
                secondary_hex: 0xbae6fd,
                css_color: "#38bdf8",
                glow_rgb: [2, 132, 199],
                face_expression: "scared",
                icon: "😱",
                description: "Sobresaltado por un ruido o movimiento repentino",
                animated: true,
            },
            Self::Hungry => EmotionMeta {
                id: self,
                id_str: "HUNGRY",
                name: "Glotón",
                color_hex: 0xf97316,
                secondary_hex: 0xfed7aa,
                css_color: "#f97316",
                glow_rgb: [234, 88, 12],
                face_expression: "hungry",
                icon: "😋",
                description: "Buscando con su olfato cibernético ricas galletas",
                animated: true,
            },
            Self::Party => EmotionMeta {
                id: self,
                id_str: "PARTY",
                name: "Fiestero",
                color_hex: 0xec4899,
                secondary_hex: 0x06b6d4,
                css_color: "#ec4899",
                glow_rgb: [244, 63, 94],
                face_expression: "party",
                icon: "🪩",
                description: "Modo discoteca encendido, listo para bailar al ritmo de los beats",
                animated: true,
            },
            Self::Confused => EmotionMeta {
                id: self,
                id_str: "CONFUSED",
                name: "Despistado",
                color_hex: 0x818cf8,
                secondary_hex: 0xc7d2fe,
                css_color: "#818cf8",
                glow_rgb: [99, 102, 241],
                face_expression: "confused",
                icon: "🤔",
                description: "Procesando una orden extraña o recalculando coordenadas",
                animated: true,
            },
        }
    }

    pub fn color_rgb_f32(self) -> [f32; 3] {
        let hex = self.meta().color_hex;
        [
            ((hex >> 16) & 0xff) as f32 / 255.0,
            ((hex >> 8) & 0xff) as f32 / 255.0,
            (hex & 0xff) as f32 / 255.0,
        ]
    }
}

pub const FACE_W: usize = 256;
pub const FACE_H: usize = 128;

/// Fast pure-Rust OLED visor pixel rasterizer (256x128 RGBA) with anti-aliased SDF primitives,
/// radial neon glow, scanline matrix, blink cycle, and animated emotion frames.
pub struct FaceRasterizer {
    pub pixels: Vec<u8>,
    pub dirty: bool,
    pub blink_timer: f32,
    pub next_blink_interval: f32,
    pub is_blinking: bool,
    pub anim_time: f32,
    pub redraw_acc: f32,
    last_emotion: Option<EmotionId>,
    last_blink: bool,
}

impl FaceRasterizer {
    pub fn new(seed: f32) -> Self {
        let mut s = Self {
            pixels: vec![0; FACE_W * FACE_H * 4],
            dirty: true,
            blink_timer: 0.0,
            next_blink_interval: 2.8 + (seed.fract().abs()) * 2.5,
            is_blinking: false,
            anim_time: seed,
            redraw_acc: 0.0,
            last_emotion: None,
            last_blink: false,
        };
        s.draw_face(EmotionId::Happy, false);
        s
    }

    pub fn update(&mut self, dt: f32, emotion: EmotionId) {
        self.anim_time += dt;
        self.blink_timer += dt;
        self.redraw_acc += dt;

        let state_changed = self.last_emotion != Some(emotion);
        if !self.is_blinking && self.blink_timer > self.next_blink_interval {
            self.is_blinking = true;
            self.blink_timer = 0.0;
            // Deterministic pseudo-random blink variation without OS RNG overhead
            let frac = ((self.anim_time * 17.31).sin() * 0.5 + 0.5).clamp(0.0, 1.0);
            self.next_blink_interval = 2.6 + frac * 2.6;
            self.draw_face(emotion, true);
            return;
        }
        if self.is_blinking && self.blink_timer > 0.14 {
            self.is_blinking = false;
            self.blink_timer = 0.0;
            self.draw_face(emotion, false);
            return;
        }
        if !self.is_blinking
            && (state_changed || (emotion.meta().animated && self.redraw_acc >= 0.042))
        {
            self.redraw_acc = 0.0;
            self.draw_face(emotion, false);
        }
    }

    pub fn draw_face(&mut self, emotion: EmotionId, blinking: bool) {
        self.last_emotion = Some(emotion);
        self.last_blink = blinking;
        self.dirty = true;

        let meta = emotion.meta();
        let glow = meta.glow_rgb;

        // 1. Sleek dark OLED vignette + subtle horizontal scanlines
        let w = FACE_W as f32;
        let h = FACE_H as f32;
        for y in 0..FACE_H {
            let scan = if y % 5 == 0 { 0.85 } else { 1.0 };
            let ny = (y as f32 / h - 0.5) * 2.0;
            for x in 0..FACE_W {
                let nx = (x as f32 / w - 0.5) * 2.0;
                let r2 = (nx * nx + ny * ny).min(1.4);
                let vig = (1.0 - r2 * 0.45).max(0.25) * scan;
                let idx = (y * FACE_W + x) * 4;
                self.pixels[idx] = (10.0 * vig) as u8;
                self.pixels[idx + 1] = (18.0 * vig) as u8;
                self.pixels[idx + 2] = (34.0 * vig) as u8;
                self.pixels[idx + 3] = 255;
            }
        }

        let lx = w * 0.32;
        let rx = w * 0.68;
        let ey = h * 0.52;

        if blinking {
            self.stroke_arc(lx, ey + 4.0, 23.0, 0.45, std::f32::consts::PI - 0.45, 5.5, glow);
            self.stroke_arc(rx, ey + 4.0, 23.0, 0.45, std::f32::consts::PI - 0.45, 5.5, glow);
            return;
        }

        match emotion {
            EmotionId::Happy => {
                self.stroke_arc(lx, ey + 10.0, 26.0, std::f32::consts::PI * 1.15, std::f32::consts::PI * 1.85, 6.5, glow);
                self.stroke_arc(rx, ey + 10.0, 26.0, std::f32::consts::PI * 1.15, std::f32::consts::PI * 1.85, 6.5, glow);
                // Cute 'w' smile
                self.stroke_arc(w * 0.5 - 6.0, ey + 17.0, 6.0, 0.1, std::f32::consts::PI - 0.1, 3.5, glow);
                self.stroke_arc(w * 0.5 + 6.0, ey + 17.0, 6.0, 0.1, std::f32::consts::PI - 0.1, 3.5, glow);
                // Blush cheeks
                self.fill_ellipse(lx - 14.0, ey + 26.0, 12.0, 6.5, [255, 90, 160], 0.78);
                self.fill_ellipse(rx + 14.0, ey + 26.0, 12.0, 6.5, [255, 90, 160], 0.78);
            }
            EmotionId::Curious => {
                self.fill_circle(lx, ey - 3.0, 24.0, glow, 1.0);
                self.fill_circle(lx + 8.0, ey - 10.0, 7.0, [255, 255, 255], 1.0);
                self.fill_circle(lx - 6.0, ey + 7.0, 3.5, [255, 255, 255], 1.0);
                self.fill_circle(rx, ey + 6.0, 19.0, glow, 1.0);
                self.fill_circle(rx + 6.0, ey, 5.0, [255, 255, 255], 1.0);
            }
            EmotionId::Loving => {
                let pulse = 1.0 + (self.anim_time * 7.5).sin() * 0.12;
                self.fill_heart(lx, ey - 3.0, 24.0 * pulse, glow);
                self.fill_heart(rx, ey - 3.0, 24.0 * pulse, glow);
                self.fill_ellipse(lx - 15.0, ey + 26.0, 11.0, 6.0, [255, 105, 180], 0.65);
                self.fill_ellipse(rx + 15.0, ey + 26.0, 11.0, 6.0, [255, 105, 180], 0.65);
            }
            EmotionId::Excited => {
                let rot = (self.anim_time * 6.0).sin() * 0.18;
                self.fill_star(lx, ey, 5, 26.0, 11.0, rot, glow);
                self.fill_star(rx, ey, 5, 26.0, 11.0, -rot, glow);
            }
            EmotionId::Sleepy => {
                self.stroke_arc(lx, ey - 4.0, 22.0, std::f32::consts::PI * 0.2, std::f32::consts::PI * 0.8, 5.5, glow);
                self.stroke_arc(rx, ey - 4.0, 22.0, std::f32::consts::PI * 0.2, std::f32::consts::PI * 0.8, 5.5, glow);
                let float_y = (self.anim_time * 3.0).sin() * 4.0;
                self.draw_z(rx + 28.0, ey - 12.0 + float_y, 12.0, glow);
                self.draw_z(rx + 42.0, ey - 28.0 - float_y * 0.7, 17.0, glow);
            }
            EmotionId::Alert => {
                self.stroke_circle(lx, ey, 22.0, 5.0, glow);
                self.stroke_circle(rx, ey, 22.0, 5.0, glow);
                self.fill_circle(lx, ey, 8.0, glow, 1.0);
                self.fill_circle(rx, ey, 8.0, glow, 1.0);
                self.stroke_line(lx - 21.0, ey - 26.0, lx + 17.0, ey - 16.0, 5.0, glow);
                self.stroke_line(rx + 21.0, ey - 26.0, rx - 17.0, ey - 16.0, 5.0, glow);
            }
            EmotionId::Mischievous => {
                self.fill_triangle(lx - 21.0, ey + 6.0, lx + 21.0, ey - 12.0, lx + 15.0, ey + 14.0, glow);
                self.stroke_arc(rx, ey + 6.0, 22.0, std::f32::consts::PI * 1.2, std::f32::consts::PI * 1.8, 6.0, glow);
                self.stroke_arc(w * 0.52, ey + 21.0, 11.0, 0.1, std::f32::consts::PI * 0.85, 4.5, glow);
            }
            EmotionId::Proud => {
                self.fill_rect(lx - 27.0, ey - 14.0, 50.0, 28.0, [15, 23, 42]);
                self.fill_rect(rx - 22.0, ey - 14.0, 50.0, 28.0, [15, 23, 42]);
                self.fill_rect(lx + 23.0, ey - 7.0, rx - lx - 45.0, 8.0, glow);
                self.stroke_rect(lx - 27.0, ey - 14.0, 50.0, 28.0, 3.0, glow);
                self.stroke_rect(rx - 22.0, ey - 14.0, 50.0, 28.0, 3.0, glow);
                self.stroke_line(lx - 17.0, ey + 10.0, lx - 5.0, ey - 10.0, 5.0, [255, 255, 255]);
                self.stroke_line(rx - 12.0, ey + 10.0, rx, ey - 10.0, 5.0, [255, 255, 255]);
            }
            EmotionId::Scared => {
                let jx = (self.anim_time * 35.0).sin() * 2.2;
                let jy = (self.anim_time * 42.0).cos() * 1.5;
                self.stroke_circle(lx + jx, ey + jy, 24.0, 5.0, glow);
                self.stroke_circle(rx + jx, ey + jy, 24.0, 5.0, glow);
                self.fill_circle(lx + jx, ey + jy, 5.0, [255, 255, 255], 1.0);
                self.fill_circle(rx + jx, ey + jy, 5.0, [255, 255, 255], 1.0);
                // Sweat drop
                self.fill_circle(w * 0.86, ey - 18.0, 7.0, [56, 189, 248], 0.95);
                self.fill_triangle(w * 0.86 - 7.0, ey - 18.0, w * 0.86 + 7.0, ey - 18.0, w * 0.86, ey - 32.0, [56, 189, 248]);
            }
            EmotionId::Hungry => {
                self.fill_circle(lx, ey - 3.0, 23.0, glow, 1.0);
                self.fill_circle(rx, ey - 3.0, 23.0, glow, 1.0);
                self.fill_circle(lx + 7.0, ey - 9.0, 8.0, [255, 255, 255], 1.0);
                self.fill_circle(rx - 5.0, ey - 9.0, 8.0, [255, 255, 255], 1.0);
                let lick = (self.anim_time * 6.0).sin() * 3.0;
                self.fill_ellipse(w * 0.5 + lick, ey + 24.0, 11.0, 8.0, [251, 113, 133], 0.95);
            }
            EmotionId::Party => {
                let bars = 8;
                let total_w = 140.0;
                let start_x = (w - total_w) * 0.5;
                let bar_w = 12.0;
                let gap = 6.0;
                for i in 0..bars {
                    let bar_h = 11.0 + (self.anim_time * 10.0 + i as f32 * 0.85).sin().abs() * 46.0;
                    let bx = start_x + i as f32 * (bar_w + gap);
                    let by = ey + 23.0 - bar_h;
                    let hue = (self.anim_time * 140.0 + i as f32 * 42.0) % 360.0;
                    let col = hsl_to_rgb(hue, 1.0, 0.62);
                    self.fill_rect_glow(bx, by, bar_w, bar_h, col);
                }
            }
            EmotionId::Confused => {
                self.fill_circle(lx, ey, 22.0, glow, 1.0);
                self.stroke_circle(rx, ey - 6.0, 16.0, 5.0, glow);
                let bob_y = (self.anim_time * 5.0).sin() * 3.0;
                let qcol = [192, 132, 252];
                self.stroke_arc(w * 0.5, ey - 20.0 + bob_y, 9.0, std::f32::consts::PI * 0.9, std::f32::consts::PI * 2.25, 4.0, qcol);
                self.stroke_line(w * 0.5, ey - 11.0 + bob_y, w * 0.5, ey - 4.0 + bob_y, 4.0, qcol);
                self.fill_circle(w * 0.5, ey + 3.0 + bob_y, 2.8, qcol, 1.0);
            }
        }
    }

    #[inline]
    fn blend_pixel(&mut self, x: i32, y: i32, rgb: [u8; 3], alpha: f32) {
        if x < 0 || y < 0 || x >= FACE_W as i32 || y >= FACE_H as i32 {
            return;
        }
        let a = alpha.clamp(0.0, 1.0);
        let idx = (y as usize * FACE_W + x as usize) * 4;
        for c in 0..3 {
            let dst = self.pixels[idx + c] as f32;
            self.pixels[idx + c] = (dst * (1.0 - a) + rgb[c] as f32 * a).min(255.0) as u8;
        }
    }

    #[inline]
    fn add_glow_pixel(&mut self, x: i32, y: i32, rgb: [u8; 3], intensity: f32) {
        if x < 0 || y < 0 || x >= FACE_W as i32 || y >= FACE_H as i32 {
            return;
        }
        let k = intensity.clamp(0.0, 1.0);
        let idx = (y as usize * FACE_W + x as usize) * 4;
        for c in 0..3 {
            let v = self.pixels[idx + c] as f32 + rgb[c] as f32 * k;
            self.pixels[idx + c] = v.min(255.0) as u8;
        }
    }

    fn fill_circle(&mut self, cx: f32, cy: f32, r: f32, rgb: [u8; 3], alpha: f32) {
        let pad = r + 7.0;
        let x0 = (cx - pad).floor() as i32;
        let x1 = (cx + pad).ceil() as i32;
        let y0 = (cy - pad).floor() as i32;
        let y1 = (cy + pad).ceil() as i32;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt() - r;
                if d <= 0.5 {
                    let cov = (0.5 - d).clamp(0.0, 1.0) * alpha;
                    self.blend_pixel(x, y, rgb, cov);
                } else if d < 7.0 {
                    let g = ((1.0 - d / 7.0).powi(2)) * 0.45 * alpha;
                    self.add_glow_pixel(x, y, rgb, g);
                }
            }
        }
    }

    fn stroke_circle(&mut self, cx: f32, cy: f32, r: f32, width: f32, rgb: [u8; 3]) {
        let hw = width * 0.5;
        let pad = r + hw + 7.0;
        let x0 = (cx - pad).floor() as i32;
        let x1 = (cx + pad).ceil() as i32;
        let y0 = (cy - pad).floor() as i32;
        let y1 = (cy + pad).ceil() as i32;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let dist = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
                let d = (dist - r).abs() - hw;
                if d <= 0.5 {
                    self.blend_pixel(x, y, rgb, (0.5 - d).clamp(0.0, 1.0));
                } else if d < 7.0 {
                    self.add_glow_pixel(x, y, rgb, (1.0 - d / 7.0).powi(2) * 0.4);
                }
            }
        }
    }

    fn stroke_arc(&mut self, cx: f32, cy: f32, r: f32, a0: f32, a1: f32, width: f32, rgb: [u8; 3]) {
        let steps = ((r * (a1 - a0).abs()).max(12.0) * 1.5) as i32;
        let mut px = cx + a0.cos() * r;
        let mut py = cy + a0.sin() * r;
        for i in 1..=steps {
            let t = i as f32 / steps as f32;
            let a = a0 + (a1 - a0) * t;
            let nx = cx + a.cos() * r;
            let ny = cy + a.sin() * r;
            self.stroke_line(px, py, nx, ny, width, rgb);
            px = nx;
            py = ny;
        }
    }

    fn stroke_line(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, width: f32, rgb: [u8; 3]) {
        let hw = width * 0.5;
        let pad = hw + 6.0;
        let min_x = x0.min(x1) - pad;
        let max_x = x0.max(x1) + pad;
        let min_y = y0.min(y1) - pad;
        let max_y = y0.max(y1) + pad;
        let dx = x1 - x0;
        let dy = y1 - y0;
        let len2 = dx * dx + dy * dy;
        for y in (min_y.floor() as i32)..=(max_y.ceil() as i32) {
            for x in (min_x.floor() as i32)..=(max_x.ceil() as i32) {
                let t = if len2 > 1e-6 {
                    (((x as f32 - x0) * dx + (y as f32 - y0) * dy) / len2).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                let qx = x0 + t * dx;
                let qy = y0 + t * dy;
                let d = ((x as f32 - qx).powi(2) + (y as f32 - qy).powi(2)).sqrt() - hw;
                if d <= 0.5 {
                    self.blend_pixel(x, y, rgb, (0.5 - d).clamp(0.0, 1.0));
                } else if d < 6.0 {
                    self.add_glow_pixel(x, y, rgb, (1.0 - d / 6.0).powi(2) * 0.35);
                }
            }
        }
    }

    fn fill_ellipse(&mut self, cx: f32, cy: f32, rx: f32, ry: f32, rgb: [u8; 3], alpha: f32) {
        let x0 = (cx - rx - 2.0).floor() as i32;
        let x1 = (cx + rx + 2.0).ceil() as i32;
        let y0 = (cy - ry - 2.0).floor() as i32;
        let y1 = (cy + ry + 2.0).ceil() as i32;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let nx = (x as f32 - cx) / rx;
                let ny = (y as f32 - cy) / ry;
                let d = nx * nx + ny * ny;
                if d <= 1.0 {
                    let edge = ((1.0 - d) * 3.0).clamp(0.0, 1.0);
                    self.blend_pixel(x, y, rgb, alpha * edge);
                }
            }
        }
    }

    fn fill_rect(&mut self, x0: f32, y0: f32, w: f32, h: f32, rgb: [u8; 3]) {
        for y in (y0.floor() as i32)..=((y0 + h).ceil() as i32) {
            for x in (x0.floor() as i32)..=((x0 + w).ceil() as i32) {
                self.blend_pixel(x, y, rgb, 1.0);
            }
        }
    }

    fn fill_rect_glow(&mut self, x0: f32, y0: f32, w: f32, h: f32, rgb: [u8; 3]) {
        let pad = 5;
        for y in ((y0.floor() as i32) - pad)..=((y0 + h).ceil() as i32 + pad) {
            for x in ((x0.floor() as i32) - pad)..=((x0 + w).ceil() as i32 + pad) {
                let dx = (x0 - x as f32).max(0.0).max(x as f32 - (x0 + w));
                let dy = (y0 - y as f32).max(0.0).max(y as f32 - (y0 + h));
                let d = (dx * dx + dy * dy).sqrt();
                if d <= 0.01 {
                    self.blend_pixel(x, y, rgb, 1.0);
                } else if d < 5.0 {
                    self.add_glow_pixel(x, y, rgb, (1.0 - d / 5.0).powi(2) * 0.45);
                }
            }
        }
    }

    fn stroke_rect(&mut self, x0: f32, y0: f32, w: f32, h: f32, width: f32, rgb: [u8; 3]) {
        self.stroke_line(x0, y0, x0 + w, y0, width, rgb);
        self.stroke_line(x0 + w, y0, x0 + w, y0 + h, width, rgb);
        self.stroke_line(x0 + w, y0 + h, x0, y0 + h, width, rgb);
        self.stroke_line(x0, y0 + h, x0, y0, width, rgb);
    }

    fn fill_triangle(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, x2: f32, y2: f32, rgb: [u8; 3]) {
        let min_x = x0.min(x1).min(x2).floor() as i32 - 1;
        let max_x = x0.max(x1).max(x2).ceil() as i32 + 1;
        let min_y = y0.min(y1).min(y2).floor() as i32 - 1;
        let max_y = y0.max(y1).max(y2).ceil() as i32 + 1;
        let edge = |ax: f32, ay: f32, bx: f32, by: f32, px: f32, py: f32| {
            (px - ax) * (by - ay) - (py - ay) * (bx - ax)
        };
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let px = x as f32;
                let py = y as f32;
                let w0 = edge(x0, y0, x1, y1, px, py);
                let w1 = edge(x1, y1, x2, y2, px, py);
                let w2 = edge(x2, y2, x0, y0, px, py);
                if (w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0) || (w0 <= 0.0 && w1 <= 0.0 && w2 <= 0.0) {
                    self.blend_pixel(x, y, rgb, 1.0);
                }
            }
        }
    }

    fn fill_heart(&mut self, cx: f32, cy: f32, size: f32, rgb: [u8; 3]) {
        let r = size * 0.55;
        let pad = r * 2.2;
        for y in ((cy - pad).floor() as i32)..=((cy + pad).ceil() as i32) {
            for x in ((cx - pad).floor() as i32)..=((cx + pad).ceil() as i32) {
                let px = (x as f32 - cx) / r;
                let py = -(y as f32 - cy) / r + 0.25;
                let v = (px * px + py * py - 1.0).powi(3) - px * px * py * py * py;
                if v <= 0.0 {
                    self.blend_pixel(x, y, rgb, 1.0);
                } else if v < 0.35 {
                    self.add_glow_pixel(x, y, rgb, (1.0 - v / 0.35) * 0.45);
                }
            }
        }
    }

    fn fill_star(&mut self, cx: f32, cy: f32, spikes: usize, outer_r: f32, inner_r: f32, rot_offset: f32, rgb: [u8; 3]) {
        let mut pts = Vec::with_capacity(spikes * 2);
        let step = std::f32::consts::PI / spikes as f32;
        let mut rot = -std::f32::consts::FRAC_PI_2 + rot_offset;
        for _ in 0..spikes {
            pts.push((cx + rot.cos() * outer_r, cy + rot.sin() * outer_r));
            rot += step;
            pts.push((cx + rot.cos() * inner_r, cy + rot.sin() * inner_r));
            rot += step;
        }
        for i in 0..pts.len() {
            let a = pts[i];
            let b = pts[(i + 1) % pts.len()];
            self.fill_triangle(cx, cy, a.0, a.1, b.0, b.1, rgb);
        }
    }

    fn draw_z(&mut self, x: f32, y: f32, sz: f32, rgb: [u8; 3]) {
        self.stroke_line(x, y, x + sz, y, 2.8, rgb);
        self.stroke_line(x + sz, y, x, y + sz, 2.8, rgb);
        self.stroke_line(x, y + sz, x + sz, y + sz, 2.8, rgb);
    }
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> [u8; 3] {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hp = (h / 60.0) % 6.0;
    let x = c * (1.0 - (hp % 2.0 - 1.0).abs());
    let (r1, g1, b1) = match hp as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = l - c * 0.5;
    [
        ((r1 + m) * 255.0) as u8,
        ((g1 + m) * 255.0) as u8,
        ((b1 + m) * 255.0) as u8,
    ]
}

#[derive(Debug, Clone)]
pub struct EmotionParticle {
    pub position: Vec3,
    pub velocity: Vec3,
    pub color: [f32; 4],
    pub base_scale: f32,
    pub current_scale: f32,
    pub swirl_phase: f32,
    pub lifetime: f32,
    pub age: f32,
}

pub struct EmotionParticleSystem {
    pub particles: Vec<EmotionParticle>,
    rng_state: u64,
}

impl EmotionParticleSystem {
    pub fn new() -> Self {
        Self {
            particles: Vec::with_capacity(128),
            rng_state: 0x9e3779b97f4a7c15,
        }
    }

    fn next_rand(&mut self) -> f32 {
        self.rng_state ^= self.rng_state << 13;
        self.rng_state ^= self.rng_state >> 7;
        self.rng_state ^= self.rng_state << 17;
        ((self.rng_state & 0xffffff) as f32) / 16777216.0
    }

    pub fn spawn_burst(&mut self, position: Vec3, emotion: EmotionId) {
        let count = 16;
        let rgb = emotion.color_rgb_f32();
        for i in 0..count {
            let r1 = self.next_rand();
            let r2 = self.next_rand();
            let r3 = self.next_rand();
            let r4 = self.next_rand();
            let r5 = self.next_rand();
            let base_scale = 0.28 + r1 * 0.14;
            let offset_radius = 0.25 + r2 * 0.55;
            let angle = (i as f32 / count as f32) * std::f32::consts::TAU + (r3 - 0.5) * 0.3;
            let pos = Vec3::new(
                position.x + angle.cos() * offset_radius,
                position.y + 1.35 + r4 * 0.6,
                position.z + angle.sin() * offset_radius,
            );
            let speed_out = 1.1 + r5 * 1.4;
            let vel = Vec3::new(
                angle.cos() * speed_out,
                1.6 + r1 * 2.0,
                angle.sin() * speed_out,
            );
            self.particles.push(EmotionParticle {
                position: pos,
                velocity: vel,
                color: [rgb[0], rgb[1], rgb[2], 0.95],
                base_scale,
                current_scale: base_scale,
                swirl_phase: r2 * std::f32::consts::TAU,
                lifetime: 1.7 + r3 * 0.6,
                age: 0.0,
            });
        }
    }

    pub fn update(&mut self, dt: f32) {
        let mut i = self.particles.len();
        while i > 0 {
            i -= 1;
            let p = &mut self.particles[i];
            p.age += dt;
            if p.age >= p.lifetime {
                self.particles.swap_remove(i);
            } else {
                p.swirl_phase += dt * 4.0;
                p.position += p.velocity * dt;
                p.position.x += p.swirl_phase.sin() * dt * 0.35;
                p.velocity.y -= dt * 0.85;
                let damp = (1.0 - dt * 1.2).clamp(0.85, 1.0);
                p.velocity.x *= damp;
                p.velocity.z *= damp;

                let progress = p.age / p.lifetime;
                p.color[3] = (1.0 - progress.powf(1.5)).max(0.0);
                p.current_scale = p.base_scale * (1.0 + (progress * std::f32::consts::PI).sin() * 0.35);
            }
        }
    }
}
