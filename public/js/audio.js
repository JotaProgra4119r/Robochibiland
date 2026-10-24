// Procedural Web Audio API Sound Synthesizer (Enhanced Studio Edition)
// Master Compressor, Subtle Spatial Reverb, Multi-Oscillator Formants & Complete SFX Suite

class RoboAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.reverbNode = null;
    this.reverbGain = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master Dynamics Compressor for warm, punchy, clip-free sound
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      // Subtle synthetic impulse reverb for spatial depth
      this.reverbNode = this.createImpulseReverb(0.45, 2.8);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // Pre-generate reusable pink/white noise buffer
      this.noiseBuffer = this.createNoiseBuffer(1.0);
      this.initialized = true;
    } catch (e) {
      console.warn("AudioContext no soportado:", e);
    }
  }

  createImpulseReverb(duration = 0.4, decay = 2.5) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const convolver = this.ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  createNoiseBuffer(duration = 1.0) {
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  get out() {
    return this.masterGain || this.ctx.destination;
  }

  playBark(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Dual-oscillator formant bark (warm & expressive)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const formant = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    const baseFreq = 310 * pitch;
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(820 * pitch, now + 0.045);
    osc1.frequency.exponentialRampToValueAtTime(210 * pitch, now + 0.17);

    osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
    osc2.frequency.exponentialRampToValueAtTime(1180 * pitch, now + 0.045);
    osc2.frequency.exponentialRampToValueAtTime(310 * pitch, now + 0.17);

    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(950 * pitch, now);
    formant.frequency.exponentialRampToValueAtTime(1850 * pitch, now + 0.05);
    formant.frequency.exponentialRampToValueAtTime(650 * pitch, now + 0.17);
    formant.Q.setValueAtTime(1.8, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    osc1.connect(formant);
    osc2.connect(formant);
    formant.connect(gain);
    gain.connect(this.out);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.19);
    osc2.stop(now + 0.19);
  }

  playBoop(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    sub.type = 'triangle';

    osc.frequency.setValueAtTime(840 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(1380 * pitch, now + 0.09);

    sub.frequency.setValueAtTime(420 * pitch, now);
    sub.frequency.exponentialRampToValueAtTime(690 * pitch, now + 0.09);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    sub.connect(gain);
    gain.connect(this.out);

    osc.start(now);
    sub.start(now);
    osc.stop(now + 0.12);
    sub.stop(now + 0.12);
  }

  playJump(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(760 * pitch, now + 0.16);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.out);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  playHappyJingle() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const harm = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.075;

      osc.type = 'triangle';
      harm.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      harm.frequency.setValueAtTime(freq * 2, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.19);

      osc.connect(gain);
      harm.connect(gain);
      gain.connect(this.out);

      osc.start(startTime);
      harm.start(startTime);
      osc.stop(startTime + 0.19);
      harm.stop(startTime + 0.19);
    });
  }

  playCurious() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.26);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.out);

    osc.start(now);
    osc.stop(now + 0.32);
  }

  playStep() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Soft padded robotic servo tap
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const base = 115 + Math.random() * 35;
    osc.frequency.setValueAtTime(base * 1.6, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, now + 0.045);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  playSplash() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.18);
    filter.frequency.exponentialRampToValueAtTime(1200, now + 0.32);
    filter.Q.setValueAtTime(1.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);

    noise.start(now);
    noise.stop(now + 0.35);
  }

  playTrampoline() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.42);

    // Vibrato spring wobble
    lfo.frequency.setValueAtTime(28, now);
    lfoGain.gain.setValueAtTime(45, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.out);

    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.45);
    lfo.stop(now + 0.45);
  }

  playGoalFanfare() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.09;
      const dur = idx === notes.length - 1 ? 0.55 : 0.28;

      osc.type = 'triangle';
      sub.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      sub.frequency.setValueAtTime(freq * 0.5, startTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.24, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this.out);

      osc.start(startTime);
      sub.start(startTime);
      osc.stop(startTime + dur);
      sub.stop(startTime + dur);
    });
  }

  playSnackMunch() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [0, 0.085, 0.17].forEach((offset, i) => {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580 + i * 110, now + offset);
      osc.frequency.exponentialRampToValueAtTime(280, now + offset + 0.065);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, now + offset);

      gain.gain.setValueAtTime(0.2, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.out);

      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  playDanceBeat() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Punchy electronic kick
    const kick = this.ctx.createOscillator();
    const kickGain = this.ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(145, now);
    kick.frequency.exponentialRampToValueAtTime(42, now + 0.13);
    kickGain.gain.setValueAtTime(0.32, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    kick.connect(kickGain);
    kickGain.connect(this.out);
    kick.start(now);
    kick.stop(now + 0.15);

    // Warm filtered funk synth pluck
    const synth = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const synthGain = this.ctx.createGain();
    synth.type = 'sawtooth';
    const pentatonic = [440, 523.25, 587.33, 659.25, 783.99, 880];
    const note = pentatonic[Math.floor(Math.random() * pentatonic.length)];
    synth.frequency.setValueAtTime(note, now + 0.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now + 0.05);
    filter.frequency.exponentialRampToValueAtTime(450, now + 0.21);

    synthGain.gain.setValueAtTime(0.14, now + 0.05);
    synthGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    synth.connect(filter);
    filter.connect(synthGain);
    synthGain.connect(this.out);
    synth.start(now + 0.05);
    synth.stop(now + 0.22);
  }

  // Alias used in robot.js PARTY emotion
  playDiscoBeat() {
    this.playDanceBeat();
  }

  playTrickSuccess() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const notes = [440, 554.37, 659.25, 880, 1108.73];
    const now = this.ctx.currentTime;
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.055;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.out);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  playHowl(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const harm = this.ctx.createOscillator();
    const vibrato = this.ctx.createOscillator();
    const vibGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    harm.type = 'triangle';

    osc.frequency.setValueAtTime(280 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(620 * pitch, now + 0.42);
    osc.frequency.exponentialRampToValueAtTime(740 * pitch, now + 0.9);
    osc.frequency.exponentialRampToValueAtTime(460 * pitch, now + 1.45);

    harm.frequency.setValueAtTime(560 * pitch, now);
    harm.frequency.exponentialRampToValueAtTime(1240 * pitch, now + 0.42);
    harm.frequency.exponentialRampToValueAtTime(1480 * pitch, now + 0.9);
    harm.frequency.exponentialRampToValueAtTime(920 * pitch, now + 1.45);

    vibrato.frequency.setValueAtTime(6.0, now);
    vibGain.gain.setValueAtTime(12 * pitch, now);
    vibrato.connect(vibGain);
    vibGain.connect(osc.frequency);

    const harmGain = this.ctx.createGain();
    harmGain.gain.setValueAtTime(0.25, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc.connect(gain);
    harm.connect(harmGain);
    harmGain.connect(gain);
    gain.connect(this.out);

    osc.start(now);
    harm.start(now);
    vibrato.start(now);
    osc.stop(now + 1.5);
    harm.stop(now + 1.5);
    vibrato.stop(now + 1.5);
  }

  playWaveSound(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [659.25, 880, 1046.5].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.065;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * pitch, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(this.out);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  playConfused() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(310, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(490, now + 0.3);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc.connect(gain);
    gain.connect(this.out);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  playWhine(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(780 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(1260 * pitch, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(920 * pitch, now + 0.3);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.out);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  playYip(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(1450 * pitch, now + 0.045);
    osc.frequency.exponentialRampToValueAtTime(480 * pitch, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.out);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playGrumble(pitch = 1.0) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135 * pitch, now);
    osc.frequency.linearRampToValueAtTime(190 * pitch, now + 0.14);
    osc.frequency.linearRampToValueAtTime(115 * pitch, now + 0.3);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, now);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  playPlayfulGrumble(pitch = 1.0) {
    this.playGrumble(pitch);
  }
}

export const roboAudio = new RoboAudioEngine();