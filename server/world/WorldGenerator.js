import { Building } from '../entities/Building.js';
import { NPC } from '../entities/NPC.js';
import { Player } from '../entities/Player.js';
import { BUILDING_TYPES, FACTORY_SUBTYPES } from '../data/buildingTypes.js';
import { FIRST_NAMES, LAST_NAMES, BUSINESS_NAMES, STREET_NAMES, FACTORY_SUFFIX, NPC_MAYOR_PARTIES } from '../data/names.js';
import { setupOperations } from './BuildingSetup.js';

const FEMALE = new Set(['Ayşe', 'Fatma', 'Emine', 'Hatice', 'Zeynep', 'Elif', 'Meryem', 'Selin', 'Deniz', 'Ece', 'Gül', 'Derya', 'Sevgi', 'Aslı', 'Büşra', 'Melike', 'Ebru', 'Nur', 'Pınar', 'İrem']);

/**
 * GENESIS (açık dünya)
 *  1) Arazi: ova, orman lekeleri, kenarlarda dağ sıraları, kıvrılan bir nehir
 *  2) Merkezde tarafsız bir kasaba (devlet binaları, pazar, fabrikalar)
 *  3) Kasaba nüfusu, patronlar, ilk belediye başkanı
 * Oyuncu köyleri, oyuncular katıldıkça createVillage() ile kurulur.
 */
export function generateWorld(world, rng, config) {
  generateTerrain(world, rng, config);
  const lots = buildLots(world).filter((l) => l.town);
  assignTownTypes(lots, rng);
  const ctx = { counters: {}, usedNames: {} };
  for (const lot of lots) world.addBuilding(createBuilding(world, rng, config, lot, ctx));
  spawnNpcs(world, rng, config);
  assignOwnership(world, rng, config);
  electFirstMayor(world, rng);
  spawnAiNations(world, rng, config);
  world.dirtyTiles.clear();
  world.dirtyBuildings.clear();
  return world.stats();
}

const AI_NATIONS = [
  { country: 'Kuzey Krallığı', leader: 'Kral Ragnar', color: '#1f4e9c' },
  { country: 'Doğu İmparatorluğu', leader: 'İmparator Zhao', color: '#7b1fa2' },
  { country: 'Batı Cumhuriyeti', leader: 'Başkan Whitmore', color: '#b7950b' },
  { country: 'Güney Sultanlığı', leader: 'Sultan Kerem', color: '#145a32' },
  { country: 'Ada Federasyonu', leader: 'Amiral Nova', color: '#5d4037' },
];

function spawnAiNations(world, rng, config) {
  for (let k = 0; k < Math.min(config.ai.nations, AI_NATIONS.length); k++) {
    const n = AI_NATIONS[k];
    const ai = new Player({ id: `ai${k + 1}`, token: null, name: n.leader, color: n.color, balance: 9000, x: 0, z: 0, maxSpeed: 0 });
    ai.isAI = true;
    ai.countryName = n.country;
    ai.title = '🤖 NPC Ülke';
    world.players.set(ai.id, ai);
    const spot = findFoundingSpot(world, rng, config);
    if (!spot || !createVillage(world, rng, config, ai, { spot, countryName: n.country })) world.players.delete(ai.id);
  }
}

// Ülke kurulabilir mi: 3x3 boş ova/orman, etrafında 3 parsel içinde başka toprak yok, kasabaya en az 3 parsel uzak
export function canFoundAt(world, config, ci, cj) {
  const { a, b } = townRange(world, config);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const t = world.tile(ci + di, cj + dj);
    if (!t || t.owner || t.terrain === 'w' || t.terrain === 'm') return false;
  }
  for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
    const t = world.tile(ci + di, cj + dj);
    if (t?.owner) return false;
  }
  const dTown = Math.max(Math.max(a - ci, ci - b, 0), Math.max(a - cj, cj - b, 0));
  return dTown >= 3;
}

