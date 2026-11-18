import crypto from 'node:crypto';
import { CONFIG } from '../config.js';
import { EVENTS } from '../../shared/events.js';
import { createRng } from '../core/rng.js';
import { EventBus } from '../core/EventBus.js';
import { GameEngine } from '../core/GameEngine.js';
import { World } from '../world/World.js';
import { generateWorld, createVillage } from '../world/WorldGenerator.js';
import { TECHS, techCost, techHours } from '../data/tech.js';
import { Player } from '../entities/Player.js';
import { UNIT_TYPES, MISSILE_TYPES } from '../data/military.js';
import { ACTIONS, catalog } from '../actions/index.js';
import { describe } from '../services/InspectService.js';
import { NetworkSyncSystem, buildClockPayload } from '../network/NetworkSyncSystem.js';
import { missilePos } from '../systems/MissileSystem.js';

import { NeedsSystem } from '../systems/NeedsSystem.js';
import { NpcBrainSystem } from '../systems/NpcBrainSystem.js';
import { CommerceSystem } from '../systems/CommerceSystem.js';
import { ProductionSystem } from '../systems/ProductionSystem.js';
import { LogisticsSystem } from '../systems/LogisticsSystem.js';
import { PayrollSystem } from '../systems/PayrollSystem.js';
import { RealEstateSystem } from '../systems/RealEstateSystem.js';
import { CrimeSystem } from '../systems/CrimeSystem.js';
import { PoliticsSystem } from '../systems/PoliticsSystem.js';
import { TaxSystem } from '../systems/TaxSystem.js';
import { MilitarySystem } from '../systems/MilitarySystem.js';
import { MissileSystem } from '../systems/MissileSystem.js';
import { PopulationSystem } from '../systems/PopulationSystem.js';
import { TechSystem } from '../systems/TechSystem.js';
import { TerritorySystem } from '../systems/TerritorySystem.js';

const COLORS = ['#ff4d4d', '#3ddc84', '#ffd23f', '#a06cff', '#2ec4ff', '#ff8c42', '#ff5fa2', '#00e0b8', '#c0ff3e', '#ffffff'];

/** Bir oda = kendi dünyası, kendi saati, kendi sistemleri olan bağımsız bir evren. */
export class Room {
  constructor(io, { code, name, password, sandbox, npcCount }) {
    this.io = io;
    this.code = code;
    this.name = name;
    this.password = password || '';
    this.sandbox = !!sandbox;
    this.createdAt = Date.now();
    this.emptySince = Date.now();
    this._playerSeq = 0;

    const config = structuredClone(CONFIG);
    config.seed = Math.floor(Math.random() * 1e9);
    if (npcCount) config.genesis.npcCount = Math.max(20, Math.min(150, npcCount));
    this.config = config;

    this.bus = new EventBus();
    this.rng = createRng(config.seed);
    this.world = new World(config, this.bus);
    const stats = generateWorld(this.world, this.rng, config);

    // SIRA ÖNEMLİ
    this.engine = new GameEngine({ world: this.world, rng: this.rng, bus: this.bus, config })
      .use(new NeedsSystem())
      .use(new NpcBrainSystem())
      .use(new CommerceSystem())
      .use(new ProductionSystem())
      .use(new LogisticsSystem())
      .use(new PayrollSystem())
      .use(new RealEstateSystem())
      .use(new CrimeSystem())
      .use(new PoliticsSystem())
      .use(new TaxSystem())
      .use(new MilitarySystem())
      .use(new MissileSystem())
      .use(new PopulationSystem())
      .use(new TechSystem())
      .use(new TerritorySystem())
      .use(new NetworkSyncSystem(io, code));
    this.ctx = this.engine.ctx;
    this.engine.start();
    console.log(`[room ${code}] "${name}" oluşturuldu`, stats);
  }

  get onlineCount() {
    let n = 0;
    for (const p of this.world.players.values()) if (p.online) n++;
    return n;
  }

  publicInfo() {
    return {
      code: this.code,
      name: this.name,
      locked: !!this.password,
      sandbox: this.sandbox,
      players: this.onlineCount,
      max: this.config.maxPlayersPerRoom,
      day: this.engine.clock.day,
      population: this.world.npcs.size,
    };
  }

