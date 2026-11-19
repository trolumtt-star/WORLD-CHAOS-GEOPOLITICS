import { CLUBS } from '../../shared/catalogs.js';

/**
 * Canlı maç simülasyonu (7'ye 7): pas, çalım, top sürme, şut, kurtarış, gol.
 * Skoru sunucu belirler: sunucu "gol" dediğinde o takım bir sonraki atakta golü atar.
 * Aynı durum hem stadyumdaki 3D sahneyi hem de televizyondaki yayını besler.
 * Koordinatlar sahaya göre: x uzun kenar (-W/2..W/2), z kısa kenar. Ev sahibi soldan sağa (+x) hücum eder.
 */
const NAMES = ['Arda', 'Kerem', 'Hakan', 'Cengiz', 'Barış', 'Ozan', 'Emre', 'Volkan', 'Burak', 'Mert', 'Selçuk', 'Ferdi', 'Yunus', 'Kaan', 'Orkun', 'Semih', 'Uğur', 'Altay', 'Zeki', 'Okay'];
const FORM = [[-0.46, 0, 'GK'], [-0.3, -0.25, 'DF'], [-0.3, 0.25, 'DF'], [-0.08, -0.3, 'MF'], [-0.08, 0.3, 'MF'], [0.15, -0.12, 'FW'], [0.15, 0.12, 'FW']];

export class MatchSim {
  constructor(W = 56, D = 34) {
    this.W = W;
    this.D = D;
    this.match = null;
    this.players = [];
    this.ball = { x: 0, z: 0, vx: 0, vz: 0, owner: null, air: 0 };
    this.events = [];
    this.pendingGoal = [];
    this.celebrate = 0;
    this.decide = 0;
    this.lastEvent = '';
    this.seed = 1;
  }

