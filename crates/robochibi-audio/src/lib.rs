use glam::Vec3;
use robochibi_core::{AudioEvent, AudioKind, FootstepSurface, TimeOfDay, WeatherMode, LAKE_CENTER_X, LAKE_CENTER_Z};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WaveKind {
    Sine,
    Triangle,
    Saw,
    Noise,
    DualFormant,
    SpringFm,
    Kick808,
    Snare,
    HiHat,
}

#[derive(Debug, Clone, Copy)]
struct Voice {
    active: bool,
    wave: WaveKind,
    delay_samples: u32,
    sample_pos: u32,
    total_samples: u32,
    phase: f32,
    phase2: f32,
    lfo_phase: f32,
    f_start: f32,
    f_mid: f32,
    f_end: f32,
    mid_ratio: f32,
    gain: f32,
    pan_l: f32,
    pan_r: f32,
    // Simple SVF filter state
    filter_cutoff_start: f32,
    filter_cutoff_end: f32,
    filter_q: f32,
    filter_bandpass: bool,
    svf_ic1: f32,
    svf_ic2: f32,
    lfo_freq: f32,
    lfo_depth: f32,
}

impl Default for Voice {
    fn default() -> Self {
        Self {
            active: false,
            wave: WaveKind::Sine,
            delay_samples: 0,
            sample_pos: 0,
            total_samples: 1,
            phase: 0.0,
            phase2: 0.0,
            lfo_phase: 0.0,
            f_start: 440.0,
            f_mid: 440.0,
            f_end: 440.0,
            mid_ratio: 0.5,
            gain: 0.2,
            pan_l: 0.707,
            pan_r: 0.707,
            filter_cutoff_start: 0.0,
            filter_cutoff_end: 0.0,
            filter_q: 1.5,
            filter_bandpass: false,
            svf_ic1: 0.0,
            svf_ic2: 0.0,
            lfo_freq: 0.0,
            lfo_depth: 0.0,
        }
    }
}

struct CombFilter {
    buf: Vec<f32>,
    idx: usize,
    feedback: f32,
    damp: f32,
    filter_store: f32,
}

impl CombFilter {
    fn new(len: usize, feedback: f32, damp: f32) -> Self {
        Self {
            buf: vec![0.0; len.max(8)],
            idx: 0,
            feedback,
            damp,
            filter_store: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let out = self.buf[self.idx];
        self.filter_store = out * (1.0 - self.damp) + self.filter_store * self.damp;
        self.buf[self.idx] = input + self.filter_store * self.feedback;
        self.idx = (self.idx + 1) % self.buf.len();
        out
    }
}

struct AllpassFilter {
    buf: Vec<f32>,
    idx: usize,
    feedback: f32,
}

impl AllpassFilter {
    fn new(len: usize, feedback: f32) -> Self {
        Self {
            buf: vec![0.0; len.max(8)],
            idx: 0,
            feedback,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let buf_out = self.buf[self.idx];
        let out = -input + buf_out;
        self.buf[self.idx] = input + buf_out * self.feedback;
        self.idx = (self.idx + 1) % self.buf.len();
        out
    }
}

pub struct RoboAudioSynth {
    pub sample_rate: f32,
    pub muted: bool,
    pub ambient_enabled: bool,
    pub master_gain: f32,
    voices: [Voice; 40],
    rng_state: u64,
    // Ambient state
    ambient_wind_lp: f32,
    ambient_lake_gain: f32,
    ambient_night_gain: f32,
    ambient_rain_gain: f32,
    ambient_phase: f32,
    // Stereo Schroeder Reverb
    comb_l: [CombFilter; 4],
    comb_r: [CombFilter; 4],
    ap_l: [AllpassFilter; 2],
    ap_r: [AllpassFilter; 2],
}

impl RoboAudioSynth {
    pub fn new(sample_rate: f32) -> Self {
        let sr_scale = (sample_rate / 44100.0).max(0.5);
        let c_len = |base: usize| ((base as f32 * sr_scale) as usize).max(16);
        Self {
            sample_rate,
            muted: false,
            ambient_enabled: true,
            master_gain: 0.85,
            voices: [Voice::default(); 40],
            rng_state: 0xdeadbeef12345678,
            ambient_wind_lp: 0.0,
            ambient_lake_gain: 0.0,
            ambient_night_gain: 0.0,
            ambient_rain_gain: 0.0,
            ambient_phase: 0.0,
            comb_l: [
                CombFilter::new(c_len(1116), 0.72, 0.25),
                CombFilter::new(c_len(1188), 0.70, 0.28),
                CombFilter::new(c_len(1277), 0.68, 0.30),
                CombFilter::new(c_len(1356), 0.66, 0.32),
            ],
            comb_r: [
                CombFilter::new(c_len(1139), 0.72, 0.25),
                CombFilter::new(c_len(1211), 0.70, 0.28),
                CombFilter::new(c_len(1300), 0.68, 0.30),
                CombFilter::new(c_len(1379), 0.66, 0.32),
            ],
            ap_l: [
                AllpassFilter::new(c_len(556), 0.5),
                AllpassFilter::new(c_len(441), 0.5),
            ],
            ap_r: [
                AllpassFilter::new(c_len(579), 0.5),
                AllpassFilter::new(c_len(464), 0.5),
            ],
        }
    }

