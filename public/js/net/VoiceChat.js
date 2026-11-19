/**
 * Yakınlık sesli sohbeti (proximity voice) — temiz ses sürümü:
 *  - Mikrofon -> alçak geçiren filtre (kenar yumuşatma) -> 16 kHz'e doğrusal ara değerle indirgenir
 *    -> yumuşak otomatik kazanç + yumuşak sınırlayıcı (patlama/cızırtı yok) -> G.711 μ-law -> 100 ms paket
 *  - Yakalama AudioWorklet'te (oyun ağırken takılmaz), yoksa ScriptProcessor
 *  - Sessizken gönderilmez; konuşma başı/sonu yumuşak açılıp kapanır (tık sesi yok)
 *  - Alıcı paketleri kendisi cihaz hızına çevirip uç uca, aynı zaman çizgisine dizer;
 *    gecikip birikenler üst üste çalınmaz, düşürülür.
 */
const RATE = 16000;
const FRAME = 1600; // 100 ms

function linearToMu(sample) {
  const BIAS = 0x84, CLIP = 32635;
  let s = Math.max(-1, Math.min(1, sample)) * 32767;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  s = Math.min(CLIP, s) + BIAS;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; exp--, mask >>= 1);
  const man = (s >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | man) & 0xff;
}
const MU_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80, exp = (u >> 4) & 7, man = u & 0x0f;
  let s = ((man << 3) + 0x84) << exp;
  s -= 0x84;
  MU_TABLE[i] = (sign ? -s : s) / 32768;
}

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const WORKLET = `
class Cap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('wc-cap', Cap);`;

export class VoiceChat {
  constructor({ audio, send, range = 45, onSpeaking, onTalking }) {
    this.audio = audio;
    this.send = send;
    this.range = range;
    this.onSpeaking = onSpeaking; // (playerId) -> uzaktaki biri konuşuyor
    this.onTalking = onTalking;   // (bool) -> ben konuşuyorum
    this.enabled = false;
    this.speakers = new Map();
    this.listener = { x: 0, z: 0, yaw: 0 };
  }

  get supported() { return !!navigator.mediaDevices?.getUserMedia; }

  async start() {
    if (this.enabled) return true;
    this.audio.init();
    const ctx = this.audio.ctx;
    if (!ctx) throw new Error('Ses sistemi başlatılamadı.');
    if (!this.supported) throw new Error('Bu cihaz mikrofon erişimine izin vermiyor.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 48000 } } });
    this.src = ctx.createMediaStreamSource(this.stream);
    // Kenar yumuşatma: 16 kHz'e inerken 7 kHz üstü cızırtıya dönüşmesin
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 7000;
    this.lp.Q.value = 0.7;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 90; // uğultu
    this.src.connect(this.hp).connect(this.lp);
    this.mute = ctx.createGain();
    this.mute.gain.value = 0;

    const st = { step: ctx.sampleRate / RATE, pos: 0, prev: 0, frame: new Float32Array(FRAME), fi: 0 };
    const feed = (input) => {
      // Sürekli (paketler arası kopmayan) doğrusal ara değerli yeniden örnekleme
      for (let i = 0; i < input.length; i++) {
        const cur = input[i];
        while (st.pos <= 1) {
          st.frame[st.fi++] = st.prev + (cur - st.prev) * st.pos;
          st.pos += st.step;
          if (st.fi === FRAME) { this.flush(st.frame); st.frame = new Float32Array(FRAME); st.fi = 0; }
        }
        st.pos -= 1;
        st.prev = cur;
      }
    };
    this.node = null;
    try {
      if (!ctx.audioWorklet) throw new Error('yok');
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(ctx, 'wc-cap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      this.node.port.onmessage = (e) => this.enabled && feed(e.data);
    } catch {
      this.node = ctx.createScriptProcessor(2048, 1, 1);
      this.node.onaudioprocess = (e) => this.enabled && feed(e.inputBuffer.getChannelData(0));
    }
    this.lp.connect(this.node);
    this.node.connect(this.mute).connect(ctx.destination);
    this.agc = 1.5;
    this.noise = 0.004;
    this.hang = 0;
    this.talking = false;
    this.enabled = true;
    return true;
  }

  flush(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    // Gürültü tabanını öğren; konuşma = tabanın belirgin üstü
    if (rms < this.noise * 2.5) this.noise = this.noise * 0.95 + rms * 0.05;
    const voice = rms > Math.max(0.01, this.noise * 3);
    const wasTalking = this.talking;
    if (voice) this.hang = 5;
    else if (this.hang > 0) this.hang--;
    this.talking = voice || this.hang > 0;
    if (!this.talking) { if (wasTalking) this.onTalking?.(false); return; }
    // Yavaş değişen kazanç (paketten pakete sıçramaz = pompalama/cızırtı yok)
    if (voice) {
      const want = Math.max(0.8, Math.min(3, 0.12 / Math.max(rms, 0.005)));
      this.agc += (want - this.agc) * 0.15;
    }
    const n = frame.length, fade = 160; // 10 ms
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let v = frame[i] * this.agc;
      v = Math.tanh(v * 1.2) / 1.2; // yumuşak sınırlayıcı: kırpılma cızırtısı olmaz
      if (!wasTalking && i < fade) v *= i / fade;               // konuşma başı yumuşak
      if (this.hang === 0 && !voice && i > n - fade) v *= (n - i) / fade; // son paket yumuşak kapanış
      bytes[i] = linearToMu(v);
    }
    this.send(toB64(bytes));
    this.onTalking?.(true);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.node?.port) this.node.port.onmessage = null;
    if (this.node && 'onaudioprocess' in this.node) this.node.onaudioprocess = null;
    try { this.src.disconnect(); this.hp.disconnect(); this.lp.disconnect(); this.node.disconnect(); this.mute.disconnect(); } catch { /* yok */ }
    for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.onTalking?.(false);
  }