  rand() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }

  setMatch(m) {
    const key = m ? `${m.id}` : null;
    const fresh = key !== this.key;
    this.match = m;
    this.key = key;
    if (!m) { this.players = []; return; }
    if (fresh) {
      this.seed = [...String(m.id)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483646 + 1;
      this.players = [];
      for (const side of [0, 1]) {
        const club = CLUBS[side ? m.away : m.home];
        FORM.forEach(([fx, fz, role], k) => {
          const hx = (side ? -fx : fx) * this.W, hz = fz * this.D;
          this.players.push({ side, role, k, name: NAMES[(k * 3 + side * 7 + (m.home ?? 0)) % NAMES.length], club, home: { x: hx, z: hz }, x: hx, z: hz, rot: side ? -Math.PI / 2 : Math.PI / 2, speed: 0, skill: 0.4 + this.rand() * 0.5 });
        });
      }
      this.kickoff(this.rand() < 0.5 ? 0 : 1);
      this.scoreSeen = [...(m.score ?? [0, 0])];
    }
  }

  /** Sunucudan gol geldi: o takım golü atar */
  forceGoal(side) {
    this.pendingGoal.push(side);
  }

  get live() { return this.match?.status === 'live'; }

  log(text) {
    this.lastEvent = text;
    this.events.unshift({ text, at: performance.now() });
    this.events.length = Math.min(this.events.length, 6);
    this.onEvent?.(text);
  }

  kickoff(side) {
    const b = this.ball;
    b.x = 0; b.z = 0; b.vx = b.vz = 0; b.air = 0;
    for (const p of this.players) { p.x = p.home.x * 0.85; p.z = p.home.z; }
    const fw = this.players.find((p) => p.side === side && p.role === 'FW');
    if (fw) { fw.x = side ? 1 : -1; fw.z = 0; }
    b.owner = fw ?? null;
    this.decide = 1;
  }

  goalX(side) { return (side ? -1 : 1) * (this.W / 2); } // side'ın hücum ettiği kale

  pass(from, to, power = 1) {
    const b = this.ball;
    const lead = 2.5;
    const tx = to.x + (to.side ? -lead : lead), tz = to.z;
    const dx = tx - from.x, dz = tz - from.z, d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(34, 14 + d * 0.8) * power;
    b.owner = null;
    b.vx = (dx / d) * sp; b.vz = (dz / d) * sp;
    b.x = from.x + (dx / d) * 0.8; b.z = from.z + (dz / d) * 0.8;
    b.air = d > 18 ? 0.6 : 0;
    b.lastTouch = from;
    b.intended = to;
  }

  shoot(p, goal) {
    const b = this.ball;
    const gx = this.goalX(p.side);
    const onTarget = goal || this.rand() < 0.55;
    const tz = goal ? (this.rand() - 0.5) * 5 : onTarget ? (this.rand() - 0.5) * 6 : (this.rand() < 0.5 ? -1 : 1) * (4.2 + this.rand() * 3);
    const dx = gx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
    b.owner = null;
    b.vx = (dx / d) * 42; b.vz = (dz / d) * 42;
    b.air = 0.5 + this.rand() * 0.6;
    b.shot = { side: p.side, goal, onTarget, by: p };
    b.lastTouch = p;
    this.log(`🎯 Şut! ${p.name} (${p.club.name})`);
  }

  nearest(list, x, z) {
    let best = null, bd = Infinity;
    for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return [best, bd];
  }

  update(dt) {
    if (!this.live || !this.players.length) return;
    dt = Math.min(dt, 0.05);
    const b = this.ball;
    // Sunucuda yeni gol var mı (sahneye girmeden önce atılmış olanları say)
    const sc = this.match.score;
    if (this.scoreSeen) {
      for (const side of [0, 1]) while (this.scoreSeen[side] < sc[side]) { this.scoreSeen[side]++; if (!this.pendingGoal.includes(side)) this.pendingGoal.push(side); }
    }
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      for (const p of this.players) { p.speed = 0; if (p.side === this.celebrateSide && p.role !== 'GK') { p.x += (this.goalX(p.side) * 0.7 - p.x) * dt * 0.8; p.speed = 4; } }
      if (this.celebrate <= 0) this.kickoff(1 - this.celebrateSide);
      return;
    }
    // Bekleyen golü olan takım topu alır ve hücuma geçer
    if (this.pendingGoal.length && b.owner?.side !== this.pendingGoal[0] && !b.shot) {
      const side = this.pendingGoal[0];
      const att = this.players.filter((p) => p.side === side && p.role === 'FW');
      const p = att[Math.floor(this.rand() * att.length)];
      if (p) { b.owner = p; b.vx = b.vz = 0; this.log(`⚡ ${p.club.name} topu kaptı!`); }
    }

    // Top hareketi
    if (b.owner) {
      const o = b.owner;
      b.x = o.x + Math.sin(o.rot) * 0.9; b.z = o.z + Math.cos(o.rot) * 0.9; b.vx = b.vz = 0; b.air = 0;
    } else {
      b.x += b.vx * dt; b.z += b.vz * dt;
      const fr = Math.pow(0.35, dt);
      b.vx *= fr; b.vz *= fr;
      b.air = Math.max(0, b.air - dt * 0.9);
      // Kale çizgisi
      const half = this.W / 2;
      if (Math.abs(b.x) > half) {
        const side = b.x > 0 ? 0 : 1; // hangi takımın hücum ettiği kale
        if (b.shot?.goal && b.shot.side === side) return this.scoreGoal(b.shot.by);
        const keeper = this.players.find((p) => p.side !== side && p.role === 'GK');
        if (Math.abs(b.z) < 3.5 && b.shot?.onTarget) this.log(`🧤 Kurtarış! ${keeper?.name ?? 'Kaleci'} topu çeldi`);
        else if (b.shot) this.log('😩 Top auta gitti, kıl payı!');
        b.shot = null;
        b.x = Math.sign(b.x) * (half - 1.5); b.z = Math.max(-this.D / 2 + 2, Math.min(this.D / 2 - 2, b.z));
        b.vx = b.vz = 0;
        b.owner = keeper ?? null;
        this.decide = 0.8;
      }
      if (Math.abs(b.z) > this.D / 2) { b.z = Math.sign(b.z) * (this.D / 2 - 0.5); b.vz *= -0.4; }
      // Topu kim alır
      if (Math.hypot(b.vx, b.vz) < 26 || !b.shot) {
        const [p, d] = this.nearest(this.players, b.x, b.z);
        if (p && d < 1.3 && p !== b.lastTouch) {
          if (b.shot && p.role === 'GK' && p.side !== b.shot.side && !b.shot.goal) this.log(`🧤 ${p.name} topu kucakladı!`);
          else if (b.intended && p.side !== b.intended.side && !b.shot) this.log(`✂️ Araya girdi: ${p.name}`);
          b.owner = p; b.shot = null; b.intended = null;
          this.decide = 0.4 + this.rand() * 0.5;
        }
      }
    }

    // Oyuncular
    const owner = b.owner;
    for (const p of this.players) {
      let tx, tz, sp = 7;
      if (p === owner) {
        const gx = this.goalX(p.side);
        tx = gx; tz = p.z * 0.6;
        sp = 7.5 + p.skill * 2;
      } else if (p.role === 'GK') {
        tx = p.home.x; tz = Math.max(-3.2, Math.min(3.2, b.z * 0.4)); sp = 6;
      } else {
        const attacking = owner && owner.side === p.side;
        const shift = (b.x - 0) * 0.55 + (attacking ? (p.side ? -1 : 1) * 6 : (p.side ? 1 : -1) * 3);
        tx = p.home.x + shift;
        tz = p.home.z + (b.z - p.home.z) * 0.25;
        // En yakın rakip topa baskı yapar
        if (!attacking) {
          const [closest] = this.nearest(this.players.filter((q) => q.side === p.side && q.role !== 'GK'), b.x, b.z);
          if (closest === p) { tx = b.x; tz = b.z; sp = 8.5; }
        }
        if (!owner) { const [c2] = this.nearest(this.players.filter((q) => q.side === p.side && q.role !== 'GK'), b.x, b.z); if (c2 === p) { tx = b.x; tz = b.z; sp = 9; } }
      }
      tx = Math.max(-this.W / 2 + 1, Math.min(this.W / 2 - 1, tx));
      tz = Math.max(-this.D / 2 + 1, Math.min(this.D / 2 - 1, tz));
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, sp * dt);
      if (d > 0.2) { p.x += (dx / d) * step; p.z += (dz / d) * step; p.rot = Math.atan2(dx, dz); }
      p.speed = step / dt;
    }

    // Top sahibinin kararı: sür / çalım / pas / şut
    if (owner) {
      this.decide -= dt;
      const opp = this.players.filter((q) => q.side !== owner.side);
      const [press, pd] = this.nearest(opp, owner.x, owner.z);
      if (press && pd < 1.4 && owner.role !== 'GK') {
        const forced = this.pendingGoal[0] === owner.side;
        if (!forced && this.rand() < 0.35 * (1.2 - owner.skill)) {
          b.owner = press; this.log(`🛡️ ${press.name} topu kaptı!`); this.decide = 0.5; return;
        }
        // Çalım: rakibin yanından sıyrıl
        owner.z += (owner.z > press.z ? 1 : -1) * 2.2;
        owner.x += (owner.side ? -1 : 1) * 1.2;
        press.x -= (owner.side ? -1 : 1) * 0.8;
        if (this.rand() < 0.5) this.log(`🌀 Çalım! ${owner.name} ${press.name}'i geçti`);
        this.decide = Math.min(this.decide, 0.3);
      }
      const distGoal = Math.abs(this.goalX(owner.side) - owner.x);
      const forced = this.pendingGoal[0] === owner.side;
      if (forced && distGoal < 16) {
        this.shoot(owner, true);
        this.pendingGoal.shift();
      } else if (this.decide <= 0) {
        if (owner.role === 'GK' || (distGoal > 20 && this.rand() < 0.55)) {
          const mates = this.players.filter((q) => q.side === owner.side && q !== owner && q.role !== 'GK');
          const fwd = mates.filter((q) => (owner.side ? q.x < owner.x + 3 : q.x > owner.x - 3));
          const pick = (fwd.length ? fwd : mates)[Math.floor(this.rand() * (fwd.length || mates.length))];
          if (pick) { this.pass(owner, pick, owner.role === 'GK' ? 1.2 : 1); if (this.rand() < 0.25) this.log(`👟 ${owner.name} → ${pick.name}`); }
        } else if (distGoal < 15 && !forced && this.rand() < 0.5) {
          this.shoot(owner, false);
        }
        this.decide = 0.5 + this.rand() * 0.8;
      }
    }
  }

  scoreGoal(by) {
    const b = this.ball;
    b.vx = b.vz = 0; b.shot = null; b.owner = null;
    b.x = Math.sign(b.x) * (this.W / 2 + 0.8);
    this.celebrate = 3.2;
    this.celebrateSide = by.side;
    this.log(`⚽⚽ GOOOL! ${by.name} (${by.club.name})`);
    this.onGoal?.(by.side);
  }

  /** TV için kuşbakışı çizim */
  draw2D(x, ox, oy, w, h) {
    const sx = w / this.W, sz = h / this.D;
    x.fillStyle = '#2e8b3a'; x.fillRect(ox, oy, w, h);
    for (let i = 0; i < 8; i += 2) { x.fillStyle = '#37a043'; x.fillRect(ox + (w / 8) * i, oy, w / 8, h); }
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2;
    x.strokeRect(ox + 2, oy + 2, w - 4, h - 4);
    x.beginPath(); x.moveTo(ox + w / 2, oy); x.lineTo(ox + w / 2, oy + h); x.stroke();
    x.beginPath(); x.arc(ox + w / 2, oy + h / 2, h * 0.15, 0, Math.PI * 2); x.stroke();
    x.strokeRect(ox, oy + h * 0.3, w * 0.1, h * 0.4); x.strokeRect(ox + w * 0.9, oy + h * 0.3, w * 0.1, h * 0.4);
    for (const p of this.players) {
      const px = ox + (p.x + this.W / 2) * sx, pz = oy + (p.z + this.D / 2) * sz;
      x.fillStyle = `#${p.club.color.toString(16).padStart(6, '0')}`;
      x.beginPath(); x.arc(px, pz, 5.5, 0, Math.PI * 2); x.fill();
      x.strokeStyle = `#${p.club.color2.toString(16).padStart(6, '0')}`; x.lineWidth = 2; x.stroke();
    }
    const b = this.ball;
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(ox + (b.x + this.W / 2) * sx, oy + (b.z + this.D / 2) * sz - b.air * 6, 3.5 + b.air * 2, 0, Math.PI * 2); x.fill();
  }
}
