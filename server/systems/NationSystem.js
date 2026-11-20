import { createVillage, findFoundingSpot } from '../world/WorldGenerator.js';

/**
 * ÜLKE MODU
 *  - Her oyuncu kendi ülkesinin başkanı olarak başlar (başkent + köy otomatik kurulur).
 *  - Ülkedeki her bina değerine göre SANİYEDE para kazandırır (~10 dakikada kendini öder).
 *  - Nüfus bir sayıdır: konutlar kapasite verir, mutluluk büyümeyi belirler, göç olur.
 *  - Vatandaşlar saniyede vergi öder. İsyan / hack / savaş geliri ve mutluluğu düşürür.
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const fail = (error) => ({ ok: false, error });

/** Konut kapasitesi (kişi) */
export const HOUSING = { house: 1000, villa: 500, apartment: 10000, mansion: 800, town_hall: 10000, palace: 50000 };
export const PAYBACK_SECS = 600;       // bina kendini ~10 dakikada öder
export const TAX_PER_CITIZEN = 0.005;  // vatandaş başı saniyelik vergi (₺)

export class NationSystem {
  name = 'nation';

  init(ctx) {
    this.ctx = ctx;
    this.acc = 0;
    this.rates = new Map(); // oyuncu -> { income, buildings, tax }
    this.rateT = 0;
    ctx.world.nationFor = (p) => this.privateFor(p);
    for (const p of ctx.world.players.values()) {
      p.food = p.water = p.energy = 100;
      if (p.village && p.pop == null) this.seedPop(p);
    }
  }

  get world() { return this.ctx.world; }
  say(pid, text, toast = 'info', sfx) { this.ctx.bus.emit('net:private', { playerId: pid?.id ?? pid, item: { category: 'politics', text, toast, sfx } }); }

  // ------------------------------------------------------------------ ülke kurulumu
  /** Ülkesi olmayan oyuncuya otomatik başkent kur */
  ensureCountry(p) {
    const { world, rng, config, bus } = this.ctx;
    if (p.village || p.isAI) return false;
    const spot = findFoundingSpot(world, rng, config, null);
    if (!spot) return false;
    const name = `${p.name} Cumhuriyeti`;
    const v = createVillage(world, rng, config, p, { spot, countryName: name });
    if (!v) return false;
    for (const n of v.npcs) bus.emit('net:spawn', { kind: 'npc', data: n.toMeta() });
    p.citizenOf = null;
    p.homeId = v.hall.id;
    p.rent = null;
    p.x = v.hall.door.x; p.z = v.hall.door.z + 3;
    this.seedPop(p);
    bus.news('player', `🏳️ ${p.name} yeni bir ülke kurdu: ${name}!`);
    bus.emit('net:alert', { level: 'info', text: `🏳️ Yeni ülke: ${name} (${p.name})` });
    world.touchPlayer(p);
    return true;
  }

  seedPop(p) {
    const cap = this.capacity(p);
    p.pop = Math.round(cap * 0.6);
    p.happy = 60;
    p.policies = p.policies ?? { birth: false, open: false, mobilize: false };
  }

  // ------------------------------------------------------------------ hesaplar
  owned(p) { return this.world.buildingsWhere((b) => b.ownerKind === 'player' && b.ownerId === p.id && !b.destroyed); }

  capacity(p) {
    let cap = 0;
    for (const b of this.owned(p)) if (b.operational || b.type === 'town_hall') cap += HOUSING[b.type] ?? 0;
    return cap;
  }

  /** Bina başına saniyelik gelir: değerinin 1/600'ü */
  buildingRate(b) { return Math.min(Math.max(0, b.value ?? 0), 5e7) / PAYBACK_SECS; }

  computeRate(p) {
    let bld = 0;
    for (const b of this.owned(p)) if ((b.operational || b.type === 'town_hall') && b.category !== 'military') bld += this.buildingRate(b);
    const tax = (p.pop ?? 0) * TAX_PER_CITIZEN;
    const now = Date.now();
    let mul = 1;
    if ((p.unrestUntil ?? 0) > now) mul *= 0.5;      // isyan: gelir yarıya
    if (p.policies?.mobilize) mul *= 0.85;            // seferberlik: ekonomi yavaşlar
    if (p.isAI) mul *= 0.6;
    return { buildings: bld, tax, mul, total: (bld + tax) * mul };
  }

  happiness(p) {
    const { world } = this.ctx;
    const f = [];
    let h = 55;
    const own = this.owned(p).filter((b) => b.operational);
    const civic = own.filter((b) => b.category === 'civic' && b.type !== 'town_hall').length;
    const shops = own.filter((b) => b.category === 'commercial').length;
    const plus = (n, label) => { if (n) { h += n; f.push([label, n]); } };
    plus(Math.min(20, civic * 5), '🏥 Kamu hizmetleri');
    plus(Math.min(16, shops * 2), '🛒 Dükkanlar');
    plus(Math.min(10, own.filter((b) => b.type === 'mansion' || b.type === 'park').length * 2), '🌳 Yaşam kalitesi');
    const wars = world.warsOf(p.id).length;
    if (wars) { h -= wars * 10; f.push(['⚔️ Savaş', -wars * 10]); }
    if ((p.bombedAt ?? 0) > Date.now() - 3 * this.ctx.config.time.msPerGameHour) { h -= 20; f.push(['💥 Bombalandık', -20]); }
    if ((p.unrestUntil ?? 0) > Date.now()) { h -= 40; f.push(['🔥 İsyan', -40]); }
    if (p.policies?.open) { h -= 5; f.push(['🛂 Açık kapı', -5]); }
    if (p.policies?.mobilize) { h -= 10; f.push(['🚨 Seferberlik', -10]); }
    return { value: Math.max(0, Math.min(100, Math.round(h))), factors: f };
  }

