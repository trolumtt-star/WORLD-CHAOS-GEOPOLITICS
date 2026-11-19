/**
 * Yakınlık sesli sohbeti (proximity voice):
 *  - Mikrofon -> 8 kHz'e indirgenir -> G.711 μ-law (bayt başına örnek) -> 100 ms paketler
 *  - Sessizken gönderilmez (ses etkinliği algılama)
 *  - Sunucu paketi yalnızca yakındaki (aynı mekândaki) oyunculara iletir; NAT/TURN derdi yok
 *  - Alıcıda konuşmacının uzaklığına göre ses kısılır, sağ/sol kanala yerleştirilir
 */
const RATE = 8000;
const FRAME = 800; // 100 ms

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
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.src = ctx.createMediaStreamSource(this.stream);
    this.proc = ctx.createScriptProcessor(2048, 1, 1);
    this.mute = ctx.createGain();
    this.mute.gain.value = 0;
    this.src.connect(this.proc);
    this.proc.connect(this.mute).connect(ctx.destination);
    const step = ctx.sampleRate / RATE;
    let acc = 0, accN = 0, pos = 0;
    let frame = new Float32Array(FRAME), fi = 0;
    let hang = 0;
    this.proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < input.length; i++) {
        acc += input[i];
        accN++;
        pos += 1;
        if (pos >= step) {
          pos -= step;
          frame[fi++] = acc / accN;
          acc = 0; accN = 0;
          if (fi === FRAME) {
            this.flush(frame, hang > 0 ? (hang--, true) : false, (h) => (hang = h));
            frame = new Float32Array(FRAME);
            fi = 0;
          }
        }
      }
    };
    this.enabled = true;
    return true;
  }

  flush(frame, hanging, setHang) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const voice = rms > 0.012;
    if (voice) setHang(4);
    if (!voice && !hanging) { this.onTalking?.(false); return; }
    // Hafif kazanç: telefon mikrofonları kısık olabilir
    const gain = Math.min(4, 0.18 / Math.max(rms, 0.02));
    const bytes = new Uint8Array(frame.length);
    for (let i = 0; i < frame.length; i++) bytes[i] = linearToMu(frame[i] * gain);
    this.send(toB64(bytes));
    this.onTalking?.(true);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.proc.onaudioprocess = null;
    try { this.src.disconnect(); this.proc.disconnect(); this.mute.disconnect(); } catch { /* yok */ }
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
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 120;
      hp.connect(gain);
      if (pan) gain.connect(pan).connect(this.audio.master); else gain.connect(this.audio.master);
      sp = { gain, pan, hp, next: 0 };
      this.speakers.set(id, sp);
    }
    const bytes = fromB64(a);
    const buf = ctx.createBuffer(1, bytes.length, RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bytes.length; i++) ch[i] = MU_TABLE[bytes[i]];
    const vol = Math.pow(Math.max(0, 1 - d / this.range), 1.3) * 1.6;
    sp.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
    if (sp.pan && speakerPos) {
      const dx = speakerPos.x - this.listener.x, dz = speakerPos.z - this.listener.z;
      const len = Math.hypot(dx, dz) || 1;
      const right = (dx * Math.cos(this.listener.yaw) - dz * Math.sin(this.listener.yaw)) / len;
      sp.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, right)), ctx.currentTime, 0.05);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(sp.hp);
    // Titreşim tamponu: paketler gecikirse 120 ms ileriden devam et
    if (sp.next < ctx.currentTime + 0.02 || sp.next > ctx.currentTime + 0.6) sp.next = ctx.currentTime + 0.12;
    src.start(sp.next);
    sp.next += buf.duration;
    this.onSpeaking?.(id);
  }

  dispose() {
    this.stop();
    for (const sp of this.speakers.values()) { try { sp.gain.disconnect(); sp.pan?.disconnect(); } catch { /* yok */ } }
    this.speakers.clear();
  }
}
