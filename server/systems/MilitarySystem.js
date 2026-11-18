import { Unit } from '../entities/Unit.js';
import { UNIT_TYPES } from '../data/military.js';
import { roadPath, stepAlongPath } from '../world/Pathfinding.js';
import { isUnlocked, requiredTech, TECHS } from '../data/tech.js';

/**
 * Kara birlikleri: eğitim, yol üzerinden hareket, otomatik çatışma.
 * Menzildeki düşman birliğe, yoksa düşman oyuncunun binasına ateş açar.
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
    const owned = [...world.units.values()].filter((u) => u.ownerId === player.id).length;
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
    const { world } = ctx;
    const target = world.nearestRoadPoint(x, z);
    let n = 0;
    for (const id of unitIds ?? []) {
      const u = world.units.get(id);
      if (!u || u.ownerId !== player.id || u.def.combat === false) continue;
      const start = world.nearestRoadPoint(u.x, u.z);
      u.x = start.x;
      u.z = start.z;
      u.path = roadPath(world, start, target);
      n++;
    }
    return n ? { ok: true, moved: n } : { ok: false, error: 'Seçili birlik yok.' };
  }

  onTick(dt, { world, bus }) {
    const units = [...world.units.values()];
    for (const u of units) {
      if (u.path.length) stepAlongPath(u, u.def.speed * (u.speedMul ?? 1) * dt);
      if (u.def.combat === false) continue;
      u.cooldown -= dt;
      if (u.cooldown > 0) continue;

      const def = u.def;
      const enemy = this.nearestEnemy(u, units, def.range);
      if (enemy) {
        enemy.hp -= def.damage;
        u.cooldown = 1 / def.fireRate;
        u.aimRot = Math.atan2(enemy.x - u.x, enemy.z - u.z);
        bus.emit('net:fx', { t: def.melee ? 'melee' : 'shot', k: u.type, a: [u.x, u.z], b: [enemy.x, enemy.z] });
        if (enemy.hp <= 0) this.kill(world, bus, enemy);
        continue;
      }
      const target = this.nearestEnemyBuilding(u, world, def.range);
      if (target) {
        u.cooldown = 1 / def.fireRate;
        bus.emit('net:fx', { t: def.melee ? 'melee' : 'shot', k: u.type, a: [u.x, u.z], b: [target.x, target.z] });
        world.damageBuilding(target, def.damage, u.ownerId);
        if (target.destroyed) bus.news('war', `🔥 ${target.name} çatışmada yerle bir oldu!`);
      } else {
        u.cooldown = 0.5; // boşta: yarım saniyede bir tara
      }
    }
  }

  nearestEnemy(u, units, range) {
    let best = null;
    let bd = range;
    for (const o of units) {
      if (o.ownerId === u.ownerId || o.hp <= 0 || o.def.combat === false) continue;
      const d = Math.hypot(o.x - u.x, o.z - u.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  nearestEnemyBuilding(u, world, range) {
    let best = null;
    let bd = range;
    for (const b of world.buildings.values()) {
      if (b.ownerKind !== 'player' || b.ownerId === u.ownerId || b.destroyed) continue;
      if (b.type === 'land') continue;
      const d = Math.hypot(b.x - u.x, b.z - u.z) - Math.max(b.width, b.depth) / 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  kill(world, bus, unit) {
    world.units.delete(unit.id);
    bus.emit('net:remove', { kind: 'unit', id: unit.id, reason: 'destroyed' });
    bus.emit('net:fx', { t: 'explosion', x: unit.x, z: unit.z, r: unit.type === 'tank' || unit.type === 'cannon' ? 8 : 3 });
  }
}
