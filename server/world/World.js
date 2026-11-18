import { inHours } from '../data/jobs.js';

/**
 * Dünyanın tüm durumu (World State). Mantık sistemlerde; burada sadece
 * durum + ortak yardımcılar (öldürme, hasar, yıkım, arama) var.
 */
export class World {
  constructor(config, bus) {
    this.config = config;
    this.bus = bus;
    this.clock = null; // GameEngine atar

    const { gridSize, blockSize, roadWidth } = config.world;
    this.gridSize = gridSize;
    this.blockSize = blockSize;
    this.roadWidth = roadWidth;
    this.size = gridSize * blockSize;
    this.half = this.size / 2;

    this.buildings = new Map();
    this.npcs = new Map();
    this.players = new Map();
    this.units = new Map();
    this.vehicles = new Map();
    this.missiles = new Map();
    this.interceptors = [];
    this.hazards = []; // { x, z, radius, untilHour, kind: 'radiation' }

    this.treasury = config.economy.startingTreasury;
    this.policy = { ...config.policy };
    this.politics = { mayor: null, candidates: [], nextElectionDay: 1 + config.politics.electionEveryDays, lastResult: null };

    this.ids = { palace: null, police: null, prison: null, hospital: null, bank: null };
    this.dirtyBuildings = new Set();
    this.dirtyPlayers = new Set();
    this._counters = {};
  }

  nextId(prefix) {
    this._counters[prefix] = (this._counters[prefix] ?? 0) + 1;
    return `${prefix}${this._counters[prefix]}`;
  }

  clockHours() { return this.clock ? this.clock.totalHours : 0; }
  hour() { return this.clock ? this.clock.hour : 0; }

  // ---------- Kayıt ----------
  addBuilding(b) {
    this.buildings.set(b.id, b);
    if (b.type in this.ids && !this.ids[b.type]) this.ids[b.type] = b.id;
  }
  addNpc(npc) { this.npcs.set(npc.id, npc); }

  buildingsOf(type) {
    const out = [];
    for (const b of this.buildings.values()) if (b.type === type) out.push(b);
    return out;
  }
  buildingsWhere(fn) {
    const out = [];
    for (const b of this.buildings.values()) if (fn(b)) out.push(b);
    return out;
  }
  get palace() { return this.buildings.get(this.ids.palace); }
  get prison() { return this.buildings.get(this.ids.prison); }
  get hospital() { return this.buildings.get(this.ids.hospital); }
  get policeStation() { return this.buildings.get(this.ids.police); }

  isOpen(b, hour = this.hour()) {
    return b.operational && (!b.def.open || inHours(b.def.open, hour));
  }

  getOwner(b) {
    if (b.ownerKind === 'npc') return this.npcs.get(b.ownerId) ?? null;
    if (b.ownerKind === 'player') return this.players.get(b.ownerId) ?? null;
    return null;
  }
  ownerName(b) {
    const o = this.getOwner(b);
    return o ? o.name : 'Devlet';
  }

  setOwner(b, kind, id) {
    const prev = this.getOwner(b);
    if (prev) prev.ownedBuildingIds = prev.ownedBuildingIds.filter((x) => x !== b.id);
    if (prev && b.ownerKind === 'player') this.touchPlayer(prev);
    b.ownerKind = kind;
    b.ownerId = id;
    b.forSale = false;
    const next = this.getOwner(b);
    if (next) next.ownedBuildingIds.push(b.id);
    if (next && kind === 'player') this.touchPlayer(next);
    this.touch(b);
  }

  // Para hareketi: sahibine göre doğru cüzdana
  credit(kind, entity, amount) {
    if (kind === 'state' || !entity) this.treasury += amount;
    else {
      entity.balance += amount;
      if (kind === 'player') this.touchPlayer(entity);
    }
  }

  findEntity(kind, id) {
    if (kind === 'npc') return this.npcs.get(id);
    if (kind === 'building') return this.buildings.get(id);
    if (kind === 'player') return this.players.get(id);
    if (kind === 'unit') return this.units.get(id);
    return undefined;
  }

  // ---------- Değişiklik bildirimi ----------
  touch(b) { this.dirtyBuildings.add(b.id); }
  touchPlayer(p) { this.dirtyPlayers.add(p.id); }

