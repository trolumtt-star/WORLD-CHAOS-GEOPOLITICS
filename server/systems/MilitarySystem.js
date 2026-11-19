import { Unit } from '../entities/Unit.js';
import { UNIT_TYPES } from '../data/military.js';
import { roadPath, stepAlongPath } from '../world/Pathfinding.js';
import { isUnlocked, requiredTech, TECHS } from '../data/tech.js';

const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const VEHICLE = new Set(['tank', 'cannon', 'cavalry']);

/**
 * Kara birlikleri: eğitim, hareket, otomatik çatışma.
 * Sadece SAVAŞTA olunan ülkeye ateş eder. Hedef önceliği:
 *   düşman askeri > düşman sivili (sokaktaki NPC → nüfus düşer) > düşman binası
 */
export class MilitarySystem {
  name = 'military';

  train(ctx, player, type) {
    const { world, config, bus } = ctx;
    const def = UNIT_TYPES[type];
    if (!def || def.combat === false) return { ok: false, error: 'Bilinmeyen birlik.' };
    if (!isUnlocked(player, 'units', type)) return { ok: false, error: `Önce ${TECHS[requiredTech('units', type)]?.label} teknolojisini geliştir.` };
    const base = world.buildingsWhere((b) => b.type === def.requires && b.ownerKind === 'player' && b.ownerId === player.id && b.operational)[0];
    if (!base) return { ok: false, error: 'Önce bir Kışla inşa etmelisin.' };
    const owned = [...world.units.values()].filter((u) => u.ownerId === player.id && !u.def.air).length;
    if (owned >= config.player.maxUnits) return { ok: false, error: 'Birlik limitine ulaştın.' };
    if (player.balance < def.cost) return { ok: false, error: 'Yetersiz bakiye.' };

    player.balance -= def.cost;
    world.touchPlayer(player);
    const unit = new Unit({ id: world.nextId('u'), type, ownerId: player.id, color: player.color, x: base.door.x + (Math.random() - 0.5) * 6, z: base.door.z });
    world.units.set(unit.id, unit);
    bus.emit('net:spawn', { kind: 'unit', data: unit.toMeta() });
    return { ok: true, unitId: unit.id };
  }

  move(ctx, player, unitIds, x, z) {
    const { world, config } = ctx;
    const target = world.nearestRoadPoint(x, z);
    let n = 0;
    // Yol masrafı (yakıt + erzak): birlik başına mesafeye göre
    let cost = 0;
    const list = (unitIds ?? []).map((id) => world.units.get(id)).filter((u) => u && u.ownerId === player.id && u.def.combat !== false && !u.def.air);
    if (!player.isAI) for (const u of list) cost += Math.hypot(u.x - target.x, u.z - target.z) / 100 * config.costs.marchPer100 * (VEHICLE.has(u.type) ? 3 : 1);
    cost = Math.round(cost);
    if (cost > player.balance) return { ok: false, error: `⛽ Yol masrafı ${tl(cost)} (yakıt + erzak). Paran yetmiyor — daha yakına gönder ya da daha az birlik seç.` };
    player.balance -= cost;
    if (cost) world.touchPlayer(player);
    for (const u of list) {
      const start = world.nearestRoadPoint(u.x, u.z);
      u.x = start.x;
      u.z = start.z;
      u.path = roadPath(world, start, target);
      n++;
    }
    return n ? { ok: true, moved: n, cost, message: cost ? `🪖 ${n} birlik yola çıktı · ⛽ yol masrafı −${tl(cost)}` : undefined } : { ok: false, error: 'Kara birliğin yok.' };
  }

