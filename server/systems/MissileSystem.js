import { MISSILE_TYPES, AIR_DEFENSE } from '../data/military.js';
import { BUILDING_TYPES } from '../data/buildingTypes.js';

/**
 * Füzeler sunucuda balistik olarak hesaplanır (parabol, deterministik):
 *   s = geçen süre / uçuş süresi;  konum = lerp(çıkış, hedef, s);  yükseklik = 4·apex·s·(1−s)
 * İstemci aynı formülle çizer, böylece her karede konum göndermeye gerek kalmaz.
 * Hava savunması menzile giren düşman füzesine önleyici atar; isabet olasılığı füze tipine bağlı.
 */
export function missilePos(m, t) {
  const s = Math.min(1, Math.max(0, (t - m.start) / m.flightMs));
  return {
    s,
    x: m.from.x + (m.to.x - m.from.x) * s,
    z: m.from.z + (m.to.z - m.from.z) * s,
    y: 4 * m.apex * s * (1 - s) + 3,
  };
}

export class MissileSystem {
  name = 'missiles';

  launch(ctx, player, type, x, z) {
    const { world, bus } = ctx;
    const def = MISSILE_TYPES[type];
    if (!def) return { ok: false, error: 'Bilinmeyen füze.' };
    if (![x, z].every(Number.isFinite)) return { ok: false, error: 'Geçersiz hedef.' };
    const silos = world.buildingsWhere((b) => b.type === 'missile_silo' && b.ownerKind === 'player' && b.ownerId === player.id && b.operational);
    if (!silos.length) return { ok: false, error: 'Önce bir Füze Rampası inşa etmelisin.' };
    const now = Date.now();
    const silo = silos.find((s) => (s.cooldownUntil ?? 0) <= now);
    if (!silo) return { ok: false, error: 'Rampa yeniden dolduruluyor, biraz bekle.' };
    if (player.balance < def.cost) return { ok: false, error: 'Yetersiz bakiye.' };

    player.balance -= def.cost;
    world.touchPlayer(player);
    silo.cooldownUntil = now + 8000;
    const c = world.clampToBounds(x, z);
    const m = {
      id: world.nextId('m'),
      type,
      ownerId: player.id,
      from: { x: silo.x, z: silo.z },
      to: { x: c.x, z: c.z },
      start: now,
      flightMs: def.flightMs,
      apex: def.apex,
      engagedUntil: 0,
    };
    world.missiles.set(m.id, m);
    bus.emit('net:missile', { t: 'launch', id: m.id, type, ownerId: m.ownerId, from: m.from, to: m.to, flightMs: m.flightMs, apex: m.apex, elapsed: 0 });
    if (def.globalAlert) {
      bus.emit('net:alert', { level: 'nuclear', text: `☢️ NÜKLEER SALDIRI TESPİT EDİLDİ! Fırlatan: ${player.name}`, x: c.x, z: c.z, etaMs: def.flightMs });
    }
    bus.news('war', `🚀 ${player.name} bir ${def.label} fırlattı!`);
    return { ok: true, missileId: m.id };
  }

  onTick(_dt, ctx) {
    const { world, rng, bus } = ctx;
    const now = Date.now();
    const defenses = world.buildingsWhere((b) => b.type === 'air_defense' && b.operational && b.ownerKind === 'player');

    // 1) Hava savunması angajmanı
    for (const m of world.missiles.values()) {
      if (now < m.engagedUntil) continue;
      for (const d of defenses) {
        if (d.ownerId === m.ownerId || (d.reloadUntil ?? 0) > now) continue;
        const hitAt = now + AIR_DEFENSE.interceptorFlightMs;
        if (hitAt > m.start + m.flightMs - 300) continue;
        const p = missilePos(m, hitAt);
        if (p.s < 0.1) continue;
        if (Math.hypot(p.x - d.x, p.z - d.z) > BUILDING_TYPES.air_defense.range) continue;
        const success = rng.chance(MISSILE_TYPES[m.type].interceptChance);
        const icp = { id: world.nextId('i'), missileId: m.id, hitAt, success, at: p };
        world.interceptors.push(icp);
        d.reloadUntil = now + AIR_DEFENSE.reloadMs;
        m.engagedUntil = hitAt + 100;
        bus.emit('net:missile', { t: 'intercept', id: icp.id, missileId: m.id, from: { x: d.x, y: 8, z: d.z }, at: p, flightMs: AIR_DEFENSE.interceptorFlightMs, success });
        break;
      }
    }

    // 2) Önleyiciler hedefe ulaştı mı
    world.interceptors = world.interceptors.filter((i) => {
      if (now < i.hitAt) return true;
      const m = world.missiles.get(i.missileId);
      if (m && i.success) {
        world.missiles.delete(m.id);
        bus.emit('net:missile', { t: 'destroyed', id: m.id, x: i.at.x, y: i.at.y, z: i.at.z });
        bus.news('war', `🛡️ Hava savunması bir ${MISSILE_TYPES[m.type].label} füzesini havada imha etti!`);
      } else if (m) {
        bus.emit('net:missile', { t: 'miss', id: i.id, x: i.at.x, y: i.at.y, z: i.at.z });
      }
      return false;
    });

    // 3) Düşenler
    for (const m of [...world.missiles.values()]) {
      if (now >= m.start + m.flightMs) this.impact(ctx, m);
    }
  }