  // ---------- Ölüm / hasar / yıkım ----------
  killNpc(npc, reason) {
    if (!npc.alive) return;
    npc.alive = false;
    const loc = this.buildings.get(npc.locationId);
    loc?.occupants.delete(npc.id);
    const home = this.buildings.get(npc.homeId);
    if (home) home.residentIds = home.residentIds.filter((x) => x !== npc.id);
    const work = this.buildings.get(npc.workId);
    if (work) work.employeeIds = work.employeeIds.filter((x) => x !== npc.id);
    // Mal varlığı devlete kalır
    for (const bid of [...npc.ownedBuildingIds]) {
      const b = this.buildings.get(bid);
      if (b) {
        this.setOwner(b, 'state', null);
        b.forSale = true;
        b.salePrice = Math.round(b.value);
      }
    }
    this.treasury += Math.max(0, npc.balance);
    this.npcs.delete(npc.id);
    this.bus.emit('npc:died', { npc, reason });
    this.bus.emit('net:remove', { kind: 'npc', id: npc.id, reason });
  }

  damageBuilding(b, dmg, attacker = null) {
    if (b.destroyed || b.type === 'land' || b.type === 'park') return;
    b.hp = Math.max(0, b.hp - dmg);
    this.touch(b);
    if (b.hp <= 0) this.destroyBuilding(b, attacker);
  }

  destroyBuilding(b, attacker = null) {
    if (b.destroyed) return;
    b.destroyed = true;
    b.construction = null;
    b.hp = 0;
    b.active = false;
    b.stock = {};
    b.value = Math.round(b.value * 0.2);
    for (const id of [...b.occupants]) {
      const npc = this.npcs.get(id);
      if (npc) this.killNpc(npc, 'bina çöktü');
    }
    for (const id of [...b.residentIds]) {
      const npc = this.npcs.get(id);
      if (npc) { npc.homeId = null; }
    }
    b.residentIds = [];
    for (const id of [...b.employeeIds]) {
      const npc = this.npcs.get(id);
      if (npc) { npc.job = 'unemployed'; npc.workId = null; }
    }
    b.employeeIds = [];
    this.touch(b);
    this.bus.emit('building:destroyed', { building: b, attacker });
  }

  // ---------- Yol ağı ----------
  roadLines() {
    const lines = [];
    for (let i = 0; i <= this.gridSize; i++) lines.push(-this.half + i * this.blockSize);
    return lines;
  }
  snapToRoadLine(v) {
    const s = Math.round((v + this.half) / this.blockSize) * this.blockSize - this.half;
    return Math.max(-this.half, Math.min(this.half, s));
  }
  isOnRoadLine(v, eps = 0.01) { return Math.abs(this.snapToRoadLine(v) - v) < eps; }

  // Bir noktaya en yakın yol noktası (yatay yol üstünde)
  nearestRoadPoint(x, z) {
    const zx = this.snapToRoadLine(z);
    const xz = this.snapToRoadLine(x);
    // yatay yola mı dikey yola mı yakın?
    if (Math.abs(zx - z) <= Math.abs(xz - x)) return { x: Math.max(-this.half, Math.min(this.half, x)), z: zx };
    return { x: xz, z: Math.max(-this.half, Math.min(this.half, z)) };
  }

  randomRoadPoint(rng) {
    const line = rng.pick(this.roadLines());
    const along = rng.range(-this.half, this.half);
    return rng.chance(0.5) ? { x: along, z: line } : { x: line, z: along };
  }

  clampToBounds(x, z) {
    const m = this.half + this.roadWidth;
    return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(m, z)) };
  }

  inHazard(x, z) {
    return this.hazards.find((h) => Math.hypot(h.x - x, h.z - z) < h.radius) ?? null;
  }

  // ---------- Serileştirme ----------
  publicStatic() {
    return { gridSize: this.gridSize, blockSize: this.blockSize, roadWidth: this.roadWidth, size: this.size, half: this.half };
  }

  stats() {
    let npcMoney = 0, unemployed = 0, happy = 0, hunger = 0, homeless = 0, jailed = 0;
    const now = this.clockHours();
    for (const n of this.npcs.values()) {
      npcMoney += n.balance;
      happy += n.happiness;
      hunger += n.hunger;
      if (n.job === 'unemployed') unemployed++;
      if (!n.homeId) homeless++;
      if (n.jailedUntil > now) jailed++;
    }
    const c = this.npcs.size || 1;
    let crime = 0;
    for (const b of this.buildings.values()) crime += b.crimeHeat;
    return {
      population: this.npcs.size,
      treasury: Math.round(this.treasury),
      avgNpcBalance: Math.round(npcMoney / c),
      happiness: Math.round(happy / c),
      hunger: Math.round(hunger / c),
      unemploymentRate: Math.round((unemployed / c) * 100),
      homeless,
      jailed,
      crimeIndex: Math.round(crime),
    };
  }
}