  // Ortak hedef bulma (helikopter de kullanır)
  findTarget(ctx, u, range) {
    const { world } = ctx;
    let best = null;
    let bd = range;
    for (const o of world.units.values()) {
      if (o === u || o.hp <= 0 || o.def.combat === false || o.def.air) continue;
      if (!world.atWar(o.ownerId, u.ownerId)) continue;
      const d = Math.hypot(o.x - u.x, o.z - u.z);
      if (d < bd) { bd = d; best = { kind: 'unit', ref: o, x: o.x, z: o.z }; }
    }
    if (best) return best;
    for (const n of world.npcs.values()) {
      if (n.state !== 'moving') continue;
      const home = world.buildings.get(n.homeId);
      const owner = home ? world.ownerAt(home.x, home.z) : world.ownerAt(n.x, n.z);
      if (!owner || !world.atWar(owner, u.ownerId)) continue;
      const d = Math.hypot(n.x - u.x, n.z - u.z);
      if (d < bd) { bd = d; best = { kind: 'npc', ref: n, x: n.x, z: n.z, owner }; }
    }
    if (best) return best;
    for (const b of world.buildings.values()) {
      if (b.ownerKind !== 'player' || b.destroyed || b.type === 'land') continue;
      if (!world.atWar(b.ownerId, u.ownerId)) continue;
      const d = Math.hypot(b.x - u.x, b.z - u.z) - Math.max(b.width, b.depth) / 2;
      if (d < bd) { bd = d; best = { kind: 'building', ref: b, x: b.x, z: b.z }; }
    }
    return best;
  }

  hit(ctx, attacker, target, damage) {
    const { world, bus } = ctx;
    if (target.kind === 'unit') {
      target.ref.hp -= damage;
      if (target.ref.hp <= 0) this.kill(world, bus, target.ref);
    } else if (target.kind === 'npc') {
      world.casualties ??= {};
      world.casualties[target.owner] = (world.casualties[target.owner] ?? 0) + 1;
      world.killNpc(target.ref, 'savaş');
    } else if (target.kind === 'building') {
      world.damageBuilding(target.ref, damage, attacker.ownerId);
      if (target.ref.destroyed) bus.news('war', `🔥 ${target.ref.name} çatışmada yerle bir oldu!`);
    }
  }

  /** Savaştaki ülke her saat askerlerine yemek, araçlarına yakıt öder; ödeyemezse ordu erir */
  onHour(time, { world, config, bus }) {
    for (const p of world.players.values()) {
      if (p.isAI || !world.warsOf(p.id).length) continue;
      const units = [...world.units.values()].filter((u) => u.ownerId === p.id && u.def.combat !== false && !u.def.air && !u.def.street);
      if (!units.length) continue;
      let bill = 0;
      for (const u of units) bill += VEHICLE.has(u.type) ? config.costs.upkeepVehicle : config.costs.upkeepFoot;
      if (p.balance >= bill) {
        p.balance -= bill;
        if (time.hour % 4 === 0) bus.emit('net:private', { playerId: p.id, item: { category: 'war', text: `🍞⛽ Ordu ikmali: ${units.length} birlik için saatlik −${tl(bill)}` } });
      } else {
        for (const u of units) u.hp = Math.max(1, u.hp - u.maxHp * 0.15);
        bus.emit('net:private', { playerId: p.id, item: { category: 'war', text: `⚠️ Hazinede ikmal parası yok (${tl(bill)}/saat)! Askerler aç, araçlar yakıtsız: ordu her saat %15 zayıflıyor.`, toast: 'err', sfx: 'alarm' } });
      }
      world.touchPlayer(p);
    }
  }

  onTick(dt, ctx) {
    const { bus, world } = ctx;
    for (const u of [...world.units.values()]) {
      const def = u.def;
      if (def.air) continue; // hava birlikleri AirSystem'de
      if (u.path.length) stepAlongPath(u, def.speed * (u.speedMul ?? 1) * dt);
      if (def.combat === false) continue;
      u.cooldown -= dt;
      if (u.cooldown > 0) continue;
      const target = this.findTarget(ctx, u, def.range);
      if (!target) { u.cooldown = 0.5; continue; }
      u.cooldown = 1 / def.fireRate;
      u.aimRot = Math.atan2(target.x - u.x, target.z - u.z);
      bus.emit('net:fx', { t: def.melee ? 'melee' : 'shot', k: u.type, a: [u.x, u.z], b: [target.x, target.z] });
      this.hit(ctx, u, target, def.damage);
    }
  }

  kill(world, bus, unit) {
    world.units.delete(unit.id);
    bus.emit('net:remove', { kind: 'unit', id: unit.id, reason: 'destroyed' });
    bus.emit('net:fx', { t: 'explosion', x: unit.x, z: unit.z, r: unit.type === 'tank' || unit.type === 'cannon' ? 8 : 3 });
  }
}