export function findFoundingSpot(world, rng, config, near = null) {
  const g = world.gridSize;
  const cands = [];
  for (let cj = 1; cj < g - 1; cj++) for (let ci = 1; ci < g - 1; ci++) if (canFoundAt(world, config, ci, cj)) cands.push({ i: ci, j: cj });
  if (!cands.length) return null;
  if (near) {
    cands.sort((p, q) => Math.hypot(p.i - near.i, p.j - near.j) - Math.hypot(q.i - near.i, q.j - near.j));
    return cands[0];
  }
  return rng.pick(cands);
}

function townRange(world, config) {
  const ts = config.world.townSize;
  const a = Math.floor((world.gridSize - ts) / 2);
  return { a, b: a + ts - 1 };
}

function generateTerrain(world, rng, config) {
  const g = world.gridSize;
  const { a, b } = townRange(world, config);
  const waves = Array.from({ length: 4 }, () => ({ fx: rng.range(0.15, 0.5), fy: rng.range(0.15, 0.5), px: rng.range(0, 6.28), py: rng.range(0, 6.28) }));
  const noise = (i, j) => waves.reduce((s, w) => s + Math.sin(i * w.fx + w.px) * Math.cos(j * w.fy + w.py), 0) / waves.length;

  for (const t of world.tiles) {
    const edge = Math.min(t.i, t.j, g - 1 - t.i, g - 1 - t.j);
    const n = noise(t.i, t.j);
    if (edge <= 1 && n > 0.05) t.terrain = 'm';
    else if (n > 0.32) t.terrain = 'f';
    else if (n < -0.55 && edge > 2) t.terrain = 'f';
    else t.terrain = 'p';
  }
  // Nehir: kasabanın bir yanından kıvrılarak akar
  const side = rng.chance(0.5) ? -1 : 1;
  const rx0 = Math.floor(g / 2) + side * rng.int(4, 6);
  const ph = rng.range(0, 6.28);
  for (let j = 0; j < g; j++) {
    const rx = rx0 + Math.round(1.6 * Math.sin(j * 0.42 + ph));
    const t = world.tile(rx, j);
    if (t && !(rx >= a - 1 && rx <= b + 1)) t.terrain = 'w';
  }
  // Kasaba: düz ova, devlete ait
  for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) {
    const t = world.tile(i, j);
    t.terrain = 'p';
    world.setTileOwner(t, 'state');
  }
}

// ---------------------------------------------------------------------------

function buildLots(world) {
  const { gridSize, blockSize, half } = world;
  const c = (gridSize - 1) / 2;
  const lots = [];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const dist = Math.max(Math.abs(i - c), Math.abs(j - c));
      lots.push({
        i, j,
        x: -half + i * blockSize + blockSize / 2,
        z: -half + j * blockSize + blockSize / 2,
        r: dist / (gridSize / 2),
        type: null,
        subtype: null,
        town: world.tile(i, j).owner === 'state',
      });
    }
  }
  return lots;
}

// Merkez kasaba: 16 parsel, her şey bir arada
const TOWN = ['police', 'prison', 'hospital', 'bank', 'court', 'stadium', 'market', 'market', 'restaurant', 'cafe', 'bar',
  'clothing', 'car_dealer', 'tech_store', 'gun_shop',
  'factory:food', 'factory:drink', 'factory:steel', 'apartment', 'apartment', 'apartment', 'house', 'house', 'market'];

function assignTownTypes(lots, rng) {
  const byCenter = [...lots].sort((x, y) => x.r - y.r);
  byCenter[0].type = 'palace';
  const rest = rng.shuffle(byCenter.slice(1));
  rest.forEach((lot, k) => {
    const [type, sub] = (TOWN[k] ?? 'house').split(':');
    lot.type = type;
    lot.subtype = sub ?? null;
  });
}

