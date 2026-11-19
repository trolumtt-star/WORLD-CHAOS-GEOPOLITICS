import { interiorLayout, interiorOrigin, spotById, entryPoint } from '../../shared/interiors.js';

/**
 * Bina içindeki NPC'ler görünür:
 *  - Müşteri NPC kapıdan girer, kasaya yürür, sıraya girer; kasada çalışan (NPC/oyuncu/patron) varsa
 *    ona satış yapılır, para dükkan kasasına geçer (+₺ efekti), sonra çıkar ya da masaya oturur.
 *  - Mesaideki NPC çalışan tezgahın arkasında / raflarda çalışırken görünür.
 * Koordinatlar iç mekân ızgarasındadır (oyuncunun girdiği odayla aynı yer).
 */
const SPEED = 4.2;        // iç mekân yürüme (birim/sn)
const SERVE_SECS = 1.6;   // kasada satış süresi
const SELF_SERVE = 8;     // kimse yoksa bu kadar bekleyip kendi öder
const STAY_KINDS = new Set(['cafe', 'restaurant', 'bar']);

export class IndoorSystem {
  name = 'indoor';

  init(ctx) {
    this.ctx = ctx;
    this.geo = this.geo ?? new Map(); // tip -> kasa/çalışma noktaları
    // Kayıttan dönüşte: yarım kalmış ziyaretleri temizle, mesaidekileri yerine koy
    for (const n of ctx.world.npcs.values()) {
      n.ind = null;
      const b = n.state === 'inside' && ctx.world.buildings.get(n.locationId);
      if (b) this.enter(n, b);
    }
  }

  /** Tipe göre: müşteri kasa noktası, çalışan (tezgah arkası) noktası, diğer çalışma noktaları */
  geom(type) {
    this.geo = this.geo ?? new Map();
    if (this.geo.has(type)) return this.geo.get(type);
    const L = interiorLayout(type);
    let g = null;
    const c = L && spotById(L, 'counter');
    if (L && c) {
      let best = null, bd = 5;
      for (const it of L.items) {
        if (it[0] === 'rug' || it[0] === 'plant') continue;
        const d = Math.hypot(it[1] - c.x, it[2] - c.z);
        if (d < bd) { bd = d; best = it; }
      }
      const wx = best ? best[1] + (best[1] - c.x) * 0.9 : c.x;
      const wz = best ? best[2] + (best[2] - c.z) * 0.9 : c.z - 4;
      const dir = Math.sign(c.z - wz) || 1; // sıra kapıya doğru uzar
      const tasks = L.spots.filter((s) => !['exit', 'counter'].includes(s.id) && !s.seats).map((s) => ({ x: s.x, z: s.z }));
      const seats = L.spots.flatMap((s) => (s.seats ?? []).map(([x, z, r]) => ({ x, z, r })));
      const ent = entryPoint(L);
      g = { counter: { x: c.x, z: c.z }, worker: { x: wx, z: wz, r: Math.atan2(c.x - wx, c.z - wz) }, dir, tasks, seats, entry: ent, w: L.w, d: L.d };
    }
    this.geo.set(type, g);
    return g;
  }

  origin(b) { return interiorOrigin(b.id); }

  /** NPC binaya girdi (NpcBrain.placeInside) */
  enter(npc, b) {
    npc.ind = null;
    if (!this.ctx) return;
    const g = this.geom(b.type);
    if (!g) return;
    if (npc.activity === 'work' && npc.workId === b.id) {
      // İlk çalışan kasaya, diğerleri iş noktalarına
      const staff = [...b.occupants].map((id) => this.ctx.world.npcs.get(id)).filter((n) => n?.ind?.mode === 'work' && n !== npc);
      const atCounter = staff.some((n) => n.ind.role === 'cashier');
      const spot = !atCounter ? g.worker : g.tasks[staff.length % Math.max(1, g.tasks.length)] ?? g.worker;
      const jitter = atCounter ? 0.8 : 0;
      npc.ind = { b: b.id, mode: 'work', role: atCounter ? 'staff' : 'cashier', x: g.entry.x, z: g.entry.z, tx: spot.x + (Math.random() - 0.5) * jitter, tz: spot.z + (Math.random() - 0.5) * jitter, rot: spot.r ?? 0, faceR: spot.r ?? Math.PI, t: 0 };
    }
  }

  /** Müşteri ziyareti: kasaya yürü, sıraya gir, servis edilince cb() ile öde */
  visit(npc, b, pay) {
    const g = this.geom(b.type);
    if (!g) return false;
    npc.ind = { b: b.id, mode: 'walk', x: g.entry.x + (Math.random() - 0.5) * 2, z: g.entry.z, tx: g.counter.x, tz: g.counter.z + g.dir * 2, rot: Math.PI, t: 0, pay };
    return true;
  }

  leave(npc) { npc.ind = null; }

  /** Kasada satışı kim yapıyor? */
  cashier(b) {
    const { world } = this.ctx;
    for (const id of b.occupants) { const n = world.npcs.get(id); if (n?.ind?.mode === 'work' && n.ind.role === 'cashier' && n.ind.arrived) return { npc: n }; }
    for (const p of world.players.values()) {
      if (!p.online || p.inside !== b.id || p.dead) continue;
      if (p.shift?.buildingId === b.id || (b.ownerKind === 'player' && b.ownerId === p.id)) return { player: p };
    }
    return null;
  }

  move(s, dt) {
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
    if (d < 0.08) return true;
    const st = Math.min(d, SPEED * dt);
    s.x += (dx / d) * st;
    s.z += (dz / d) * st;
    s.rot = Math.atan2(dx, dz);
    return d - st < 0.08;
  }