  checkPassword(pw) {
    if (!this.password) return true;
    const a = Buffer.from(String(pw ?? ''));
    const b = Buffer.from(this.password);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  findByToken(token) {
    if (!token) return null;
    for (const p of this.world.players.values()) if (p.token === token) return p;
    return null;
  }

  addPlayer(socket, rawName, token) {
    const { world, rng, config, bus } = this.ctx;
    let player = this.findByToken(token);
    if (player && player.online && player.socketId !== socket.id) {
      // Aynı hesap başka sekmede: eskisini düşür
      this.io.sockets.sockets.get(player.socketId)?.disconnect(true);
    }
    if (!player) {
      if (world.players.size >= config.maxPlayersPerRoom) return null;
      const spawn = world.randomRoadPoint(rng);
      const [lo, hi] = config.player.startBalance;
      const used = new Set([...world.players.values()].map((p) => p.color));
      player = new Player({
        id: `p${++this._playerSeq}`,
        token: crypto.randomUUID(),
        name: sanitizeName(rawName),
        color: COLORS.find((c) => !used.has(c)) ?? rng.pick(COLORS),
        balance: this.sandbox ? config.player.sandboxBalance : Math.round(rng.range(lo, hi) / 10) * 10,
        x: spawn.x,
        z: spawn.z,
        maxSpeed: config.player.speed * config.player.sprintMultiplier,
      });
      world.players.set(player.id, player);
      if (this.sandbox) player.techs = Object.keys(TECHS);
      const v = createVillage(world, rng, config, player);
      if (v) {
        player.x = v.hall.door.x;
        player.z = v.hall.door.z;
        for (const n of v.npcs) bus.emit('net:spawn', { kind: 'npc', data: n.toMeta() });
        bus.news('player', `🏰 ${player.name} yeni bir köy kurdu! (${v.npcs.length} köylü)`);
      } else {
        bus.news('player', `✈️ ${player.name} şehre ₺${player.balance.toLocaleString('tr-TR')} ile adım attı.`);
      }
    } else {
      bus.news('player', `🔌 ${player.name} geri döndü.`);
    }
    player.online = true;
    player.socketId = socket.id;
    player.lastMoveAt = Date.now();
    this.emptySince = null;
    return player;
  }

  removeSocket(socket, player) {
    if (!player || player.socketId !== socket.id) return;
    player.online = false;
    player.socketId = null;
    if (this.onlineCount === 0) this.emptySince = Date.now();
    this.io.to(this.code).emit(EVENTS.PLAYER_LEFT, { id: player.id });
    this.bus.news('player', `💤 ${player.name} çevrimdışı oldu (mülkleri korunuyor).`);
  }

  // Hız hilesine karşı "hareket bütçesi"
  handleMove(socket, player, data) {
    const x = Number(data?.x);
    const z = Number(data?.z);
    const rotY = Number(data?.rotY);
    if (![x, z, rotY].every(Number.isFinite)) return;
    const world = this.world;

    if (player.jailedUntil > world.clockHours()) {
      const pr = world.prison;
      if (pr && Math.hypot(x - pr.door.x, z - pr.door.z) > 6) {
        socket.emit(EVENTS.PLAYER_CORRECTION, { x: pr.door.x, z: pr.door.z });
      }
      return;
    }

    const now = Date.now();
    const elapsed = (now - player.lastMoveAt) / 1000;
    player.lastMoveAt = now;
    player.moveBudget = Math.min(player.moveBudget + player.maxSpeed * elapsed * 1.3, player.maxSpeed);
    const dist = Math.hypot(x - player.x, z - player.z);
    if (dist > player.moveBudget + 0.5) {
      socket.emit(EVENTS.PLAYER_CORRECTION, { x: player.x, z: player.z });
      return;
    }
    player.moveBudget -= dist;
    const c = world.clampToBounds(x, z);
    player.x = c.x;
    player.z = c.z;
    player.rotY = rotY;
  }

  handleAction(player, type, params) {
    const fn = ACTIONS[type];
    if (!fn) return { ok: false, error: 'Bilinmeyen eylem.' };
    if (player.jailedUntil > this.world.clockHours() && type !== 'crime:bail') {
      return { ok: false, error: 'Cezaevindesin! Önce kefalet ödemelisin.' };
    }
    try {
      const r = fn(this.ctx, player, params ?? {}) ?? { ok: true };
      this.world.touchPlayer(player);
      return r;
    } catch (err) {
      console.error(`[action ${type}]`, err);
      return { ok: false, error: 'Sunucu hatası.' };
    }
  }

  inspect(player, kind, id) {
    return describe(this.ctx, kind, id, player);
  }

  buildInit(player) {
    const { world, config } = this.ctx;
    const now = Date.now();
    return {
      selfId: player.id,
      token: player.token,
      room: { code: this.code, name: this.name, sandbox: this.sandbox },
      config: {
        msPerGameHour: config.time.msPerGameHour,
        playerSpeed: config.player.speed,
        sprintMultiplier: config.player.sprintMultiplier,
        airDefenseRange: 150,
      },
      catalog: {
        ...catalog(),
        units: UNIT_TYPES,
        missiles: MISSILE_TYPES,
        techCost: Object.fromEntries(Object.keys(TECHS).map((k) => [k, { cost: techCost(k, config), hours: techHours(k) }])),
      },
      tiles: world.tilesPublic(),
      world: world.publicStatic(),
      buildings: [...world.buildings.values()].map((b) => b.toPublic()),
      npcs: [...world.npcs.values()].map((n) => n.toMeta()),
      npcSnapshot: [...world.npcs.values()].map((n) => n.toSnapshot()),
      players: [...world.players.values()].filter((p) => p.online).map((p) => p.toPublic()),
      units: [...world.units.values()].map((u) => u.toMeta()),
      vehicles: [...world.vehicles.values()].map((v) => v.toMeta()),
      missiles: [...world.missiles.values()].map((m) => ({ id: m.id, type: m.type, ownerId: m.ownerId, from: m.from, to: m.to, flightMs: m.flightMs, apex: m.apex, elapsed: now - m.start, pos: missilePos(m, now) })),
      hazards: world.hazards,
      self: player.toPrivate(world),
      ...buildClockPayload(this.ctx),
    };
  }

  destroy() {
    this.engine.stop();
    this.bus.removeAllListeners();
    console.log(`[room ${this.code}] kapatıldı`);
  }
}

export function sanitizeName(raw) {
  const name = String(raw ?? '').replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().slice(0, 16);
  return name || `Yabancı${Math.floor(Math.random() * 1000)}`;
}
