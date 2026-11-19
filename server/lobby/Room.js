import crypto from 'node:crypto';
import { CONFIG } from '../config.js';
import { EVENTS } from '../../shared/events.js';
import { createRng } from '../core/rng.js';
import { EventBus } from '../core/EventBus.js';
import { GameEngine } from '../core/GameEngine.js';
import { World } from '../world/World.js';
import { generateWorld, findFoundingSpot, ensureTownExtras } from '../world/WorldGenerator.js';
import { TECHS, techCost, techHours } from '../data/tech.js';
import { Player } from '../entities/Player.js';
import { UNIT_TYPES, MISSILE_TYPES } from '../data/military.js';
import { ACTIONS, catalog } from '../actions/index.js';
import { describe } from '../services/InspectService.js';
import { NetworkSyncSystem, buildClockPayload } from '../network/NetworkSyncSystem.js';
import { missilePos } from '../systems/MissileSystem.js';
import { restoreWorld } from '../persistence/Snapshot.js';

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
import { DiplomacySystem } from '../systems/DiplomacySystem.js';
import { AirSystem } from '../systems/AirSystem.js';
import { AiSystem } from '../systems/AiSystem.js';
import { LifeSystem } from '../systems/LifeSystem.js';
import { SocietySystem } from '../systems/SocietySystem.js';
import { interiorLayout, interiorOrigin } from '../../shared/interiors.js';

const COLORS = ['#ff4d4d', '#3ddc84', '#ffd23f', '#a06cff', '#2ec4ff', '#ff8c42', '#ff5fa2', '#00e0b8', '#c0ff3e', '#ffffff'];

/** Bir oda = kendi dünyası, kendi saati, kendi sistemleri olan bağımsız bir evren. */
export class Room {
  constructor(io, { code, name, password, sandbox, npcCount, ownerName, save }) {
    this.io = io;
    this.code = save?.meta.code ?? code;
    this.name = save?.meta.name ?? name;
    this.passwordHash = save ? save.meta.passwordHash ?? '' : password ? hashPw(password) : '';
    this.sandbox = save ? !!save.meta.sandbox : !!sandbox;
    this.ownerName = save?.meta.ownerName ?? ownerName ?? null;
    this.createdAt = save?.meta.createdAt ?? Date.now();
    this.emptySince = Date.now();
    this._playerSeq = save?.meta.playerSeq ?? 0;

    let config;
    if (save) {
      // Kayıttaki denge ayarları + koddaki yeni ayarlar (yeni eklenen alanlar eksik kalmasın)
      config = mergeDeep(structuredClone(CONFIG), save.config);
      config.time.msPerGameHour = CONFIG.time.msPerGameHour;
      config.life = { ...config.life, ...CONFIG.life };
    } else {
      config = structuredClone(CONFIG);
      config.seed = Math.floor(Math.random() * 1e9);
      if (npcCount) config.genesis.npcCount = Math.max(20, Math.min(150, npcCount));
    }
    this.config = config;

    this.bus = new EventBus();
    this.rng = createRng(save ? Math.floor(Math.random() * 1e9) : config.seed);
    this.world = new World(config, this.bus);
    let stats = null;
    if (save) {
      restoreWorld(this.world, save);
      // Yeni sürümde eklenen binalar (göç). Hata olsa bile dünya yine de açılsın.
      try { ensureTownExtras(this.world, this.rng, config); } catch (e) { console.error(`[room ${this.code}] göç hatası`, e); }
    }
    else stats = generateWorld(this.world, this.rng, config);

    // SIRA ÖNEMLİ
    this.engine = new GameEngine({ world: this.world, rng: this.rng, bus: this.bus, config });
    if (save) this.engine.clock.elapsedMs = save.clockMs;
    this.engine
      .use(new DiplomacySystem())
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
      .use(new AirSystem())
      .use(new PopulationSystem())
      .use(new TechSystem())
      .use(new TerritorySystem())
      .use(new AiSystem())
      .use(new LifeSystem())
      .use(new SocietySystem())
      .use(new NetworkSyncSystem(io, this.code));
    this.ctx = this.engine.ctx;
    if (save) {
      const life = this.engine.getSystem('life');
      if (life) life.incSeq = save.life?.incSeq ?? 0;
      // Sunucu uyurken geçen zamanı telafi et
      const missedHours = Math.floor((Date.now() - save.savedAt) / config.time.msPerGameHour);
      this.caughtUp = this.engine.fastForward(Math.min(missedHours, CONFIG.persistence.maxCatchUpHours));
      console.log(`[room ${this.code}] kayıttan yüklendi, ${this.caughtUp} oyun saati telafi edildi`);
    } else {
      console.log(`[room ${this.code}] "${this.name}" oluşturuldu`, stats);
    }
    this.engine.start();
  }

  /** Lobi listesi ve veritabanı için özet */
  summary() {
    const humans = [...this.world.players.values()].filter((p) => !p.isAI);
    return {
      code: this.code,
      name: this.name,
      owner_name: this.ownerName,
      locked: !!this.passwordHash,
      sandbox: this.sandbox,
      day: this.engine.clock.day,
      population: this.world.npcs.size,
      player_names: humans.map((p) => p.name).slice(0, 20),
      countries: [...this.world.players.values()].filter((p) => p.village).length,
    };
  }

  get onlineCount() {
    let n = 0;
    for (const p of this.world.players.values()) if (p.online && !p.isAI) n++;
    return n;
  }

  publicInfo() {
    return {
      code: this.code,
      name: this.name,
      locked: !!this.passwordHash,
      sandbox: this.sandbox,
      players: this.onlineCount,
      max: this.config.maxPlayersPerRoom,
      day: this.engine.clock.day,
      population: this.world.npcs.size,
    };
  }

