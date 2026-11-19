import { Unit } from '../entities/Unit.js';
import { interiorLayout, interiorOrigin, spotById } from '../../shared/interiors.js';

/**
 * Sokak hukuku:
 *  1) GÖRÜNÜR POLİS KOVALAMACASI: aranan oyuncunun peşine gerçek polis memurları düşer.
 *     Polis koşan oyuncudan yavaştır; uzaklaşırsan ya da bir binaya saklanırsan izini kaybeder.
 *     Yakalamak için polisin 1,5 sn boyunca dibinde olması gerekir.
 *  2) YERALTI: haritanın 4 köşesindeki inlerde parayla yasadışı iş yaptırılır.
 *     Çete üyeleri haritada yürüyerek gider, işi yapar, döner; polis %50 ihtimalle yakalar.
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const fail = (error) => ({ ok: false, error });

export const JOBS_UNDERWORLD = {
  fake:   { label: 'Sahte Para Bastır',     icon: '💵', desc: 'Verdiğin paranın 10 katı sahte para basılır (1 saat sürer). Polis baskını riski var.', min: 100, max: 20000 },
  shoot:  { label: 'Dükkan Tarat',          icon: '🔫', desc: '3-4 adam gidip dükkanı tarar: kasanın %30\'u gider, bina hasar alır, etraftaki insanlar ölür.', cost: 2500 },
  racket: { label: 'Haraç Kestir',          icon: '💼', desc: 'Dükkan 3 gün boyunca günlük cirosunun %15\'ini sana öder.', cost: 1500 },
  hit:    { label: 'Oyuncu Öldürt',         icon: '🎯', desc: 'Kiralık katil hedefin peşine düşer ve vurur.', cost: 6000 },
  coup:   { label: 'Devlete Darbe',         icon: '💥', desc: 'Merkez şehirde dükkanlar patlatılır, sokaktakiler vurulur. Başarılırsa yönetim senin olur.', cost: 60000 },
};

export class UnderworldSystem {
  name = 'underworld';

  init(ctx) {
    this.ctx = ctx;
    this.crews = new Map();
    this.chases = new Map(); // playerId -> { cops:[unitId], lost, close, until }
    this.seq = 0;
    this.slow = 0;
    ctx.world.chaseFor = (p) => this.chaseInfo(p);
    // Kayıttan dönen sokak birimlerini temizle
    for (const u of [...ctx.world.units.values()]) if (u.def?.street) ctx.world.units.delete(u.id);
  }

  mul() { return this.ctx.world.society?.econ.mul ?? 1; }
  say(p, text, toast = 'info', sfx) { this.ctx.bus.emit('net:private', { playerId: p.id ?? p, item: { category: 'crime', text, toast, sfx } }); }

  spawn(type, x, z, owner, color) {
    const { world, bus } = this.ctx;
    const u = new Unit({ id: world.nextId('u'), type, ownerId: owner, color, x, z });
    world.units.set(u.id, u);
    bus.emit('net:spawn', { kind: 'unit', data: u.toMeta() });
    return u;
  }

  despawn(id) {
    const { world, bus } = this.ctx;
    if (!world.units.delete(id)) return;
    bus.emit('net:remove', { kind: 'unit', id, reason: 'gone' });
  }

  move(u, tx, tz, speed, dt) {
    const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const s = Math.min(d, speed * dt);
    u.x += (dx / d) * s;
    u.z += (dz / d) * s;
    u.rotY = Math.atan2(dx, dz);
    return d - s;
  }

  // ================================================================== POLİS KOVALAMACASI
  /** Suç işlenince çağrılır: yakındaki karakoldan / devriyeden polis gelir */
  startChase(p, near) {
    const { world, rng, bus } = this.ctx;
    if (p.inside || p.dead || p.isAI || p.pendingCase) return;
    let c = this.chases.get(p.id);
    if (!c) { c = { cops: [], lost: 0, close: 0, wait: 0 }; this.chases.set(p.id, c); }
    const want = Math.min(4, Math.max(1, p.wanted)) - c.cops.length;
    for (let i = 0; i < want; i++) {
      const a = rng.range(0, Math.PI * 2), r = near ? rng.range(22, 34) : rng.range(45, 70);
      const u = this.spawn('cop', p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 'police', '#1f3a93');
      c.cops.push(u.id);
    }
    c.lost = 0;
    if (want > 0) {
      bus.emit('net:fx', { t: 'alarm', x: p.x, z: p.z });
      this.say(p, `🚨 POLİS PEŞİNDE! ${c.cops.length} memur geliyor. Koş, arabaya bin ya da bir binaya saklan!`, 'err', 'siren');
      world.touchPlayer(p);
    }
  }

  endChase(p, msg) {
    const c = this.chases.get(p.id);
    if (!c) return;
    for (const id of c.cops) this.despawn(id);
    this.chases.delete(p.id);
    if (msg) this.say(p, msg, 'ok', 'success');
    this.ctx.world.touchPlayer(p);
  }

  chaseInfo(p) {
    const c = this.chases.get(p.id);
    if (!c) return null;
    let nearest = Infinity;
    for (const id of c.cops) { const u = this.ctx.world.units.get(id); if (u) nearest = Math.min(nearest, Math.hypot(u.x - p.x, u.z - p.z)); }
    return { cops: c.cops.length, nearest: Number.isFinite(nearest) ? Math.round(nearest) : null, lost: Math.round(c.lost * 10) / 10, hiding: !!p.inside };
  }

  tickChases(dt) {
    const { world, engine } = this.ctx;
    for (const [pid, c] of [...this.chases]) {
      const p = world.players.get(pid);
      if (!p || !p.online || p.dead || p.pendingCase || p.jailedUntil > world.clockHours() || p.wanted <= 0) { if (p) this.endChase(p); else this.chases.delete(pid); continue; }
      c.cops = c.cops.filter((id) => world.units.has(id));
      if (!c.cops.length) { this.endChase(p, '😎 Polisi atlattın!'); continue; }
      if (p.inside) {
        // Saklandı: polis kapıda biraz bekler sonra gider
        c.wait += dt;
        const b = world.buildings.get(p.inside);
        for (const id of c.cops) { const u = world.units.get(id); if (u && b) this.move(u, b.door.x, b.door.z + 3, 6, dt); }
        if (c.wait > 12) { this.endChase(p, '🤫 Saklandın, polis izini kaybetti! (Bir süre dışarı çıkma, aranman düşsün.)'); p.hidingBonus = 2; }
        continue;
      }
      c.wait = 0;
      let nearest = Infinity;
      for (const id of c.cops) {
        const u = world.units.get(id);
        const d = this.move(u, p.x, p.z, u.def.speed, dt);
        nearest = Math.min(nearest, d);
      }
      // Arabadaki hızlı oyuncuya yetişemezler; çok uzaklaşırsan izini kaybederler
      if (nearest > 55) c.lost += dt; else c.lost = Math.max(0, c.lost - dt * 0.5);
      if (c.lost > 7) { this.endChase(p, '😎 Polisi atlattın! Gözden kayboldun.'); continue; }
      if (nearest < 2.4 && !p.driving) c.close += dt; else c.close = Math.max(0, c.close - dt * 2);
      if (c.close > 1.5) {
        this.endChase(p);
        engine.getSystem('crime').arrestPlayer(p);
      }
    }
  }

  // ================================================================== YERALTI İŞLERİ
  hideouts() { return this.ctx.world.buildingsWhere((b) => b.type === 'hideout'); }

  nearBoss(p) {
    const b = this.ctx.world.buildings.get(p.inside);
    if (b?.type !== 'hideout') return null;
    const s = spotById(interiorLayout(b.type), 'boss');
    const o = interiorOrigin(b.id);
    return Math.hypot(p.x - (o.x + s.x), p.z - (o.z + s.z)) < 6 ? b : null;
  }

  order(p, { job, amount, targetId }) {
    const { world, clock, bus } = this.ctx;
    const hide = this.nearBoss(p);
    if (!hide) return fail('Bunu sadece Yeraltı İni\'ndeki patronla konuşabilirsin.');
    const J = JOBS_UNDERWORLD[job];
    if (!J) return fail('Böyle bir iş yok.');
    if ([...this.crews.values()].filter((c) => c.ownerId === p.id).length >= 2) return fail('Adamların hâlâ sahada, önce dönsünler.');
    const cost = job === 'fake' ? Math.max(J.min, Math.min(J.max, Math.round(Number(amount) || 0))) : Math.round(J.cost * this.mul());
    if (p.balance < cost) return fail(`Bu iş ${tl(cost)}.`);
    let target = null;
    if (job === 'shoot' || job === 'racket') {
      target = world.buildings.get(targetId);
      if (!target || target.category !== 'commercial' || !target.operational) return fail('Hedef bir dükkan olmalı.');
      if (target.ownerKind === 'player' && target.ownerId === p.id) return fail('Kendi dükkanına mı? 😅');
    } else if (job === 'hit') {
      target = world.players.get(targetId);
      if (!target || target === p || target.isAI) return fail('Hedef oyuncuyu seç.');
    } else if (job === 'coup') {
      target = world.palace ?? world.buildingsWhere((b) => b.type === 'police')[0];
    }
    p.balance -= cost;
    world.touchPlayer(p);
    if (job === 'fake') {
      this.crews.set(`f${++this.seq}`, { id: `f${this.seq}`, ownerId: p.id, job, cost, readyAt: clock.totalHours + 1, members: [] });
      return { ok: true, message: `💵 Matbaa çalışıyor... 1 saat sonra ${tl(cost * 10)} sahte para hazır.`, sfx: 'cash' };
    }
    const n = job === 'coup' ? 8 : job === 'hit' ? 1 : job === 'racket' ? 2 : 3 + (Math.random() < 0.5 ? 1 : 0);
    const members = [];
    for (let i = 0; i < n; i++) members.push(this.spawn('gang', hide.door.x + (i - n / 2) * 1.6, hide.door.z + 2, 'underworld', '#111111').id);
    const crew = { id: `c${++this.seq}`, ownerId: p.id, job, cost, targetId: target?.id, home: { x: hide.door.x, z: hide.door.z + 2 }, phase: 'go', members, actT: 0 };
    this.crews.set(crew.id, crew);
    void bus;
    return { ok: true, message: `🕶️ ${n} adam yola çıktı: ${J.label}. Haritada siyah kıyafetliler onlar.`, sfx: 'click' };
  }

  crewTarget(c) {
    const { world } = this.ctx;
    if (c.phase === 'back') return c.home;
    if (c.job === 'hit') { const t = world.players.get(c.targetId); if (!t) return null; if (t.inside) { const b = world.buildings.get(t.inside); return b ? b.door : null; } return t; }
    const b = world.buildings.get(c.targetId);
    return b?.door ?? null;
  }

  tickCrews(dt) {
    const { world, clock } = this.ctx;
    for (const c of [...this.crews.values()]) {
      if (c.job === 'fake') {
        if (clock.totalHours >= c.readyAt) this.finishFake(c);
        continue;
      }
      c.members = c.members.filter((id) => world.units.has(id));
      if (!c.members.length) { this.crews.delete(c.id); continue; }
      const t = this.crewTarget(c);
      if (!t) { c.phase = 'back'; continue; }
      let far = 0;
      c.members.forEach((id, i) => {
        const u = world.units.get(id);
        const ox = (i - c.members.length / 2) * 1.8;
        far = Math.max(far, this.move(u, t.x + ox, t.z + (c.phase === 'go' ? 2.5 : 0), u.def.speed, dt));
      });
      if (c.phase === 'go' && far < 3) { c.phase = 'act'; c.actT = 0; }
      if (c.phase === 'act') {
        c.actT += dt;
        if (c.actT > 2.5) { this.act(c); c.phase = 'back'; }
        else if (Math.random() < dt * 4 && (c.job === 'shoot' || c.job === 'coup' || c.job === 'hit')) {
          const u = world.units.get(c.members[0]);
          this.ctx.bus.emit('net:fx', { t: 'gun', a: [u.x, u.z], b: [t.x + (Math.random() - 0.5) * 6, t.z + (Math.random() - 0.5) * 6], w: 'rifle', hit: 1 });
        }
      }
      if (c.phase === 'back' && far < 3) {
        for (const id of c.members) this.despawn(id);
        this.crews.delete(c.id);
      }
    }
  }

  /** Polis %50 yakalar; yakalananlar bazen ispiyonlar */
  policeRoll(c, snitch) {
    const { world, bus, rng } = this.ctx;
    const p = world.players.get(c.ownerId);
    if (!rng.chance(0.5)) return false;
    for (const id of c.members) this.despawn(id);
    c.members = [];
    bus.news('crime', `🚔 Polis ${JOBS_UNDERWORLD[c.job].label.toLowerCase()} işindeki çeteyi suçüstü yakaladı!`);
    if (p && rng.chance(snitch)) {
      p.wanted = Math.min(5, p.wanted + 2);
      world.logCrime?.(p, `Azmettirici: ${JOBS_UNDERWORLD[c.job].label}`);
      this.say(p, '🐀 Yakalanan adamların seni ispiyonladı! ⭐⭐ aranıyorsun.', 'err', 'siren');
      this.startChase(p);
    } else if (p) this.say(p, '🚔 Adamların yakalandı ama ağızlarını açmadılar. Paran gitti.', 'warn');
    return true;
  }

  act(c) {
    const { world, bus, rng, engine } = this.ctx;
    const p = world.players.get(c.ownerId);
    const J = JOBS_UNDERWORLD[c.job];
    if (c.job === 'shoot') {
      const b = world.buildings.get(c.targetId);
      if (!b) return;
      const loss = Math.round(b.balance * 0.3);
      b.balance -= loss;
      world.damageBuilding(b, (b.maxHp ?? 1000) * 0.25);
      let dead = 0;
      for (const n of [...world.npcs.values()]) {
        if (dead >= 3 || n.state === 'inside') continue;
        if (Math.hypot(n.x - b.door.x, n.z - b.door.z) < 18 && rng.chance(0.6)) { world.killNpc(n, 'kurşunlandı'); dead++; }
      }
      bus.emit('net:fx', { t: 'explosion', x: b.door.x, z: b.door.z, r: 4 });
      bus.news('crime', `🔫 ${b.name} kurşunlandı! ${dead} kişi hayatını kaybetti, kasadan ${tl(loss)} gitti.`);
      if (b.ownerKind === 'player') this.say(b.ownerId, `🔫 Dükkanın ${b.name} taratıldı! ${tl(loss)} zarar.`, 'err', 'alarm');
      if (!this.policeRoll(c, 0.35) && p) this.say(p, `🔫 İş tamam: ${b.name} tarandı. Adamlar dönüyor.`, 'ok');
    } else if (c.job === 'racket') {
      const b = world.buildings.get(c.targetId);
      if (!b) return;
      if (this.policeRoll(c, 0.3)) return;
      b.racket = { ownerId: c.ownerId, days: 3 };
      bus.news('crime', `💼 ${b.name} esnafına "koruma" teklifi yapıldı... Esnaf tedirgin.`);
      if (b.ownerKind === 'player') this.say(b.ownerId, `💼 Çete ${b.name} için haraç kesti: 3 gün cironun %15'i gidecek.`, 'err', 'alarm');
      if (p) this.say(p, `💼 ${b.name} artık sana haraç ödüyor (3 gün).`, 'ok', 'cash');
    } else if (c.job === 'hit') {
      const t = world.players.get(c.targetId);
      if (!t) return;
      if (this.policeRoll(c, 0.4)) return;
      if (t.admin?.god || t.dead) { if (p) this.say(p, '🎯 Hedef vurulamadı... (çok şanslı biri)', 'warn'); return; }
      engine.getSystem('life').kill(t, null, 'bir suikastte');
      this.say(t, '🎯 Kiralık bir katil seni vurdu! Kimin gönderdiğini bilmiyorsun...', 'err');
      if (p) this.say(p, `🎯 İş tamam: ${t.name} temizlendi.`, 'ok');
    } else if (c.job === 'coup') {
      // Merkez şehirde kaos
      const shops = rng.shuffle(world.buildingsWhere((b) => b.category === 'commercial' && b.operational && world.ownerAt(b.x, b.z) === 'state')).slice(0, 3);
      for (const b of shops) { bus.emit('net:fx', { t: 'explosion', x: b.x, z: b.z, r: 10 }); world.damageBuilding(b, (b.maxHp ?? 1000) * 0.7); }
      let dead = 0;
      for (const n of [...world.npcs.values()]) if (n.state !== 'inside' && world.ownerAt(n.x, n.z) === 'state' && rng.chance(0.25) && dead < 10) { world.killNpc(n, 'darbede öldü'); dead++; }
      bus.news('crime', `💥💥 DARBE GİRİŞİMİ! Merkez şehirde ${shops.length} dükkan patladı, ${dead} kişi öldü!`);
      bus.emit('net:alert', { level: 'warning', text: '💥 DARBE GİRİŞİMİ! Merkez şehir karıştı!' });
      if (this.policeRoll(c, 0.6)) { bus.news('politics', '🛡️ Darbe girişimi bastırıldı!'); return; }
      if (p) {
        const R = world.republic;
        if (R) { R.candidates = []; R.votes = {}; engine.getSystem('society').setPresident(p); }
        else { world.politics.mayor = { kind: 'player', id: p.id, name: p.name, party: 'Darbe Cuntası' }; p.title = 'Darbeci Başkan'; }
        bus.news('politics', `💥 DARBE BAŞARILI! Yönetimi ${p.name} ele geçirdi!`);
        world.touchPlayer(p);
      }
    }
    void J;
  }

  finishFake(c) {
    const { world, bus, rng } = this.ctx;
    this.crews.delete(c.id);
    const p = world.players.get(c.ownerId);
    if (!p) return;
    if (rng.chance(0.5)) {
      // Polis baskını
      bus.news('crime', '🚔 Polis kaçak bir matbaaya baskın yaptı, sahte paralara el konuldu!');
      if (rng.chance(0.3)) { p.wanted = Math.min(5, p.wanted + 2); world.logCrime?.(p, 'Kalpazanlık'); this.say(p, '🚔 Matbaaya baskın! Basılan paraya el konuldu ve seni ispiyonladılar ⭐⭐', 'err', 'siren'); this.startChase(p); }
      else this.say(p, '🚔 Matbaaya baskın oldu, sahte paralar gitti. Neyse ki adın geçmedi.', 'warn');
      return;
    }
    p.balance += c.cost * 10;
    world.touchPlayer(p);
    this.say(p, `💵 Sahte paralar hazır: +${tl(c.cost * 10)}. Dikkatli harca 😏`, 'ok', 'cash');
  }

  onDay(_t, { world }) {
    // Haraç tahsilatı
    for (const b of world.buildings.values()) {
      const r = b.racket;
      if (!r) continue;
      const p = world.players.get(r.ownerId);
      const cut = Math.round(Math.max(0, (b.revenueToday || b.balance * 0.1) * 0.15));
      if (p && cut > 0) { b.balance -= cut; p.balance += cut; world.touchPlayer(p); this.say(p, `💼 ${b.name} haracı geldi: +${tl(cut)}`, 'ok', 'cash'); }
      if (--r.days <= 0) b.racket = null;
    }
  }

  onTick(dt) {
    this.tickChases(dt);
    this.tickCrews(dt);
  }
}
