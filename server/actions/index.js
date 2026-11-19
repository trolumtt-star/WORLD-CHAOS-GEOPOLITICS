import { BUILDING_TYPES, FACTORY_SUBTYPES, buildOptions } from '../data/buildingTypes.js';
import { PRODUCTS } from '../data/products.js';
import { JOBS } from '../data/jobs.js';
import { buildingMaxHp, AIR_TYPES } from '../data/military.js';
import { makeName, canFoundAt, findFoundingSpot, createVillage } from '../world/WorldGenerator.js';
import { TECHS, ERAS, ADS, DEFAULT_UNLOCKS, isUnlocked, requiredTech, adChance, techCost, techHours } from '../data/tech.js';

/**
 * Oyuncu eylemleri. Her handler: (ctx, player, params) => { ok, error?, message? }
 * Yeni eylem: buraya bir anahtar ekle, InspectService'te butonunu göster. Bu kadar.
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const num = (v, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const fail = (error) => ({ ok: false, error });

function ownedBuilding(ctx, player, id) {
  const b = ctx.world.buildings.get(id);
  if (!b) return [null, fail('Bina bulunamadı.')];
  if (b.ownerKind !== 'player' || b.ownerId !== player.id) return [null, fail('Bu mülk senin değil.')];
  return [b, null];
}

function pay(ctx, player, amount) {
  if (player.balance < amount) return false;
  player.balance -= amount;
  ctx.world.touchPlayer(player);
  return true;
}

const NEED_COUNTRY = '🏳️ Önce kendi ülkeni kurmalısın! Vatandaşken ordu, teknoloji ve toprak yönetemezsin. Sınırlardan uzak boş bir bölgeye yürü, ÜLKE KUR butonu çıkacak.';
const needCountry = (p) => (p.village ? null : fail(NEED_COUNTRY));
const life = (ctx) => ctx.engine.getSystem('life');

function nearDoor(player, b, dist = 24) {
  return Math.hypot(player.x - b.door.x, player.z - b.door.z) <= dist;
}

export const ACTIONS = {
  // ---------------- EMLAK ----------------
  'property:buy'(ctx, p, { buildingId }) {
    const { world, bus } = ctx;
    const b = world.buildings.get(buildingId);
    if (!b || !b.forSale) return fail('Bu mülk satılık değil.');
    if (b.ownerKind === 'player' && b.ownerId === p.id) return fail('Zaten senin.');
    const price = b.salePrice;
    if (!pay(ctx, p, price)) return fail(`Yetersiz bakiye (${tl(price)} gerekli).`);
    world.credit(b.ownerKind, world.getOwner(b), price);
    world.setOwner(b, 'player', p.id);
    b.salePrice = 0;
    bus.news('estate', `🔑 ${p.name}, ${b.name} tapusunu ${tl(price)} karşılığında aldı.`);
    return { ok: true, message: 'Tapu senin! 🎉', sfx: 'cash' };
  },

  'property:build'(ctx, p, { buildingId, type, subtype, name }) {
    const { world, rng, bus } = ctx;
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    if (b.type !== 'land' || b.construction) return fail('Sadece boş arsaya inşaat yapılabilir.');
    const opt = buildOptions().find((o) => o.type === type && (o.subtype ?? null) === (subtype ?? null));
    if (!opt) return fail('Geçersiz yapı tipi.');
    if (BUILDING_TYPES[type]?.category === 'military' && !p.village) return fail(NEED_COUNTRY);
    if (!isUnlocked(p, 'buildings', opt.key)) return fail(`Önce ${TECHS[requiredTech('buildings', opt.key)]?.label} teknolojisini geliştir.`);
    if (!pay(ctx, p, opt.cost)) return fail(`Yetersiz bakiye (${tl(opt.cost)} gerekli).`);

    const def = BUILDING_TYPES[type];
    const maxFoot = world.blockSize - world.roadWidth - 4;
    b.type = type;
    b.subtype = type === 'factory' ? subtype : null;
    b.variant = rng.int(0, 3);
    b.width = Math.round(Math.min(maxFoot, rng.range(def.footprint[0], def.footprint[1])));
    b.depth = Math.round(Math.min(maxFoot, rng.range(def.footprint[0], def.footprint[1])));
    b.height = Math.round(rng.range(def.height[0], def.height[1]));
    const clean = String(name ?? '').replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().slice(0, 28);
    b.name = clean || (def.category === 'residential' ? makeName(type, null, b.address, rng, {}) : `${p.name} ${opt.label}`);
    b.value = Math.round(b.value + opt.cost * 0.9);
    b.construction = { progress: 0, hours: opt.hours };
    b.maxHp = buildingMaxHp(b);
    b.hp = b.maxHp;
    b.forSale = false;
    b.stock = {};
    world.touch(b);
    bus.news('build', `🏗️ ${p.name} yeni bir ${opt.label} inşaatına başladı (${opt.hours} saat).`);
    return { ok: true, message: `İnşaat başladı! ${opt.hours} oyun saati sürecek.`, sfx: 'build' };
  },

  'property:clear'(ctx, p, { buildingId }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    if (!b.destroyed) return fail('Burada enkaz yok.');
    if (!pay(ctx, p, 500)) return fail('Yetersiz bakiye.');
    Object.assign(b, { type: 'land', subtype: null, destroyed: false, stock: {}, height: 0, hp: 1, maxHp: 1, capacity: 0 });
    b.name = `Arsa · ${b.address}`;
    ctx.world.touch(b);
    return { ok: true, message: 'Arsa temizlendi, yeniden inşa edebilirsin.' };
  },

  'property:list'(ctx, p, { buildingId, price }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    const v = num(price, 1, 1e9);
    if (!v) return fail('Geçersiz fiyat.');
    b.forSale = true;
    b.salePrice = Math.round(v);
    ctx.world.touch(b);
    ctx.bus.news('estate', `📢 ${p.name}, ${b.name} mülkünü ${tl(v)} fiyatla satışa çıkardı.`);
    return { ok: true, message: 'İlan yayında.' };
  },

  'property:unlist'(ctx, p, { buildingId }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    b.forSale = false;
    ctx.world.touch(b);
    return { ok: true, message: 'İlan kaldırıldı.' };
  },

  'property:setRent'(ctx, p, { buildingId, rent }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    const v = num(rent, 0, 500);
    if (v === null) return fail('Geçersiz kira.');
    b.rentPerResident = Math.round(v);
    return { ok: true, message: `Kira kişi başı ${tl(v)}/gün oldu.` };
  },

  'property:withdraw'(ctx, p, { buildingId, amount }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    const v = num(amount, 0, b.balance);
    if (!v) return fail('Geçersiz tutar.');
    b.balance -= v;
    p.balance += v;
    ctx.world.touchPlayer(p);
    return { ok: true, message: `${tl(v)} cüzdanına aktarıldı.`, sfx: 'cash' };
  },

  'property:deposit'(ctx, p, { buildingId, amount }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    const v = num(amount, 0, p.balance);
    if (!v) return fail('Geçersiz tutar.');
    p.balance -= v;
    b.balance += v;
    ctx.world.touchPlayer(p);
    return { ok: true, message: `${tl(v)} kasaya kondu.` };
  },

  // ---------------- ÜLKE KURMA ----------------
  'country:found'(ctx, p, { name }) {
    const { world, rng, config, bus } = ctx;
    if (p.village) return fail('Zaten bir ülken var.');
    if (p.inside) return fail('Önce binadan çık.');
    // Oyuncu genelde yol üstündedir: bastığı parsel ve komşularından uygun olanı seç
    const here = world.tileAt(p.x, p.z);
    const t = [here, ...(here ? world.neighbors(here) : [])].find((c) => c && canFoundAt(world, config, c.i, c.j)) ?? here;
    const clean = String(name ?? '').replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().slice(0, 24) || `${p.name} Ülkesi`;
    if (!t || !canFoundAt(world, config, t.i, t.j)) {
      const spot = findFoundingSpot(world, rng, config, t ? { i: t.i, j: t.j } : null);
      if (!spot) return fail('Haritada ülke kuracak boş yer kalmadı.');
      const c = world.lotCenter(spot.i, spot.j);
      const dx = c.x - p.x, dz = c.z - p.z;
      const dir = `${dz < -20 ? 'kuzey' : dz > 20 ? 'güney' : ''}${dx > 20 ? 'doğu' : dx < -20 ? 'batı' : ''}` || 'yakın';
      return { ok: false, error: `Burası uygun değil (sınırlara/nehre/dağa çok yakın). En yakın uygun yer: ${dir} yönünde ~${Math.round(Math.hypot(dx, dz) / world.blockSize)} parsel.`, hint: { x: c.x, z: c.z } };
    }
    const v = createVillage(world, rng, config, p, { spot: { i: t.i, j: t.j }, countryName: clean });
    if (!v) return fail('Ülke kurulamadı.');
    for (const n of v.npcs) bus.emit('net:spawn', { kind: 'npc', data: n.toMeta() });
    bus.news('player', `🏳️ ${p.name} yeni bir ülke kurdu: ${clean}!`);
    bus.emit('net:alert', { level: 'info', text: `🏳️ Yeni ülke: ${clean} (${p.name})` });
    p.citizenOf = null;
    world.touchPlayer(p);
    return { ok: true, message: `🏳️ ${clean} kuruldu! Sarayın, köylülerin ve toprakların hazır.`, sfx: 'build', founded: true };
  },

  // ---------------- DİPLOMASİ / SAVAŞ ----------------
  'war:justify'(ctx, p, { targetId }) { return needCountry(p) ??  ctx.engine.getSystem('diplomacy').justify(p, targetId); },
  'war:declare'(ctx, p, { targetId }) { return needCountry(p) ??  ctx.engine.getSystem('diplomacy').declare(p, targetId); },
  'war:peace'(ctx, p, { targetId }) { return ctx.engine.getSystem('diplomacy').offerPeace(p, targetId); },
  'war:acceptPeace'(ctx, p, { fromId }) { return ctx.engine.getSystem('diplomacy').acceptPeace(p, fromId); },

  'air:launch'(ctx, p, { airType, x, z }) {
    return needCountry(p) ?? ctx.engine.getSystem('air').launch(ctx, p, airType, num(x), num(z));
  },

  // ---------------- TEKNOLOJİ / TOPRAK ----------------
  'tech:research'(ctx, p, { techId }) {
    return needCountry(p) ?? ctx.engine.getSystem('tech').start(ctx, p, techId);
  },

  'explore:scout'(ctx, p, { i, j }) {
    return needCountry(p) ?? ctx.engine.getSystem('territory').scout(ctx, p, Number(i), Number(j));
  },

  'territory:claim'(ctx, p, { i, j }) {
    return needCountry(p) ?? ctx.engine.getSystem('territory').claim(ctx, p, Number(i), Number(j));
  },

  // ---------------- REKLAM ----------------
  'business:advertise'(ctx, p, { buildingId, channel }) {
    const { world, rng, bus, engine } = ctx;
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    if (b.category !== 'commercial' || !b.operational) return fail('Sadece faal dükkanlar reklam verebilir.');
    const ad = ADS[channel];
    if (!ad) return fail('Geçersiz reklam kanalı.');
    if (!isUnlocked(p, 'ads', channel)) return fail(`Bu kanal için ${TECHS[requiredTech('ads', channel)]?.label} gerekli.`);
    if (!pay(ctx, p, ad.cost)) return fail(`Reklam bütçesi yetersiz (${tl(ad.cost)}).`);
    if (!rng.chance(adChance(p))) {
      bus.news('ads', `📣 ${b.name} reklam verdi ama kimse ilgilenmedi.`);
      return { ok: true, message: `😕 Reklam tutmadı... (başarı şansı %${Math.round(adChance(p) * 100)}). Para gitti.`, sfx: 'error' };
    }
    const now = world.clockHours();
    b.adUntil = now + ad.hours;
    // Müşteri akını: uygun NPC'ler dükkana yönelir
    const activity = { market: 'buy_food', cafe: 'eat_out', restaurant: 'eat_out', bar: 'leisure', tech_store: 'luxury', gun_shop: 'weapon' }[b.type] ?? 'buy_food';
    const product = Object.keys(b.stock).find((k) => b.stock[k].sell);
    const price = b.stock[product]?.price ?? 0;
    const hour = world.hour();
    const awake = hour >= 7 && hour < 23;
    const brain = engine.getSystem('npcBrain');
    const crowd = rng.shuffle([...world.npcs.values()].filter((n) => n.jailedUntil <= now && n.balance >= price && (n.activity !== 'work') && awake)).slice(0, ad.power);
    for (const n of crowd) {
      n.targets[activity] = b.id;
      if (activity === 'luxury') n.plan.luxury = true;
      if (activity === 'leisure') n.plan.goesOut = true;
      brain.sendTo(n, { activity, buildingId: b.id }, ctx);
    }
    bus.news('ads', `📣 ${ad.icon} ${b.name} reklamı tuttu! ${crowd.length ? `${crowd.length} müşteri yola çıktı.` : 'Sabah müşteri akını bekleniyor.'}`);
    return { ok: true, message: `🎉 Reklam tuttu! ${crowd.length} müşteri geliyor, ${ad.hours} saat boyunca dükkanın öne çıkacak.`, sfx: 'cash' };
  },

  // ---------------- DÜKKAN YÖNETİMİ ----------------
  'shop:setPrice'(ctx, p, { buildingId, product, price }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    const s = b.stock[product];
    const v = num(price, 0.1, 100000);
    if (!s || !s.sell || !v) return fail('Geçersiz ürün veya fiyat.');
    s.price = Math.round(v * 100) / 100;
    return { ok: true, message: `${PRODUCTS[product].label} fiyatı ${tl(s.price)} oldu.` };
  },

  'shop:setRestock'(ctx, p, { buildingId, product, autoRestock, restockTo }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    const s = b.stock[product];
    if (!s) return fail('Geçersiz ürün.');
    if (typeof autoRestock === 'boolean') s.autoRestock = autoRestock;
    const t = num(restockTo, 0, 1000);
    if (t !== null) s.restockTo = Math.round(t);
    return { ok: true, message: s.autoRestock ? `Otomatik tedarik açık (hedef ${s.restockTo}).` : 'Otomatik tedarik kapalı.' };
  },

  'shop:order'(ctx, p, { buildingId, product, qty }) {
    const [b, err] = ownedBuilding(ctx, p, buildingId);
    if (err) return err;
    if (!b.operational) return fail('Bina faal değil.');
    const q = num(qty, 1, 500);
    if (!q) return fail('Geçersiz miktar.');
    const r = ctx.engine.getSystem('logistics').order(ctx, b, product, Math.round(q));
    if (!r.ok) return r;
    return { ok: true, message: `🚚 ${r.qty} adet sipariş verildi (${tl(r.cost)}). ${r.supplier} kamyonu yola çıktı!`, sfx: 'cash' };
  },

  // ---------------- İŞ ----------------
  'job:apply'(ctx, p, { buildingId }) {
    const b = ctx.world.buildings.get(buildingId);
    if (!b?.def.staff || !b.operational) return fail('Burada iş yok.');
    ACTIONS['job:quit'](ctx, p, {});
    p.jobBuildingId = b.id;
    b.playerWorkerIds.push(p.id);
    ctx.world.touchPlayer(p);
    const job = JOBS[b.def.staff.job];
    return { ok: true, message: `👔 İşe alındın (${job.label})! Mesai ${job.shift[0]}:00-${job.shift[1]}:00. İçeri gir, "Mesaiye Başla" de ve görevleri yap: her görev prim, her saat maaş.` };
  },

  'job:quit'(ctx, p) {
    const prev = ctx.world.buildings.get(p.jobBuildingId);
    if (prev) prev.playerWorkerIds = prev.playerWorkerIds.filter((x) => x !== p.id);
    p.jobBuildingId = null;
    if (p.shift) life(ctx).endShift(p, null);
    ctx.world.touchPlayer(p);
    return { ok: true, message: 'İşten ayrıldın.' };
  },

  // ---------------- GÜNDELİK HAYAT ----------------
  'building:enter'(ctx, p, { buildingId }) {
    const b = ctx.world.buildings.get(buildingId);
    if (!b) return fail('Bina bulunamadı.');
    return life(ctx).enter(p, b);
  },
  'building:exit'(ctx, p) {
    if (!p.inside) return fail('Zaten dışarıdasın.');
    return life(ctx).exit(p);
  },
  'home:guests'(ctx, p, { open }) {
    const b = ctx.world.buildings.get(p.inside ?? p.homeId);
    if (!b || !(b.id === p.homeId || (b.ownerKind === 'player' && b.ownerId === p.id))) return fail('Burası senin evin değil.');
    b.guestsOpen = !!open;
    return { ok: true, message: b.guestsOpen ? '🚪 Kapın misafirlere açık. Arkadaşların gelebilir!' : '🔒 Kapını kilitledin.' };
  },
  'life:use'(ctx, p, { spot, act }) { return life(ctx).use(p, String(spot), String(act)); },
  'life:stand'(ctx, p) { return life(ctx).stand(p); },
  'life:consume'(ctx, p, { item }) { return life(ctx).consume(p, String(item)); },
  'shop:buy'(ctx, p, { product, qty, now }) { return life(ctx).buy(p, String(product), qty, !!now); },
  'shop:weapon'(ctx, p, { weapon, ammo }) { return life(ctx).buyWeapon(p, String(weapon), !!ammo); },
  'job:shiftStart'(ctx, p) { return life(ctx).startShift(p); },
  'job:shiftEnd'(ctx, p) { return life(ctx).endShift(p, null); },
  'job:task'(ctx, p) { return life(ctx).doTask(p); },
  'combat:attack'(ctx, p, { kind, id }) { return life(ctx).attack(p, String(kind), String(id)); },
  'combat:equip'(ctx, p, { weapon }) { return life(ctx).equip(p, String(weapon)); },
  'police:arrest'(ctx, p, { npcId }) { return life(ctx).arrest(p, String(npcId)); },

  // ---------------- SUÇ ----------------
  'crime:rob'(ctx, p, { buildingId }) {
    const { world, rng, bus, config, engine } = ctx;
    const b = world.buildings.get(buildingId);
    if (!b || b.category !== 'commercial' || !b.operational) return fail('Burası soyulamaz.');
    if (b.ownerKind === 'player' && b.ownerId === p.id) return fail('Kendi dükkanını soyamazsın.');
    if (!nearDoor(p, b)) return fail('Soygun için dükkanın kapısına git.');
    if (Date.now() - p.lastRobAt < config.crime.playerRobCooldownMs) return fail('Ortalık hâlâ çok sıcak, biraz bekle.');
    if (b.balance < 10) return fail('Kasa bomboş!');
    p.lastRobAt = Date.now();
    const steal = Math.round(Math.min(3000, b.balance * rng.range(0.2, 0.4)));
    b.balance -= steal;
    p.balance += steal;
    p.wanted = Math.min(5, p.wanted + 2);
    b.crimeHeat += 2;
    world.touchPlayer(p);
    bus.news('crime', `🚨 ${b.name} silahlı soyguna uğradı! Şüpheli: ${p.name}`);
    bus.emit('net:fx', { t: 'alarm', x: b.x, z: b.z });
    const crime = engine.getSystem('crime');
    crime.dispatchPolice(b, 3);
    if (crime.policeOnDuty() > 0 && rng.chance(0.15)) {
      crime.arrestPlayer(p);
      return { ok: true, message: `${tl(steal)} çaldın ama polis tam kapıdaydı! 🚔`, sfx: 'siren' };
    }
    return { ok: true, message: `${tl(steal)} çaldın! Aranma seviyen: ${'⭐'.repeat(p.wanted)}`, sfx: 'cash' };
  },

  'crime:bail'(ctx, p) {
    const { world, config } = ctx;
    const left = p.jailedUntil - world.clockHours();
    if (left <= 0) return fail('Zaten serbestsin.');
    const cost = left * config.crime.bailPerHour;
    if (!pay(ctx, p, cost)) return fail(`Kefalet ${tl(cost)}. Yeterli paran yok.`);
    world.treasury += cost;
    p.jailedUntil = 0;
    p.wasJailed = false;
    world.touchPlayer(p);
    return { ok: true, message: 'Kefalet ödendi, özgürsün!' };
  },

  // ---------------- SİYASET ----------------
  'politics:run'(ctx, p) {
    const { world, config, bus } = ctx;
    if (p.isMayor || world.politics.candidates.some((c) => c.playerId === p.id)) return fail('Zaten adaysın.');
    if (!pay(ctx, p, config.politics.candidateFee)) return fail('Aday olma ücretini karşılayamıyorsun.');
    world.treasury += config.politics.candidateFee;
    world.politics.candidates.push({ playerId: p.id, name: p.name, campaign: 0 });
    p.campaign = 0;
    bus.news('politics', `🗳️ ${p.name}, Gün ${world.politics.nextElectionDay} seçimi için belediye başkanlığına aday oldu!`);
    return { ok: true, message: 'Adaylığın onaylandı. Kampanyaya bütçe ayırarak oy toplayabilirsin.' };
  },

  'politics:campaign'(ctx, p, { amount }) {
    const { world, bus } = ctx;
    const v = num(amount, 1, p.balance);
    if (!v) return fail('Geçersiz tutar.');
    const c = world.politics.candidates.find((x) => x.playerId === p.id);
    if (!c && !p.isMayor) return fail('Önce aday olmalısın.');
    pay(ctx, p, v);
    p.campaign = (p.campaign ?? 0) + v;
    if (c) c.campaign = p.campaign;
    // Kampanya parası afişçi, matbaa vs. olarak ekonomiye dağılır
    const shops = world.buildingsWhere((b) => b.isBusiness && b.operational);
    for (const s of shops) s.balance += v / shops.length;
    bus.news('politics', `📣 ${p.name} seçim kampanyasına ${tl(v)} harcadı. Şehir afişlerle donatıldı!`);
    return { ok: true, message: `Toplam kampanya bütçen: ${tl(p.campaign)}` };
  },

  'politics:setPolicy'(ctx, p, params) {
    const { world, bus } = ctx;
    if (!p.isMayor) return fail('Bu yetki sadece belediye başkanında.');
    const income = num(params.incomeTax, 0, 50);
    const sales = num(params.salesTax, 0, 40);
    const prop = num(params.propertyTax, 0, 20);
    const welfare = num(params.welfare, 0, 100);
    if ([income, sales, prop, welfare].some((v) => v === null)) return fail('Geçersiz değer.');
    world.policy = { incomeTax: income / 100, salesTax: sales / 100, propertyTax: prop / 1000, welfare: Math.round(welfare) };
    bus.news('politics', `📜 Başkan ${p.name} yeni vergi paketini açıkladı: Gelir %${income}, KDV %${sales}, Emlak ‰${prop}, İşsizlik maaşı ₺${welfare}.`);
    return { ok: true, message: 'Meclis kararı yürürlüğe girdi.' };
  },

  'politics:embezzle'(ctx, p, { amount }) {
    const { world, rng, bus } = ctx;
    if (!p.isMayor) return fail('Bu yetki sadece belediye başkanında.');
    const v = num(amount, 1, world.treasury * 0.5);
    if (!v) return fail('Geçersiz tutar.');
    world.treasury -= v;
    p.balance += v;
    world.touchPlayer(p);
    if (rng.chance(Math.min(0.9, (v / Math.max(1, world.treasury + v)) * 1.5 + 0.05))) {
      for (const n of world.npcs.values()) n.happiness = Math.max(0, n.happiness - 15);
      p.wanted = Math.min(5, p.wanted + 2);
      bus.news('politics', `📰 YOLSUZLUK SKANDALI! Başkan ${p.name}'in hazineden ${tl(v)} aktardığı ortaya çıktı! Halk öfkeli.`);
      bus.emit('net:alert', { level: 'warning', text: `📰 SKANDAL: ${p.name} hazineyi soydu!` });
      return { ok: true, message: `${tl(v)} hesabına geçti... ama gazeteciler duydu! 😬`, sfx: 'siren' };
    }
    return { ok: true, message: `${tl(v)} sessizce hesabına geçti. 🤫`, sfx: 'cash' };
  },

  // ---------------- ASKERİ ----------------
  'military:train'(ctx, p, { unitType }) {
    if (!p.village) return fail(NEED_COUNTRY);
    const r = ctx.engine.getSystem('military').train(ctx, p, unitType);
    return r.ok ? { ...r, message: 'Birlik eğitimini tamamladı ve kışladan çıktı!', sfx: 'build' } : r;
  },

  'military:move'(ctx, p, { unitIds, x, z }) {
    const ids = Array.isArray(unitIds) && unitIds.length
      ? unitIds
      : [...ctx.world.units.values()].filter((u) => u.ownerId === p.id).map((u) => u.id);
    const tx = num(x);
    const tz = num(z);
    if (tx === null || tz === null) return fail('Geçersiz hedef.');
    return ctx.engine.getSystem('military').move(ctx, p, ids, tx, tz);
  },

  'military:launch'(ctx, p, { missileType, x, z }) {
    return needCountry(p) ?? ctx.engine.getSystem('missiles').launch(ctx, p, missileType, num(x), num(z));
  },
};

export function catalog() {
  const buildings = {};
  for (const [k, d] of Object.entries(BUILDING_TYPES)) buildings[k] = { label: d.label, icon: d.icon, category: d.category };
  const factories = {};
  for (const [k, d] of Object.entries(FACTORY_SUBTYPES)) factories[k] = { label: d.label, output: d.output };
  const techs = {};
  for (const [k, t] of Object.entries(TECHS)) techs[k] = { ...t };
  return { buildOptions: buildOptions(), buildings, factories, products: PRODUCTS, techs, eras: ERAS, ads: ADS, defaultUnlocks: DEFAULT_UNLOCKS, air: AIR_TYPES };
}