  checkPassword(pw) {
    if (!this.passwordHash) return true;
    const a = Buffer.from(hashPw(String(pw ?? '')));
    const b = Buffer.from(this.passwordHash);
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
      if ([...world.players.values()].filter((p) => !p.isAI).length >= config.maxPlayersPerRoom) return null;
      // Vatandaş olarak rastgele bir ülkede, kendine ayrılmış bir evde başla
      const home = this.pickCitizenHome();
      const spawn = home ? { x: home.door.x, z: home.door.z + 1.5 } : world.randomRoadPoint(rng);
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
      if (home) {
        player.homeId = home.id;
        player.citizenOf = world.ownerAt(home.x, home.z) ?? 'state';
      }
      const nation = world.players.get(player.citizenOf);
      player.citizenName = nation?.countryName ?? 'Merkez Şehir';
      bus.news('player', `🧳 ${player.name}, ${player.citizenName} vatandaşı olarak hayata başladı.`);
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

  /** Yeni vatandaşa ev: önce NPC ülkelerin köyleri, yoksa merkez şehir */
  pickCitizenHome() {
    const { world, rng } = this.ctx;
    const houses = world.buildingsWhere((b) => b.operational && ['house', 'apartment', 'villa'].includes(b.type));
    const taken = new Set([...world.players.values()].map((p) => p.homeId));
    const free = houses.filter((b) => !taken.has(b.id));
    const ai = free.filter((b) => world.players.get(world.ownerAt(b.x, b.z))?.isAI);
    const pool = ai.length && rng.chance(0.75) ? ai : free;
    return pool.length ? rng.pick(pool) : null;
  }

  // Hız hilesine karşı "hareket bütçesi"
  handleMove(socket, player, data) {
    const x = Number(data?.x);
    const z = Number(data?.z);
    const rotY = Number(data?.rotY);
    if (![x, z, rotY].every(Number.isFinite)) return;
    const world = this.world;
    if (player.dead || (player.pose === 'sleep' && player.energy < 15)) {
      if (Math.hypot(x - player.x, z - player.z) > 0.5) socket.emit(EVENTS.PLAYER_CORRECTION, { x: player.x, z: player.z });
      return;
    }

    // Arabada yolcuysa konumunu sürücü belirler
    if (player.rideWith) return;
    if (player.jailedUntil > world.clockHours() && !player.pendingCase) {
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
    if (dist > 0.4 && player.pose && player.pose !== 'dead' && player.pose !== 'drive') { player.pose = ''; player.tv = false; world.touchPlayer(player); }
    if (player.inside) {
      // İç mekânda: odanın duvarları içinde kal
      const b = world.buildings.get(player.inside);
      const L = b && interiorLayout(b.type);
      if (L) {
        const o = interiorOrigin(b.id);
        player.x = Math.max(o.x - L.w / 2 + 0.5, Math.min(o.x + L.w / 2 - 0.5, x));
        player.z = Math.max(o.z - L.d / 2 + 0.5, Math.min(o.z + L.d / 2 - 0.5, z));
        player.rotY = rotY;
        return;
      }
    }
    const c = world.clampToBounds(x, z);
    player.x = c.x;
    player.z = c.z;
    player.rotY = rotY;
    if (player.driving) this.engine.getSystem('society')?.carryPassengers(player);
  }

  /** Yakınlık sesli sohbeti: sesi yalnızca yakındaki (aynı mekândaki) oyunculara ilet */
  handleVoice(socket, player, data) {
    if (typeof data !== 'string' || data.length > 4000 || player.dead) return;
    const now = Date.now();
    if (now - (player._voiceWin ?? 0) > 1000) { player._voiceWin = now; player._voiceN = 0; }
    if (++player._voiceN > 25) return;
    const range = this.config.life.voiceRange;
    // Telefonla konuşuyorsa karşı taraf her yerden duyar
    const callee = player.callWith && this.world.players.get(player.callWith);
    if (callee?.online && callee.socketId) this.io.to(callee.socketId).volatile.emit('voice:in', { id: player.id, d: 4, a: data, call: 1 });
    for (const o of this.world.players.values()) {
      if (o === player || o === callee || !o.online || !o.socketId || o.inside !== player.inside) continue;
      // Aynı arabadakiler birbirini net duyar
      const d = Math.hypot(o.x - player.x, o.z - player.z);
      if (d > range) continue;
      this.io.to(o.socketId).volatile.emit('voice:in', { id: player.id, d: Math.round(d * 10) / 10, a: data });
    }
  }

  handleAction(player, type, params) {
    const fn = ACTIONS[type];
    if (!fn) return { ok: false, error: 'Bilinmeyen eylem.' };
    if (player.pendingCase && !String(type).startsWith('phone:') && type !== 'social:feed') {
      return { ok: false, error: '⚖️ Duruşmadasın! Hakimin kararını bekle.' };
    }
    if (player.jailedUntil > this.world.clockHours() && type !== 'crime:bail' && !player.pendingCase) {
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
        gridSize: config.world.gridSize,
        townSize: config.world.townSize,
        voiceRange: config.life.voiceRange,
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
      match: this.engine.getSystem('society')?.matchPublic() ?? null,
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

function hashPw(pw) {
  return crypto.createHash('sha256').update(`wc:${pw}`).digest('hex');
}

function mergeDeep(base, over) {
  for (const [k, v] of Object.entries(over ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') mergeDeep(base[k], v);
    else base[k] = v;
  }
  return base;
}
