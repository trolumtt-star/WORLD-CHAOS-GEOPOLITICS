import { EVENTS } from '../../shared/events.js';

/**
 * Oda içindeki her şeyi istemcilere yayınlar. EN SON kayıt edilmeli.
 *  - SNAPSHOT: oyuncular 20 Hz, birlikler 10 Hz, NPC + kamyon 5 Hz (volatile: kaybolursa sorun değil)
 *  - BUILDING_UPDATE: değişen binalar (inşaat, hasar, sahip...)
 *  - PLAYER_STATE: sadece sahibine (cüzdan, aranma, hapis)
 *  - FX / MISSILE / ALERT / NEWS / ENTITY_SPAWN / ENTITY_REMOVE: olay bazlı
 */
export class NetworkSyncSystem {
  name = 'network';

  constructor(io, code) {
    this.io = io;
    this.code = code;
    this.tick = 0;
    this.fx = [];
  }

  get room() { return this.io.to(this.code); }

  init(ctx) {
    this.ctx = ctx;
    const { bus } = ctx;
    bus.on('news', (item) => this.room.emit(EVENTS.NEWS, item));
    bus.on('net:spawn', (e) => this.room.emit(EVENTS.ENTITY_SPAWN, e));
    bus.on('net:remove', (e) => this.room.emit(EVENTS.ENTITY_REMOVE, e));
    bus.on('net:fx', (e) => this.fx.push(e));
    bus.on('net:missile', (e) => this.room.emit(EVENTS.MISSILE, e));
    bus.on('net:alert', (e) => {
      if (!e.to) return this.room.emit(EVENTS.ALERT, e);
      const p = ctx.world.players.get(e.to);
      if (p?.socketId) this.io.to(p.socketId).emit(EVENTS.ALERT, e);
    });
    bus.on('net:private', ({ playerId, item }) => {
      const p = ctx.world.players.get(playerId);
      if (p?.socketId) this.io.to(p.socketId).emit(EVENTS.NEWS, { ...item, private: true, time: ctx.clock.label() });
    });
    bus.on('net:room', ({ event, data }) => this.room.emit(event, data));
    bus.on('net:to', ({ playerId, event, data }) => {
      const p = ctx.world.players.get(playerId);
      if (p?.socketId) this.io.to(p.socketId).emit(event, data);
    });
    bus.on('net:teleport', ({ playerId, x, z, rotY }) => {
      const p = ctx.world.players.get(playerId);
      if (p?.socketId) this.io.to(p.socketId).emit(EVENTS.PLAYER_CORRECTION, { x, z, rotY, teleport: true });
    });
  }

  onTick(_dt, { world, config }) {
    this.tick++;
    const online = [...world.players.values()].filter((p) => p.online);
    if (!online.length) {
      world.dirtyTiles.clear();
      world.dirtyBuildings.clear();
      world.dirtyPlayers.clear();
      this.fx.length = 0;
      return;
    }

    const snap = { p: online.map((p) => p.toSnapshot()) };
    if (this.tick % config.time.unitNetEvery === 0 && world.units.size) {
      snap.u = [...world.units.values()].map((u) => u.toSnapshot());
    }
    if (this.tick % config.time.npcNetEvery === 0) {
      snap.n = [...world.npcs.values()].map((n) => n.toSnapshot());
      if (world.vehicles.size) snap.v = [...world.vehicles.values()].map((v) => v.toSnapshot());
    }
    this.room.volatile.emit(EVENTS.SNAPSHOT, snap);

    if (world.dirtyBuildings.size) {
      const list = [];
      for (const id of world.dirtyBuildings) {
        const b = world.buildings.get(id);
        if (b) list.push(b.toPublic());
      }
      world.dirtyBuildings.clear();
      this.room.emit(EVENTS.BUILDING_UPDATE, list);
    }

    if (world.dirtyTiles.size) {
      const list = [];
      for (const k of world.dirtyTiles) {
        const t = world.tiles[k];
        list.push([t.i, t.j, t.owner, t.terrain]);
      }
      world.dirtyTiles.clear();
      this.room.emit(EVENTS.TERRITORY, list);
    }

    if (world.dirtyPlayers.size) {
      for (const id of world.dirtyPlayers) {
        const p = world.players.get(id);
        if (p?.online && p.socketId) this.io.to(p.socketId).emit(EVENTS.PLAYER_STATE, p.toPrivate(world));
      }
      world.dirtyPlayers.clear();
    }

    if (this.fx.length) {
      this.room.emit(EVENTS.FX, this.fx);
      this.fx = [];
    }
  }

  onHour(_time, ctx) {
    this.room.emit(EVENTS.CLOCK, buildClockPayload(ctx));
  }
}

export function buildClockPayload({ world, clock }) {
  const leaderboard = [...world.players.values()].map((p) => {
    let assets = 0;
    for (const id of p.ownedBuildingIds) assets += world.buildings.get(id)?.value ?? 0;
    return { id: p.id, name: p.name, color: p.color, online: p.online, title: p.title, era: p.era, tiles: world.ownedTileCount(p.id), isAI: p.isAI, countryName: p.countryName, population: world.populationOf(p.id), wars: world.warsOf(p.id), overlordId: p.overlordId ?? null, netWorth: Math.round(p.balance + assets) };
  }).sort((a, b) => b.population - a.population || b.netWorth - a.netWorth);

  const pol = world.politics;
  return {
    clock: clock.snapshot(),
    treasury: Math.round(world.treasury),
    stats: world.stats(),
    policy: world.policy,
    politics: {
      mayor: pol.mayor ? { name: pol.mayor.name, kind: pol.mayor.kind, id: pol.mayor.id, party: pol.mayor.party } : null,
      opposition: pol.opposition,
      candidates: pol.candidates.map((c) => ({ name: c.name, playerId: c.playerId })),
      nextElectionDay: pol.nextElectionDay,
      lastResult: pol.lastResult,
    },
    leaderboard,
  };
}