function createBuilding(world, rng, config, lot, ctx) {
  const def = BUILDING_TYPES[lot.type];
  const maxFoot = world.blockSize - world.roadWidth - 4;
  const width = Math.round(Math.min(maxFoot, rng.range(def.footprint[0], def.footprint[1])));
  const depth = Math.round(Math.min(maxFoot, rng.range(def.footprint[0], def.footprint[1])));
  const height = Math.round(rng.range(def.height[0], def.height[1]));

  ctx.counters.street = (ctx.counters.street ?? 0) + 1;
  const address = `${STREET_NAMES[lot.j % STREET_NAMES.length]} No:${ctx.counters.street}`;

  const b = new Building({
    id: world.nextId('b'),
    type: lot.type,
    subtype: lot.subtype,
    variant: rng.int(0, 3),
    name: makeName(lot.type, lot.subtype, address, rng, ctx),
    address,
    x: lot.x,
    z: lot.z,
    width,
    depth,
    height,
    door: { x: lot.x, z: lot.z + world.blockSize / 2 },
    value: Math.round(rng.range(def.value[0], def.value[1]) / 100) * 100,
    balance: def.startBalance ? Math.round(rng.range(def.startBalance[0], def.startBalance[1])) : 0,
  });
  setupOperations(b, rng, config, { fill: true });

  if (b.type === 'land') {
    b.forSale = true;
    b.salePrice = b.value;
  }
  return b;
}

export function makeName(type, subtype, address, rng, ctx) {
  if (type === 'factory') {
    const prefix = rng.pick(BUSINESS_NAMES.factory);
    return `${prefix} ${FACTORY_SUFFIX[subtype] ?? 'Sanayi'}`;
  }
  if (type === 'apartment') return `${rng.pick(LAST_NAMES)} Apartmanı`;
  if (type === 'villa') return `Villa ${rng.pick(LAST_NAMES)}`;
  if (type === 'house') return `Ev · ${address}`;
  if (type === 'land') return `Arsa · ${address}`;
  const list = BUSINESS_NAMES[type];
  if (!list) return BUILDING_TYPES[type].label;
  ctx.usedNames[type] = (ctx.usedNames[type] ?? 0) + 1;
  const n = ctx.usedNames[type];
  const base = list[(n - 1) % list.length];
  return n > list.length ? `${base} ${Math.ceil(n / list.length)}` : base;
}

// ---------------------------------------------------------------------------

export function createRandomNpc(world, rng, config, { home, slot, balance }) {
  const first = rng.pick(FIRST_NAMES);
  const npc = new NPC({
    id: world.nextId('n'),
    name: `${first} ${rng.pick(LAST_NAMES)}`,
    gender: FEMALE.has(first) ? 'f' : 'm',
    age: rng.int(18, 72),
    job: slot ? slot.job : 'unemployed',
    homeId: home ? home.id : null,
    workId: slot ? slot.buildingId : null,
    balance: balance ?? Math.round(rng.range(config.genesis.npcBalance[0], config.genesis.npcBalance[1])),
    speedFactor: rng.range(0.85, 1.15),
    traits: { greed: rng.next(), lawfulness: rng.next(), sociability: rng.next(), loyalty: rng.next() },
  });
  npc.hunger = rng.range(5, 40);
  npc.groceries = rng.int(0, 4);
  const spawnAt = home ?? world.palace;
  npc.x = spawnAt.door.x;
  npc.z = spawnAt.door.z;
  npc.locationId = spawnAt.id;
  npc.targetId = spawnAt.id;
  if (home) home.residentIds.push(npc.id);
  if (slot) world.buildings.get(slot.buildingId).employeeIds.push(npc.id);
  world.addNpc(npc);
  return npc;
}

export function vacantSlots(world) {
  const slots = [];
  for (const b of world.buildings.values()) {
    const staff = b.def.staff;
    if (!staff || !b.operational) continue;
    const free = staff.count - b.employeeIds.length;
    for (let k = 0; k < free; k++) slots.push({ job: staff.job, buildingId: b.id });
  }
  return slots;
}

export function homesWithRoom(world) {
  return world.buildingsWhere((b) => b.category === 'residential' && b.operational && b.residentIds.length < b.capacity);
}

