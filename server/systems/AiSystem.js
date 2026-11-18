import { TECHS, techCost, isUnlocked, playerEra } from '../data/tech.js';
import { UNIT_TYPES, AIR_TYPES, MISSILE_TYPES } from '../data/military.js';
import { BUILDING_TYPES } from '../data/buildingTypes.js';
import { ACTIONS } from '../actions/index.js';

/**
 * NPC ÜLKELER: kendi başına büyüyen, araştıran, ordu kuran ve savaş açan yapay zekâ.
 *  - Her saat: devlet geliri, teknoloji araştırması
 *  - Her 4 saatte: inşaat (ev → nüfus, kışla, hava üssü, rampa, hava savunması, pazar)
 *  - Her 6 saatte: toprak genişletme
 *  - Ordu: çağına göre en iyi birliği eğitir
 *  - Savaş: belli günden sonra komşusuna gerekçe hazırlar, 3 dk sonra ilan eder;
 *    savaşta askerlerini düşman sarayına yollar, füze ve uçak gönderir; bir süre sonra barış ister
 */
export class AiSystem {
  name = 'ai';

  ais(world) {
    return [...world.players.values()].filter((p) => p.isAI && p.village);
  }

  onHour(time, ctx) {
    const { world, config } = ctx;
    for (const ai of this.ais(world)) {
      ai.balance += config.ai.hourlyStipend * playerEra(ai);
      // Öncelik: kışla + ordu (güvenlik) > inşaat > araştırma > genişleme
      if (time.hour % 2 === 1) this.build(ctx, ai);
      this.army(ctx, ai);
      this.research(ctx, ai);
      if (time.hour % 6 === 2) this.expand(ctx, ai);
      this.war(ctx, ai, time);
    }
  }

  research(ctx, ai) {
    if (ai.research) return;
    const options = Object.entries(TECHS)
      .filter(([id, t]) => !ai.techs.includes(id) && t.requires.every((r) => ai.techs.includes(r)))
      .sort((a, b) => a[1].era - b[1].era);
    const pick = options.slice(0, 3)[Math.floor(ctx.rng.next() * Math.min(3, options.length))];
    const hasBarracks = ctx.world.buildingsWhere((b) => b.type === 'barracks' && b.ownerId === ai.id).length > 0;
    if (pick && hasBarracks && ai.balance > techCost(pick[0], ctx.config) * 2.2) ctx.engine.getSystem('tech').start(ctx, ai, pick[0]);
  }

  build(ctx, ai) {
    const { world } = ctx;
    const mine = world.buildingsWhere((b) => b.ownerKind === 'player' && b.ownerId === ai.id);
    const land = mine.find((b) => b.type === 'land' && !b.construction);
    if (!land) return;
    const has = (t) => mine.some((b) => b.type === t);
    const houses = mine.filter((b) => b.category === 'residential').length;
    const era = playerEra(ai);
    const wish = [
      !has('barracks') && 'barracks',
      houses < 3 + era && (isUnlocked(ai, 'buildings', 'apartment') ? 'apartment' : 'house'),
      !has('airbase') && isUnlocked(ai, 'buildings', 'airbase') && 'airbase',
      !has('air_defense') && isUnlocked(ai, 'buildings', 'air_defense') && 'air_defense',
      !has('missile_silo') && isUnlocked(ai, 'buildings', 'missile_silo') && 'missile_silo',
      mine.filter((b) => b.type === 'market').length < 2 && 'market',
      isUnlocked(ai, 'buildings', 'apartment') ? 'apartment' : 'house',
    ].find(Boolean);
    if (!wish || ai.balance < (BUILDING_TYPES[wish].buildCost ?? 0) * 1.2) return;
    ACTIONS['property:build'](ctx, ai, { buildingId: land.id, type: wish });
  }