  setListener(x, z, yaw) { this.listener = { x, z, yaw }; }

  /** Sunucudan gelen ses paketi: { id, d, a } */
  receive({ id, d, a }, speakerPos) {
    const ctx = this.audio.ctx;
    if (!ctx || ctx.state !== 'running' || typeof a !== 'string') return;
    let sp = this.speakers.get(id);
    if (!sp) {
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7200; // μ-law hışırtısını yumuşat
      lp.connect(gain);
      if (pan) gain.connect(pan).connect(this.audio.master); else gain.connect(this.audio.master);
      sp = { gain, pan, lp, next: 0, last: 0, rate: 0 };
      this.speakers.set(id, sp);
    }
    const bytes = fromB64(a);
    // Kodu çöz ve cihaz hızına kendimiz çevir (tarayıcı her paketi ayrı çevirince ek yerlerinde tık olur)
    const outRate = ctx.sampleRate;
    const ratio = outRate / RATE;
    const outLen = Math.round(bytes.length * ratio);
    const buf = ctx.createBuffer(1, outLen, outRate);
    const ch = buf.getChannelData(0);
    let prev = sp.last;
    for (let o = 0; o < outLen; o++) {
      const f = o / ratio - 1; // önceki paketin son örneğiyle süreklilik
      const i0 = Math.floor(f), t = f - i0;
      const s0 = i0 < 0 ? prev : MU_TABLE[bytes[i0]];
      const s1 = MU_TABLE[bytes[Math.min(bytes.length - 1, i0 + 1)]];
      ch[o] = s0 + (s1 - s0) * t;
    }
    const vol = Math.pow(Math.max(0, 1 - d / this.range), 1.3) * 1.5;
    sp.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.08);
    if (sp.pan && speakerPos) {
      const dx = speakerPos.x - this.listener.x, dz = speakerPos.z - this.listener.z;
      const len = Math.hypot(dx, dz) || 1;
      const right = (dx * Math.cos(this.listener.yaw) - dz * Math.sin(this.listener.yaw)) / len;
      sp.pan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, right)), ctx.currentTime, 0.1);
    }
    const now = ctx.currentTime;
    const ahead = sp.next - now;
    if (ahead > 0.7) return; // çok birikti: üst üste çalmak yerine bu paketi at
    if (ahead < 0.01) {
      // Akış koptu: 150 ms tamponla yeniden başla, girişi yumuşat
      sp.next = now + 0.15;
      const f = Math.min(outLen, Math.round(outRate * 0.008));
      for (let i = 0; i < f; i++) ch[i] *= i / f;
    }
    sp.last = MU_TABLE[bytes[bytes.length - 1]];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(sp.lp);
    src.start(sp.next);
    sp.next += outLen / outRate;
    this.onSpeaking?.(id);
  }

  dispose() {
    this.stop();
    for (const sp of this.speakers.values()) { try { sp.gain.disconnect(); sp.pan?.disconnect(); } catch { /* yok */ } }
    this.speakers.clear();
  }
}