  /** Oyuncu bir dükkandayken orası boş kalmasın: yakındaki boştaki NPC'ler alışverişe gelir */
  attract(dt) {
    const { world } = this.ctx;
    this.attractT = (this.attractT ?? 0) - dt;
    if (this.attractT > 0) return;
    this.attractT = 2;
    const brain = this.ctx.engine.getSystem('npcBrain');
    const ACT = { market: 'buy_food', cafe: 'eat_out', restaurant: 'eat_out', bar: 'leisure', gun_shop: 'weapon', tech_store: 'luxury' };
    const seen = new Set();
    for (const p of world.players.values()) {
      if (!p.online || !p.inside || seen.has(p.inside)) continue;
      seen.add(p.inside);
      const b = world.buildings.get(p.inside);
      const act = b && ACT[b.type];
      if (!act || !this.geom(b.type) || !world.isOpen(b)) continue;
      const coming = [...world.npcs.values()].filter((n) => n.targetId === b.id && n.activity === act).length + [...b.occupants].filter((id) => world.npcs.get(id)?.ind && world.npcs.get(id).ind.mode !== 'work').length;
      if (coming >= 6) continue;
      // sokakta yürüyen ya da evinde oturan, işte olmayan en yakın NPC
      let best = null, bd = 260;
      for (const n of world.npcs.values()) {
        // işte olanlar da öğle arası/çay molası için uğrar, sonra işine döner
        if (!n.alive || n.ind || n.balance < 10 || n.workId === b.id || n.locationId === b.id || n.jailed) continue;
        const d = Math.hypot(n.x - b.x, n.z - b.z);
        if (d < bd) { bd = d; best = n; }
      }
      if (best) { best.activity = act; brain.sendTo(best, { activity: act, buildingId: b.id }, this.ctx); }
    }
  }

  onTick(dt) {
    this.attract(dt);
    const { world, bus } = this.ctx;
    const queues = new Map();
    for (const npc of world.npcs.values()) {
      const s = npc.ind;
      if (!s) continue;
      if (npc.state !== 'inside' || npc.locationId !== s.b) { npc.ind = null; continue; }
      const b = world.buildings.get(s.b);
      if (!b) { npc.ind = null; continue; }
      const g = this.geom(b.type);
      if (s.mode === 'work') {
        if (this.move(s, dt)) { s.arrived = true; s.rot = s.faceR; }
        continue;
      }
      if (s.mode === 'walk' || s.mode === 'queue') {
        if (!queues.has(b.id)) queues.set(b.id, []);
        queues.get(b.id).push(npc);
        continue;
      }
      if (s.mode === 'served') {
        s.t += dt;
        if (s.t > SERVE_SECS) {
          const r = s.pay?.();
          s.pay = null;
          if (r?.amount > 0) bus.emit('net:fx', { t: 'sale', x: this.origin(b).x + g.counter.x, z: this.origin(b).z + g.counter.z - g.dir * 1.2, v: Math.round(r.amount), by: r.by });
          // Kafe/bar: masaya otur; market: çık
          const seat = STAY_KINDS.has(b.type) && r?.amount > 0 ? g.seats[Math.floor(Math.random() * g.seats.length)] : null;
          if (seat) Object.assign(s, { mode: 'stay', tx: seat.x, tz: seat.z, faceR: seat.r, t: 0 });
          else Object.assign(s, { mode: 'out', tx: g.entry.x, tz: g.entry.z + 1.5, t: 0 });
        }
        continue;
      }
      if (s.mode === 'stay') { if (this.move(s, dt)) s.rot = s.faceR; continue; }
      if (s.mode === 'out' && this.move(s, dt)) {
        npc.ind = null;
        // dışarıdaki planına devam etsin (eve dön vb.)
        this.ctx.engine.getSystem('npcBrain')?.decide(npc, world.hour(), this.ctx, true);
      }
    }
    // Sıralar: ilk sıradaki kasaya, diğerleri arkasına dizilir
    for (const [bid, list] of queues) {
      const b = world.buildings.get(bid);
      const g = this.geom(b.type);
      list.sort((a, c) => (a.ind.enq ?? 1e9) - (c.ind.enq ?? 1e9));
      const who = this.cashier(b);
      list.forEach((npc, i) => {
        const s = npc.ind;
        s.tx = g.counter.x + (i ? ((i % 2) - 0.5) * 0.6 : 0);
        s.tz = g.counter.z + g.dir * (i * 1.7);
        const there = this.move(s, dt);
        if (there && s.mode === 'walk') { s.mode = 'queue'; s.enq = s.enq ?? performance.now(); }
        if (s.mode !== 'queue') return;
        s.rot = g.dir > 0 ? Math.PI : 0;
        s.t += dt;
        if (i === 0 && there && (who || s.t > SELF_SERVE)) {
          s.mode = 'served';
          s.t = 0;
          const by = who?.player ?? null;
          const pay = s.pay;
          s.pay = () => {
            const amount = pay?.() ?? 0;
            // Kasadaki oyuncu çalışan satış primi alır
            if (by && amount > 0 && by.shift?.buildingId === b.id) { const tip = Math.max(1, Math.round(amount * 0.1)); by.balance += tip; world.touchPlayer(by); }
            return { amount, by: by?.id };
          };
        }
      });
    }
  }

  /** Snapshot: içerideki görünür NPC: [id, x, z, 2|3, rot] */
  snap(npc) {
    const s = npc.ind;
    if (!s) return null;
    const o = interiorOrigin(s.b);
    const busy = s.mode === 'work' && s.arrived;
    return [npc.id, Math.round((o.x + s.x) * 10) / 10, Math.round((o.z + s.z) * 10) / 10, busy ? 3 : 2, Math.round(s.rot * 100) / 100];
  }
}
