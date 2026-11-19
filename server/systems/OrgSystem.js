import { CARS } from '../../shared/catalogs.js';
import { Unit } from '../entities/Unit.js';
import { interiorOrigin, interiorLayout, spotById } from '../../shared/interiors.js';

/**
 * ÖRGÜTLER / KARTELLER
 *  - Oyuncular telefondan örgüt kurar, başka oyuncuları davet eder (birlikte güçlenirler).
 *  - Haritadaki duvarlı Terk Edilmiş Depolar örgüt karargahı yapılır: içeride sahte para matbaası,
 *    dışarıda korumalar nöbet tutar.
 *  - Adam tutulur: koruma, kiralık katil, bombacı, tetikçi (bölge/baskın), kaçırıcı.
 *  - Görevler araçlarla yapılır: siyah kartel araçları gider, adamlar iner, vurur/patlatır/kaçırır, kaçar.
 *  - Her ülkenin güvenlik gücü (polis + özel harekât / ülke askeri) olay yerine gelip çatışır.
 *  - Rakip NPC karteller (çok güçlü) oyuncuların işyerlerini basar, patlatır, adam kaçırır.
 * Tüm sokak çatışması sunucuda: her birim menzildeki düşmanına ateş eder, can biter = ölür.
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const fail = (error) => ({ ok: false, error });

export const MEN = {
  guard:     { label: 'Koruma',        icon: '🛡️', price: 800,  desc: 'Karargahı korur ya da yanında gezip seni korur, sana ateş edeni vurur.' },
  hitman:    { label: 'Kiralık Katil', icon: '🎯', price: 1500, desc: 'İstediğin kişiyi vurur; araya giren polisi de.' },
  bomber:    { label: 'Bombacı',       icon: '💣', price: 2000, desc: 'Ev, işletme, devlet binası: bomba koyar, yıkar.' },
  enforcer:  { label: 'Tetikçi',       icon: '🔫', price: 1000, desc: 'Mekan basar, bölge ele geçirir, askerle çatışır.' },
  kidnapper: { label: 'Kaçırıcı',      icon: '🥷', price: 1500, desc: 'Hedefi kaçırıp karargaha getirir, fidye alınır.' },
};

export const MISSIONS = {
  hit:    { label: 'Suikast',          icon: '🎯', men: 'hitman',    target: 'player', cost: 300, desc: 'Hedefi vur' },
  bomb:   { label: 'Bombalama',        icon: '💣', men: 'bomber',    target: 'building', cost: 500, desc: 'Binayı patlat' },
  raid:   { label: 'Mekan Basma',      icon: '🚙', men: 'enforcer',  target: 'building', cost: 400, desc: 'Kasayı soy, mekanı tara' },
  turf:   { label: 'Bölge Ele Geçir',  icon: '🏴', men: 'enforcer',  target: 'here', cost: 600, desc: 'Bölgeyi haraca bağla' },
  kidnap: { label: 'Adam Kaçırma',     icon: '🥷', men: 'kidnapper', target: 'player', cost: 400, desc: 'Kaçır, fidye al' },
  wreck:  { label: 'Araç Çal / Patlat', icon: '🚗', men: 'enforcer', target: 'unit', cost: 300, desc: 'Park halindeki aracı çal ya da patlat' },
  ceonap: { label: 'CEO Kaçırma',      icon: '👔', men: 'kidnapper', target: 'building', cost: 400, desc: 'İşletmenin CEO\'sunu rehin al', hidden: true },
};

const AI_CARTELS = [
  { name: 'Kızıl Akrep Kartelı', color: '#c0392b', icon: '🦂' },
  { name: 'Kara Yılan Kartelı', color: '#27ae60', icon: '🐍' },
  { name: 'Demir Yumruk Ailesi', color: '#8e44ad', icon: '✊' },
];

const FOUND_COST = 5000;
const HQ_COST = 10000;
const LAW = new Set(['cop', 'swat']);

export class OrgSystem {
  name = 'orgs';

  init(ctx) {
    this.ctx = ctx;
    const { world } = ctx;
    world.orgs = world.orgs ?? {};
    this.missions = new Map();
    this.seq = 0;
    this.fxBudget = 0;
    this.lawCalls = new Map(); // missionId -> polis/asker birlikleri
    // kayıttan dönüş: istasyonlar ve korumalar yeniden kurulsun
    for (const o of Object.values(world.orgs)) { o.posted = []; o.escort = {}; }
    for (const p of world.players.values()) { p.kidnapped = null; }
    this.ensureCartels();
    for (const o of Object.values(world.orgs)) if (!o.ai && this.hqOf(o)) this.postGuards(o);
    world.orgFor = (p) => this.privateFor(p);
    ctx.bus.on('building:destroyed', ({ building }) => { building.destroyedAt = ctx.clock.totalHours; });
  }

  /** Merkez şehir (devlet) kendini onarır: hasarlı binalar saat saat, yıkılanlar 12 saatte yeniden yapılır */
  regenState() {
    const { world, bus, clock } = this.ctx;
    for (const b of world.buildings.values()) {
      if (b.type === 'land' || b.type === 'park') continue;
      const own = world.ownerAt(b.x, b.z);
      if (own !== 'state' || b.ownerKind === 'player') continue;
      if (b.destroyed) {
        b.destroyedAt = b.destroyedAt ?? clock.totalHours;
        if (clock.totalHours - b.destroyedAt < 12) continue;
        b.destroyed = false;
        b.active = true;
        b.hp = b.maxHp;
        b.value = Math.round(b.value * 5);
        b.destroyedAt = null;
        world.touch(b);
        bus.news('city', `🏗️ ${world.republic?.name ?? 'Devlet'} yıkılan ${b.name}'i yeniden inşa etti.`);
      } else if (b.hp < b.maxHp) {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.1);
        world.touch(b);
      }
    }
  }

  // ------------------------------------------------------------------ yardımcılar
  get world() { return this.ctx.world; }
  mul() { return this.world.society?.econ.mul ?? 1; }
  say(pid, text, toast = 'info', sfx) { this.ctx.bus.emit('net:private', { playerId: pid?.id ?? pid, item: { category: 'crime', text, toast, sfx } }); }
  orgOf(p) { return p?.orgId ? this.world.orgs[p.orgId] ?? null : null; }
  compounds() { return this.world.buildingsWhere((b) => b.type === 'compound'); }
  hqOf(o) { const b = o?.hqId && this.world.buildings.get(o.hqId); return b && !b.destroyed ? b : null; }

  spawn(type, x, z, owner, color, extra = {}) {
    const { world, bus } = this.ctx;
    const u = new Unit({ id: world.nextId('u'), type, ownerId: owner, color, x, z });
    Object.assign(u, extra);
    world.units.set(u.id, u);
    bus.emit('net:spawn', { kind: 'unit', data: { ...u.toMeta(), tag: extra.tag, model: extra.model } });
    return u;
  }

  despawn(id, reason = 'gone') {
    const { world, bus } = this.ctx;
    if (!world.units.delete(id)) return;
    bus.emit('net:remove', { kind: 'unit', id, reason });
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

  // ------------------------------------------------------------------ örgüt kurma / üyelik
  found(p, { name }) {
    const { world, bus } = this.ctx;
    if (p.orgId) return fail('Zaten bir örgüttesin.');
    const clean = String(name ?? '').replace(/[<>]/g, '').trim().slice(0, 24);
    if (clean.length < 3) return fail('Örgüte en az 3 harfli bir isim ver.');
    if (Object.values(world.orgs).some((o) => o.name.toLocaleLowerCase('tr') === clean.toLocaleLowerCase('tr'))) return fail('Bu isimde bir örgüt var.');
    const cost = Math.round(FOUND_COST * this.mul());
    if (p.balance < cost) return fail(`Örgüt kurmak ${tl(cost)}.`);
    p.balance -= cost;
    const id = `org${Date.now().toString(36)}${++this.seq}`;
    world.orgs[id] = { id, name: clean, color: p.color, icon: '🕴️', leaderId: p.id, members: [p.id], invites: [], ai: false, hqId: null, men: { guard: 0, hitman: 0, bomber: 0, enforcer: 0, kidnapper: 0 }, turf: [], rep: 0, grudge: {}, posted: [], escort: {}, kills: 0 };
    p.orgId = id;
    world.touchPlayer(p);
    bus.news('crime', `🕴️ Yeraltında yeni bir isim: "${clean}" örgütü kuruldu.`);
    return { ok: true, message: `🕴️ "${clean}" kuruldu! Adam tut, haritadaki duvarlı Terk Edilmiş Depo'lardan birini karargah yap.`, sfx: 'success' };
  }

  invite(p, { playerId }) {
    const o = this.orgOf(p);
    if (!o) return fail('Örgütün yok.');
    const t = this.world.players.get(playerId);
    if (!t || t.isAI || t === p) return fail('Oyuncu seç.');
    if (t.orgId) return fail(`${t.name} zaten bir örgütte.`);
    if (!o.invites.includes(t.id)) o.invites.push(t.id);
    this.say(t, `🕴️ ${p.name} seni "${o.name}" örgütüne davet etti! Telefon › Örgüt'ten katıl.`, 'info', 'notify');
    return { ok: true, message: `📨 ${t.name} davet edildi.` };
  }

  join(p, { orgId }) {
    const o = this.world.orgs[orgId];
    if (!o || o.ai) return fail('Örgüt bulunamadı.');
    if (p.orgId) return fail('Önce mevcut örgütünden ayrıl.');
    if (!o.invites.includes(p.id)) return fail('Bu örgüte davetin yok.');
    o.invites = o.invites.filter((x) => x !== p.id);
    o.members.push(p.id);
    p.orgId = o.id;
    this.world.touchPlayer(p);
    for (const m of o.members) if (m !== p.id) this.say(m, `🤝 ${p.name} örgüte katıldı! Artık adamları birlikte kullanıyorsunuz.`, 'ok');
    return { ok: true, message: `🤝 "${o.name}" örgütüne katıldın. Adamlar ortak, birlikte dalın!`, sfx: 'success' };
  }

  leave(p) {
    const o = this.orgOf(p);
    if (!o) return fail('Örgütün yok.');
    this.dismissEscort(o, p.id);
    o.members = o.members.filter((x) => x !== p.id);
    p.orgId = null;
    this.world.touchPlayer(p);
    if (!o.members.length) {
      for (const id of o.posted) this.despawn(id);
      const hq = this.hqOf(o);
      if (hq) { hq.orgId = null; hq.orgTag = null; this.world.touch(hq); }
      delete this.world.orgs[o.id];
      return { ok: true, message: `🕴️ "${o.name}" dağıldı.` };
    }
    if (o.leaderId === p.id) o.leaderId = o.members[0];
    return { ok: true, message: `🚪 "${o.name}" örgütünden ayrıldın.` };
  }

  hire(p, { type, n }) {
    const o = this.orgOf(p);
    if (!o) return fail('Önce telefondan örgüt kur.');
    const M = MEN[type];
    if (!M) return fail('Böyle bir adam yok.');
    // Sınır yok: paran neye yetiyorsa (tek seferde en çok 500)
    const k = Math.max(1, Math.min(500, Math.round(Number(n) || 1)));
    const cost = Math.round(M.price * k * this.mul());
    if (p.balance < cost) return fail(`${k} ${M.label} = ${tl(cost)}.`);
    p.balance -= cost;
    o.men[type] = (o.men[type] ?? 0) + k;
    this.world.touchPlayer(p);
    if (type === 'guard') this.postGuards(o);
    return { ok: true, message: `${M.icon} ${k} ${M.label} tuttun (−${tl(cost)}). Örgüt: ${o.men[type]} ${M.label}.`, sfx: 'cash' };
  }

  // ------------------------------------------------------------------ karargah
  claimHQ(p, buildingId) {
    const { world, bus } = this.ctx;
    const o = this.orgOf(p);
    if (!o) return fail('Önce telefondan örgüt kur (Telefon › Örgüt).');
    const b = world.buildings.get(buildingId);
    if (!b || b.type !== 'compound') return fail('Burası karargah yapılamaz.');
    if (b.destroyed) return fail('Burası yıkık.');
    if (b.orgId && b.orgId !== o.id) return fail(`Burası ${world.orgs[b.orgId]?.name ?? 'başka bir örgüt'}'ün karargahı. Önce adamlarını temizle!`);
    if (b.orgId === o.id) return fail('Zaten sizin karargahınız.');
    if (Math.hypot(p.x - b.door.x, p.z - b.door.z) > 25 && p.inside !== b.id) return fail('Deponun kapısına git.');
    const cost = Math.round(HQ_COST * this.mul());
    if (p.balance < cost) return fail(`Depoyu satın alıp tahkim etmek ${tl(cost)}.`);
    p.balance -= cost;
    const old = this.hqOf(o);
    if (old) { old.orgId = null; old.orgTag = null; world.touch(old); }
    this.setHQ(o, b);
    world.touchPlayer(p);
    bus.news('crime', `🏴 "${o.name}" ${b.name}'yu karargah yaptı. Duvarların ardında neler dönüyor?`);
    return { ok: true, message: `🏴 ${b.name} artık "${o.name}" karargahı! Korumalar kapıda nöbet tutacak, içeride matbaa var.`, sfx: 'success' };
  }

  setHQ(o, b) {
    b.orgId = o.id;
    b.orgTag = { name: o.name, color: o.color, icon: o.icon };
    o.hqId = b.id;
    this.world.touch(b);
    for (const id of o.posted) this.despawn(id);
    o.posted = [];
    this.postGuards(o);
  }

  /** Karargah önündeki nöbetçiler: koruma stoğundan (kişisel korumalar hariç) */
  postGuards(o) {
    const hq = this.hqOf(o);
    o.posted = o.posted.filter((id) => this.world.units.has(id));
    if (!hq) return;
    const escorting = Object.values(o.escort).reduce((s, l) => s + l.length, 0);
    const want = Math.min(40, Math.max(0, (o.men.guard ?? 0) - escorting)); // fazlası içeride bekler
    while (o.posted.length < want) {
      const k = o.posted.length;
      const a = (k / Math.max(6, want)) * Math.PI * 2;
      const r = 14 + (k % 2) * 3;
      const u = this.spawn('guard', hq.x + Math.cos(a) * r, hq.z + Math.sin(a) * r, `org:${o.id}`, o.color, { tag: o.name });
      u.post = { x: u.x, z: u.z };
      u.org = o.id;
      o.posted.push(u.id);
    }
    while (o.posted.length > want) this.despawn(o.posted.pop());
  }

  /** Kişisel korumalar: yanında gezer, sana ateş edeni vurur */
  escort(p, { n }) {
    const o = this.orgOf(p);
    if (!o) return fail('Örgütün yok.');
    this.dismissEscort(o, p.id);
    const k = Math.max(0, Math.min(30, Math.round(Number(n) || 0)));
    if (!k) { this.postGuards(o); return { ok: true, message: '🛡️ Korumalar karargaha döndü.' }; }
    const used = Object.values(o.escort).reduce((s, l) => s + l.length, 0);
    if ((o.men.guard ?? 0) - used < k) return fail(`Boşta ${Math.max(0, (o.men.guard ?? 0) - used)} koruman var. Telefon › Örgüt › Adam Tut.`);
    o.escort[p.id] = [];
    for (let i = 0; i < k; i++) {
      const u = this.spawn('guard', p.x + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6, `org:${o.id}`, o.color, { tag: `${p.name}'in korumaları` });
      u.org = o.id; u.boss = p.id; u.slot = i;
      o.escort[p.id].push(u.id);
    }
    this.postGuards(o);
    return { ok: true, message: `🛡️ ${k} koruma yanında. Sana ateş edeni vururlar, kurşunların bir kısmını üstlerine alırlar.`, sfx: 'click' };
  }

  dismissEscort(o, pid) {
    for (const id of o.escort[pid] ?? []) this.despawn(id);
    delete o.escort[pid];
  }

  // ------------------------------------------------------------------ görevler
  order(p, { kind, targetId, n }) {
    const { world } = this.ctx;
    const o = this.orgOf(p);
    if (!o) return fail('Önce telefondan örgüt kur.');
    const M = MISSIONS[kind];
    if (!M) return fail('Böyle bir iş yok.');
    const avail = this.available(o, M.men);
    const k = Math.max(1, Math.min(avail, Math.round(Number(n) || 1)));
    if (avail < 1) return fail(`Boşta ${MEN[M.men].label} yok. Telefon › Örgüt › Adam Tut.`);
    const cars = Math.min(40, Math.ceil(k / 3));
    const cost = Math.round((M.cost + cars * 150) * this.mul());
    if (p.balance < cost) return fail(`Görev masrafı (araç, cephane, yakıt) ${tl(cost)}.`);
    let target;
    if (M.target === 'player') {
      target = world.players.get(targetId);
      if (!target || target === p) return fail('Hedef oyuncuyu seç.');
      if (target.orgId === o.id) return fail('Kendi adamın!');
    } else if (M.target === 'building') {
      target = world.buildings.get(targetId);
      if (!target || target.destroyed || target.type === 'land' || target.type === 'park') return fail('Hedef binayı seç.');
      if (target.orgId === o.id) return fail('Kendi karargahın!');
    } else if (M.target === 'unit') {
      target = world.units.get(targetId);
      if (!target || !target.def?.keep || target.ownerId === p.id) return fail('Hedef aracı seç.');
    } else {
      const t = world.tileAt(p.x, p.z);
      if (!t) return fail('Geçersiz yer.');
      target = { tile: `${t.i},${t.j}`, x: -world.half + (t.i + 0.5) * world.blockSize, z: -world.half + (t.j + 0.5) * world.blockSize };
    }
    p.balance -= cost;
    world.touchPlayer(p);
    const m = this.launch(o, kind, target, k, p.id);
    if (!m) return fail('Adamlar yola çıkamadı.');
    return { ok: true, message: `${M.icon} ${k} ${MEN[M.men].label}, ${cars} araçla yola çıktı (−${tl(cost)}). Siyah araçları haritadan izle!`, sfx: 'launch' };
  }

  available(o, type) {
    let busy = 0;
    for (const m of this.missions.values()) if (m.orgId === o.id && m.menType === type) busy += m.n;
    if (type === 'guard') busy += Object.values(o.escort).reduce((s, l) => s + l.length, 0);
    return Math.max(0, (o.men[type] ?? 0) - busy);
  }

  /** Görevi başlat: araçlar karargahtan (ya da haritanın kenarından) çıkar */
  launch(o, kind, target, n, byId) {
    const { world } = this.ctx;
    const M = MISSIONS[kind];
    const hq = this.hqOf(o);
    const from = hq ? { x: hq.door.x, z: hq.door.z + 6 } : this.edgePoint(target);
    const cars = [];
    const nc = Math.max(1, Math.min(40, Math.ceil(n / 3))); // 100 adam = 34 araçlık konvoy
    // filodaki arabalar kullanılır (zırhlılar daha dayanıklı); filo yoksa standart siyah cip
    const fleet = Object.entries(o.fleet?.cars ?? {}).flatMap(([k, n]) => Array(Math.max(0, n)).fill(k));
    for (let i = 0; i < nc; i++) {
      const model = fleet.length ? fleet[i % fleet.length] : (o.ai ? ['gwagon', 'tank_suv', 'sprinter', 'hummer'][i % 4] : null);
      const u = this.spawn('gangcar', from.x + (i % 4) * 4 - 6, from.z + Math.floor(i / 4) * 6, `org:${o.id}`, o.color, { tag: o.name, model });
      u.model = model;
      if (model) { const k = CARS[model]?.armor ?? 1; u.hp = u.maxHp = Math.round(420 * k); }
      cars.push(u.id);
    }
    const id = `m${++this.seq}`;
    const m = { id, orgId: o.id, kind, menType: M.men, n, cars, men: [], phase: 'drive', from, byId, t: 0, targetKind: M.target, targetId: target.id ?? null, tile: target.tile ?? null, tx: target.x, tz: target.z, loot: 0 };
    this.missions.set(id, m);
    for (const cid of cars) { const u = world.units.get(cid); u.job = id; u.org = o.id; }
    return m;
  }

  edgePoint(t) {
    const h = this.world.half - 10;
    const a = Math.random() * Math.PI * 2;
    return { x: Math.max(-h, Math.min(h, t.x + Math.cos(a) * 160)), z: Math.max(-h, Math.min(h, t.z + Math.sin(a) * 160)) };
  }

  missionTarget(m) {
    const { world } = this.ctx;
    if (m.targetKind === 'player') {
      const t = world.players.get(m.targetId);
      if (!t || !t.online) return null;
      if (t.inside) { const b = world.buildings.get(t.inside); return b ? { x: b.door.x, z: b.door.z, inside: true, p: t } : null; }
      return { x: t.x, z: t.z, p: t };
    }
    if (m.targetKind === 'unit') {
      const u = world.units.get(m.targetId);
      return u && u.def?.keep && !u.flight ? { x: u.x, z: u.z + 3, u } : null;
    }
    if (m.targetKind === 'building') {
      const b = world.buildings.get(m.targetId);
      return b && !b.destroyed ? { x: b.door.x, z: b.door.z + 3, b } : null;
    }
    return { x: m.tx, z: m.tz };
  }

  tickMissions(dt) {
    const { world, bus } = this.ctx;
    for (const m of [...this.missions.values()]) {
      const o = world.orgs[m.orgId];
      m.cars = m.cars.filter((id) => world.units.has(id));
      m.men = m.men.filter((id) => world.units.has(id));
      if (!o || (!m.cars.length && !m.men.length)) { this.endMission(m, false); continue; }
      const T = this.missionTarget(m);
      if (m.phase === 'drive') {
        if (!T) { m.phase = 'escape'; continue; }
        let far = 0;
        m.cars.forEach((id, i) => { const u = world.units.get(id); far = Math.max(far, this.move(u, T.x + (i % 3 - 1) * 5, T.z + Math.floor(i / 3) * 5 + 4, u.def.speed, dt)); });
        if (far < 6) this.dismount(m, o, T);
        continue;
      }
      if (m.phase === 'act') {
        m.t += dt;
        // adamlar hedefe yürür (suikast/kaçırma: hedefi takip eder)
        m.men.forEach((id, i) => {
          const u = world.units.get(id);
          const rr = 3 + Math.floor(i / 8) * 1.6;
          const tx = T ? T.x + Math.cos(i * 0.785) * rr : u.x, tz = T ? T.z + Math.sin(i * 0.785) * rr : u.z;
          this.move(u, tx, tz, u.def.speed, dt);
        });
        if (!m.men.length) { m.phase = 'escape'; continue; }
        if (this.act(m, o, T, dt)) m.phase = 'remount';
        else if (m.t > 45) m.phase = 'remount';
        continue;
      }
      if (m.phase === 'remount') {
        // hayatta kalanlar araçlara biner
        const car = world.units.get(m.cars[0]);
        if (!car) { m.phase = 'escape'; continue; }
        let far = 0;
        for (const id of m.men) far = Math.max(far, this.move(world.units.get(id), car.x, car.z, 18, dt));
        if (far < 2.5 || m.t > 60) {
          m.survivors = m.men.length;
          for (const id of m.men) this.despawn(id);
          m.men = [];
          m.phase = 'escape';
        }
        m.t += dt;
        continue;
      }
      if (m.phase === 'escape') {
        if (!m.cars.length) { this.endMission(m, m.done); continue; }
        const home = this.hqOf(o) ? { x: this.hqOf(o).door.x, z: this.hqOf(o).door.z + 6 } : m.from;
        let far = 0;
        m.cars.forEach((id, i) => { const u = world.units.get(id); far = Math.max(far, this.move(u, home.x + (i % 3) * 4 - 4, home.z, u.def.speed * 1.15, dt)); });
        if (far < 5) this.endMission(m, m.done);
      }
    }
    void bus;
  }

  dismount(m, o, T) {
    const { world, bus } = this.ctx;
    m.phase = 'act';
    m.t = 0;
    const car = world.units.get(m.cars[0]);
    for (let i = 0; i < m.n; i++) {
      const c = world.units.get(m.cars[i % m.cars.length]) ?? car;
      const u = this.spawn(m.menType, c.x + (Math.random() - 0.5) * 4, c.z + (Math.random() - 0.5) * 4, `org:${o.id}`, o.color, { tag: o.name });
      u.org = o.id; u.job = m.id; u.hostile = true;
      m.men.push(u.id);
    }
    // olay yerine güvenlik güçleri
    this.callLaw(m, T);
    const M = MISSIONS[m.kind];
    const where = T?.b?.name ?? (T?.p ? T.p.name : 'bir mahalle');
    bus.emit('net:fx', { t: 'alarm', x: T?.x ?? m.tx, z: T?.z ?? m.tz });
    bus.news('crime', `${M.icon} ${o.icon ?? '🕴️'} "${o.name}" adamları ${where} için harekete geçti!`);
    if (T?.p && m.kind !== 'turf') this.say(T.p, `🚨 Kartel araçları geldi! "${o.name}" seni hedef aldı. KAÇ ya da çatış!`, 'err', 'siren');
    if (T?.b?.ownerKind === 'player') this.say(T.b.ownerId, `🚨 "${o.name}" ${T.b.name} binana saldırıyor!`, 'err', 'alarm');
  }

  /** Görevin işini yap: true = bitti, kaçış */
  act(m, o, T, dt) {
    const { world, bus, engine, rng } = this.ctx;
    const near = (x, z, r) => m.men.some((id) => { const u = world.units.get(id); return u && Math.hypot(u.x - x, u.z - z) < r; });
    if (!T) return true;
    switch (m.kind) {
      case 'hit': {
        const t = T.p;
        if (!t || t.dead) { m.done = true; return true; }
        if (T.inside) return m.t > 40; // içeride saklanıyor: kapıda bekle
        // vurma işini sokak çatışması yapar (hedef düşman sayılır)
        return false;
      }
      case 'kidnap': {
        const t = T.p;
        if (!t || t.dead) return true;
        if (T.inside) return m.t > 40;
        if (near(t.x, t.z, 3) && !t.admin?.god && !t.kidnapped) { this.kidnap(o, t, m); m.done = true; return true; }
        return false;
      }
      case 'bomb': {
        const b = T.b;
        if (!b) { m.done = true; return true; }
        if (!near(T.x, T.z, 6)) return false;
        m.plant = (m.plant ?? 0) + dt;
        if (m.plant < 5) { if (!m.warned) { m.warned = true; bus.emit('net:fx', { t: 'alarm', x: b.x, z: b.z }); } return false; }
        const alive = m.men.length;
        const dmg = (b.maxHp ?? 1000) * Math.min(1.2, 0.38 * alive);
        world.damageBuilding(b, dmg, null);
        for (let k = 0; k < Math.min(4, alive); k++) bus.emit('net:fx', { t: 'explosion', x: b.x + (rng.next() - 0.5) * b.width * 0.6, z: b.z + (rng.next() - 0.5) * b.depth * 0.6, r: 8 + alive * 2 });
        let dead = 0;
        for (const n of [...world.npcs.values()]) if (n.alive && (n.state !== 'inside' || n.locationId === b.id) && Math.hypot(n.x - b.x, n.z - b.z) < 14 + alive * 2 && rng.chance(0.6)) { world.killNpc(n, 'bombada öldü'); dead++; }
        this.blastPlayers(b.x, b.z, 12 + alive * 2, 70);
        bus.news('crime', `💥 ${b.name} BOMBALANDI! ${b.destroyed ? 'Bina yerle bir oldu' : 'Bina ağır hasar aldı'}, ${dead} kişi öldü. Üstlenen: "${o.name}"`);
        if (b.ownerKind === 'player') {
          this.killStaff(o, b, 0.75);
          if (o.ai) this.threat(o, b.ownerId, `${b.name} artık bir enkaz. Bizimle uğraşmanın bedeli bu.`);
          this.grudge(o, b.ownerId);
        }
        // oyuncunun evi bombalandı
        for (const pl of world.players.values()) if (pl.homeId === b.id && pl !== world.players.get(m.byId)) this.say(pl, `🏠💥 EVİN BOMBALANDI! (${b.name}) "${o.name}"`, 'err', 'alarm');
        m.done = true;
        return true;
      }
      case 'wreck': {
        const v = T.u;
        if (!v) { m.done = true; return true; }
        if (!near(v.x, v.z, 6)) return false;
        m.grab = (m.grab ?? 0) + dt;
        if (m.grab < 3) return false;
        const veh = engine.getSystem('vehicles');
        const owner = world.players.get(v.ownerId);
        const label = (v.type === 'pheli' ? '🚁' : '🚗') + ' ' + (v.model ?? 'araç');
        if (rng.chance(0.5)) {
          veh.transfer(v, null, v.kindV ?? (v.type === 'pheli' ? 'heli' : 'car'));
          if (owner) { this.say(owner, `🚗💨 Park halindeki aracın "${o.name}" tarafından ÇALINDI!`, 'err', 'alarm'); if (o.ai) this.threat(o, owner.id, 'Güzel araban vardı. Artık bizim.'); }
          bus.news('crime', `🚗💨 "${o.name}" ${owner?.name ?? 'birinin'} aracını çaldı!`);
        } else {
          this.despawn(v.id, 'destroyed');
          veh.destroyed(v);
          if (owner && o.ai) this.threat(o, owner.id, 'Aracına küçük bir hediye bıraktık. 💥');
          bus.news('crime', `💥 "${o.name}" ${owner?.name ?? 'birinin'} aracını havaya uçurdu!`);
        }
        if (owner) this.grudge(o, owner.id);
        void label;
        m.done = true;
        return true;
      }
      case 'ceonap': {
        const b = T.b;
        if (!b) { m.done = true; return true; }
        if (!near(T.x, T.z, 8)) return false;
        m.grab = (m.grab ?? 0) + dt;
        if (m.grab < 4) return false;
        this.killStaff(o, b, 0);
        this.takeCeo(o, b);
        m.done = true;
        return true;
      }
      case 'raid': {
        const b = T.b;
        if (!b) { m.done = true; return true; }
        if (!near(T.x, T.z, 8)) return false;
        m.raid = (m.raid ?? 0) + dt;
        if ((this.fxBudget -= 1) > 0 || rng.chance(dt * 3)) {
          const u = world.units.get(m.men[0]);
          if (u) bus.emit('net:fx', { t: 'gun', a: [u.x, u.z], b: [b.x + (rng.next() - 0.5) * b.width, b.z + (rng.next() - 0.5) * b.depth], w: 'rifle', hit: 1 });
        }
        if (m.raid < 10) return false;
        const loot = Math.round(Math.max(0, b.balance) * 0.4);
        b.balance -= loot;
        m.loot += loot;
        world.damageBuilding(b, (b.maxHp ?? 1000) * 0.3, null);
        // içerideki/yakındaki oyuncular yaralanır
        for (const p of world.players.values()) if (p.online && !p.dead && p.orgId !== o.id && (p.inside === b.id || Math.hypot(p.x - b.door.x, p.z - b.door.z) < 12)) engine.getSystem('life').damage(p, 35, null, 'baskında');
        let dead = 0;
        for (const n of [...world.npcs.values()]) if (n.alive && (n.locationId === b.id || Math.hypot(n.x - b.door.x, n.z - b.door.z) < 12) && rng.chance(0.4) && dead < 5) { world.killNpc(n, 'baskında öldü'); dead++; }
        bus.news('crime', `🚙💨 "${o.name}" baskını: ${b.name}! Kasadan ${tl(loot)} götürdüler, ${dead} kişi öldü.`);
        if (b.ownerKind === 'player') {
          const staff = this.killStaff(o, b, o.ai ? 0.5 : 0.35);
          this.say(b.ownerId, `🚙 ${b.name} basıldı! Kasadan ${tl(loot)} gitti${staff ? `, ${staff} çalışan öldü` : ''}.`, 'err', 'alarm');
          if (o.ai) this.threat(o, b.ownerId, `${b.name} bizim bölgemizde. Haraç vermeyen dükkanın sonu bu.`);
          this.grudge(o, b.ownerId);
        }
        // karargah basıldıysa: o örgütün parası da gider
        if (b.type === 'compound' && b.orgId) this.hitOrg(b, o);
        m.done = true;
        return true;
      }
      case 'turf': {
        if (!near(m.tx, m.tz, 14)) return false;
        m.hold = (m.hold ?? 0) + dt;
        if (m.hold < 25) return false;
        if (!o.turf.includes(m.tile)) o.turf.push(m.tile);
        const [i, j] = m.tile.split(',').map(Number);
        const t = world.tile(i, j);
        if (t) t.org = o.id;
        const owner = t?.owner;
        const name = owner === 'state' ? (world.republic?.name ?? 'Devlet') : world.players.get(owner)?.countryName ?? 'bölge';
        bus.news('crime', `🏴 "${o.name}" ${name} topraklarında bir mahalleyi ele geçirdi! Esnaf ve devlet artık haraç ödeyecek.`);
        if (owner && world.players.get(owner)) this.say(owner, `🏴 "${o.name}" topraklarında bir mahalleyi haraca bağladı! Her gün koruma parası ödeyeceksin.`, 'err', 'alarm');
        m.done = true;
        return true;
      }
    }
    return true;
  }

  blastPlayers(x, z, r, dmg) {
    const life = this.ctx.engine.getSystem('life');
    for (const p of this.world.players.values()) if (p.online && !p.dead && !p.inside && Math.hypot(p.x - x, p.z - z) < r) life.damage(p, dmg * (1 - Math.hypot(p.x - x, p.z - z) / r), null, 'patlamada');
  }

  endMission(m, ok) {
    const { world } = this.ctx;
    this.missions.delete(m.id);
    for (const id of [...m.cars, ...m.men]) this.despawn(id);
    for (const id of this.lawCalls.get(m.id) ?? []) { const u = world.units.get(id); if (u) u.leaveAt = Date.now() + 8000; }
    this.lawCalls.delete(m.id);
    const o = world.orgs[m.orgId];
    if (!o) return;
    // ölenler stoktan düşer
    const lost = m.n - (m.survivors ?? m.men.length);
    if (m.phase === 'escape' || m.phase === 'remount' || m.phase === 'act') o.men[m.menType] = Math.max(0, (o.men[m.menType] ?? 0) - Math.max(0, lost));
    const by = world.players.get(m.byId);
    if (m.loot > 0) {
      const to = by ?? world.players.get(o.leaderId);
      if (to) { to.balance += m.loot; world.touchPlayer(to); }
      else o.bank = (o.bank ?? 0) + m.loot;
    }
    if (by) this.say(by, `${MISSIONS[m.kind].icon} ${MISSIONS[m.kind].label} ${ok ? 'BAŞARILI ✅' : 'başarısız ❌'}${lost > 0 ? ` · ${lost} adam öldü` : ''}${m.loot ? ` · ganimet +${tl(m.loot)}` : ''}`, ok ? 'ok' : 'warn', ok ? 'success' : 'alarm');
    // geride ölü bırakıldıysa: polis ispiyon zinciri
    if (by && lost > 0 && Math.random() < 0.3) {
      by.wanted = Math.min(5, by.wanted + 1);
      world.logCrime?.(by, `Örgüt faaliyeti: ${MISSIONS[m.kind].label}`);
      this.say(by, '🐀 Ölen adamlarının üstünden sana ulaştılar. ⭐ aranıyorsun!', 'warn', 'siren');
    }
  }

  // ------------------------------------------------------------------ kaçırma
  kidnap(o, t, m, extra = true) {
    const { world, bus, config } = this.ctx;
    const hq = this.hqOf(o);
    // NPC karteller: 24 oyun saati süre, ödenmezse rehine infaz edilir
    const ai = !!o.ai;
    const ransom = ai ? Math.max(2000, Math.round(Math.max(0, t.balance) * 0.5 + 1500 * this.mul())) : Math.max(500, Math.round(Math.max(0, t.balance) * 0.3));
    const life = ai ? 24 * config.time.msPerGameHour : 120000;
    t.kidnapped = { orgId: o.id, ransom, until: Date.now() + life, byId: m.byId, ai };
    t.pose = '';
    t.frozenUntil = t.kidnapped.until;
    if (hq) {
      const L = interiorLayout('hideout'), s = spotById(L, 'boss'), og = interiorOrigin(hq.id);
      t.inside = hq.id;
      t.x = og.x + s.x + 2; t.z = og.z + s.z + 3;
    } else { t.x = m.from.x; t.z = m.from.z; t.inside = null; }
    bus.emit('net:teleport', { playerId: t.id, x: t.x, z: t.z });
    world.touchPlayer(t);
    if (ai) {
      this.say(t, `🥷 KAÇIRILDIN! "${o.name}" seni ${hq?.name ?? 'bir depoya'} götürdü. Fidye: ${tl(ransom)} — 24 saat içinde ödenmezse infaz edileceksin!`, 'err', 'siren');
      this.threat(o, t.id, `Seni aldık ${t.name}. 24 saat içinde ${tl(ransom)} gönder, yoksa bu depodan çıkamazsın. Polise gidersen ölürsün.`);
    } else this.say(t, `🥷 KAÇIRILDIN! "${o.name}" seni ${hq?.name ?? 'bir depoya'} götürdü. Fidye: ${tl(ransom)} — öde ya da 2 dakika bekle (o zaman zorla alınır).`, 'err', 'siren');
    const by = world.players.get(m.byId);
    if (by) this.say(by, `🥷 ${t.name} kaçırıldı ve karargahta! Fidye ${tl(ransom)} gelecek.`, 'ok', 'success');
    bus.news('crime', `🥷 ${t.name} sokak ortasında kaçırıldı! Şüpheli: "${o.name}"`);
    this.grudge(o, t.id);
    // NPC kartel: örgütündeki herkesi alır, sadece 1 kişiyi bırakır; tehdit ona gider
    if (ai && extra && t.orgId) {
      const mates = world.orgs[t.orgId]?.members.map((id) => world.players.get(id)).filter((x) => x && x !== t && x.online && !x.dead && !x.kidnapped && !x.admin?.god) ?? [];
      mates.sort((a, b) => b.balance - a.balance);
      const left = mates.shift(); // en zengini dışarıda bırak: o ödeyecek
      for (const x of mates) this.kidnap(o, x, m, false);
      const all = [t, ...mates];
      if (left) {
        const sum = all.reduce((s, x) => s + x.kidnapped.ransom, 0);
        this.threat(o, left.id, `Arkadaşlarını kaçırdık: ${all.map((x) => x.name).join(', ')}. Bir tek sen kaldın. 24 saat içinde ${tl(sum)} göndermezsen ölürler. Telefon › Örgüt › Rehineler.`);
        this.say(left, `☠️ "${o.name}" örgütünden ${all.length} kişiyi kaçırdı, bir tek sen kaldın! Mesajlarına bak.`, 'err', 'siren');
      }
    }
  }

  /** Kartelin telefondan tehdit mesajı (Mesajlar uygulamasında kartelin adıyla görünür) */
  threat(o, pid, text) {
    const soc = this.ctx.engine.getSystem('society');
    if (!soc) return;
    const m = { id: soc.id('t'), from: o.id, fromName: `${o.icon ?? '🕴️'} ${o.name}`, to: pid, text, at: Date.now(), threat: true };
    soc.S.messages.push(m);
    soc.S.messages = soc.S.messages.slice(-300);
    soc.to(pid, 'phone:msg', m);
  }

  /** Başkası için fidye öde (rehineler listesinden) */
  payFor(p, { hostageId, playerId }) {
    const { world } = this.ctx;
    if (playerId) {
      const t = world.players.get(playerId);
      if (!t?.kidnapped) return fail('Bu kişi rehin değil.');
      const amt = t.kidnapped.ransom;
      if (p !== t && p.balance < amt) return fail(`Fidye ${tl(amt)}.`);
      if (p !== t) { p.balance -= amt; t.balance += amt; world.touchPlayer(p); }
      const r = this.payRansom(t);
      if (p !== t) this.say(t, `🙏 ${p.name} senin için fidyeyi ödedi. Serbestsin!`, 'ok', 'success');
      return p === t ? r : { ok: true, message: `💸 ${t.name} için ${tl(amt)} fidye ödendi. Serbest!` };
    }
    for (const o of Object.values(world.orgs)) {
      const h = (o.hostages ?? []).find((x) => x.id === hostageId);
      if (!h) continue;
      if (p.balance < h.ransom) return fail(`Fidye ${tl(h.ransom)}.`);
      p.balance -= h.ransom;
      o.bank = (o.bank ?? 0) + h.ransom;
      o.hostages = o.hostages.filter((x) => x !== h);
      const b = world.buildings.get(h.buildingId);
      if (b?.ceo) { b.ceo.held = null; world.touch(b); }
      world.touchPlayer(p);
      this.threat(o, p.id, `Para geldi. ${h.name} serbest. Bir dahakine bu kadar şanslı olmayabilirsin.`);
      return { ok: true, message: `💸 ${h.name} kurtarıldı (−${tl(h.ransom)}).`, sfx: 'success' };
    }
    return fail('Rehine bulunamadı.');
  }

  /** CEO'yu rehin al */
  takeCeo(o, b) {
    const { world, bus, clock } = this.ctx;
    if (!b?.ceo || b.ceo.held) return false;
    const owner = world.players.get(b.ownerId);
    const T = { junior: 15000, pro: 150000, legend: 1500000 }[b.ceo.tier] ?? 15000;
    const h = { id: `h${Date.now().toString(36)}${++this.seq}`, kind: 'ceo', name: b.ceo.name, buildingId: b.id, ownerId: b.ownerId, ransom: Math.round(T * 0.6), deadline: clock.totalHours + 24 };
    o.hostages = [...(o.hostages ?? []), h];
    b.ceo.held = h.id;
    world.touch(b);
    bus.news('crime', `👔🥷 ${b.name} CEO'su ${h.name} kaçırıldı! Şüpheli: "${o.name}"`);
    if (owner) {
      this.threat(o, owner.id, `CEO'n ${h.name} bizde. 24 saat içinde ${tl(h.ransom)} göndermezsen onu bir daha göremezsin. Telefon › Örgüt › Rehineler.`);
      this.say(owner, `👔 CEO'n ${h.name} kaçırıldı! "${o.name}" ${tl(h.ransom)} fidye istiyor. Mesajlarına bak.`, 'err', 'siren');
    }
    this.grudge(o, b.ownerId);
    return true;
  }

  /** İşletmenin çalışanlarını ve CEO'sunu vur */
  killStaff(o, b, ceoChance) {
    const { world, bus, rng } = this.ctx;
    let dead = 0;
    for (const id of [...(b.employeeIds ?? [])]) {
      const n = world.npcs.get(id);
      if (n?.alive && (n.locationId === b.id || Math.hypot(n.x - b.door.x, n.z - b.door.z) < 20) && rng.chance(0.8)) { world.killNpc(n, 'kartel kurşunuyla öldü'); dead++; }
    }
    const owner = b.ownerKind === 'player' && world.players.get(b.ownerId);
    if (b.ceo && !b.ceo.held && rng.chance(ceoChance)) {
      const name = b.ceo.name;
      b.ceo = null;
      world.touch(b);
      bus.news('crime', `👔💀 ${b.name} CEO'su ${name} "${o.name}" saldırısında vuruldu!`);
      if (owner) { this.say(owner, `👔💀 CEO'n ${name} vuruldu! ${b.name} artık yönetimsiz.`, 'err', 'death'); this.threat(o, owner.id, `CEO'nu temizledik. Sıradaki sensin.`); }
    }
    if (owner && dead) this.say(owner, `💀 ${b.name} çalışanlarından ${dead} kişi öldürüldü!`, 'err', 'alarm');
    return dead;
  }

  payRansom(p, forced = false) {
    const { world } = this.ctx;
    const k = p.kidnapped;
    if (!k) return fail('Kaçırılmadın.');
    const o = world.orgs[k.orgId];
    if (k.ai && !forced && p.balance < k.ransom) return fail(`Fidye ${tl(k.ransom)}, paran yetmiyor. Örgüt arkadaşların Telefon › Örgüt › Rehineler'den ödeyebilir.`);
    const amt = Math.min(Math.max(0, p.balance), k.ransom);
    p.balance -= amt;
    const to = world.players.get(k.byId) ?? world.players.get(o?.leaderId);
    if (to) { to.balance += amt; world.touchPlayer(to); this.say(to, `💰 ${p.name} fidyesi geldi: +${tl(amt)}`, 'ok', 'cash'); }
    p.kidnapped = null;
    p.frozenUntil = 0;
    const hq = o && this.hqOf(o);
    if (hq && p.inside === hq.id) { p.inside = null; p.x = hq.door.x + 4; p.z = hq.door.z + 8; this.ctx.bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z }); }
    world.touchPlayer(p);
    return { ok: true, message: forced ? `💸 Fidye zorla alındı (−${tl(amt)}). Serbestsin.` : `💸 Fidyeyi ödedin (−${tl(amt)}). Serbestsin!` };
  }

  // ------------------------------------------------------------------ güvenlik güçleri
  /** Olay yerine o toprağın güvenlik gücü gelir: merkez = polis + özel harekât, ülkeler = kendi askeri */
  callLaw(m, T) {
    const { world } = this.ctx;
    const x = T?.x ?? m.tx, z = T?.z ?? m.tz;
    const owner = world.ownerAt(x, z) ?? 'state';
    if (owner === 'underworld' || owner === `org:${m.orgId}`) return;
    const ownerPlayer = world.players.get(owner);
    const force = Math.min(40, Math.round(m.n * 0.8) + 2);
    const ids = [];
    for (let i = 0; i < force; i++) {
      const a = Math.random() * Math.PI * 2, r = 55 + Math.random() * 25;
      const type = i % 3 === 2 || ownerPlayer ? 'swat' : 'cop';
      const color = ownerPlayer ? ownerPlayer.color : '#1f3a93';
      const u = this.spawn(type, x + Math.cos(a) * r, z + Math.sin(a) * r, 'police', color, { tag: ownerPlayer ? `${ownerPlayer.countryName ?? ownerPlayer.name} Askeri` : 'Özel Harekât' });
      u.law = owner; u.chaseMission = m.id; u.goal = { x, z };
      ids.push(u.id);
    }
    this.lawCalls.set(m.id, ids);
  }

  // ------------------------------------------------------------------ sokak çatışması
  team(u) { return LAW.has(u.type) ? 'law' : u.org ? `org:${u.org}` : null; }

  hostile(u, v) {
    const a = this.team(u), b = this.team(v);
    if (!a || !b || a === b) return false;
    if (a === 'law' || b === 'law') {
      const g = a === 'law' ? v : u;
      // polis/asker: görevdeki çete adamlarıyla ve onlara ateş açanla çatışır; karargah nöbetçisine dokunmaz (baskın yoksa)
      return !!g.hostile || !!g.job;
    }
    const oa = this.world.orgs[u.org], ob = this.world.orgs[v.org];
    return !!(oa?.grudge?.[v.org] || ob?.grudge?.[u.org] || u.hostile || v.hostile);
  }

  /** Birim bu oyuncuya ateş eder mi? */
  shootsPlayer(u, p) {
    if (p.dead || !p.online || p.inside || p.admin?.god) return false;
    const now = Date.now();
    if (LAW.has(u.type)) return (p.copHostileUntil ?? 0) > now || p.wanted >= 4;
    if (!u.org || p.orgId === u.org) return false;
    if ((u.aggro?.[p.id] ?? 0) > now) return true;
    const m = u.job && this.missions.get(u.job);
    if (m && (m.kind === 'hit' || m.kind === 'kidnap') && m.targetId === p.id) return m.kind === 'hit' || (p.health > 60 && Math.random() < 0.1);
    if (u.boss) { const b = this.world.players.get(u.boss); if (b && b.lastHitBy?.id === p.id && b.lastHitBy.at > now - 20000) return true; }
    const o = this.world.orgs[u.org];
    if (o?.grudge?.[p.id] && (u.job || u.post)) return true;
    // karargaha yaklaşan düşman örgüt üyesi
    if (u.post && p.orgId && o?.grudge?.[p.orgId]) return true;
    return false;
  }

  tickCombat(dt) {
    const { world, bus, engine } = this.ctx;
    const fighters = [];
    for (const u of world.units.values()) if (u.def?.fight) fighters.push(u);
    if (!fighters.length) return;
    const life = engine.getSystem('life');
    const players = [...world.players.values()].filter((p) => p.online && !p.dead && !p.inside);
    this.fxBudget = 6;
    for (const u of fighters) {
      if (!world.units.has(u.id)) continue;
      const F = u.def.fight;
      u.cd = (u.cd ?? Math.random() * F.cd) - dt;
      // hedef seç: en yakın düşman birim ya da oyuncu
      let best = null, bd = F.range;
      for (const v of fighters) {
        if (v === u || !world.units.has(v.id)) continue;
        const d = Math.hypot(v.x - u.x, v.z - u.z);
        if (d < bd && this.hostile(u, v)) { bd = d; best = v; }
      }
      let bestP = null;
      for (const p of players) {
        const d = Math.hypot(p.x - u.x, p.z - u.z);
        if (d < bd && this.shootsPlayer(u, p)) { bd = d; bestP = p; best = null; }
      }
      u.engaged = !!(best || bestP);
      if (u.cd > 0 || (!best && !bestP)) continue;
      u.cd = F.cd * (0.85 + Math.random() * 0.3);
      const tx = best?.x ?? bestP.x, tz = best?.z ?? bestP.z;
      u.rotY = Math.atan2(tx - u.x, tz - u.z);
      u.aimRot = u.rotY;
      const hit = Math.random() < Math.max(0.35, 0.85 - bd / (F.range * 2));
      if (this.fxBudget-- > 0 || hit) bus.emit('net:fx', { t: 'gun', a: [u.x, u.z], b: [tx, tz], w: F.dmg > 20 ? 'rifle' : 'pistol', hit: hit ? 1 : 0 });
      if (!hit) continue;
      const dmg = F.dmg * (0.8 + Math.random() * 0.4);
      if (best) this.hurtUnit(best, dmg, u);
      else this.hurtPlayer(bestP, dmg, u, life);
    }
  }

  hurtUnit(v, dmg, by) {
    const { world, bus } = this.ctx;
    v.hp -= dmg;
    if (by?.org && v.org) {
      // misilleme: vurulan örgüt, vuranı düşman bilir
      const vo = world.orgs[v.org];
      if (vo) vo.grudge[by.org] = (vo.grudge[by.org] ?? 0) + 1;
    }
    v.hostile = v.hostile || !!by;
    if (v.hp > 0) return;
    bus.emit('net:fx', { t: 'blood', x: v.x, z: v.z });
    this.despawn(v.id, 'destroyed');
    if (v.def?.keep) { this.ctx.engine.getSystem('vehicles')?.destroyed(v); return; }
    if (v.type === 'gangcar' && v.model && v.org) { const fo = world.orgs[v.org]; if (fo?.fleet?.cars?.[v.model]) fo.fleet.cars[v.model]--; }
    if (v.type === 'oheli' && v.model && v.org) { const fo = world.orgs[v.org]; if (fo?.fleet?.helis?.[v.model]) fo.fleet.helis[v.model]--; bus.news('crime', `🚁💥 "${fo?.name}" helikopteri düşürüldü!`); }
    if (v.org && world.orgs[v.org] && !v.job) {
      const o = world.orgs[v.org];
      if (v.type === 'guard') o.men.guard = Math.max(0, (o.men.guard ?? 0) - 1);
      if (v.boss) o.escort[v.boss] = (o.escort[v.boss] ?? []).filter((id) => id !== v.id);
      o.posted = o.posted.filter((id) => id !== v.id);
    }
    if (by?.org) { const bo = world.orgs[by.org]; if (bo) bo.kills = (bo.kills ?? 0) + 1; }
  }

  hurtPlayer(p, dmg, u, life) {
    u.hostile = true;
    // Korumalar kurşunun bir kısmını üstlenir
    const o = this.orgOf(p);
    const guards = (o?.escort[p.id] ?? []).map((id) => this.world.units.get(id)).filter((g) => g && Math.hypot(g.x - p.x, g.z - p.z) < 7);
    for (const g of guards) g.hostile = true; // korumalar saldırganla çatışır
    if (guards.length && Math.random() < 0.5) { this.hurtUnit(guards[0], dmg, u); return; }
    life.damage(p, dmg, null, LAW.has(u.type) ? 'polis kurşunuyla' : 'kartel kurşunuyla');
    if (!p.dead) this.say(p, `🩸 ${u.def.label} sana ateş ediyor! (−${Math.round(dmg)} can)`, 'err', 'hurt');
  }

  /** Oyuncu bir sokak birimini vurdu (LifeSystem.attack) */
  playerHitUnit(p, u, dmg) {
    const { world } = this.ctx;
    const now = Date.now();
    if (LAW.has(u.type)) {
      p.copHostileUntil = now + 60000;
      p.wanted = Math.min(5, p.wanted + (u.hp - dmg <= 0 ? 2 : 1));
      world.logCrime?.(p, 'Polise silahlı saldırı');
      this.ctx.engine.getSystem('underworld')?.startChase(p, true);
    } else if (u.org) {
      u.aggro = u.aggro ?? {};
      // aynı örgütün yakındaki tüm adamları saldırgana döner
      for (const v of world.units.values()) if (v.org === u.org && Math.hypot(v.x - u.x, v.z - u.z) < 40) { v.aggro = v.aggro ?? {}; v.aggro[p.id] = now + 45000; }
      const o = world.orgs[u.org];
      if (o?.ai) this.grudge(o, p.orgId ?? p.id);
    }
    this.hurtUnit(u, dmg, p.orgId ? { org: p.orgId } : null);
    world.touchPlayer(p);
    return u.hp <= 0;
  }

  grudge(o, enemy) {
    if (!o || !enemy) return;
    o.grudge[enemy] = (o.grudge[enemy] ?? 0) + 2;
  }

  /** Karargahı basılan örgüt: kasası ve itibarı gider */
  hitOrg(b, attacker) {
    const { world, bus } = this.ctx;
    const o = world.orgs[b.orgId];
    if (!o) return;
    this.grudge(o, attacker.id);
    const guardsLeft = o.posted.filter((id) => world.units.has(id)).length;
    if (b.hp <= (b.maxHp ?? 1) * 0.35 || guardsLeft === 0) {
      const loot = Math.round(o.bank ?? 0);
      o.bank = 0;
      b.orgId = null; b.orgTag = null; o.hqId = null;
      world.touch(b);
      for (const id of o.posted) this.despawn(id);
      o.posted = [];
      bus.news('crime', `🏴‍☠️ "${o.name}" karargahı düştü! "${attacker.name}" ${loot ? `${tl(loot)} ganimetle ` : ''}depoyu ele geçirdi.`);
      bus.emit('net:alert', { level: 'warning', text: `🏴‍☠️ "${o.name}" karargahı "${attacker.name}" tarafından düşürüldü!` });
      const to = world.players.get(attacker.leaderId);
      if (to && loot) { to.balance += loot; world.touchPlayer(to); }
      if (!attacker.ai) this.setHQ(attacker, b);
      if (o.ai) { o.defeatedUntil = this.ctx.clock.totalHours + 48; o.men = { guard: 4, hitman: 2, bomber: 2, enforcer: 4, kidnapper: 1 }; }
    }
  }

  // ------------------------------------------------------------------ NPC rakip karteller
  ensureCartels() {
    const { world } = this.ctx;
    const comps = this.compounds();
    if (!comps.length) return;
    for (const [k, c] of AI_CARTELS.entries()) {
      const id = `cartel${k}`;
      if (!world.orgs[id]) world.orgs[id] = { id, name: c.name, color: c.color, icon: c.icon, leaderId: null, members: [], invites: [], ai: true, hqId: null, men: { guard: 10, hitman: 6, bomber: 5, enforcer: 14, kidnapper: 4 }, turf: [], rep: 50, grudge: {}, posted: [], escort: {}, bank: 50000, nextMoveAt: 10 + k * 6, kills: 0 };
      const o = world.orgs[id];
      if (!this.hqOf(o) && !(o.defeatedUntil > this.ctx.clock.totalHours)) {
        const free = comps.find((b) => !b.orgId && !b.destroyed);
        if (free) this.setHQ(o, free);
      } else if (this.hqOf(o)) this.postGuards(o);
    }
  }

  /** Rakip kartellerin saatlik kararları: oyuncuların işyerlerini basar, patlatır, adam kaçırır */
  aiTurn(hour) {
    const { world, bus, rng } = this.ctx;
    const online = [...world.players.values()].filter((p) => p.online && !p.isAI && !p.dead);
    for (const o of Object.values(world.orgs)) {
      if (!o.ai) continue;
      if (o.defeatedUntil && hour < o.defeatedUntil) continue;
      if (o.defeatedUntil && hour >= o.defeatedUntil) { o.defeatedUntil = null; this.ensureCartels(); bus.news('crime', `${o.icon} "${o.name}" küllerinden doğdu, yeni bir depoya yerleşti!`); }
      // günlük güçlenme
      if (hour % 24 === 3) { o.men.enforcer = Math.min(30, o.men.enforcer + 3); o.men.guard = Math.min(16, o.men.guard + 2); o.men.bomber = Math.min(10, o.men.bomber + 1); o.men.hitman = Math.min(10, o.men.hitman + 1); o.men.kidnapper = Math.min(6, o.men.kidnapper + 1); this.postGuards(o); }
      if (!online.length || hour < o.nextMoveAt) continue;
      if ([...this.missions.values()].some((m) => m.orgId === o.id)) continue;
      // her kartel ~12-22 oyun saatinde bir (2-4 gerçek dk) büyük bir iş yapar; kin varsa daha sık
      o.nextMoveAt = hour + rng.int(12, 22) - Math.min(8, Object.keys(o.grudge).length * 2);
      // hedef: kin tutulan > zengin oyuncunun işyeri/dükkanı > rastgele dükkan
      const grudgeP = online.filter((p) => o.grudge[p.id] || (p.orgId && o.grudge[p.orgId]));
      const victim = rng.pick(grudgeP.length ? grudgeP : online);
      const roll = rng.next();
      const owned = world.buildingsWhere((b) => b.ownerKind === 'player' && b.ownerId === victim.id && !b.destroyed && b.category !== 'land');
      const work = world.buildings.get(victim.jobBuildingId);
      const rivalHq = victim.orgId && this.hqOf(world.orgs[victim.orgId]);
      if (rivalHq && o.grudge[victim.orgId] > 3 && roll < 0.35) { this.launch(o, 'raid', { ...rivalHq.door, x: rivalHq.door.x, z: rivalHq.door.z, id: rivalHq.id }, Math.min(this.available(o, 'enforcer'), 10), null); continue; }
      const home = world.buildings.get(victim.homeId);
      const ceoBiz = owned.filter((x) => x.ceo && !x.ceo.held);
      if (ceoBiz.length && roll < 0.22 && this.available(o, 'kidnapper') > 0) { this.launch(o, 'ceonap', rng.pick(ceoBiz), Math.min(4, this.available(o, 'kidnapper')), null); continue; }
      const parked = [...world.units.values()].filter((u) => u.def?.keep && u.ownerId === victim.id && !u.flight);
      if (parked.length && roll > 0.7 && roll <= 0.85) { this.launch(o, 'wreck', rng.pick(parked), Math.max(2, Math.min(5, this.available(o, 'enforcer'))), null); continue; }
      if (home && grudgeP.includes(victim) && roll > 0.85) { this.launch(o, 'bomb', home, Math.max(2, Math.min(4, this.available(o, 'bomber'))), null); this.threat(o, victim.id, `Evini biliyoruz ${victim.name}.`); continue; }
      if (roll < 0.3 && (owned.length || work)) {
        const b = rng.pick(owned.length ? owned : [work]);
        this.launch(o, rng.chance(0.5) ? 'bomb' : 'raid', b, Math.min(this.available(o, rng.chance(0.5) ? 'bomber' : 'enforcer'), rng.int(3, 6)) || 2, null);
      } else if (roll < 0.5 && this.available(o, 'kidnapper') > 0 && victim.balance > 1500) {
        this.launch(o, 'kidnap', victim, Math.min(3, this.available(o, 'kidnapper')), null);
      } else if (roll < 0.68 && grudgeP.includes(victim) && this.available(o, 'hitman') > 0) {
        this.launch(o, 'hit', victim, Math.min(3, this.available(o, 'hitman')), null);
      } else {
        const shops = world.buildingsWhere((b) => b.category === 'commercial' && b.operational && !b.destroyed);
        const b = work && rng.chance(0.5) ? work : rng.pick(shops);
        if (b) this.launch(o, 'raid', b, Math.min(this.available(o, 'enforcer'), rng.int(4, 9)) || 2, null);
      }
    }
  }

  // ------------------------------------------------------------------ zaman
  onHour(time) {
    this.aiTurn(time.totalHours);
    this.regenState();
    // kaçırılanların süresi
    const now = Date.now();
    for (const p of this.world.players.values()) if (p.kidnapped && now > p.kidnapped.until) {
      if (p.kidnapped.ai) {
        const o = this.world.orgs[p.kidnapped.orgId];
        p.kidnapped = null; p.frozenUntil = 0;
        this.ctx.engine.getSystem('life').kill(p, null, 'rehineyken infaz edilerek');
        this.ctx.bus.news('crime', `☠️ Fidyesi ödenmeyen ${p.name}, "${o?.name ?? 'kartel'}" tarafından infaz edildi!`);
        if (o) for (const id of this.world.orgs[p.orgId]?.members ?? []) if (id !== p.id) this.threat(o, id, `${p.name} için para gelmedi. Uyarmıştık.`);
        continue;
      }
      const r = this.payRansom(p, true);
      this.say(p, r.message, 'warn');
    }
    for (const o of Object.values(this.world.orgs)) {
      for (const h of [...(o.hostages ?? [])]) {
        if (time.totalHours < h.deadline) continue;
        o.hostages = o.hostages.filter((x) => x !== h);
        const b = this.world.buildings.get(h.buildingId);
        if (b?.ceo?.held === h.id) { b.ceo = null; this.world.touch(b); }
        this.ctx.bus.news('crime', `☠️ Fidyesi ödenmeyen CEO ${h.name} ölü bulundu! "${o.name}" üstlendi.`);
        const owner = this.world.players.get(h.ownerId);
        if (owner) { this.say(owner, `👔💀 Fidye ödenmedi: CEO'n ${h.name} öldürüldü.`, 'err', 'death'); this.threat(o, owner.id, `Süre doldu. ${h.name} artık yok.`); }
      }
    }
  }

  onDay() {
    const { world, bus } = this.ctx;
    // Haraç: ele geçirilen bölgelerdeki esnaf %10, devlet/ülke koruma parası öder
    for (const o of Object.values(world.orgs)) {
      if (!o.turf.length) continue;
      let total = 0;
      const keep = [];
      for (const key of o.turf) {
        const [i, j] = key.split(',').map(Number);
        const t = world.tile(i, j);
        if (!t || t.org !== o.id) continue;
        // Devlet / ülke güçleri operasyon yapar: %30 ihtimalle mahalleyi geri alır
        if (Math.random() < 0.3) {
          t.org = null;
          const nm = t.owner === 'state' ? (world.republic?.name ?? 'Devlet') : world.players.get(t.owner)?.countryName ?? 'Güvenlik';
          bus.news('crime', `🚔 ${nm} güçleri operasyon yaptı: "${o.name}" bir mahalleden temizlendi!`);
          continue;
        }
        keep.push(key);
        for (const b of world.buildingsWhere((x) => x.lot?.i === i && x.lot?.j === j && x.category === 'commercial' && !x.destroyed)) {
          const cut = Math.round(Math.max(0, b.balance) * 0.1);
          b.balance -= cut; total += cut;
        }
        const owner = world.players.get(t.owner);
        const fee = 400;
        if (t.owner === 'state') { const f = Math.min(fee, Math.max(0, world.treasury)); world.treasury -= f; total += f; }
        else if (owner) { const f = Math.min(fee, Math.max(0, owner.balance)); owner.balance -= f; total += f; world.touchPlayer(owner); }
      }
      o.turf = keep;
      if (!total) continue;
      const to = world.players.get(o.leaderId);
      if (to) { to.balance += total; world.touchPlayer(to); this.say(to, `🏴 Bölgelerden haraç geldi: +${tl(total)} (${keep.length} mahalle)`, 'ok', 'cash'); }
      else o.bank = (o.bank ?? 0) + total;
    }
  }

  onTick(dt) {
    const { world } = this.ctx;
    this.tickMissions(dt);
    // nöbetçiler yerinde, korumalar patronun peşinde, polis olay yerine
    const now = Date.now();
    for (const u of [...world.units.values()]) {
      if (!u.def?.street) continue;
      if (u.post && !u.engaged) this.move(u, u.post.x, u.post.z, 6, dt);
      else if (u.boss) {
        const b = world.players.get(u.boss);
        const o = world.orgs[u.org];
        if (!b || !b.online || b.dead) { if (o) this.dismissEscort(o, u.boss); continue; }
        if (b.inside) { const hb = world.buildings.get(b.inside); if (hb) this.move(u, hb.door.x + (u.slot - 1.5) * 2, hb.door.z + 3, 15, dt); continue; }
        const ring = Math.floor(u.slot / 8);
      const a = ((u.slot % 8) / 8) * Math.PI * 2 + b.rotY;
        const d = Math.hypot(b.x - u.x, b.z - u.z);
        if (d > 60) { u.x = b.x; u.z = b.z; }
        if (!u.engaged || d > 14) this.move(u, b.x + Math.cos(a) * (3 + ring * 2), b.z + Math.sin(a) * (3 + ring * 2), d > 6 ? 17 : 8, dt);
      } else if (u.law && u.goal) {
        if (u.leaveAt && now > u.leaveAt) { this.despawn(u.id); continue; }
        const m = this.missions.get(u.chaseMission);
        // görevdeki en yakın çeteciye yürü
        let tgt = u.goal;
        if (m) { for (const id of [...m.men, ...m.cars]) { const v = world.units.get(id); if (v) { tgt = v; break; } } }
        else if (!u.leaveAt) u.leaveAt = now + 8000;
        if (!u.engaged) this.move(u, tgt.x, tgt.z, u.def.speed, dt);
        else if (Math.hypot(tgt.x - u.x, tgt.z - u.z) > 18) this.move(u, tgt.x, tgt.z, u.def.speed * 0.5, dt);
      }
    }
    this.tickCombat(dt);
  }

  /** Telefon için özet */
  privateFor(p) {
    const { world } = this.ctx;
    const o = this.orgOf(p);
    const list = Object.values(world.orgs).map((x) => ({ id: x.id, name: x.name, icon: x.icon, color: x.color, ai: x.ai, members: x.members.length, power: Object.values(x.men).reduce((s, v) => s + v, 0), hq: this.hqOf(x)?.name ?? null, turf: x.turf.length, enemy: !!(o && (x.grudge?.[o.id] || o.grudge?.[x.id])) }));
    const invites = Object.values(world.orgs).filter((x) => x.invites?.includes(p.id)).map((x) => ({ id: x.id, name: x.name }));
    // Beni ilgilendiren rehineler: CEO'larım, örgüt arkadaşlarım
    const hostages = [];
    for (const x of Object.values(world.orgs)) for (const h of x.hostages ?? []) if (h.ownerId === p.id) hostages.push({ id: h.id, name: `👔 ${h.name}`, ransom: h.ransom, left: Math.max(0, h.deadline - this.ctx.clock.totalHours), by: x.name });
    for (const q of world.players.values()) if (q.kidnapped && q !== p && ((p.orgId && q.orgId === p.orgId) || q.kidnapped.ai)) hostages.push({ playerId: q.id, name: `👤 ${q.name}`, ransom: q.kidnapped.ransom, left: Math.max(0, Math.round((q.kidnapped.until - Date.now()) / this.ctx.config.time.msPerGameHour)), by: world.orgs[q.kidnapped.orgId]?.name ?? '?' });
    const out = { hostages, orgs: list, invites, kidnapped: p.kidnapped ? { ransom: p.kidnapped.ransom, left: Math.max(0, Math.round((p.kidnapped.until - Date.now()) / 1000)), org: world.orgs[p.kidnapped.orgId]?.name } : null };
    if (o) {
      const men = {};
      for (const k of Object.keys(MEN)) men[k] = { total: o.men[k] ?? 0, free: this.available(o, k) };
      out.org = {
        id: o.id, name: o.name, leader: world.players.get(o.leaderId)?.name, isLeader: o.leaderId === p.id,
        members: o.members.map((id) => ({ id, name: world.players.get(id)?.name ?? '?', online: !!world.players.get(id)?.online })),
        fleet: o.fleet ?? { cars: {}, helis: {} },
        air: [...world.units.values()].filter((u) => u.type === 'oheli' && u.org === o.id).map((u) => ({ id: u.id, model: u.model, phase: u.flight?.phase ?? 'land', hp: Math.round((u.hp / u.maxHp) * 100) })),
        men, hq: this.hqOf(o) ? { id: o.hqId, name: this.hqOf(o).name, x: this.hqOf(o).door.x, z: this.hqOf(o).door.z } : null, turf: o.turf.length, escort: (o.escort[p.id] ?? []).length,
        missions: [...this.missions.values()].filter((m) => m.orgId === o.id).map((m) => ({ id: m.id, kind: m.kind, n: m.men.length || m.n, phase: m.phase })),
      };
    }
    return out;
  }
}