    #[inline]
    fn next_white(&mut self) -> f32 {
        self.rng_state ^= self.rng_state << 13;
        self.rng_state ^= self.rng_state >> 7;
        self.rng_state ^= self.rng_state << 17;
        let v = ((self.rng_state & 0xffffff) as f32) / 8388608.0 - 1.0;
        v
    }

    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(8000.0);
    }

    pub fn update_environment(
        &mut self,
        listener_pos: Vec3,
        time: TimeOfDay,
        weather: WeatherMode,
    ) {
        let d_lake = (listener_pos.x - LAKE_CENTER_X).hypot(listener_pos.z - LAKE_CENTER_Z);
        self.ambient_lake_gain = ((1.0 - (d_lake - 48.0) / 50.0).clamp(0.0, 1.0)) * 0.08;
        self.ambient_night_gain = if time == TimeOfDay::Night { 0.025 } else { 0.0 };
        self.ambient_rain_gain = if weather == WeatherMode::CyberRain { 0.06 } else { 0.0 };
    }

    fn alloc_voice(&mut self, v: Voice) {
        for slot in &mut self.voices {
            if !slot.active {
                *slot = v;
                slot.active = true;
                return;
            }
        }
        // Steal oldest/first voice if full
        let mut best_i = 0;
        let mut best_p = 0u32;
        for (i, slot) in self.voices.iter().enumerate() {
            if slot.sample_pos >= best_p {
                best_p = slot.sample_pos;
                best_i = i;
            }
        }
        self.voices[best_i] = v;
        self.voices[best_i].active = true;
    }

    fn spatial_pan_att(&self, world_pos: Vec3, listener_pos: Vec3, listener_right: Vec3) -> (f32, f32, f32) {
        let delta = world_pos - listener_pos;
        let dist = delta.length();
        let atten = if dist < 2.5 {
            1.0
        } else {
            1.0 / (1.0 + (dist - 2.5) * 0.028)
        };
        let pan = if dist > 0.2 {
            (delta / dist).dot(listener_right).clamp(-0.9, 0.9)
        } else {
            0.0
        };
        // Constant power pan law
        let angle = (pan + 1.0) * 0.5 * std::f32::consts::FRAC_PI_2;
        (angle.cos(), angle.sin(), atten)
    }

