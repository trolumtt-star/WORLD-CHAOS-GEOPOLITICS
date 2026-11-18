import { Settings } from '../core/Settings.js';

/**
 * Tamamen prosedürel ses: hiçbir ses dosyası yok, her şey WebAudio ile anlık sentezlenir.
 * (APK boyutu küçük kalır, internetsiz çalışır.)
 *  - SFX: tıklama, kasa, hata, inşaat, tüfek, tank topu, patlama, füze, siren, nükleer...
 *  - Müzik: ruh haline göre (menu / game / war) üretken akor-arpej-bas motoru
 *  - Ortam: şehir uğultusu
 */
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, z: 0 };
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Kahverengi gürültü (şehir uğultusu için)
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    this.applyVolumes();
    this.music = new MusicEngine(this);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(Settings.get('master'), t, 0.05);
    this.musicBus.gain.setTargetAtTime(Settings.get('music') * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(Settings.get('sfx'), t, 0.05);
  }

  get now() { return this.ctx?.currentTime ?? 0; }

  setListener(x, z) { this.listener.x = x; this.listener.z = z; }

  // ---------------- Temel yapı taşları ----------------
  tone({ type = 'sine', freq = 440, freqEnd, dur = 0.2, vol = 0.3, attack = 0.005, when = 0, dest, detune = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst({ dur = 0.3, vol = 0.3, type = 'lowpass', freq = 1000, freqEnd, q = 1, when = 0, attack = 0.005, dest, brown = false }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // Mesafeye göre ses (dünyadaki olaylar)
  playAt(name, x, z, opts = {}) {
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    const att = Math.max(0.04, 1 - d / (opts.range ?? 450));
    this.play(name, { ...opts, vol: (opts.vol ?? 1) * att });
  }

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // Aynı sesi aynı anda 30 kez çalmasın
    const nowMs = performance.now();
    const minGap = opts.minGap ?? 30;
    if (nowMs - (this.lastPlay[name] ?? 0) < minGap) return;
    this.lastPlay[name] = nowMs;
    const v = opts.vol ?? 1;
    const fn = SFX[name];
    if (fn) fn(this, v, opts);
  }

  // Sürekli çalan ortam sesi
  startAmbience() {
    if (!this.ctx || this.ambience) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start();
    this.ambience = { src, g };
  }

  stopAmbience() {
    this.ambience?.src.stop();
    this.ambience = null;
  }

  setMusic(mood) {
    if (this.music) this.music.setMood(mood);
  }
}

// ---------------- Ses efekti kütüphanesi ----------------
const SFX = {
  click: (a, v) => {
    a.tone({ type: 'square', freq: 1100, freqEnd: 700, dur: 0.05, vol: 0.08 * v });
    a.noiseBurst({ dur: 0.03, vol: 0.05 * v, type: 'highpass', freq: 3000 });
  },
  soft: (a, v) => a.tone({ type: 'sine', freq: 620, freqEnd: 520, dur: 0.06, vol: 0.1 * v }),
  open: (a, v) => {
    a.tone({ type: 'sine', freq: 520, dur: 0.08, vol: 0.12 * v });
    a.tone({ type: 'sine', freq: 780, dur: 0.12, vol: 0.12 * v, when: 0.06 });
  },
  close: (a, v) => {
    a.tone({ type: 'sine', freq: 700, dur: 0.07, vol: 0.1 * v });
    a.tone({ type: 'sine', freq: 480, dur: 0.1, vol: 0.1 * v, when: 0.05 });
  },
  cash: (a, v) => {
    a.tone({ type: 'triangle', freq: 1320, dur: 0.18, vol: 0.18 * v });
    a.tone({ type: 'triangle', freq: 1760, dur: 0.35, vol: 0.18 * v, when: 0.08 });
    for (let i = 0; i < 4; i++) a.noiseBurst({ dur: 0.05, vol: 0.06 * v, type: 'highpass', freq: 5000, when: 0.02 + i * 0.05 });
  },
  error: (a, v) => {
    a.tone({ type: 'square', freq: 220, freqEnd: 170, dur: 0.14, vol: 0.12 * v });
    a.tone({ type: 'square', freq: 200, freqEnd: 150, dur: 0.18, vol: 0.12 * v, when: 0.16 });
  },
  success: (a, v) => {
    [72, 76, 79, 84].forEach((m, i) => a.tone({ type: 'triangle', freq: midi(m), dur: 0.25, vol: 0.14 * v, when: i * 0.07 }));
  },
  build: (a, v) => {
    for (let i = 0; i < 3; i++) {
      a.noiseBurst({ dur: 0.08, vol: 0.2 * v, type: 'bandpass', freq: 900, q: 3, when: i * 0.12 });
      a.tone({ type: 'square', freq: 180, freqEnd: 120, dur: 0.06, vol: 0.1 * v, when: i * 0.12 });
    }
    SFX.success(a, v * 0.8);
  },
  notify: (a, v) => {
    a.tone({ type: 'sine', freq: 880, dur: 0.12, vol: 0.12 * v });
    a.tone({ type: 'sine', freq: 1320, dur: 0.2, vol: 0.1 * v, when: 0.1 });
  },
  type: (a, v) => a.noiseBurst({ dur: 0.02, vol: 0.06 * v, type: 'highpass', freq: 4000 }),
  rifle: (a, v) => {
    a.noiseBurst({ dur: 0.09, vol: 0.32 * v, type: 'bandpass', freq: 1700, q: 0.8 });
    a.tone({ type: 'square', freq: 170, freqEnd: 60, dur: 0.07, vol: 0.12 * v });
  },
  cannon: (a, v) => {
    a.noiseBurst({ dur: 0.55, vol: 0.6 * v, type: 'lowpass', freq: 1400, freqEnd: 150 });
    a.tone({ type: 'sine', freq: 80, freqEnd: 35, dur: 0.5, vol: 0.5 * v });
  },
  explosion: (a, v, o) => {
    const s = o.size ?? 1;
    a.noiseBurst({ dur: 0.9 * s + 0.4, vol: 0.85 * v, type: 'lowpass', freq: 1800, freqEnd: 90, attack: 0.01 });
    a.tone({ type: 'sine', freq: 70, freqEnd: 28, dur: 0.9 * s + 0.3, vol: 0.7 * v });
    for (let i = 0; i < 6; i++) a.noiseBurst({ dur: 0.05, vol: 0.15 * v, type: 'highpass', freq: 2500, when: 0.1 + Math.random() * 0.6 * s });
  },
  launch: (a, v) => {
    a.noiseBurst({ dur: 1.6, vol: 0.45 * v, type: 'bandpass', freq: 300, freqEnd: 2600, q: 1.2, attack: 0.15 });
    a.tone({ type: 'sawtooth', freq: 70, freqEnd: 140, dur: 1.4, vol: 0.12 * v, attack: 0.1 });
  },
  intercept: (a, v) => {
    a.noiseBurst({ dur: 0.5, vol: 0.3 * v, type: 'highpass', freq: 1500, freqEnd: 4000 });
    a.tone({ type: 'square', freq: 1400, freqEnd: 2200, dur: 0.15, vol: 0.06 * v });
  },
  alarm: (a, v) => {
    for (let i = 0; i < 6; i++) a.tone({ type: 'square', freq: i % 2 ? 760 : 960, dur: 0.22, vol: 0.09 * v, when: i * 0.24 });
  },
  siren: (a, v) => {
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 700;
    lfo.frequency.value = 0.45;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.6);
    g.gain.setValueAtTime(0.16 * v, t + 6.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
    o.connect(f).connect(g).connect(a.sfxBus);
    o.start(t); lfo.start(t);
    o.stop(t + 8.1); lfo.stop(t + 8.1);
  },
  nuke: (a, v) => {
    SFX.explosion(a, v, { size: 3.5 });
    a.noiseBurst({ dur: 7, vol: 0.6 * v, type: 'lowpass', freq: 220, freqEnd: 40, attack: 0.4, when: 0.3, brown: true });
    a.tone({ type: 'sine', freq: 45, freqEnd: 20, dur: 6, vol: 0.6 * v, attack: 0.3 });
  },
  boom: (a, v) => {
    a.tone({ type: 'sine', freq: 120, freqEnd: 28, dur: 2.6, vol: 0.85 * v });
    a.noiseBurst({ dur: 2.8, vol: 0.55 * v, type: 'lowpass', freq: 2200, freqEnd: 60 });
    a.tone({ type: 'sawtooth', freq: 55, freqEnd: 30, dur: 2.2, vol: 0.18 * v });
  },
  riser: (a, v) => {
    a.noiseBurst({ dur: 3.2, vol: 0.3 * v, type: 'bandpass', freq: 200, freqEnd: 5000, q: 2, attack: 2.8 });
    a.tone({ type: 'sawtooth', freq: 90, freqEnd: 420, dur: 3.2, vol: 0.08 * v, attack: 2.8 });
  },
  whoosh: (a, v) => a.noiseBurst({ dur: 0.6, vol: 0.25 * v, type: 'bandpass', freq: 1600, freqEnd: 250, q: 1.5, attack: 0.15 }),
  built: (a, v) => SFX.success(a, v),
};

// ---------------- Üretken müzik ----------------
const MOODS = {
  menu: { bpm: 78, chords: [[45, 48, 52, 57], [41, 45, 48, 53], [48, 52, 55, 60], [43, 47, 50, 55]], pad: 0.05, arp: 0.05, arpEvery: 1, kick: [0, 4], hat: 0.012, bass: 0.12, cutoff: 1100 },
  game: { bpm: 70, chords: [[50, 53, 57, 60], [46, 50, 53, 57], [41, 48, 53, 57], [48, 52, 55, 60]], pad: 0.035, arp: 0.035, arpEvery: 2, kick: [], hat: 0, bass: 0.07, cutoff: 900 },
  war:  { bpm: 112, chords: [[40, 47, 52, 55], [36, 48, 52, 55], [38, 50, 54, 57], [35, 47, 50, 54]], pad: 0.04, arp: 0.045, arpEvery: 1, kick: [0, 2, 4, 6], hat: 0.02, bass: 0.15, cutoff: 1600, stab: true },
};

class MusicEngine {
  constructor(audio) {
    this.a = audio;
    this.mood = null;
    this.step = 0;
    this.next = 0;
    const ctx = audio.ctx;
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.38;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.35;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.delay.connect(this.fb).connect(this.delay);
    this.delay.connect(this.wet).connect(audio.musicBus);
    this.timer = setInterval(() => this.schedule(), 60);
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.preset = MOODS[mood] ?? null;
    if (this.preset && this.next < this.a.now) this.next = this.a.now + 0.1;
  }

  schedule() {
    const p = this.preset;
    if (!p || this.a.ctx.state !== 'running') return;
    const eighth = 60 / p.bpm / 2;
    while (this.next < this.a.now + 0.25) {
      this.playStep(this.step, this.next - this.a.now, eighth, p);
      this.step = (this.step + 1) % 32;
      this.next += eighth;
    }
  }

  playStep(step, when, eighth, p) {
    const a = this.a;
    const bus = a.musicBus;
    const bar = Math.floor(step / 8);
    const s = step % 8;
    const chord = p.chords[bar % p.chords.length];

    if (s === 0) {
      // Pad: her akor notası için hafif detune'lu iki testere dalga
      for (const n of chord) {
        for (const det of [-7, 7]) {
          this.pad(midi(n + 12), when, eighth * 8, p.pad, det, p.cutoff);
        }
      }
    }
    if (p.bass && (s === 0 || s === 4 || (p.stab && s % 2 === 0))) {
      a.tone({ type: p.stab ? 'sawtooth' : 'sine', freq: midi(chord[0] - 12), dur: p.stab ? eighth * 0.9 : eighth * 3.5, vol: p.bass, when, dest: bus, attack: 0.01 });
    }
    if (p.arp && step % p.arpEvery === 0) {
      const n = chord[(s + bar) % chord.length] + 24;
      a.tone({ type: 'triangle', freq: midi(n), dur: eighth * 1.6, vol: p.arp, when, dest: bus });
      a.tone({ type: 'triangle', freq: midi(n), dur: eighth * 1.6, vol: p.arp * 0.6, when, dest: this.delay });
    }
    if (p.kick.includes(s)) {
      a.tone({ type: 'sine', freq: 130, freqEnd: 38, dur: 0.28, vol: 0.32, when, dest: bus });
    }
    if (p.hat && s % 2 === 1) {
      a.noiseBurst({ dur: 0.04, vol: p.hat, type: 'highpass', freq: 7000, when, dest: bus });
    }
  }

  pad(freq, when, dur, vol, detune, cutoff) {
    const ctx = this.a.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 0.5, t);
    f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(cutoff * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    o.connect(f).connect(g).connect(this.a.musicBus);
    o.start(t);
    o.stop(t + dur * 1.1);
  }
}