  expand(ctx, ai) {
    const { world } = ctx;
    const ter = ctx.engine.getSystem('territory');
    if (world.ownedTileCount(ai.id) >= 10 + playerEra(ai) * 3) return;
    const cost = ter.claimCost(ctx, ai);
    if (ai.balance < cost * 1.6) return;
    const free = world.tiles.filter((t) => !t.owner && t.terrain !== 'w' && t.terrain !== 'm' && ter.isAdjacent(world, t, ai.id));
    const t = free[Math.floor(ctx.rng.next() * free.length)];
    if (!t) return;
    t.exploredBy.add(ai.id);
    ter.claim(ctx, ai, t.i, t.j);
  }

  army(ctx, ai) {
    const { world } = ctx;
    const era = playerEra(ai);
    const ground = [...world.units.values()].filter((u) => u.ownerId === ai.id && !u.def.air && u.def.combat !== false);
    if (ground.length >= 3 + era * 2) return;
    const best = Object.entries(UNIT_TYPES)
      .filter(([k, d]) => d.combat !== false && isUnlocked(ai, 'units', k))
      .sort((a, b) => b[1].cost - a[1].cost)[0];
    if (best && ai.balance > best[1].cost * 1.2) ctx.engine.getSystem('military').train(ctx, ai, best[0]);
  }

  war(ctx, ai, time) {
    const { world, config, rng } = ctx;
    const dip = ctx.engine.getSystem('diplomacy');
    const enemies = world.warsOf(ai.id);

    // Hazır gerekçe varsa ilan et
    for (const [targetId, readyAt] of Object.entries(world.justificationsOf(ai.id))) {
      if (Date.now() >= readyAt) dip.declare(ai, targetId);
    }

    if (enemies.length) {
      const target = world.players.get(enemies[0]);
      const hall = target && world.buildings.get(target.homeId);
      if (hall && time.hour % 3 === 0) {
        const ids = [...world.units.values()].filter((u) => u.ownerId === ai.id && !u.def.air && u.def.combat !== false).map((u) => u.id);
        ctx.engine.getSystem('military').move(ctx, ai, ids, hall.door.x, hall.door.z);
        // Füze
        const missile = ['ballistic', 'tactical'].find((m) => isUnlocked(ai, 'missiles', m) && ai.balance > MISSILE_TYPES[m].cost * 1.5);
        if (missile) ctx.engine.getSystem('missiles').launch(ctx, ai, missile, hall.x + (rng.next() - 0.5) * 30, hall.z + (rng.next() - 0.5) * 30);
        // Hava
        const air = ['b2', 'jet', 'drone', 'heli'].find((a) => isUnlocked(ai, 'air', a) && ai.balance > AIR_TYPES[a].cost * (a === 'b2' ? 1.1 : 1.5) && (a !== 'b2' || rng.chance(0.15)));
        if (air) ctx.engine.getSystem('air').launch(ctx, ai, air, hall.x, hall.z);
      }
      // Barış
      const w = world.wars.get(world.warKey(ai.id, enemies[0]));
      if (w && time.hour === 6 && time.totalHours - w.since > 48 && rng.chance(0.3)) dip.makePeace(ai.id, enemies[0]);
      return;
    }

    // Savaş başlat
    if (time.day < config.ai.firstWarDay || time.hour !== 12 || !rng.chance(config.ai.warChancePerDay)) return;
    if (Object.keys(world.justificationsOf(ai.id)).length) return;
    const hallA = world.buildings.get(ai.homeId);
    const candidates = [...world.players.values()].filter((p) => p.id !== ai.id && p.village && world.buildings.get(p.homeId));
    if (!hallA || !candidates.length) return;
    // İnsan oyunculara öncelik, en yakını
    candidates.sort((a, b) => (a.isAI - b.isAI) || dist(world, hallA, a) - dist(world, hallA, b));
    dip.justify(ai, candidates[0].id);
  }
}

function dist(world, hall, p) {
  const h = world.buildings.get(p.homeId);
  return h ? Math.hypot(h.x - hall.x, h.z - hall.z) : 1e9;
}
