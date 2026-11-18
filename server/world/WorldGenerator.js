import { Building } from '../entities/Building.js';
import { NPC } from '../entities/NPC.js';
import { BUILDING_TYPES, FACTORY_SUBTYPES } from '../data/buildingTypes.js';
import { FIRST_NAMES, LAST_NAMES, BUSINESS_NAMES, STREET_NAMES, FACTORY_SUFFIX, NPC_MAYOR_PARTIES } from '../data/names.js';
import { setupOperations } from './BuildingSetup.js';

const FEMALE = new Set(['Ayşe', 'Fatma', 'Emine', 'Hatice', 'Zeynep', 'Elif', 'Meryem', 'Selin', 'Deniz', 'Ece', 'Gül', 'Derya', 'Sevgi', 'Aslı', 'Büşra', 'Melike', 'Ebru', 'Nur', 'Pınar', 'İrem']);

/**
 * GENESIS
 *  1) Parseller + bölgeler (merkez / orta / dış)
 *  2) Zorunlu yapılar: saray merkezde, devlet binaları merkez halkasında, cezaevi ve fabrikalar dışarıda
 *  3) Minimum ticaret çeşitliliği + parklar + satılık arsalar
 *  4) Geri kalan parseller bölge ağırlıklarıyla
 *  5) NPC'ler: ev, iş, kişilik; patronlar, ev sahipleri, belediye başkanı
 */
export function generateWorld(world, rng, config) {
  const lots = buildLots(world);
  assignTypes(lots, rng);
  const ctx = { counters: {}, usedNames: {} };
  for (const lot of lots) {
    const b = createBuilding(world, rng, config, lot, ctx);
    world.addBuilding(b);
  }
  spawnNpcs(world, rng, config);
  assignOwnership(world, rng, config);
  electFirstMayor(world, rng);
  return world.stats();
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
      });
    }
  }
  return lots;
}

const ZONES = [
  { maxR: 0.4,      weights: [['apartment', 4], ['market', 1], ['cafe', 1], ['restaurant', 1], ['bar', 0.6], ['tech_store', 0.4], ['land', 0.3]] },
  { maxR: 0.78,     weights: [['house', 5], ['apartment', 2], ['villa', 0.8], ['market', 0.6], ['cafe', 0.5], ['land', 0.8], ['park', 0.3]] },
  { maxR: Infinity, weights: [['house', 3], ['villa', 1], ['factory', 1], ['land', 1.5]] },
];

function assignTypes(lots, rng) {
  const free = (filter = () => true) => rng.shuffle(lots.filter((l) => !l.type && filter(l)));
  const place = (type, count, filter, subtype = null) => {
    for (const lot of free(filter).slice(0, count)) {
      lot.type = type;
      lot.subtype = subtype;
    }
  };

  // Saray en merkezde
  [...lots].sort((a, b) => a.r - b.r)[0].type = 'palace';

  const inner = (l) => l.r < 0.45;
  const mid = (l) => l.r >= 0.25 && l.r < 0.8;
  const outer = (l) => l.r >= 0.75;

  place('police', 1, inner);
  place('bank', 1, inner);
  place('hospital', 1, inner);
  place('prison', 1, outer);
  for (const sub of Object.keys(FACTORY_SUBTYPES)) place('factory', 1, outer, sub);

  place('market', 3, (l) => l.r < 0.8);
  place('cafe', 2, (l) => l.r < 0.7);
  place('restaurant', 2, (l) => l.r < 0.7);
  place('bar', 2, (l) => l.r < 0.7);
  place('tech_store', 1, inner);
  place('gun_shop', 1, mid);
  place('park', 2, mid);
  place('land', 4, outer);
  place('land', 4, mid);

  for (const lot of lots.filter((l) => !l.type)) {
    const zone = ZONES.find((z) => lot.r < z.maxR);
    lot.type = rng.weighted(zone.weights);
    if (lot.type === 'factory') lot.subtype = rng.pick(['food', 'drink', 'steel']);
  }
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
