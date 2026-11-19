import zlib from 'node:zlib';
import { Building } from '../entities/Building.js';
import { NPC } from '../entities/NPC.js';
import { Player } from '../entities/Player.js';
import { Unit, Vehicle } from '../entities/Unit.js';

/**
 * Bir dünyanın TAMAMINI JSON'a çevirir / geri yükler.
 * Set ve Map'ler korunur; sınıf örnekleri (Building, NPC, Player...) prototipleriyle geri gelir.
 * Uçuştaki füzeler ve görevdeki uçaklar kaydedilmez (anlık şeyler).
 */
export const SNAPSHOT_VERSION = 1;

const replacer = (_k, v) => {
  if (v instanceof Set) return { $s: [...v] };
  if (v instanceof Map) return { $m: [...v.entries()] };
  return v;
};
const reviver = (_k, v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (v.$s && Object.keys(v).length === 1) return new Set(v.$s);
    if (v.$m && Object.keys(v).length === 1) return new Map(v.$m);
  }
  return v;
};

const PLAYER_SKIP = new Set(['socketId', '_voiceWin', '_voiceN']);
const strip = (o, skip) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (!skip?.has(k) && typeof v !== 'function') out[k] = v;
  return out;
};

export function serializeRoom(room) {
  const { world, engine } = room;
  const snap = {
    v: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    meta: {
      code: room.code, name: room.name, passwordHash: room.passwordHash, sandbox: room.sandbox,
      createdAt: room.createdAt, playerSeq: room._playerSeq, ownerName: room.ownerName ?? null,
    },
    config: room.config,
    clockMs: engine.clock.elapsedMs,
    life: { incSeq: engine.getSystem('life')?.incSeq ?? 0 },
    world: {
      counters: world._counters,
      treasury: world.treasury,
      policy: world.policy,
      politics: world.politics,
      ids: world.ids,
      hazards: world.hazards,
      casualties: world.casualties ?? {},
      society: world.society ? { ...world.society, posts: (world.society.posts ?? []).slice(0, 12), messages: (world.society.messages ?? []).slice(-120) } : null,
      wars: world.wars,
      justifications: world.justifications,
      tiles: world.tiles,
      buildings: [...world.buildings.values()],
      npcs: [...world.npcs.values()],
      players: [...world.players.values()].map((p) => strip({ ...p, online: false }, PLAYER_SKIP)),
      // Görevdeki uçaklar kaydedilmez (üsse dönmüş sayılır)
      units: [...world.units.values()].filter((u) => !u.def?.air),
      vehicles: [...world.vehicles.values()],
    },
  };
  return JSON.stringify(snap, replacer);
}

const revive = (Cls, data) => Object.assign(Object.create(Cls.prototype), data);

export function parseSnapshot(json) {
  return JSON.parse(json, reviver);
}

/** Kayıttaki dünyayı boş bir World nesnesine yerleştirir */
export function restoreWorld(world, s) {
  const w = s.world;
  world._counters = w.counters ?? {};
  world.treasury = w.treasury;
  world.policy = w.policy;
  world.politics = w.politics;
  world.ids = w.ids;
  world.hazards = w.hazards ?? [];
  world.casualties = w.casualties ?? {};
  if (w.society) world.society = w.society;
  world.wars = w.wars instanceof Map ? w.wars : new Map();
  world.justifications = w.justifications instanceof Map ? w.justifications : new Map();
  world.tiles = w.tiles.map((t) => ({ ...t, exploredBy: t.exploredBy instanceof Set ? t.exploredBy : new Set() }));
  world.buildings = new Map(w.buildings.map((b) => {
    const o = revive(Building, b);
    o.occupants = o.occupants instanceof Set ? o.occupants : new Set();
    return [o.id, o];
  }));
  world.npcs = new Map(w.npcs.map((n) => [n.id, revive(NPC, n)]));
  world.players = new Map(w.players.map((p) => {
    const o = revive(Player, { ...p, online: false, socketId: null, lastMoveAt: Date.now() });
    o.moveBudget = o.maxSpeed;
    return [o.id, o];
  }));
  world.units = new Map(w.units.map((u) => [u.id, revive(Unit, u)]));
  world.vehicles = new Map(w.vehicles.map((v) => [v.id, revive(Vehicle, v)]));
  world.missiles = new Map();
  world.interceptors = [];
  // İç mekân haritada olmadığı için kayıttan dönen oyuncu binasının kapısında başlar
  for (const p of world.players.values()) {
    if (p.inside) {
      const b = world.buildings.get(p.inside);
      p.inside = null;
      if (b) { p.x = b.door.x; p.z = b.door.z + 1.5; }
    }
    p.pose = p.dead ? '' : p.pose === 'sleep' ? '' : p.pose;
    p.dead = false;
    p.shift = null;
    p.tv = false;
    p.callWith = null;
    p.callPending = null;
    p.rideWith = null;
    p.seat = 0;
    if (p.driving) { p.driving = null; p.maxSpeed = world.config.player.speed * world.config.player.sprintMultiplier; }
  }
  world.dirtyBuildings.clear();
  world.dirtyPlayers.clear();
  world.dirtyTiles.clear();
}

export const gzip = (str) => zlib.gzipSync(Buffer.from(str, 'utf8'), { level: 6 }).toString('base64');
export const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