function spawnNpcs(world, rng, config) {
  const { npcCount, unemploymentChance } = config.genesis;
  let slots = rng.shuffle(vacantSlots(world));
  // Devlet kadroları önce dolsun (polis, doktor olmadan şehir çalışmaz)
  slots.sort((a, b) => civicFirst(world, a) - civicFirst(world, b));

  for (let i = 0; i < npcCount; i++) {
    const homes = homesWithRoom(world);
    const home = rng.pick(homes);
    let slot = null;
    if (!rng.chance(unemploymentChance) && slots.length) {
      // ilk yarı devlet, sonra en yakın iş
      slot = i < 8 ? slots.shift() : takeNearbySlot(rng, world, home, slots);
    }
    createRandomNpc(world, rng, config, { home, slot });
  }
}

function civicFirst(world, slot) {
  return world.buildings.get(slot.buildingId).category === 'civic' ? 0 : 1;
}

function takeNearbySlot(rng, world, home, slots) {
  if (!slots.length) return null;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let k = 0; k < 6; k++) {
    const idx = Math.floor(rng.next() * slots.length);
    const b = world.buildings.get(slots[idx].buildingId);
    const d = home ? Math.abs(b.x - home.x) + Math.abs(b.z - home.z) : 0;
    if (d < bestDist) { bestDist = d; bestIdx = idx; }
  }
  return slots.splice(bestIdx, 1)[0];
}

function assignOwnership(world, rng, config) {
  const npcs = [...world.npcs.values()];
  const [minB, maxB] = config.genesis.bossBonus;

  for (const b of world.buildings.values()) {
    const cat = b.category;
    if (cat === 'commercial' || cat === 'industrial' || (cat === 'residential' && rng.chance(0.5))) {
      const candidates = npcs.filter((n) => !b.employeeIds.includes(n.id) && n.age >= 25);
      const owner = rng.pick(candidates);
      if (!owner) continue;
      world.setOwner(b, 'npc', owner.id);
      if (cat !== 'residential') owner.balance += Math.round(rng.range(minB, maxB));
      else owner.balance += Math.round(rng.range(minB, maxB) * 0.3);
      if (rng.chance(config.genesis.forSaleChance)) {
        b.forSale = true;
        b.salePrice = Math.round((b.value * rng.range(1.05, 1.3)) / 100) * 100;
      }
    }
  }
  world.dirtyBuildings.clear();
}