  impact({ world, bus }, m) {
    const def = MISSILE_TYPES[m.type];
    world.missiles.delete(m.id);
    const { x, z } = m.to;
    const r = def.radius;
    bus.emit('net:missile', { t: 'impact', id: m.id, type: m.type, x, z, radius: r });

    const before = world.npcs.size;
    let destroyed = 0;
    for (const b of world.buildings.values()) {
      if (b.destroyed || b.type === 'land' || b.type === 'park') continue;
      const d = Math.max(0, Math.hypot(b.x - x, b.z - z) - Math.max(b.width, b.depth) / 2);
      if (d >= r) continue;
      if (m.type === 'nuclear') world.destroyBuilding(b, m.ownerId);
      else world.damageBuilding(b, def.damage * (1 - d / r), m.ownerId);
      if (b.destroyed) destroyed++;
    }
    for (const npc of [...world.npcs.values()]) {
      if (npc.state === 'moving' && Math.hypot(npc.x - x, npc.z - z) < r) world.killNpc(npc, 'füze');
    }
    for (const u of [...world.units.values()]) {
      const d = Math.hypot(u.x - x, u.z - z);
      if (d >= r) continue;
      u.hp -= def.damage * (1 - d / r);
      if (u.hp <= 0) {
        world.units.delete(u.id);
        bus.emit('net:remove', { kind: 'unit', id: u.id, reason: 'destroyed' });
      }
    }
    for (const v of [...world.vehicles.values()]) {
      if (Math.hypot(v.x - x, v.z - z) < r) {
        world.vehicles.delete(v.id);
        bus.emit('net:remove', { kind: 'vehicle', id: v.id, reason: 'destroyed' });
      }
    }
    // Oyuncular ölmez ama yaralanıp hastaneye kaldırılır
    const hospital = world.hospital;
    for (const p of world.players.values()) {
      if (!p.online || Math.hypot(p.x - x, p.z - z) >= r) continue;
      const bill = Math.round(p.balance * 0.05);
      p.balance -= bill;
      world.treasury += bill;
      if (hospital && !hospital.destroyed) {
        p.x = hospital.door.x;
        p.z = hospital.door.z;
        bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z });
      }
      world.touchPlayer(p);
      bus.news('war', `🚑 ${p.name} patlamada yaralandı, hastaneye kaldırıldı (fatura ₺${bill.toLocaleString('tr-TR')}).`);
    }

    if (def.radiationHours) {
      world.hazards.push({ kind: 'radiation', x, z, radius: r * 1.2, untilHour: world.clockHours() + def.radiationHours });
      bus.emit('net:missile', { t: 'hazards', hazards: world.hazards });
    }
    const dead = before - world.npcs.size;
    bus.news('war', `💥 ${def.label} düştü! ${destroyed} bina yıkıldı${dead ? `, ${dead} kişi hayatını kaybetti` : ''}.`);
  }

  onHour(time, { world, bus }) {
    const n = world.hazards.length;
    world.hazards = world.hazards.filter((h) => h.untilHour > time.totalHours);
    if (n !== world.hazards.length) {
      bus.emit('net:missile', { t: 'hazards', hazards: world.hazards });
      bus.news('war', '☢️ Radyasyon seviyesi düştü, bölge yeniden yaşanabilir.');
    }
  }
}