  // ------------------------------------------------------------------ zaman
  onTick(dt) {
    const { world } = this.ctx;
    this.rateT -= dt;
    if (this.rateT <= 0) {
      this.rateT = 3;
      for (const p of world.players.values()) if (p.village) this.rates.set(p.id, this.computeRate(p));
    }
    this.acc += dt;
    if (this.acc < 1) return;
    const secs = Math.floor(this.acc);
    this.acc -= secs;
    for (const p of world.players.values()) {
      if (p.online && !p.isAI) { p.food = p.water = p.energy = 100; }
      const r = this.rates.get(p.id);
      if (!r || !p.village) continue;
      const add = r.total * secs;
      p.balance += add;
      p.earnedToday = (p.earnedToday ?? 0) + add * 0.2; // gelir vergisi tabanı (düşük tutulur)
      if (p.online) world.touchPlayer(p);
    }
  }

  onHour() {
    const { world } = this.ctx;
    const nations = [...world.players.values()].filter((p) => p.village);
    for (const p of nations) {
      if (p.pop == null) this.seedPop(p);
      const cap = this.capacity(p);
      const H = this.happiness(p);
      p.happy = H.value;
      p.popCap = cap;
      const birth = p.policies?.birth ? 1.5 : 1;
      if (p.pop < cap) p.pop += Math.max(1, (cap - p.pop) * 0.05 * (H.value / 60) * birth);
      else p.pop -= (p.pop - cap) * 0.1;
      if (H.value < 30) p.pop -= p.pop * 0.01; // mutsuz halk ülkeyi terk eder
      if (p.policies?.birth) { const fee = Math.round(p.pop * 0.05); p.balance -= fee; }
      p.pop = Math.max(0, Math.round(p.pop));
      if ((p.unrestUntil ?? 0) > Date.now()) p.pop = Math.round(p.pop * 0.98);
    }
    // Göç: mutsuz ülkeden mutlu ülkeye
    const sorted = nations.filter((p) => p.pop > 0).sort((a, b) => a.happy - b.happy);
    if (sorted.length >= 2) {
      const from = sorted[0], to = sorted[sorted.length - 1];
      if (to.happy - from.happy > 15 && to.pop < (to.popCap ?? 0)) {
        const n = Math.round(Math.min(from.pop * 0.005 * (to.policies?.open ? 2 : 1), (to.popCap ?? 0) - to.pop));
        if (n > 0) { from.pop -= n; to.pop += n; }
      }
    }
    for (const p of nations) world.touchPlayer(p);
  }

  // ------------------------------------------------------------------ politikalar
  setPolicy(p, { key, on }) {
    if (!p.village) return fail('Ülken yok.');
    if (!['birth', 'open', 'mobilize'].includes(key)) return fail('Böyle bir politika yok.');
    p.policies = p.policies ?? {};
    p.policies[key] = !!on;
    this.rates.set(p.id, this.computeRate(p));
    this.world.touchPlayer(p);
    const L = { birth: '👶 Doğum teşviki', open: '🛂 Açık kapı göç politikası', mobilize: '🚨 Seferberlik' }[key];
    if (key === 'mobilize' && on) this.ctx.bus.news('war', `🚨 ${p.countryName} SEFERBERLİK ilan etti!`);
    return { ok: true, message: `${L} ${on ? 'başladı' : 'kaldırıldı'}.` };
  }

  /** Asker sınırı: nüfusun %10'u (seferberlikte %25) */
  soldierCap(p) { return Math.floor((p.pop ?? 0) * (p.policies?.mobilize ? 0.25 : 0.1)); }

  privateFor(p) {
    if (!p.village) return null;
    const r = this.rates.get(p.id) ?? this.computeRate(p);
    const H = this.happiness(p);
    return {
      pop: Math.round(p.pop ?? 0), cap: p.popCap ?? this.capacity(p), happy: H.value, factors: H.factors,
      perSec: Math.round(r.total), fromBuildings: Math.round(r.buildings), fromTax: Math.round(r.tax), mul: r.mul,
      policies: p.policies ?? {}, soldierCap: this.soldierCap(p), soldiers: Math.round(p.soldiers ?? 0),
      unrest: Math.max(0, Math.round(((p.unrestUntil ?? 0) - Date.now()) / 1000)),
      adLock: Math.max(0, Math.round(((p.adLockUntil ?? 0) - Date.now()) / 1000)),
      bankLock: Math.max(0, Math.round(((p.bankLockUntil ?? 0) - Date.now()) / 1000)),
    };
  }
}
void tl;