function electFirstMayor(world, rng) {
  const candidates = [...world.npcs.values()].filter((n) => n.age >= 35);
  const mayor = rng.pick(candidates) ?? [...world.npcs.values()][0];
  world.politics.mayor = { kind: 'npc', id: mayor.id, name: mayor.name, party: rng.pick(NPC_MAYOR_PARTIES) };
  world.politics.opposition = { name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`, party: rng.pick(NPC_MAYOR_PARTIES) };
}


// ---------------------------------------------------------------------------
// OYUNCU KÖYÜ: 3x3 parsel; merkezde Köy Konağı, etrafında evler, pazar, çiftlik, meyhane, boş arsalar
const VILLAGE = ['house', 'house', 'house', 'market', 'factory:food', 'bar', 'land', 'land'];

export function createVillage(world, rng, config, player, { spot: given = null, countryName = null } = {}) {
  const g = world.gridSize;
  const { a, b } = townRange(world, config);
  const minD = config.territory.villageMinDistance;
  const villages = [...world.players.values()].filter((p) => p.village && p !== player).map((p) => p.village);
  const ok = (ci, cj, dist) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const t = world.tile(ci + di, cj + dj);
      if (!t || t.owner || t.terrain === 'w' || t.terrain === 'm') return false;
    }
    const dTown = Math.max(Math.max(a - ci, ci - b, 0), Math.max(a - cj, cj - b, 0));
    if (dTown < 3) return false;
    return villages.every((v) => Math.max(Math.abs(v.i - ci), Math.abs(v.j - cj)) >= dist);
  };
  let spot = given;
  for (const dist of given ? [] : [minD, minD - 1, 3]) {
    const cands = [];
    for (let cj = 2; cj < g - 2; cj++) for (let ci = 2; ci < g - 2; ci++) if (ok(ci, cj, dist)) cands.push({ i: ci, j: cj });
    if (cands.length) { spot = rng.pick(cands); break; }
  }
  if (!spot) return null;

  const ctx = { counters: { street: world.buildings.size + 100 }, usedNames: {} };
  const lots = [];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const t = world.tile(spot.i + di, spot.j + dj);
    if (t.terrain === 'f') t.terrain = 'p';
    world.setTileOwner(t, player.id);
    const c = world.lotCenter(t.i, t.j);
    lots.push({ i: t.i, j: t.j, x: c.x, z: c.z, r: 1, center: di === 0 && dj === 0 });
  }
  const types = rng.shuffle(VILLAGE);
  const created = [];
  for (const lot of lots) {
    const [type, sub] = (lot.center ? 'town_hall' : types.pop()).split(':');
    lot.type = type;
    lot.subtype = sub ?? null;
    const bld = createBuilding(world, rng, config, lot, ctx);
    const cn = countryName ?? player.name;
    if (type === 'town_hall') bld.name = `${cn} Sarayı`;
    else if (type === 'market') bld.name = `${cn} Pazarı`;
    else if (type === 'bar') bld.name = `${cn} Meyhanesi`;
    else if (type === 'factory') bld.name = `${cn} Çiftliği`;
    else if (type === 'land') bld.name = `Arsa · ${cn}`;
    bld.balance = { market: 600, bar: 400, factory: 1000 }[type] ?? 0;
    bld.forSale = false;
    world.addBuilding(bld);
    world.setOwner(bld, 'player', player.id);
    created.push(bld);
  }
  const hall = created.find((x) => x.type === 'town_hall');
  player.village = { i: spot.i, j: spot.j };
  player.countryName = countryName ?? player.countryName ?? `${player.name} Ülkesi`;
  player.homeId = hall.id;
  hall.capitalOf = player.id;

  // Köylüler: önce köyün kadroları
  const villageIds = new Set(created.map((x) => x.id));
  const slots = vacantSlots(world).filter((s) => villageIds.has(s.buildingId));
  const homes = created.filter((x) => x.category === 'residential');
  const npcs = [];
  for (let k = 0; k < config.genesis.villagersPerPlayer; k++) {
    const home = homes.find((h) => h.residentIds.length < h.capacity) ?? homes[k % homes.length];
    if (home.residentIds.length >= home.capacity) home.capacity++;
    const npc = createRandomNpc(world, rng, config, { home, slot: slots.shift() ?? null, balance: rng.int(80, 400) });
    npc.plan = {};
    world.buildings.get(npc.locationId)?.occupants.add(npc.id);
    npcs.push(npc);
  }
  return { hall, buildings: created, npcs };
}

/** Eski kayıtlarda olmayan devlet binalarını kasabanın hemen dışına ekler (göç) */
export function ensureTownExtras(world, rng, config) {
  const need = ['court', 'stadium', 'clothing', 'car_dealer'].filter((t) => ![...world.buildings.values()].some((b) => b.type === t));
  if (!need.length) return [];
  const { a, b } = townRange(world, config);
  const cands = world.tiles.filter((t) => !t.owner && t.terrain !== 'w' && t.terrain !== 'm'
    && Math.max(Math.max(a - t.i, t.i - b, 0), Math.max(a - t.j, t.j - b, 0)) === 1)
    .sort((x, y) => Math.abs(x.i - (a + b) / 2) + Math.abs(x.j - (a + b) / 2) - Math.abs(y.i - (a + b) / 2) - Math.abs(y.j - (a + b) / 2));
  const ctx = { counters: { street: 900 } };
  const made = [];
  for (const type of need) {
    const t = cands.shift();
    if (!t) break;
    t.terrain = 'p';
    world.setTileOwner(t, 'state');
    const bl = createBuilding(world, rng, config, { i: t.i, j: t.j, x: -world.half + t.i * world.blockSize + world.blockSize / 2, z: -world.half + t.j * world.blockSize + world.blockSize / 2, type, subtype: null }, ctx);
    world.addBuilding(bl);
    t.buildingId = bl.id;
    made.push(bl);
  }
  return made;
}