    pub fn emit_3d(&mut self, ev: AudioEvent, listener_pos: Vec3, listener_right: Vec3) {
        if self.muted {
            return;
        }
        let (pl, pr, atten) = self.spatial_pan_att(ev.world_pos, listener_pos, listener_right);
        if atten < 0.04 {
            return;
        }
        let sr = self.sample_rate;
        let p = ev.pitch.clamp(0.4, 2.5);
        let g = atten;

        match ev.kind {
            AudioKind::Bark => {
                self.alloc_voice(Voice {
                    wave: WaveKind::DualFormant,
                    total_samples: (0.19 * sr) as u32,
                    f_start: 310.0 * p,
                    f_mid: 820.0 * p,
                    f_end: 210.0 * p,
                    mid_ratio: 0.24,
                    gain: 0.30 * g,
                    pan_l: pl,
                    pan_r: pr,
                    filter_cutoff_start: 950.0 * p,
                    filter_cutoff_end: 1750.0 * p,
                    filter_q: 1.8,
                    filter_bandpass: true,
                    ..Default::default()
                });
            }
            AudioKind::Boop => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Sine,
                    total_samples: (0.12 * sr) as u32,
                    f_start: 840.0 * p,
                    f_mid: 1120.0 * p,
                    f_end: 1380.0 * p,
                    mid_ratio: 0.5,
                    gain: 0.20 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
                self.alloc_voice(Voice {
                    wave: WaveKind::Triangle,
                    total_samples: (0.12 * sr) as u32,
                    f_start: 420.0 * p,
                    f_mid: 560.0 * p,
                    f_end: 690.0 * p,
                    mid_ratio: 0.5,
                    gain: 0.14 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::Jump => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Sine,
                    total_samples: (0.18 * sr) as u32,
                    f_start: 240.0 * p,
                    f_mid: 520.0 * p,
                    f_end: 760.0 * p,
                    mid_ratio: 0.5,
                    gain: 0.22 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::HappyJingle => {
                let notes = [523.25f32, 659.25, 783.99, 1046.5];
                for (i, &freq) in notes.iter().enumerate() {
                    let delay = (i as f32 * 0.075 * sr) as u32;
                    self.alloc_voice(Voice {
                        wave: WaveKind::Triangle,
                        delay_samples: delay,
                        total_samples: (0.19 * sr) as u32,
                        f_start: freq,
                        f_mid: freq,
                        f_end: freq,
                        gain: 0.20 * g,
                        pan_l: pl,
                        pan_r: pr,
                        ..Default::default()
                    });
                    self.alloc_voice(Voice {
                        wave: WaveKind::Sine,
                        delay_samples: delay,
                        total_samples: (0.19 * sr) as u32,
                        f_start: freq * 2.0,
                        f_mid: freq * 2.0,
                        f_end: freq * 2.0,
                        gain: 0.08 * g,
                        pan_l: pl,
                        pan_r: pr,
                        ..Default::default()
                    });
                }
            }
            AudioKind::Curious => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Sine,
                    total_samples: (0.32 * sr) as u32,
                    f_start: 420.0,
                    f_mid: 640.0,
                    f_end: 920.0,
                    mid_ratio: 0.4,
                    gain: 0.20 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::Step(surf) => {
                let jit = (self.next_white() * 0.5 + 0.5) * 30.0;
                match surf {
                    FootstepSurface::Grass => {
                        self.alloc_voice(Voice {
                            wave: WaveKind::Triangle,
                            total_samples: (0.05 * sr) as u32,
                            f_start: 165.0 + jit,
                            f_mid: 110.0,
                            f_end: 72.0,
                            mid_ratio: 0.4,
                            gain: 0.055 * g,
                            pan_l: pl,
                            pan_r: pr,
                            filter_cutoff_start: 580.0,
                            filter_cutoff_end: 420.0,
                            filter_q: 0.8,
                            ..Default::default()
                        });
                    }
                    FootstepSurface::Stone => {
                        self.alloc_voice(Voice {
                            wave: WaveKind::Triangle,
                            total_samples: (0.045 * sr) as u32,
                            f_start: 420.0 + jit * 2.0,
                            f_mid: 260.0,
                            f_end: 160.0,
                            mid_ratio: 0.35,
                            gain: 0.075 * g,
                            pan_l: pl,
                            pan_r: pr,
                            filter_cutoff_start: 1600.0,
                            filter_cutoff_end: 900.0,
                            filter_q: 1.1,
                            ..Default::default()
                        });
                    }
                    FootstepSurface::Wood => {
                        self.alloc_voice(Voice {
                            wave: WaveKind::Sine,
                            total_samples: (0.065 * sr) as u32,
                            f_start: 280.0 + jit,
                            f_mid: 210.0,
                            f_end: 135.0,
                            mid_ratio: 0.3,
                            gain: 0.095 * g,
                            pan_l: pl,
                            pan_r: pr,
                            filter_cutoff_start: 1100.0,
                            filter_cutoff_end: 650.0,
                            filter_q: 1.6,
                            ..Default::default()
                        });
                    }
                    FootstepSurface::Water => {
                        self.alloc_voice(Voice {
                            wave: WaveKind::Noise,
                            total_samples: (0.14 * sr) as u32,
                            gain: 0.14 * g,
                            pan_l: pl,
                            pan_r: pr,
                            filter_cutoff_start: 1200.0,
                            filter_cutoff_end: 550.0,
                            filter_q: 1.5,
                            filter_bandpass: true,
                            ..Default::default()
                        });
                    }
                }
            }
            AudioKind::Splash => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Noise,
                    total_samples: (0.35 * sr) as u32,
                    gain: 0.30 * g,
                    pan_l: pl,
                    pan_r: pr,
                    filter_cutoff_start: 1050.0,
                    filter_cutoff_end: 450.0,
                    filter_q: 1.4,
                    filter_bandpass: true,
                    ..Default::default()
                });
            }
            AudioKind::Trampoline => {
                self.alloc_voice(Voice {
                    wave: WaveKind::SpringFm,
                    total_samples: (0.45 * sr) as u32,
                    f_start: 160.0 * p,
                    f_mid: 680.0 * p,
                    f_end: 340.0 * p,
                    mid_ratio: 0.4,
                    lfo_freq: 28.0,
                    lfo_depth: 45.0,
                    gain: 0.28 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::Bounce(intensity) => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Sine,
                    total_samples: (0.11 * sr) as u32,
                    f_start: 190.0 * p,
                    f_mid: 130.0 * p,
                    f_end: 78.0 * p,
                    mid_ratio: 0.3,
                    gain: (0.12 + intensity * 0.16) * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::GoalFanfare => {
                let notes = [523.25f32, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
                for (i, &freq) in notes.iter().enumerate() {
                    let delay = (i as f32 * 0.09 * sr) as u32;
                    let dur = if i == notes.len() - 1 { 0.55 } else { 0.28 };
                    self.alloc_voice(Voice {
                        wave: WaveKind::DualFormant,
                        delay_samples: delay,
                        total_samples: (dur * sr) as u32,
                        f_start: freq,
                        f_mid: freq,
                        f_end: freq,
                        gain: 0.22 * g,
                        pan_l: pl,
                        pan_r: pr,
                        filter_cutoff_start: 2800.0,
                        filter_cutoff_end: 2200.0,
                        filter_q: 0.9,
                        ..Default::default()
                    });
                }
            }
            AudioKind::TargetHit | AudioKind::TrickSuccess => {
                let notes = [440.0f32, 554.37, 659.25, 880.0, 1108.73];
                for (i, &f) in notes.iter().enumerate() {
                    self.alloc_voice(Voice {
                        wave: WaveKind::Triangle,
                        delay_samples: (i as f32 * 0.055 * sr) as u32,
                        total_samples: (0.20 * sr) as u32,
                        f_start: f * (if matches!(ev.kind, AudioKind::TargetHit) { p } else { 1.0 }),
                        f_mid: f,
                        f_end: f,
                        gain: 0.20 * g,
                        pan_l: pl,
                        pan_r: pr,
                        ..Default::default()
                    });
                }
            }
            AudioKind::SnackMunch => {
                for i in 0..3 {
                    let delay = (i as f32 * 0.085 * sr) as u32;
                    self.alloc_voice(Voice {
                        wave: WaveKind::Triangle,
                        delay_samples: delay,
                        total_samples: (0.07 * sr) as u32,
                        f_start: 580.0 + i as f32 * 110.0,
                        f_mid: 430.0,
                        f_end: 280.0,
                        mid_ratio: 0.5,
                        gain: 0.20 * g,
                        pan_l: pl,
                        pan_r: pr,
                        filter_cutoff_start: 1100.0,
                        filter_cutoff_end: 900.0,
                        filter_q: 1.5,
                        filter_bandpass: true,
                        ..Default::default()
                    });
                }
            }
            AudioKind::DiscoBeat(step) => {
                // Proper 128-BPM 16-step groove!
                if step % 2 == 0 {
                    // Punchy 808 Kick on quarter beats
                    self.alloc_voice(Voice {
                        wave: WaveKind::Kick808,
                        total_samples: (0.16 * sr) as u32,
                        f_start: 148.0,
                        f_mid: 68.0,
                        f_end: 42.0,
                        mid_ratio: 0.25,
                        gain: 0.30 * g,
                        pan_l: pl,
                        pan_r: pr,
                        ..Default::default()
                    });
                }
                if step % 4 == 2 {
                    // Snappy clap/snare on backbeats
                    self.alloc_voice(Voice {
                        wave: WaveKind::Snare,
                        total_samples: (0.12 * sr) as u32,
                        f_start: 220.0,
                        f_mid: 170.0,
                        f_end: 130.0,
                        gain: 0.18 * g,
                        pan_l: pl,
                        pan_r: pr,
                        filter_cutoff_start: 2200.0,
                        filter_cutoff_end: 1400.0,
                        filter_q: 1.2,
                        filter_bandpass: true,
                        ..Default::default()
                    });
                }
                if step % 2 == 1 {
                    // Crisp offbeat hi-hat
                    self.alloc_voice(Voice {
                        wave: WaveKind::HiHat,
                        total_samples: (0.045 * sr) as u32,
                        gain: 0.11 * g,
                        pan_l: pl,
                        pan_r: pr,
                        filter_cutoff_start: 6500.0,
                        filter_cutoff_end: 6500.0,
                        filter_q: 1.0,
                        filter_bandpass: true,
                        ..Default::default()
                    });
                }
                // Funky bass + pentatonic synth pluck
                let bass_notes = [110.0, 110.0, 130.81, 146.83, 110.0, 164.81, 146.83, 196.0];
                let lead_notes = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 659.25, 523.25];
                let b_freq = bass_notes[(step as usize) % bass_notes.len()];
                let l_freq = lead_notes[((step as usize) * 3) % lead_notes.len()];
                self.alloc_voice(Voice {
                    wave: WaveKind::Saw,
                    total_samples: (0.18 * sr) as u32,
                    f_start: b_freq,
                    f_mid: b_freq,
                    f_end: b_freq,
                    gain: 0.14 * g,
                    pan_l: pl,
                    pan_r: pr,
                    filter_cutoff_start: 900.0,
                    filter_cutoff_end: 300.0,
                    filter_q: 1.8,
                    ..Default::default()
                });
                self.alloc_voice(Voice {
                    wave: WaveKind::Saw,
                    delay_samples: (0.02 * sr) as u32,
                    total_samples: (0.16 * sr) as u32,
                    f_start: l_freq,
                    f_mid: l_freq,
                    f_end: l_freq,
                    gain: 0.11 * g,
                    pan_l: pl,
                    pan_r: pr,
                    filter_cutoff_start: 2600.0,
                    filter_cutoff_end: 550.0,
                    filter_q: 1.5,
                    ..Default::default()
                });
            }
            AudioKind::Howl => {
                self.alloc_voice(Voice {
                    wave: WaveKind::SpringFm,
                    total_samples: (1.5 * sr) as u32,
                    f_start: 280.0 * p,
                    f_mid: 740.0 * p,
                    f_end: 460.0 * p,
                    mid_ratio: 0.6,
                    lfo_freq: 6.0,
                    lfo_depth: 12.0 * p,
                    gain: 0.24 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::WaveSound => {
                for (i, &freq) in [659.25f32, 880.0, 1046.5].iter().enumerate() {
                    self.alloc_voice(Voice {
                        wave: WaveKind::Sine,
                        delay_samples: (i as f32 * 0.065 * sr) as u32,
                        total_samples: (0.15 * sr) as u32,
                        f_start: freq * p,
                        f_mid: freq * p,
                        f_end: freq * p,
                        gain: 0.16 * g,
                        pan_l: pl,
                        pan_r: pr,
                        ..Default::default()
                    });
                }
            }
            AudioKind::Confused => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Triangle,
                    total_samples: (0.34 * sr) as u32,
                    f_start: 540.0,
                    f_mid: 310.0,
                    f_end: 490.0,
                    mid_ratio: 0.45,
                    gain: 0.18 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::Whine => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Sine,
                    total_samples: (0.32 * sr) as u32,
                    f_start: 780.0 * p,
                    f_mid: 1260.0 * p,
                    f_end: 920.0 * p,
                    mid_ratio: 0.45,
                    gain: 0.15 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::Yip => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Triangle,
                    total_samples: (0.14 * sr) as u32,
                    f_start: 640.0 * p,
                    f_mid: 1450.0 * p,
                    f_end: 480.0 * p,
                    mid_ratio: 0.32,
                    gain: 0.24 * g,
                    pan_l: pl,
                    pan_r: pr,
                    ..Default::default()
                });
            }
            AudioKind::Grumble => {
                self.alloc_voice(Voice {
                    wave: WaveKind::Saw,
                    total_samples: (0.32 * sr) as u32,
                    f_start: 135.0 * p,
                    f_mid: 190.0 * p,
                    f_end: 115.0 * p,
                    mid_ratio: 0.45,
                    gain: 0.16 * g,
                    pan_l: pl,
                    pan_r: pr,
                    filter_cutoff_start: 520.0,
                    filter_cutoff_end: 440.0,
                    filter_q: 1.0,
                    ..Default::default()
                });
            }
            AudioKind::UiChirp => {
                for (i, &freq) in [520.0f32, 780.0, 1040.0].iter().enumerate() {
                    self.alloc_voice(Voice {
                        wave: WaveKind::Triangle,
                        delay_samples: (i as f32 * 0.055 * sr) as u32,
                        total_samples: (0.07 * sr) as u32,
                        f_start: freq,
                        f_mid: freq,
                        f_end: freq,
                        gain: 0.06,
                        pan_l: 0.707,
                        pan_r: 0.707,
                        ..Default::default()
                    });
                }
            }
        }
    }

    pub fn render_stereo(&mut self, out_l: &mut [f32], out_r: &mut [f32]) {
        let len = out_l.len().min(out_r.len());
        if self.muted {
            out_l[..len].fill(0.0);
            out_r[..len].fill(0.0);
            return;
        }
        let sr = self.sample_rate;
        let inv_sr = 1.0 / sr;
        let tau = std::f32::consts::TAU;

        for i in 0..len {
            let mut dry_l = 0.0f32;
            let mut dry_r = 0.0f32;

            // 1. Adaptive environmental soundscape
            if self.ambient_enabled {
                let wn = self.next_white();
                self.ambient_wind_lp = self.ambient_wind_lp * 0.994 + wn * 0.006;
                self.ambient_phase += inv_sr;
                let wave_mod = (self.ambient_phase * 0.55).sin() * 0.5 + 0.5;
                let lake = self.ambient_wind_lp * self.ambient_lake_gain * (0.4 + wave_mod * 0.9);
                let night = if self.ambient_night_gain > 0.0 {
                    let pulse = ((self.ambient_phase * 4.5).sin().max(0.0)).powi(6);
                    (self.ambient_phase * 4200.0 * tau).sin() * self.ambient_night_gain * pulse
                } else {
                    0.0
                };
                let rain = if self.ambient_rain_gain > 0.0 {
                    (wn - self.ambient_wind_lp) * self.ambient_rain_gain
                } else {
                    0.0
                };
                let amb = lake + night + rain;
                dry_l += amb;
                dry_r += amb;
            }

            // 2. Polyphonic synth voices
            for v in &mut self.voices {
                if !v.active {
                    continue;
                }
                if v.delay_samples > 0 {
                    v.delay_samples -= 1;
                    continue;
                }
                if v.sample_pos >= v.total_samples {
                    v.active = false;
                    continue;
                }
                let prog = v.sample_pos as f32 / v.total_samples.max(1) as f32;
                v.sample_pos += 1;

                // Frequency envelope
                let mut freq = if prog < v.mid_ratio && v.mid_ratio > 0.01 {
                    let t = prog / v.mid_ratio;
                    v.f_start + (v.f_mid - v.f_start) * t
                } else {
                    let t = (prog - v.mid_ratio) / (1.0 - v.mid_ratio).max(0.01);
                    v.f_mid + (v.f_end - v.f_mid) * t
                };

                if v.lfo_freq > 0.0 {
                    v.lfo_phase = (v.lfo_phase + v.lfo_freq * inv_sr) % 1.0;
                    freq += (v.lfo_phase * tau).sin() * v.lfo_depth;
                }

                // Amplitude ADSR
                let env = if prog < 0.06 {
                    prog / 0.06
                } else {
                    (1.0 - (prog - 0.06) / 0.94).powf(1.8)
                };

                v.phase = (v.phase + freq * inv_sr) % 1.0;
                v.phase2 = (v.phase2 + (freq * 1.5) * inv_sr) % 1.0;

                let raw = match v.wave {
                    WaveKind::Sine | WaveKind::SpringFm | WaveKind::Kick808 => (v.phase * tau).sin(),
                    WaveKind::Triangle => 4.0 * (v.phase - 0.5).abs() - 1.0,
                    WaveKind::Saw => 2.0 * v.phase - 1.0,
                    WaveKind::Noise | WaveKind::HiHat => {
                        self.rng_state ^= self.rng_state << 13;
                        self.rng_state ^= self.rng_state >> 7;
                        self.rng_state ^= self.rng_state << 17;
                        ((self.rng_state & 0xffffff) as f32) / 8388608.0 - 1.0
                    }
                    WaveKind::DualFormant => {
                        let s1 = 2.0 * v.phase - 1.0;
                        let s2 = 4.0 * (v.phase2 - 0.5).abs() - 1.0;
                        s1 * 0.65 + s2 * 0.35
                    }
                    WaveKind::Snare => {
                        self.rng_state ^= self.rng_state << 13;
                        self.rng_state ^= self.rng_state >> 7;
                        self.rng_state ^= self.rng_state << 17;
                        let n = ((self.rng_state & 0xffffff) as f32) / 8388608.0 - 1.0;
                        n * 0.7 + (v.phase * tau).sin() * 0.3
                    }
                };

                let shaped = if v.filter_cutoff_start > 10.0 {
                    let cut = (v.filter_cutoff_start
                        + (v.filter_cutoff_end - v.filter_cutoff_start) * prog)
                        .clamp(60.0, sr * 0.42);
                    let g_svf = (std::f32::consts::PI * cut * inv_sr).tan();
                    let k = 1.0 / v.filter_q.max(0.5);
                    let a1 = 1.0 / (1.0 + g_svf * (g_svf + k));
                    let a2 = g_svf * a1;
                    let a3 = g_svf * a2;
                    let v3 = raw - v.svf_ic2;
                    let v1 = a1 * v.svf_ic1 + a2 * v3;
                    let v2 = v.svf_ic2 + a2 * v.svf_ic1 + a3 * v3;
                    v.svf_ic1 = 2.0 * v1 - v.svf_ic1;
                    v.svf_ic2 = 2.0 * v2 - v.svf_ic2;
                    if v.filter_bandpass {
                        v1
                    } else {
                        v2
                    }
                } else {
                    raw
                };

                let sample = shaped * env * v.gain;
                dry_l += sample * v.pan_l;
                dry_r += sample * v.pan_r;
            }

            // 3. Stereo Schroeder Reverb (subtle 18% wet)
            let rev_in_l = dry_l * 0.25;
            let rev_in_r = dry_r * 0.25;
            let mut wet_l = 0.0f32;
            let mut wet_r = 0.0f32;
            for c in &mut self.comb_l {
                wet_l += c.process(rev_in_l);
            }
            for c in &mut self.comb_r {
                wet_r += c.process(rev_in_r);
            }
            for ap in &mut self.ap_l {
                wet_l = ap.process(wet_l);
            }
            for ap in &mut self.ap_r {
                wet_r = ap.process(wet_r);
            }

            // 4. Master Gain + Warm Soft-Clip Limiter (tanh)
            let mix_l = (dry_l + wet_l * 0.16) * self.master_gain;
            let mix_r = (dry_r + wet_r * 0.16) * self.master_gain;
            out_l[i] = mix_l.tanh();
            out_r[i] = mix_r.tanh();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_synth_produces_bounded_stereo_audio_for_events() {
        let mut synth = RoboAudioSynth::new(44100.0);
        synth.ambient_enabled = false;
        synth.emit_3d(
            AudioEvent {
                kind: AudioKind::Bark,
                world_pos: Vec3::new(3.0, 0.0, 0.0),
                pitch: 1.0,
            },
            Vec3::ZERO,
            Vec3::X,
        );
        synth.emit_3d(
            AudioEvent {
                kind: AudioKind::GoalFanfare,
                world_pos: Vec3::ZERO,
                pitch: 1.0,
            },
            Vec3::ZERO,
            Vec3::X,
        );
        let mut l = vec![0.0f32; 4096];
        let mut r = vec![0.0f32; 4096];
        synth.render_stereo(&mut l, &mut r);

        let energy_l: f32 = l.iter().map(|s| s.abs()).sum();
        let energy_r: f32 = r.iter().map(|s| s.abs()).sum();
        assert!(energy_l > 5.0 && energy_r > 5.0);
        assert!(l.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
        assert!(r.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
    }
}
