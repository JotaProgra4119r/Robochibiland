#[derive(Clone, Debug)]
pub struct TextureRgba {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

struct FastRng(u64);

impl FastRng {
    fn new(seed: u64) -> Self {
        Self(seed)
    }
    fn next_f32(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        ((self.0 & 0xffffff) as f32) / 16777216.0
    }
}

pub struct ProceduralTextures {
    pub white: TextureRgba,
    pub grass: TextureRgba,
    pub soccer: TextureRgba,
    pub wood: TextureRgba,
    pub tartan: TextureRgba,
    pub cobblestone: TextureRgba,
    pub water: TextureRgba,
}

impl ProceduralTextures {
    pub fn generate_all() -> Self {
        Self {
            white: TextureRgba {
                width: 2,
                height: 2,
                data: vec![255; 16],
            },
            grass: generate_grass(),
            soccer: generate_soccer(),
            wood: generate_wood(),
            tartan: generate_tartan(),
            cobblestone: generate_cobblestone(),
            water: generate_water(),
        }
    }
}

fn generate_grass() -> TextureRgba {
    let w = 256u32;
    let h = 256u32;
    let mut data = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let t = (x + y) as f32 / (w + h) as f32;
            let r = (56.0 * (1.0 - t) + 46.0 * t) as u8;
            let g = (148.0 * (1.0 - t) + 125.0 * t) as u8;
            let b = (60.0 * (1.0 - t) + 50.0 * t) as u8;
            let idx = ((y * w + x) * 4) as usize;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
        }
    }
    let mut rng = FastRng::new(0x13572468);
    for _ in 0..2200 {
        let x = (rng.next_f32() * w as f32) as u32 % w;
        let y = (rng.next_f32() * h as f32) as u32 % h;
        let len = 2 + (rng.next_f32() * 5.0) as u32;
        for dy in 0..len {
            let yy = (y + dy) % h;
            let idx = ((yy * w + x) * 4) as usize;
            data[idx] = data[idx].saturating_add(24);
            data[idx + 1] = data[idx + 1].saturating_add(34);
            data[idx + 2] = data[idx + 2].saturating_add(20);
        }
    }
    for _ in 0..1400 {
        let x = (rng.next_f32() * w as f32) as u32 % w;
        let y = (rng.next_f32() * h as f32) as u32 % h;
        let idx = ((y * w + x) * 4) as usize;
        data[idx] = data[idx].saturating_sub(14);
        data[idx + 1] = data[idx + 1].saturating_sub(24);
        data[idx + 2] = data[idx + 2].saturating_sub(12);
    }
    TextureRgba { width: w, height: h, data }
}

fn generate_soccer() -> TextureRgba {
    let w = 256u32;
    let h = 256u32;
    let mut data = vec![248u8; (w * h * 4) as usize];
    for i in (3..data.len()).step_by(4) {
        data[i] = 255;
    }
    let pentagons = [
        (128.0f32, 128.0f32),
        (64.0, 64.0),
        (192.0, 64.0),
        (64.0, 192.0),
        (192.0, 192.0),
        (128.0, 30.0),
        (128.0, 226.0),
        (30.0, 128.0),
        (226.0, 128.0),
    ];
    for y in 0..h {
        for x in 0..w {
            let fx = x as f32;
            let fy = y as f32;
            let mut inside = false;
            let mut border = false;
            for &(cx, cy) in &pentagons {
                let dx = fx - cx;
                let dy = fy - cy;
                let d = (dx * dx + dy * dy).sqrt();
                if d < 24.0 {
                    let a = dy.atan2(dx) + std::f32::consts::FRAC_PI_2;
                    let sector = std::f32::consts::TAU / 5.0;
                    let mod_a = (a.rem_euclid(sector)) - sector * 0.5;
                    let r_edge = 20.0 * (std::f32::consts::PI / 5.0).cos() / mod_a.cos();
                    if d < r_edge {
                        inside = true;
                    } else if d < r_edge + 2.2 {
                        border = true;
                    }
                }
            }
            let idx = ((y * w + x) * 4) as usize;
            if inside {
                data[idx] = 15;
                data[idx + 1] = 23;
                data[idx + 2] = 42;
            } else if border {
                data[idx] = 100;
                data[idx + 1] = 116;
                data[idx + 2] = 139;
            }
        }
    }
    TextureRgba { width: w, height: h, data }
}

