import { JOBS, inHours } from '../data/jobs.js';
import { PRODUCTS } from '../data/products.js';
import { OUTFITS, CARS, CLUBS, priceOf } from '../../shared/catalogs.js';
import { interiorLayout, interiorOrigin, spotById } from '../../shared/interiors.js';
import { roadPath } from '../world/Pathfinding.js';
import { Vehicle } from '../entities/Unit.js';

/**
 * Toplum: mahkeme, stadyum + bahis, enflasyon, banka, telefon (mesaj/arama), sosyal medya,
 * internetten sipariş + kurye, giyim ve arabalar.
 * Tüm durum world.society içinde (kayıt dosyasına girer).
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const fail = (error) => ({ ok: false, error });
const clean = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, n);

export function defaultSociety() {
  return { econ: { mul: 1, history: [], lastDay: 0 }, cases: [], match: null, results: [], posts: [], messages: [], orders: [], seq: 1 };
}

export const CEO_TIERS = {
  junior: { label: 'Genç CEO',      icon: '👔', fee: 15000,   min: 2000,   max: 25000 },
  pro:    { label: 'Deneyimli CEO', icon: '💼', fee: 150000,  min: 25000,  max: 200000 },
  legend: { label: 'Efsane CEO',    icon: '👑', fee: 1500000, min: 200000, max: 1000000 },
};
const CEO_FIRST = ['Kerem', 'Selin', 'Murat', 'Elif', 'Can', 'Zeynep', 'Burak', 'Defne', 'Emre', 'Aslı', 'Mert', 'Ece'];
const CEO_LAST = ['Koç', 'Sabancı', 'Yıldırım', 'Aksoy', 'Demirtaş', 'Özdemir', 'Kaya', 'Arslan', 'Erdem', 'Tekin'];

export class SocietySystem {
  name = 'society';

  init(ctx) {
    this.ctx = ctx;
    const { world, config } = ctx;
    world.society ??= defaultSociety();
    const S = world.society;
    for (const [k, v] of Object.entries(defaultSociety())) S[k] ??= v;
    config.economy.priceMul = S.econ.mul;
    config.economy.wageMul = S.econ.mul;
    this.slow = 0;
    // Merkez devlet bir cumhuriyet: cumhurbaşkanını sadece OYUNCULAR telefondan seçer (NPC ülkeler olsa da)
    if (world.republic && !world.republic.presidentId && !world.republic.npcPresident) world.republic.npcPresident = 'Hasan Kaya';
    if (!world.republic) {
      world.republic = { name: 'Kaos Cumhuriyeti', presidentId: null, npcPresident: 'Hasan Kaya', candidates: [], votes: {}, nextDay: ctx.clock.day, techs: [], electionHour: 20 };
    }
    world.logCrime = (p, text) => { p.crimeLog = [...(p.crimeLog ?? []), `${ctx.clock.label?.() ?? ''} ${text}`].slice(-8); };
    world.societyFor = (p) => this.privateFor(p);
  }

  get S() { return this.ctx.world.society; }
  id(prefix) { return `${prefix}${this.S.seq++}`; }
  mul() { return this.S.econ.mul; }
  to(playerId, event, data) { this.ctx.bus.emit('net:to', { playerId, event, data }); }
  say(p, text, toast = 'info', sfx) { this.ctx.bus.emit('net:private', { playerId: p.id ?? p, item: { category: 'phone', text, toast, sfx } }); }
  jobOf(p) { return this.ctx.world.buildings.get(p.jobBuildingId)?.def.staff?.job ?? null; }
  near(p, b, d = 20) { return b && Math.hypot(p.x - b.door.x, p.z - b.door.z) <= d; }
  insideType(p, type) { const b = this.ctx.world.buildings.get(p.inside); return b?.type === type ? b : null; }
  nearCounter(p, b) {
    const L = interiorLayout(b.type);
    const s = spotById(L, 'counter');
    const o = interiorOrigin(b.id);
    return s && Math.hypot(p.x - (o.x + s.x), p.z - (o.z + s.z)) <= 7;
  }

  // ------------------------------------------------------------------ özel durum (telefon için)
  privateFor(p) {
    const { world } = this.ctx;
    const S = this.S;
    const out = {
      outfit: p.outfit ?? {}, wardrobe: p.wardrobe ?? [], cars: p.cars ?? [], driving: p.driving ?? null,
      loan: p.loan ?? null, loanLimit: this.loanLimit(p), callWith: p.callId ?? null, call: this.callInfo(p),
      econ: { mul: Math.round(S.econ.mul * 1000) / 1000, history: S.econ.history.slice(-6) },
      rideWith: p.rideWith ?? null, seat: p.seat ?? 0,
      myCase: S.cases.find((c) => c.defendantId === p.id && c.status === 'open') ?? null,
      bets: (S.match?.bets ?? []).filter((b) => b.playerId === p.id),
      orders: S.orders.filter((o) => o.status !== 'done' && (o.buyerId === p.id || o.courierId === p.id)).map((o) => this.orderPublic(o)),
      courierJobs: S.orders.filter((o) => o.status === 'waiting' && o.buyerId !== p.id).length,
    };
    const R = world.republic;
    if (R) {
      out.republic = {
        name: R.name, presidentId: R.presidentId, president: world.players.get(R.presidentId)?.name ?? (R.npcPresident ? `${R.npcPresident} (NPC)` : null), nextDay: R.nextDay, hour: R.electionHour,
        candidates: R.candidates.map((id) => ({ id, name: world.players.get(id)?.name ?? '?', votes: Object.values(R.votes).filter((v) => v === id).length })),
        myVote: R.votes[p.id] ?? null, isPresident: R.presidentId === p.id,
      };
    }
    if (this.jobOf(p) === 'judge') out.cases = S.cases.filter((c) => c.status === 'open');
    return out;
  }

  // ------------------------------------------------------------------ zaman
  // ================================================================== CEO
  ceoHire(p, { buildingId, tier }) {
    const { world, bus, rng } = this.ctx;
    const b = world.buildings.get(buildingId);
    if (!b || b.ownerKind !== 'player' || b.ownerId !== p.id) return fail('Bu işletme senin değil.');
    if (!b.isBusiness || !b.operational) return fail('CEO sadece çalışan işletmelere atanır.');
    const T = CEO_TIERS[tier];
    if (!T) return fail('Böyle bir CEO yok.');
    if (b.ceo) return fail(`${b.name} zaten ${b.ceo.name} tarafından yönetiliyor. Önce kov.`);
    if (p.balance < T.fee) return fail(`${T.label} transfer ücreti ${tl(T.fee)}.`);
    p.balance -= T.fee;
    const name = `${rng.pick(CEO_FIRST)} ${rng.pick(CEO_LAST)}`;
    b.ceo = { name, tier, since: this.ctx.clock.day, last: 0, total: 0 };
    world.touchPlayer(p);
    world.touch(b);
    bus.news('economy', `👔 ${b.name} yeni CEO'su ${name} (${T.label}) ile anlaştı!`);
    return { ok: true, message: `👔 ${name} artık ${b.name} CEO'su! Her gün ${tl(T.min)} – ${tl(T.max)} arası kazandıracak.`, sfx: 'cash' };
  }

  ceoFire(p, { buildingId }) {
    const b = this.ctx.world.buildings.get(buildingId);
    if (!b || b.ownerId !== p.id || !b.ceo) return fail('Burada CEO yok.');
    const n = b.ceo.name;
    b.ceo = null;
    this.ctx.world.touch(b);
    return { ok: true, message: `👋 ${n} kovuldu.` };
  }

  /** Her sabah: CEO'lar sahibine kâr aktarır (kademeye göre 2.000 – 1.000.000 ₺) */
  payCeos(world) {
    const { rng } = this.ctx;
    const byOwner = new Map();
    for (const b of world.buildings.values()) {
      if (!b.ceo || b.ceo.held) continue;
      const p = b.ownerKind === 'player' && world.players.get(b.ownerId);
      if (!p || b.destroyed) { if (!p) b.ceo = null; continue; }
      const T = CEO_TIERS[b.ceo.tier] ?? CEO_TIERS.junior;
      // iyi gün / kötü gün: kademenin aralığında, ortası daha olası
      const r = (rng.next() + rng.next()) / 2;
      const amt = Math.round(T.min + (T.max - T.min) * r);
      p.balance += amt;
      b.ceo.last = amt;
      b.ceo.total += amt;
      world.touch(b);
      byOwner.set(p, [...(byOwner.get(p) ?? []), `${b.name} +${tl(amt)}`]);
    }
    for (const [p, list] of byOwner) { world.touchPlayer(p); this.say(p, `👔 CEO raporu: ${list.join(' · ')}`, 'ok', 'cash'); }
  }

  // ================================================================== KİRA / EV / İŞ
  rentFor(b) {
    const own = b.ownerKind === 'player';
    return Math.max(15, Math.round((b.rentPerResident || 10) * (this.ctx.config.player.rentMul ?? 3) * (own ? 1 : this.S.econ.mul)));
  }

  roomIn(b) {
    const tenants = [...this.ctx.world.players.values()].filter((p) => p.homeId === b.id).length;
    return Math.max(0, (b.capacity ?? 2) + 1 - b.residentIds.length - tenants);
  }

  /** Oyuncuyu eve yerleştir: kendi evi ise kira yok, değilse günlük kira */
  setHome(p, b) {
    p.homeId = b.id;
    const mine = b.ownerKind === 'player' && b.ownerId === p.id;
    p.rent = mine ? null : { amount: this.rentFor(b), missed: 0 };
    this.ctx.world.touchPlayer(p);
  }

  rentHome(p, buildingId) {
    const { world } = this.ctx;
    const b = world.buildings.get(buildingId);
    if (!b || b.category !== 'residential' || !b.operational) return fail('Burası kiralanacak bir ev değil.');
    if (b.id === p.homeId) return fail('Zaten burada oturuyorsun.');
    const mine = b.ownerKind === 'player' && b.ownerId === p.id;
    if (!mine && this.roomIn(b) <= 0) return fail('Bu evde boş oda yok.');
    if (b.ownerKind === 'player' && !mine) {
      // başka oyuncunun evi: sahibinin izni gibi düşün, kira ona gider
    }
    const amount = mine ? 0 : this.rentFor(b);
    if (!mine && p.balance < amount) return fail(`İlk günün kirası peşin: ${tl(amount)}.`);
    if (!mine) { p.balance -= amount; world.credit(b.ownerKind, world.getOwner(b), amount); }
    this.setHome(p, b);
    this.ctx.bus.news('estate', `🏠 ${p.name}, ${b.name} adresine ${mine ? 'kendi evine' : 'kiracı olarak'} taşındı.`);
    return { ok: true, message: mine ? `🏠 Kendi evine taşındın, kira yok!` : `🔑 ${b.name} kiralandı: günlük ${tl(amount)} (her sabah otomatik ödenir).`, sfx: 'cash' };
  }

  leaveHome(p) {
    if (!p.homeId) return fail('Zaten bir evin yok.');
    const b = this.ctx.world.buildings.get(p.homeId);
    p.homeId = null;
    p.rent = null;
    this.ctx.world.touchPlayer(p);
    return { ok: true, message: `🚪 ${b?.name ?? 'Evden'} çıktın. Telefon › Sahibinden › Kiralık'tan yeni ev bul.` };
  }

  /** Rastgele bir iş ata (yakındaki iş yerlerinden) */
  assignJob(p) {
    const { world, rng } = this.ctx;
    const home = world.buildings.get(p.homeId) ?? { x: p.x, z: p.z };
    const jobs = world.buildingsWhere((b) => b.operational && b.def?.staff && JOBS[b.def.staff.job] && !['palace', 'court', 'prison'].includes(b.type))
      .sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z)).slice(0, 10);
    const b = rng.pick(jobs);
    if (!b) return null;
    p.jobBuildingId = b.id;
    b.playerWorkerIds.push(p.id);
    world.touchPlayer(p);
    return b;
  }

  collectRent(world, bus) {
    for (const p of world.players.values()) {
      if (p.isAI || !p.homeId) continue;
      const b = world.buildings.get(p.homeId);
      if (!b) { p.homeId = null; p.rent = null; continue; }
      const mine = b.ownerKind === 'player' && b.ownerId === p.id;
      if (mine) { p.rent = null; continue; }
      // Eski kayıtlar: bedava ev yok, kira başlar
      if (!p.rent) p.rent = { amount: this.rentFor(b), missed: 0 };
      const amt = p.rent.amount;
      if (p.balance >= amt) {
        p.balance -= amt;
        world.credit(b.ownerKind, world.getOwner(b), amt);
        p.rent.missed = 0;
        this.say(p, `🏠 Günlük kira ödendi: −${tl(amt)} (${b.name})`, 'info');
      } else if (++p.rent.missed >= 3) {
        p.homeId = null;
        p.rent = null;
        this.say(p, `⚖️ 3 gündür kira ödemedin, ${b.name} evinden tahliye edildin! Telefon › Sahibinden › Kiralık'tan yeni ev bul.`, 'err', 'alarm');
        bus.news('estate', `⚖️ İCRA: ${p.name} kirasını ödeyemediği için evinden çıkarıldı.`);
      } else this.say(p, `⚠️ Kirayı ödeyemedin (${tl(amt)}). ${3 - p.rent.missed} gün içinde ödemezsen tahliye edileceksin!`, 'warn', 'alarm');
      world.touchPlayer(p);
    }
  }

  onDay(time, ctx) {
    const { world, rng, bus, config } = ctx;
    const S = this.S;
    // ülke modu: kira yok
    this.payCeos(world);
    // Enflasyon: her 3 günde bir maaşlar ve fiyatlar birlikte artar
    if (time.day % 3 === 0 && S.econ.lastDay !== time.day) {
      S.econ.lastDay = time.day;
      const rate = Math.round(rng.range(0.025, 0.05) * 1000) / 1000;
      S.econ.mul = Math.round(S.econ.mul * (1 + rate) * 10000) / 10000;
      config.economy.priceMul = config.economy.wageMul = S.econ.mul;
      for (const b of world.buildings.values()) for (const s of Object.values(b.stock)) if (s.price) s.price = Math.round(s.price * (1 + rate) * 100) / 100;
      S.econ.history.push({ day: time.day, rate, mul: S.econ.mul });
      S.econ.history = S.econ.history.slice(-20);
      bus.news('economy', `📈 ENFLASYON: Maaşlar ve fiyatlar %${(rate * 100).toFixed(1)} arttı. (Endeks: ${S.econ.mul.toFixed(2)})`);
      bus.emit('net:alert', { level: 'info', text: `📈 Zam geldi! Maaşlar ve fiyatlar %${(rate * 100).toFixed(1)} arttı.` });
    }
    // Kredi vadeleri
    for (const p of world.players.values()) {
      const L = p.loan;
      if (!L || time.day < L.dueDay) continue;
      const pay = Math.min(Math.max(0, p.balance), L.owed);
      p.balance -= pay;
      L.owed = Math.round(L.owed - pay);
      if (L.owed <= 0) { p.loan = null; this.say(p, `🏦 Kredin otomatik ödendi (${tl(pay)}). Borcun kalmadı!`, 'ok', 'cash'); }
      else {
        L.owed = Math.round(L.owed * 1.1);
        L.dueDay = time.day + 1;
        L.late = (L.late ?? 0) + 1;
        if (L.late >= 2) { p.wanted = Math.min(5, p.wanted + 1); world.logCrime(p, 'Kredi borcunu ödemedi (icra)'); }
        this.say(p, `🏦 Kredi taksitin ödenemedi! Kalan borç ${tl(L.owed)} (+%10 gecikme faizi).${L.late >= 2 ? ' İcra takibi başladı ⭐' : ''}`, 'err', 'error');
      }
      world.touchPlayer(p);
    }
  }

  onHour(time, ctx) {
    const { world, config } = ctx;
    // Kiralık arabaların süresi
    for (const p of world.players.values()) {
      if (!p.cars?.length) continue;
      const before = p.cars.length;
      p.cars = p.cars.filter((c) => !c.until || c.until > time.totalHours);
      if (p.cars.length !== before) {
        if (p.driving && !p.cars.some((c) => c.model === p.driving)) this.park(p);
        this.say(p, '🚗 Kiraladığın arabanın süresi doldu, bayi geri aldı.', 'warn');
        world.touchPlayer(p);
      }
    }
    // Maç takvimi: her gün 00:00'da duyurulur, 14:00'te başlar
    const R = world.republic;
    if (R && time.hour === R.electionHour && time.day >= R.nextDay) this.runElection(ctx, time);
    const M = this.S.match;
    if ((!M || M.status === 'done') && time.hour === 0) this.scheduleMatch(ctx, time);
    if (M?.status === 'upcoming' && time.hour >= 14 && time.totalHours >= M.kickHour) this.kickoff(ctx);
    void config;
  }

  onTick(dt, ctx) {
    this.slow += dt;
    if (this.slow < 1) return;
    this.slow = 0;
    this.tickMatch(ctx);
    this.tickCourts(ctx);
    this.tickOrders(ctx);
  }

  // ================================================================== MAHKEME
  judgesOnline() {
    return [...this.ctx.world.players.values()].filter((p) => p.online && this.jobOf(p) === 'judge');
  }

  courtBuilding() { return [...this.ctx.world.buildings.values()].find((b) => b.type === 'court' && b.operational) ?? null; }

  npcJudgeName() {
    const c = this.courtBuilding();
    const n = c && c.employeeIds.map((id) => this.ctx.world.npcs.get(id)).find(Boolean);
    return n ? `NPC Hakim ${n.name}` : 'NPC Hakim Adalet Bey';
  }

  /** Tutuklanan oyuncu doğrudan adliyedeki sanık kürsüsüne ışınlanır; oyuncu hakim yoksa NPC hakim karar verir */
  openCase(p) {
    const { world, bus } = this.ctx;
    const court = this.courtBuilding();
    if (!court) return false;
    const judges = this.judgesOnline().filter((j) => j.id !== p.id);
    const c = { id: this.id('c'), defendantId: p.id, name: p.name, wanted: Math.max(1, p.wanted), crimes: (p.crimeLog ?? []).slice(-5), balance: Math.round(Math.max(0, p.balance)), createdAt: Date.now(),
      autoAt: Date.now() + (judges.length ? 150000 : 20000), npc: !judges.length, status: 'open' };
    this.S.cases.push(c);
    this.S.cases = this.S.cases.slice(-30);
    p.wanted = 0;
    p.pendingCase = c.id;
    p.jailedUntil = world.clockHours() + 1000; // duruşma bitene kadar tutuklu
    if (p.driving) this.park(p);
    this.leaveCar(p);
    if (p.shift) this.ctx.engine.getSystem('life').endShift(p, null);
    // Sanık kürsüsüne ışınla
    const L = interiorLayout(court.type), o = interiorOrigin(court.id), st = spotById(L, 'witness');
    p.inside = court.id;
    p.pose = '';
    p.tv = false;
    p.x = o.x + st.x;
    p.z = o.z + st.z;
    p.rotY = Math.PI;
    bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z, rotY: p.rotY });
    world.touchPlayer(p);
    for (const j of judges) {
      bus.emit('net:alert', { level: 'warning', text: `⚖️ Yeni dava: ${p.name} (${'⭐'.repeat(c.wanted)}). Telefon › Adalet'ten kararı ver!`, to: j.id });
      world.touchPlayer(j);
    }
    bus.news('crime', `⚖️ ${p.name} kelepçelenip adliyeye getirildi! Duruşma başlıyor.`);
    this.say(p, judges.length ? '⚖️ Adliyedesin! Hakim kararını verene kadar sanık kürsüsündesin.' : `⚖️ Adliyedesin! ${this.npcJudgeName()} birazdan kararını açıklayacak...`, 'err', 'siren');
    return true;
  }

  verdict(judge, { caseId, minutes, fine, death, free }) {
    const { world } = this.ctx;
    if (this.jobOf(judge) !== 'judge') return fail('Sadece hakimler karar verebilir. (Adliye\'de işe gir.)');
    const c = this.S.cases.find((x) => x.id === caseId && x.status === 'open');
    if (!c) return fail('Dava bulunamadı ya da karara bağlanmış.');
    const p = world.players.get(c.defendantId);
    if (!p) return fail('Sanık bulunamadı.');
    if (p.id === judge.id) return fail('Kendi davana bakamazsın!');
    const text = this.applyVerdict(c, p, { minutes, fine, death, free }, `Hakim ${judge.name}`);
    const fee = Math.round(200 * this.mul());
    world.treasury -= fee;
    judge.balance += fee;
    judge.earnedToday += fee;
    world.touchPlayer(judge);
    return { ok: true, message: `⚖️ Karar verildi: ${text} · +${tl(fee)} hakim ücreti`, sfx: 'success' };
  }

  applyVerdict(c, p, { minutes, fine, death, free }, judgeName) {
    const { world, bus, config, engine } = this.ctx;
    const m = Math.max(0, Math.min(30, Math.round(Number(minutes) || 0)));
    const f = Math.max(0, Math.min(Math.max(0, p.balance), Math.round(Number(fine) || 0)));
    let text;
    p.jailedUntil = 0;
    p.pendingCase = null;
    if (f > 0) { p.balance -= f; world.treasury += f; }
    const court = world.buildings.get(p.inside);
    p.inside = null;
    if (death) {
      engine.getSystem('life').kill(p, null, 'idam edilerek');
      text = '💀 İDAM';
    } else if (!free && m > 0) {
      p.jailedUntil = world.clockHours() + Math.max(1, Math.ceil((m * 60000) / config.time.msPerGameHour));
      p.wasJailed = true;
      const pr = world.prison;
      if (pr) { p.x = pr.door.x; p.z = pr.door.z; bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z }); }
      text = `⛓️ ${m} dk hapis`;
    } else {
      text = free ? '🕊️ BERAAT' : 'serbest';
      const d = court?.door ?? world.palace?.door;
      if (d) { p.x = d.x; p.z = d.z + 1.5; bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z }); }
    }
    if (f > 0) text += ` + ${tl(f)} para cezası`;
    c.status = 'done';
    c.verdict = text;
    c.judge = judgeName;
    world.touchPlayer(p);
    bus.news('crime', `⚖️ ${judgeName}, ${p.name} hakkında kararını verdi: ${text}`);
    this.say(p, `⚖️ KARAR (${judgeName}): ${text}`, death ? 'err' : 'warn', 'alarm');
    return text;
  }

  tickCourts({ world, rng }) {
    const now = Date.now();
    for (const c of this.S.cases) {
      if (c.status !== 'open' || now < c.autoAt) continue;
      const p = world.players.get(c.defendantId);
      if (!p) { c.status = 'done'; continue; }
      // NPC hakim: suçun ağırlığına göre hapis + para cezası (çok ağır suçta nadiren idam)
      const murders = c.crimes.filter((x) => x.includes('Cinayet')).length;
      const minutes = Math.max(1, Math.min(20, c.wanted * 2 + murders * 2 + rng.int(0, 3)));
      const fine = Math.round(Math.max(0, p.balance) * rng.range(0.06, 0.14));
      const death = c.wanted >= 5 && murders >= 2 && rng.chance(0.2);
      this.applyVerdict(c, p, { minutes, fine, death }, this.npcJudgeName());
    }
  }

  // ================================================================== CUMHURİYET SEÇİMİ
  runFor(p) {
    const R = this.ctx.world.republic;
    if (!R) return fail('Bu dünyada cumhuriyet yok.');
    if (p.village && R.presidentId !== p.id) return fail('Kendi ülkesi olan aday olamaz.');
    if (R.candidates.includes(p.id)) return fail('Zaten adaysın.');
    const fee = Math.round(1000 * this.mul());
    if (p.balance < fee) return fail(`Adaylık ücreti ${tl(fee)}.`);
    p.balance -= fee;
    R.candidates.push(p.id);
    this.ctx.bus.news('politics', `🗳️ ${p.name}, ${R.name} cumhurbaşkanlığına aday oldu!`);
    return { ok: true, message: `🗳️ Adaylığın onaylandı. Seçim ${R.nextDay}. gün ${R.electionHour}:00'de.`, sfx: 'success' };
  }

  vote(p, { candidateId }) {
    const R = this.ctx.world.republic;
    if (!R) return fail('Bu dünyada seçim yok.');
    if (!R.candidates.includes(candidateId)) return fail('Böyle bir aday yok.');
    R.votes[p.id] = candidateId;
    return { ok: true, message: `🗳️ Oyun kullanıldı: ${this.ctx.world.players.get(candidateId)?.name}`, sfx: 'click' };
  }

  runElection({ world, bus, rng }, time) {
    const R = world.republic;
    R.nextDay = time.day + 2;
    if (!R.candidates.length) {
      // Aday oyuncu yoksa devleti bir NPC cumhurbaşkanı yönetir
      if (!R.presidentId) {
        const n = rng.pick([...world.npcs.values()].filter((x) => x.alive));
        R.npcPresident = n ? n.name : 'Hasan Kaya';
        bus.news('politics', `🗳️ ${R.name}: oyuncu adayı çıkmadı, halk ${R.npcPresident}'yı Cumhurbaşkanı seçti.`);
      } else bus.news('politics', `🗳️ ${R.name}: aday çıkmadı, mevcut cumhurbaşkanı görevine devam ediyor.`);
      return;
    }
    const tally = Object.fromEntries(R.candidates.map((c) => [c, 0]));
    for (const v of Object.values(R.votes)) if (v in tally) tally[v]++;
    const best = Math.max(...Object.values(tally));
    const top = R.candidates.filter((c) => tally[c] === best);
    const winner = world.players.get(rng.pick(top));
    const summary = R.candidates.map((c) => `${world.players.get(c)?.name ?? '?'} ${tally[c]} oy`).join(' · ');
    R.candidates = [];
    R.votes = {};
    if (!winner) return;
    this.setPresident(winner);
    bus.news('politics', `🗳️ SEÇİM SONUCU (${summary}) → ${R.name} Cumhurbaşkanı: ${winner.name}!`);
    bus.emit('net:alert', { level: 'info', text: `🗳️ Yeni Cumhurbaşkanı: ${winner.name}` });
  }

  /** Cumhurbaşkanı değişince devletin toprakları, binaları, ordusu ve teknolojisi yeni başkana geçer */
  setPresident(np) {
    const { world, config } = this.ctx;
    const R = world.republic;
    const old = world.players.get(R.presidentId);
    if (old === np) return;
    const g = config.world.gridSize, c = Math.floor(g / 2);
    if (old) {
      R.techs = [...new Set([...R.techs, ...old.techs])];
      old.techs = old.personalTechs ?? [];
      old.village = null;
      old.countryName = null;
      old.title = 'Eski Cumhurbaşkanı';
      world.touchPlayer(old);
    }
    for (const t of world.tiles) if (t.gov && old && t.owner === old.id) world.setTileOwner(t, np.id);
    for (const b of world.buildings.values()) if (b.gov && old && b.ownerKind === 'player' && b.ownerId === old.id) world.setOwner(b, 'player', np.id);
    for (const u of world.units.values()) if (old && u.ownerId === old.id) { u.ownerId = np.id; u.color = np.color; }
    np.personalTechs = [...np.techs];
    np.techs = [...new Set([...np.techs, ...R.techs])];
    np.village = { i: c, j: c };
    np.countryName = R.name;
    np.title = 'Cumhurbaşkanı';
    R.presidentId = np.id;
    R.npcPresident = null;
    // Cumhurbaşkanı devleti yönetir: vergi oranları, hazine, kamu binaları
    for (const p of world.players.values()) if (p.isMayor && p !== np) { p.isMayor = false; world.touchPlayer(p); }
    np.isMayor = true;
    world.politics.mayor = { kind: 'player', id: np.id, name: np.name, party: 'Cumhurbaşkanı' };
    world.touchPlayer(np);
  }

  // ================================================================== ARABA YOLCULARI
  seatsOf(model) { return CARS[model]?.seats ?? 4; }

  ride(p, { driverId }) {
    const { world } = this.ctx;
    const d = world.players.get(driverId);
    if (!d?.driving || d === p) return fail('Bu kişi araba sürmüyor.');
    if (p.inside || p.dead || p.driving) return fail('Şu an binemezsin.');
    if (Math.hypot(d.x - p.x, d.z - p.z) > 10) return fail('Arabaya yaklaş.');
    const taken = [...world.players.values()].filter((x) => x.rideWith === d.id).map((x) => x.seat);
    const seat = [1, 2, 3].slice(0, this.seatsOf(d.driving) - 1).find((s) => !taken.includes(s));
    if (!seat) return fail('🚗 Arabada boş koltuk yok.');
    p.rideWith = d.id;
    p.seat = seat;
    p.pose = 'drive';
    p.x = d.x; p.z = d.z; p.rotY = d.rotY;
    this.say(d, `🚗 ${p.name} arabana bindi.`, 'info', 'door');
    world.touchPlayer(p);
    return { ok: true, message: `🚗 ${d.name}'in ${CARS[d.driving].label} arabasına bindin (${seat === 1 ? 'ön' : 'arka'} koltuk).`, sfx: 'door' };
  }

  leaveCar(p) {
    if (!p.rideWith) return { ok: true, quiet: true };
    const d = this.ctx.world.players.get(p.rideWith);
    p.rideWith = null;
    p.seat = 0;
    if (p.pose === 'drive') p.pose = '';
    if (d) { p.x = d.x + Math.cos(d.rotY) * 3; p.z = d.z - Math.sin(d.rotY) * 3; this.ctx.bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z }); }
    this.ctx.world.touchPlayer(p);
    return { ok: true, quiet: true };
  }

  /** Sürücü hareket edince yolcular da onunla gider */
  carryPassengers(d) {
    for (const p of this.ctx.world.players.values()) {
      if (p.rideWith !== d.id) continue;
      p.x = d.x; p.z = d.z; p.rotY = d.rotY;
      p.moveBudget = p.maxSpeed;
    }
  }

  // ================================================================== STADYUM + BAHİS
  scheduleMatch(ctx, time) {
    const { rng, bus } = ctx;
    const [h, a] = rng.shuffle(CLUBS.map((c, i) => i)).slice(0, 2);
    this.S.match = { id: this.id('m'), home: h, away: a, kickHour: time.totalHours + 14, status: 'upcoming', roster: { h: [], a: [] }, bets: [], goals: [], score: [0, 0], odds: null };
    this.updateOdds();
    const M = this.S.match;
    bus.news('sports', `🏟️ Bugün 14:00'te: ${CLUBS[h].name} - ${CLUBS[a].name}! Oranlar: 1:${M.odds.h} X:${M.odds.d} 2:${M.odds.a}`);
    this.pushMatch();
  }

  updateOdds() {
    const M = this.S.match;
    const ph = CLUBS[M.home].power + M.roster.h.length * 4 + 3;
    const pa = CLUBS[M.away].power + M.roster.a.length * 4;
    const d = ph - pa;
    const pHome = 0.38 + d * 0.012, pAway = 0.34 - d * 0.012, pDraw = 0.28;
    const fair = (q) => Math.max(1.15, Math.round((0.92 / Math.max(0.05, q)) * 100) / 100);
    M.odds = { h: fair(pHome), d: fair(pDraw), a: fair(pAway) };
    M.power = [ph, pa];
  }

  kickoff({ bus }) {
    const M = this.S.match;
    M.status = 'live';
    M.startedAt = Date.now();
    M.lastMin = 0;
    bus.news('sports', `⚽ MAÇ BAŞLADI: ${CLUBS[M.home].name} - ${CLUBS[M.away].name}`);
    bus.emit('net:alert', { level: 'info', text: `⚽ Maç başladı! ${CLUBS[M.home].name} - ${CLUBS[M.away].name} · Stadyuma gel ya da telefondan izle` });
    this.pushMatch();
  }

  // Maç gerçek zamanda 2 dakika = 90 dakika
  matchMinute(M) { return Math.min(90, Math.floor(((Date.now() - M.startedAt) / 120000) * 90)); }

  tickMatch({ world, rng, bus }) {
    const M = this.S.match;
    if (M?.status !== 'live') return;
    const min = this.matchMinute(M);
    for (let m = M.lastMin + 1; m <= min; m++) {
      const [ph, pa] = M.power;
      if (rng.chance(2.7 / 90)) {
        const side = rng.chance(ph / (ph + pa)) ? 0 : 1;
        this.goal(side, m, null);
      }
    }
    M.lastMin = min;
    if (min >= 90) this.finish(world, bus);
  }

  goal(side, minute, scorer) {
    const M = this.S.match;
    M.score[side]++;
    const club = CLUBS[side ? M.away : M.home];
    const who = scorer?.name ?? `${club.name} oyuncusu`;
    M.goals.push({ min: minute, side, who });
    this.ctx.bus.news('sports', `⚽ GOL! ${minute}' ${who} (${club.name}) · ${CLUBS[M.home].name} ${M.score[0]}-${M.score[1]} ${CLUBS[M.away].name}`);
    this.ctx.bus.emit('net:fx', { t: 'goal', side });
    this.pushMatch();
  }

  finish(world, bus) {
    const M = this.S.match;
    M.status = 'done';
    const res = M.score[0] > M.score[1] ? 'h' : M.score[0] < M.score[1] ? 'a' : 'd';
    for (const b of M.bets) {
      const p = world.players.get(b.playerId);
      if (!p) continue;
      if (b.pick === res) {
        const win = Math.round(b.amount * b.odds);
        p.balance += win;
        world.treasury -= win - b.amount;
        this.say(p, `🎉 Bahsi kazandın! +${tl(win)}`, 'ok', 'cash');
      } else this.say(p, `😢 Bahsi kaybettin (${tl(b.amount)}).`, 'warn');
      world.touchPlayer(p);
    }
    const winners = res === 'h' ? M.roster.h : res === 'a' ? M.roster.a : [];
    for (const id of [...M.roster.h, ...M.roster.a]) {
      const p = world.players.get(id);
      if (!p) continue;
      const prize = Math.round((winners.includes(id) ? 1500 : 400) * this.mul());
      p.balance += prize;
      this.say(p, `⚽ Maç primi: +${tl(prize)}${winners.includes(id) ? ' (galibiyet!)' : ''}`, 'ok', 'cash');
      world.touchPlayer(p);
    }
    this.S.results.unshift({ home: M.home, away: M.away, score: M.score, at: Date.now() });
    this.S.results = this.S.results.slice(0, 8);
    bus.news('sports', `🏁 MAÇ SONU: ${CLUBS[M.home].name} ${M.score[0]}-${M.score[1]} ${CLUBS[M.away].name}`);
    this.pushMatch();
  }

  matchPublic() {
    const M = this.S.match;
    if (!M) return null;
    return { id: M.id, home: M.home, away: M.away, status: M.status, kickHour: M.kickHour, startedAt: M.startedAt ?? null, score: M.score, goals: M.goals, odds: M.odds, roster: M.roster, pool: M.bets.reduce((s, b) => s + b.amount, 0), results: this.S.results.slice(0, 5) };
  }

  pushMatch() { this.ctx.bus.emit('net:room', { event: 'match:update', data: this.matchPublic() }); }

  bet(p, { pick, amount }) {
    const M = this.S.match;
    if (!M || M.status !== 'upcoming') return fail('Şu an bahis alınmıyor (maç başlamış ya da yok).');
    if (!['h', 'd', 'a'].includes(pick)) return fail('Geçersiz seçim.');
    const a = Math.round(Number(amount) || 0);
    if (a < 10) return fail('En az ₺10.');
    if (a > p.balance) return fail('Paran yetmiyor.');
    p.balance -= a;
    this.ctx.world.treasury += a;
    M.bets.push({ playerId: p.id, pick, amount: a, odds: M.odds[pick] });
    this.pushMatch();
    const label = pick === 'h' ? CLUBS[M.home].name : pick === 'a' ? CLUBS[M.away].name : 'Beraberlik';
    return { ok: true, message: `🎟️ ${tl(a)} → ${label} (oran ${M.odds[pick]}). Kazanırsan ${tl(a * M.odds[pick])}!`, sfx: 'cash' };
  }

  joinTeam(p, { side }) {
    const M = this.S.match;
    if (!M || M.status !== 'upcoming') return fail('Kadrolar maç başlamadan önce belirlenir.');
    if (!['h', 'a'].includes(side)) return fail('Geçersiz takım.');
    M.roster.h = M.roster.h.filter((x) => x !== p.id);
    M.roster.a = M.roster.a.filter((x) => x !== p.id);
    if (M.roster[side].length >= 5) return fail('Kadro dolu.');
    M.roster[side].push(p.id);
    this.updateOdds();
    this.pushMatch();
    return { ok: true, message: `⚽ ${CLUBS[side === 'h' ? M.home : M.away].name} kadrosundasın! 14:00'te stadyumda ol, sahada ⚽ Şut butonuyla gol at.`, sfx: 'success' };
  }

  shoot(p) {
    const M = this.S.match;
    if (M?.status !== 'live') return fail('Maç oynanmıyor.');
    const side = M.roster.h.includes(p.id) ? 0 : M.roster.a.includes(p.id) ? 1 : -1;
    if (side < 0) return fail('Kadroda değilsin.');
    if (!this.insideType(p, 'stadium')) return fail('Stadyumda olmalısın!');
    if (Date.now() - (p.lastShot ?? 0) < 6000) return { ok: false, error: null, quiet: true };
    p.lastShot = Date.now();
    this.ctx.bus.emit('net:fx', { t: 'kick', by: p.id, side });
    if (Math.random() < 0.3) {
      this.goal(side, this.matchMinute(M), p);
      return { ok: true, message: '⚽⚽ GOOOOL! Muhteşem vuruş!', sfx: 'success' };
    }
    return { ok: true, message: Math.random() < 0.5 ? '🧤 Kaleci kurtardı!' : '😬 Direkten döndü!', sfx: 'whoosh' };
  }

  // ================================================================== BANKA
  netWorth(p) {
    let assets = 0;
    for (const id of p.ownedBuildingIds) assets += this.ctx.world.buildings.get(id)?.value ?? 0;
    return p.balance + assets;
  }

  loanLimit(p) { return Math.max(0, Math.round(Math.min(500000 * this.mul(), (3000 + this.netWorth(p) * 0.4) * this.mul()))); }

  loan(p, { amount }) {
    const { world, clock, bus } = this.ctx;
    if (p.loan) return fail('Önce mevcut kredini kapatmalısın.');
    const a = Math.round(Number(amount) || 0);
    const lim = this.loanLimit(p);
    if (a < 100) return fail('En az ₺100.');
    if (a > lim) return fail(`Kredi limitin ${tl(lim)}.`);
    p.loan = { principal: a, owed: Math.round(a * 1.15), dueDay: clock.day + 3, late: 0 };
    p.balance += a;
    const banker = [...world.players.values()].find((x) => x.online && x.shift && this.jobOf(x) === 'banker' && x.id !== p.id);
    if (banker) {
      const fee = Math.round(a * 0.02);
      banker.balance += fee;
      this.say(banker, `🏦 ${p.name}'in ${tl(a)} kredisini onayladın: +${tl(fee)} prim`, 'ok', 'cash');
      world.touchPlayer(banker);
    }
    bus.news('economy', `🏦 ${p.name} bankadan ${tl(a)} kredi çekti.`);
    return { ok: true, message: `🏦 ${tl(a)} hesabına yattı. ${clock.day + 3}. gün ${tl(p.loan.owed)} otomatik tahsil edilecek.`, sfx: 'cash' };
  }

  repay(p, { amount }) {
    if (!p.loan) return fail('Borcun yok.');
    const a = Math.min(p.loan.owed, Math.max(0, Math.round(Number(amount) || p.loan.owed)), Math.max(0, p.balance));
    if (a <= 0) return fail('Paran yok.');
    p.balance -= a;
    p.loan.owed -= a;
    if (p.loan.owed <= 0) { p.loan = null; return { ok: true, message: '🏦 Kredi kapandı! Borcun yok.', sfx: 'success' }; }
    return { ok: true, message: `🏦 ${tl(a)} ödendi, kalan ${tl(p.loan.owed)}.`, sfx: 'cash' };
  }

  transfer(p, { to, amount }) {
    const { world } = this.ctx;
    const t = world.players.get(to) ?? [...world.players.values()].find((x) => x.name.toLowerCase() === String(to).toLowerCase());
    if (!t || t.isAI || t === p) return fail('Alıcı bulunamadı.');
    const a = Math.round(Number(amount) || 0);
    if (a < 1 || a > p.balance) return fail('Geçersiz tutar.');
    p.balance -= a;
    t.balance += a;
    world.touchPlayer(t);
    this.say(t, `🏦 ${p.name} sana ${tl(a)} gönderdi!`, 'ok', 'cash');
    return { ok: true, message: `🏦 ${t.name}'e ${tl(a)} gönderildi.`, sfx: 'cash' };
  }

  // ================================================================== MESAJ + ARAMA
  message(p, { to, text, loc }) {
    const { world } = this.ctx;
    const t = world.players.get(to);
    if (!t || t.isAI) return fail('Kişi bulunamadı.');
    const body = clean(text, 300);
    if (!body && !loc) return fail('Boş mesaj.');
    const now = Date.now();
    if (now - (p.lastMsgAt ?? 0) < 700) return fail('Biraz yavaş!');
    p.lastMsgAt = now;
    const m = { id: this.id('t'), from: p.id, fromName: p.name, to: t.id, text: body, loc: loc ? { x: Math.round(p.x), z: Math.round(p.z) } : null, at: now };
    this.S.messages.push(m);
    this.S.messages = this.S.messages.slice(-300);
    this.to(t.id, 'phone:msg', m);
    return { ok: true, quiet: true, msg: m };
  }

  inbox(p) {
    return { ok: true, quiet: true, messages: this.S.messages.filter((m) => m.from === p.id || m.to === p.id).slice(-150) };
  }

  // ------------------------------------------------------------------ GRUP ARAMASI
  // Arama bir odadır: görüşme sırasında başka kişiler de eklenebilir, herkes herkesi duyar.
  get calls() { return (this._calls = this._calls ?? new Map()); }

  callOf(p) { return p?.callId ? this.calls.get(p.callId) ?? null : null; }

  callInfo(p) {
    const c = this.callOf(p);
    if (!c) return null;
    const W = this.ctx.world;
    return { id: c.id, members: [...c.members].filter((id) => id !== p.id).map((id) => ({ id, name: W.players.get(id)?.name ?? '?' })), invited: [...c.invited].map((id) => ({ id, name: W.players.get(id)?.name ?? '?' })) };
  }

  touchCall(c) { for (const id of [...c.members, ...c.invited]) { const x = this.ctx.world.players.get(id); if (x) this.ctx.world.touchPlayer(x); } }

  call(p, { to }) {
    const { world } = this.ctx;
    const t = world.players.get(to);
    if (!t || !t.online || t.isAI || t === p) return fail('📵 Ulaşılamıyor.');
    let c = this.callOf(p);
    if (c?.members.has(t.id)) return fail(`${t.name} zaten görüşmede.`);
    if (c && c.members.size + c.invited.size >= 8) return fail('📵 Grup aramasına en fazla 8 kişi.');
    if (t.callId && t.callId !== c?.id) return fail(`📵 ${t.name} başka bir görüşmede.`);
    if (!c) {
      c = { id: `call${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, members: new Set([p.id]), invited: new Set() };
      this.calls.set(c.id, c);
      p.callId = c.id;
    }
    c.invited.add(t.id);
    const others = [...c.members].filter((id) => id !== p.id).map((id) => world.players.get(id)?.name).filter(Boolean);
    this.to(t.id, 'phone:ring', { from: p.id, name: p.name, callId: c.id, group: others });
    this.touchCall(c);
    setTimeout(() => { if (c.invited.delete(t.id)) { this.to(p.id, 'phone:call', { state: 'noanswer', name: t.name }); this.cleanupCall(c); } }, 30000);
    return { ok: true, quiet: true, message: c.members.size > 1 ? `📞 ${t.name} görüşmeye ekleniyor...` : `📞 ${t.name} aranıyor...` };
  }

  answer(p, { from, accept, callId }) {
    const { world } = this.ctx;
    const c = this.calls.get(callId) ?? this.callOf(world.players.get(from));
    if (!c || !c.invited.has(p.id)) return fail('Arama sonlandı.');
    c.invited.delete(p.id);
    if (!accept) {
      for (const id of c.members) this.to(id, 'phone:call', { state: 'declined', name: p.name });
      this.cleanupCall(c);
      return { ok: true, quiet: true };
    }
    if (p.callId && p.callId !== c.id) this.hangup(p);
    for (const id of c.members) this.to(id, 'phone:call', { state: 'join', name: p.name });
    c.members.add(p.id);
    p.callId = c.id;
    this.touchCall(c);
    const names = [...c.members].filter((id) => id !== p.id).map((id) => world.players.get(id)?.name).filter(Boolean);
    return { ok: true, quiet: true, call: { id: c.id, names } };
  }

  hangup(p) {
    const c = this.callOf(p);
    p.callId = null;
    p.callWith = null; p.callPending = null;
    this.ctx.world.touchPlayer(p);
    if (!c) return { ok: true, quiet: true };
    c.members.delete(p.id);
    for (const id of c.members) this.to(id, 'phone:call', { state: 'left', name: p.name });
    this.cleanupCall(c);
    this.touchCall(c);
    return { ok: true, quiet: true };
  }

  /** Tek kişi kaldıysa ve bekleyen davet yoksa görüşme biter */
  cleanupCall(c) {
    if (c.members.size > 1 || c.invited.size > 0) return;
    for (const id of c.members) { const x = this.ctx.world.players.get(id); if (x) { x.callId = null; this.to(id, 'phone:call', { state: 'off' }); this.ctx.world.touchPlayer(x); } }
    this.calls.delete(c.id);
  }

  /** Bu oyuncunun sesini duyacak görüşme arkadaşları */
  callPeers(p) {
    const c = this.callOf(p);
    return c ? [...c.members].filter((id) => id !== p.id) : [];
  }

  // ================================================================== SOSYAL MEDYA
  post(p, { img, caption, tags, buildingId, boost }) {
    const { world, rng, bus, engine } = this.ctx;
    if (typeof img !== 'string' || !img.startsWith('data:image/jpeg;base64,') || img.length > 120000) return fail('Fotoğraf geçersiz ya da çok büyük.');
    const B = Math.max(0, Math.min(500000, Math.round(Number(boost) || 0)));
    if (B > p.balance) return fail('Reklam bütçen yetmiyor.');
    if (Date.now() - (p.lastPostAt ?? 0) < 15000) return fail('Biraz bekle, az önce paylaştın.');
    p.lastPostAt = Date.now();
    p.balance -= B;
    const b = buildingId ? world.buildings.get(buildingId) : null;
    const promo = b && b.ownerKind === 'player' && b.ownerId === p.id && b.category === 'commercial' && b.operational ? b : null;
    const followers = (p.followers ?? 0);
    const views = Math.round(25 + followers * 3 + rng.range(10, 60) + B * rng.range(0.18, 0.3));
    const likes = Math.round(views * rng.range(0.05, 0.14));
    p.followers = followers + Math.round(likes * 0.15);
    const post = { id: this.id('s'), authorId: p.id, author: p.name, img, caption: clean(caption, 200), tags: clean(tags, 80), building: promo?.name ?? null, buildingId: promo?.id ?? null, boost: B, views, likes, likedBy: [], at: Date.now() };
    this.S.posts.unshift(post);
    this.S.posts = this.S.posts.slice(0, 30);
    let crowd = 0;
    if (promo && B > 0) {
      promo.adUntil = Math.max(promo.adUntil ?? 0, world.clockHours() + Math.min(48, 6 + B / 1500));
      crowd = this.sendCrowd(promo, Math.min(45, Math.round(B / 200)));
    }
    bus.emit('net:room', { event: 'social:new', data: this.postPublic(post, true) });
    if (B >= 1000) bus.news('ads', `📸 ${p.name}'in sponsorlu paylaşımı ${views.toLocaleString('tr-TR')} kişiye ulaştı!${promo ? ` (${promo.name})` : ''}`);
    void engine;
    return { ok: true, message: `📸 Paylaşıldı! 👁️ ${views.toLocaleString('tr-TR')} görüntülenme · ❤️ ${likes}${crowd ? ` · 🛍️ ${crowd} müşteri dükkânına yola çıktı!` : ''}`, sfx: 'success' };
  }

  sendCrowd(b, n) {
    const { world, rng, engine } = this.ctx;
    const activity = { market: 'buy_food', cafe: 'eat_out', restaurant: 'eat_out', bar: 'leisure', tech_store: 'luxury', gun_shop: 'weapon' }[b.type];
    if (!activity) return 0;
    const now = world.clockHours();
    const hour = world.hour();
    if (hour < 7 || hour >= 23) return 0;
    const product = Object.keys(b.stock).find((k) => b.stock[k].sell);
    const price = b.stock[product]?.price ?? 0;
    const brain = engine.getSystem('npcBrain');
    const crowd = rng.shuffle([...world.npcs.values()].filter((x) => x.jailedUntil <= now && x.balance >= price && x.activity !== 'work')).slice(0, n);
    for (const x of crowd) {
      x.targets[activity] = b.id;
      if (activity === 'luxury') x.plan.luxury = true;
      if (activity === 'leisure') x.plan.goesOut = true;
      brain.sendTo(x, { activity, buildingId: b.id }, this.ctx);
    }
    return crowd.length;
  }

  postPublic(s, withImg = true) { const { likedBy, ...rest } = s; return { ...rest, img: withImg ? s.img : null, likedCount: likedBy.length }; }
  feed() { return { ok: true, quiet: true, posts: this.S.posts.map((s) => this.postPublic(s)) }; }

  like(p, { postId }) {
    const s = this.S.posts.find((x) => x.id === postId);
    if (!s) return fail('Paylaşım silinmiş.');
    if (s.likedBy.includes(p.id)) return { ok: true, quiet: true };
    s.likedBy.push(p.id);
    s.likes++;
    const a = this.ctx.world.players.get(s.authorId);
    if (a && a !== p) { a.followers = (a.followers ?? 0) + 1; this.say(a, `❤️ ${p.name} paylaşımını beğendi`, 'info'); }
    return { ok: true, quiet: true, likes: s.likes };
  }

  // ================================================================== SİPARİŞ + KURYE
  orderPublic(o) {
    const w = this.ctx.world;
    const shop = w.buildings.get(o.shopId), home = w.buildings.get(o.homeId);
    return { ...o, shopDoor: shop?.door ?? null, homeDoor: home?.door ?? null };
  }

  order(p, { shopId, product, qty, outfitId }) {
    const { world, bus } = this.ctx;
    const shop = world.buildings.get(shopId);
    const home = world.buildings.get(p.homeId);
    if (!home) return fail('Teslimat için bir evin olmalı.');
    if (!shop?.operational || !world.isOpen(shop)) return fail('Bu işletme şu an kapalı.');
    const fee = Math.round(15 * this.mul());
    let cost, label, item;
    if (product === 'outfit') {
      const o = OUTFITS[outfitId];
      if (shop.type !== 'clothing' || !o) return fail('Bu ürün burada yok.');
      if ((p.wardrobe ?? []).includes(outfitId)) return fail('Bu kıyafet zaten sende.');
      cost = priceOf(o.price, this.mul());
      label = o.label;
      item = { outfitId };
    } else {
      const s = shop.stock[product];
      const q = Math.max(1, Math.min(10, Math.round(Number(qty) || 1)));
      if (!s?.sell || s.qty < q || !['food', 'drink'].includes(product)) return fail('Stokta yok.');
      cost = s.price * q;
      s.qty -= q;
      label = `${q} × ${PRODUCTS[product].label}`;
      item = { product, qty: q };
    }
    if (p.balance < cost + fee) return fail(`Toplam ${tl(cost + fee)} (ürün + kurye).`);
    p.balance -= cost + fee;
    shop.balance += cost;
    shop.revenueToday += cost;
    const o = { id: this.id('o'), buyerId: p.id, buyerName: p.name, shopId: shop.id, shopName: shop.name, homeId: home.id, label, item, fee, status: 'waiting', createdAt: Date.now(), courierId: null };
    this.S.orders.push(o);
    this.S.orders = this.S.orders.filter((x) => x.status !== 'done' || Date.now() - x.createdAt < 600000).slice(-60);
    for (const x of world.players.values()) if (x.online && x !== p && !x.isAI) { this.say(x, `🛵 Yeni kurye işi: ${shop.name} → ${p.name} · ${tl(fee)}+bahşiş (Telefon › Kurye)`, 'info'); world.touchPlayer(x); }
    void bus;
    return { ok: true, message: `🛵 Sipariş alındı: ${label}. Kurye yola çıkınca haber vereceğiz!`, sfx: 'cash' };
  }

  acceptOrder(p, { orderId }) {
    const o = this.S.orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'waiting') return fail('Bu siparişi başkası aldı.');
    if (o.buyerId === p.id) return fail('Kendi siparişini taşıyamazsın 😄');
    o.status = 'pickup';
    o.courierId = p.id;
    this.say(o.buyerId, `🛵 Kurye ${p.name} siparişini almaya gidiyor.`, 'info');
    this.ctx.world.touchPlayer(p);
    return { ok: true, message: `🛵 İş senin! Önce ${o.shopName}'a git, paketi al.`, sfx: 'success' };
  }

  courierStep(p) {
    const { world } = this.ctx;
    const o = this.S.orders.find((x) => x.courierId === p.id && (x.status === 'pickup' || x.status === 'deliver'));
    if (!o) return fail('Aktif kurye işin yok.');
    if (o.status === 'pickup') {
      if (!this.near(p, world.buildings.get(o.shopId))) return fail(`📍 ${o.shopName} kapısına git.`);
      o.status = 'deliver';
      world.touchPlayer(p);
      return { ok: true, message: `📦 Paket alındı! Şimdi ${o.buyerName}'in evine götür.`, sfx: 'success' };
    }
    if (!this.near(p, world.buildings.get(o.homeId))) return fail(`📍 ${o.buyerName}'in evinin kapısına git.`);
    this.deliver(o);
    const tip = Math.round(o.fee * (0.5 + Math.random()));
    p.balance += o.fee + tip;
    p.earnedToday += o.fee + tip;
    world.touchPlayer(p);
    return { ok: true, message: `✅ Teslim edildi! +${tl(o.fee + tip)} (bahşiş dahil)`, sfx: 'cash' };
  }

  deliver(o) {
    const { world } = this.ctx;
    o.status = 'done';
    const buyer = world.players.get(o.buyerId);
    const home = world.buildings.get(o.homeId);
    if (o.item.outfitId) {
      if (buyer) { buyer.wardrobe = [...new Set([...(buyer.wardrobe ?? []), o.item.outfitId])]; }
    } else if (home) {
      home.fridge ??= { food: 0, drink: 0 };
      home.fridge[o.item.product] = (home.fridge[o.item.product] ?? 0) + o.item.qty;
    }
    if (buyer) {
      this.say(buyer, `📦 Siparişin geldi: ${o.label}${o.item.outfitId ? ' (gardırobunda)' : ' (buzdolabına konuldu)'}`, 'ok', 'notify');
      world.touchPlayer(buyer);
    }
  }

  tickOrders({ world, bus }) {
    const now = Date.now();
    for (const o of this.S.orders) {
      if (o.status === 'waiting' && now - o.createdAt > 45000) {
        // Oyuncu kurye çıkmadı: NPC kurye motorla götürür
        const shop = world.buildings.get(o.shopId), home = world.buildings.get(o.homeId);
        if (!shop || !home) { o.status = 'done'; continue; }
        const v = new Vehicle({ id: world.nextId('v'), kind: 'courier', x: shop.door.x, z: shop.door.z, product: null, qty: 0, fromId: shop.id, toId: home.id, path: roadPath(world, shop.door, home.door), speed: 40 });
        world.vehicles.set(v.id, v);
        bus.emit('net:spawn', { kind: 'vehicle', data: v.toMeta() });
        o.status = 'npc';
        o.vehicleId = v.id;
        this.say(o.buyerId, '🛵 NPC kurye siparişini getiriyor!', 'info');
      } else if (o.status === 'npc' && !world.vehicles.has(o.vehicleId)) {
        this.deliver(o);
      }
    }
  }

  // ================================================================== GİYİM
  buyOutfit(p, { id }) {
    const { world } = this.ctx;
    const o = OUTFITS[id];
    const b = this.insideType(p, 'clothing');
    if (!o) return fail('Ürün yok.');
    if (!b || !this.nearCounter(p, b)) return fail('Giyim mağazasının kasasında olmalısın (ya da telefondan sipariş ver).');
    if (!world.isOpen(b)) return fail('Mağaza kapalı.');
    if ((p.wardrobe ?? []).includes(id)) return this.wear(p, { id });
    const price = priceOf(o.price, this.mul());
    if (p.balance < price) return fail(`${o.label}: ${tl(price)}`);
    p.balance -= price;
    b.balance += price;
    b.revenueToday += price;
    p.wardrobe = [...(p.wardrobe ?? []), id];
    this.wear(p, { id });
    return { ok: true, message: `🛍️ ${o.label} senin! Üstüne giydin.`, sfx: 'cash' };
  }

  wear(p, { id, slot }) {
    if (id && !(p.wardrobe ?? []).includes(id)) return fail('Bu kıyafet sende yok.');
    p.outfit = { ...(p.outfit ?? {}) };
    if (id) p.outfit[OUTFITS[id].slot] = id;
    else if (slot) delete p.outfit[slot];
    this.ctx.bus.emit('net:room', { event: 'player:look', data: { id: p.id, outfit: p.outfit } });
    this.ctx.world.touchPlayer(p);
    return { ok: true, quiet: true };
  }

  // ================================================================== ARABA
  buyCar(p, { model, rent }) {
    const { world } = this.ctx;
    const c = CARS[model];
    const b = this.insideType(p, 'car_dealer');
    if (!c) return fail('Model yok.');
    if (!b || !this.nearCounter(p, b)) return fail('Araba bayisinde satış danışmanının yanında olmalısın.');
    if (!world.isOpen(b)) return fail('Bayi kapalı.');
    if ((p.cars ?? []).some((x) => x.model === model && !x.until)) return fail('Bu araba zaten senin.');
    const price = priceOf(rent ? c.rent : c.price, this.mul());
    if (p.balance < price) return fail(`${tl(price)} gerekli.`);
    p.balance -= price;
    b.balance += price;
    b.revenueToday += price;
    p.cars = [...(p.cars ?? []).filter((x) => x.model !== model), { model, until: rent ? world.clockHours() + 24 : null }];
    this.ctx.bus.news('estate', `🚗 ${p.name} ${rent ? 'bir günlüğüne kiraladı' : 'satın aldı'}: ${c.label}!`);
    return { ok: true, message: `🚗 ${c.label} ${rent ? '24 saatliğine kiralandı' : 'artık senin'}! Dışarıda 🚗 butonuna basıp bin.`, sfx: 'cash' };
  }

  drive(p, { model }) {
    const { config } = this.ctx;
    const owned = (p.cars ?? []).find((c) => c.model === model);
    if (!owned) return fail('Bu araba sende yok.');
    if (p.inside) return fail('Önce dışarı çık.');
    if (p.flying) return fail('Helikopterdesin.');
    if (p.driving === model) return { ok: true, quiet: true };
    if (p.driving) this.park(p);
    if (p.rideWith) this.leaveCar(p);
    const err = this.ctx.engine.getSystem('vehicles')?.board(p, model);
    if (err) return err;
    if (p.dead || p.jailedUntil > this.ctx.world.clockHours()) return fail('Şu an süremezsin.');
    p.driving = model;
    p.pose = 'drive';
    p.tv = false;
    p.maxSpeed = CARS[model].speed * 1.25;
    p.moveBudget = p.maxSpeed;
    this.ctx.world.touchPlayer(p);
    void config;
    return { ok: true, message: `🚗 ${CARS[model].label} · Gaza bas!`, sfx: 'build' };
  }

  park(p) {
    const { config, world } = this.ctx;
    for (const x of world.players.values()) if (x.rideWith === p.id) this.leaveCar(x);
    // araba yok olmaz: olduğu yerde kilitli park edilir
    this.ctx.engine.getSystem('vehicles')?.parkCar(p);
    p.driving = null;
    if (p.pose === 'drive') p.pose = '';
    p.maxSpeed = config.player.speed * config.player.sprintMultiplier;
    this.ctx.world.touchPlayer(p);
    return { ok: true, quiet: true };
  }
}