fn generate_wood() -> TextureRgba {
    let w = 256u32;
    let h = 256u32;
    let mut data = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let fx = x as f32 * 0.08;
            let fy = y as f32 * 0.14;
            let grain = ((fy + (fx * 0.7).sin() * 1.4).sin() * 0.5 + 0.5).powf(2.0);
            let plank_seam = if y % 64 < 2 { 0.55 } else { 1.0 };
            let r = ((112.0 - grain * 30.0) * plank_seam) as u8;
            let g = ((78.0 - grain * 24.0) * plank_seam) as u8;
            let b = ((64.0 - grain * 18.0) * plank_seam) as u8;
            let idx = ((y * w + x) * 4) as usize;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
        }
    }
    TextureRgba { width: w, height: h, data }
}

fn generate_tartan() -> TextureRgba {
    let w = 256u32;
    let h = 256u32;
    let mut data = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let checker = ((x / 32) + (y / 32)) % 2 == 0;
            let seam = (x % 32 < 2) || (y % 32 < 2);
            let idx = ((y * w + x) * 4) as usize;
            if seam {
                data[idx] = 0;
                data[idx + 1] = 180;
                data[idx + 2] = 216;
            } else if checker {
                data[idx] = 30;
                data[idx + 1] = 41;
                data[idx + 2] = 59;
            } else {
                data[idx] = 15;
                data[idx + 1] = 23;
                data[idx + 2] = 42;
            }
            data[idx + 3] = 255;
        }
    }
    TextureRgba { width: w, height: h, data }
}

fn generate_cobblestone() -> TextureRgba {
    let w = 256u32;
    let h = 256u32;
    let mut data = vec![0u8; (w * h * 4) as usize];
    let step = 32i32;
    for y in 0..h as i32 {
        let row = y / step;
        let offset = (row % 2) * (step / 2);
        for x in 0..w as i32 {
            let sx = (x + offset) % step;
            let sy = y % step;
            let col_idx = ((x + offset) / step) * 17 + row * 31;
            let edge_dist = sx.min(step - 1 - sx).min(sy).min(step - 1 - sy);
            let idx = ((y as u32 * w + x as u32) * 4) as usize;
            if edge_dist <= 2 {
                data[idx] = 30;
                data[idx + 1] = 41;
                data[idx + 2] = 59;
            } else {
                let shade = 82 + ((col_idx.abs() * 19) % 42) as u8;
                let bevel = if sy < 5 { 18 } else { 0 };
                data[idx] = shade.saturating_add(bevel);
                data[idx + 1] = shade.saturating_add(6 + bevel);
                data[idx + 2] = shade.saturating_add(16 + bevel);
            }
            data[idx + 3] = 255;
        }
    }
    TextureRgba { width: w, height: h, data }
}

fn generate_water() -> TextureRgba {
    let w = 256u32;
    let h = 256u32;
    let mut data = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let fx = x as f32 / w as f32 * std::f32::consts::TAU;
            let fy = y as f32 / h as f32 * std::f32::consts::TAU;
            let caustic = ((fx * 3.0 + fy * 2.0).sin() * (fy * 3.0 - fx * 2.0).cos()).abs();
            let boost = (caustic.powf(3.0) * 90.0) as u8;
            let idx = ((y * w + x) * 4) as usize;
            data[idx] = 6u8.saturating_add(boost / 2);
            data[idx + 1] = 136u8.saturating_add(boost);
            data[idx + 2] = 204u8.saturating_add(boost / 2);
            data[idx + 3] = 235;
        }
    }
    TextureRgba { width: w, height: h, data }
}
