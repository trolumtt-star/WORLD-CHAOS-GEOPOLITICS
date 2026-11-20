import { adTier } from '../../shared/catalogs.js';
import { Unit } from '../entities/Unit.js';
import { AIR_TYPES, AIR_DEFENSE, MISSILE_TYPES } from '../data/military.js';
import { BUILDING_TYPES } from '../data/buildingTypes.js';
import { isUnlocked, requiredTech, hasFeature, TECHS } from '../data/tech.js';

const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

/**
 * Hava görevleri: Hava Üssü'nden kalkış → hedefe uçuş → saldırı → üsse dönüş.
 *  - Jet / SİHA: hedefe füze bırakır (patlama)
 *  - Helikopter: hedef bölgede bekler, menzildeki askerleri / sivilleri / binaları tarar
 *  - B-2 Spirit: nükleer bombayı bırakır (3 sn düşüş, sonra nükleer patlama)
 * Savaşta olunan ülkenin hava savunması uçakları düşürmeye çalışır (B-2 hayalet: %15).
 */
export class AirSystem {
  name = 'air';
  bombs = [];
  shots = [];

  launch(ctx, p, type, x, z) {
    const { world, bus, engine } = ctx;
    const def = AIR_TYPES[type];
    if (!def) return { ok: false, error: 'Bilinmeyen uçak.' };
    if (!isUnlocked(p, 'air', type)) return { ok: false, error: `Önce ${TECHS[requiredTech('air', type)]?.label} teknolojisini geliştir.` };
    if (type === 'b2' && !hasFeature(p, 'nuclear')) return { ok: false, error: 'Nükleer Fizik gerekli.' };
    if (![x, z].every(Number.isFinite)) return { ok: false, error: 'Geçersiz hedef.' };
    const check = engine.getSystem('diplomacy').canStrike(p, x, z);
    if (!check.ok) return check;
    const base = world.buildingsWhere((b) => b.type === 'airbase' && b.ownerKind === 'player' && b.ownerId === p.id && b.operational)[0];
    if (!base) return { ok: false, error: 'Önce bir Hava Üssü inşa etmelisin.' };
    const total = Math.round(def.cost * (1 + (ctx.config.costs?.airFuel ?? 0)));
    if (p.balance < total) return { ok: false, error: `${def.label} ${tl(def.cost)} + kalkış yakıtı ${tl(total - def.cost)} = ${tl(total)}. Paran yetmiyor.` };
    p.balance -= total;
    world.touchPlayer(p);
    const u = new Unit({ id: world.nextId('u'), type, ownerId: p.id, color: p.color, x: base.x, z: base.z });
    u.alt = 3;
    u.mission = { phase: 'out', tx: x, tz: z, bx: base.x, bz: base.z, hover: def.hover ?? 0, strikes: def.strikes ?? 1, fireCd: 0 };
    u.path = [];
    world.units.set(u.id, u);
    bus.emit('net:spawn', { kind: 'unit', data: u.toMeta() });
    bus.news('war', `${def.icon} ${p.countryName ?? p.name} bir ${def.label} gönderdi!`);
    return { ok: true, message: `${def.icon} ${def.label} kalktı! Hedefe gidiyor.`, sfx: 'launch' };
  }

  onTick(dt, ctx) {
    const { world, bus, rng } = ctx;
    const now = Date.now();
    const missiles = ctx.engine.getSystem('missiles');

    for (const u of [...world.units.values()]) {
      const def = AIR_TYPES[u.type];
      if (!def || !u.mission) continue;
      const m = u.mission;
      u.alt += (def.alt - u.alt) * Math.min(1, dt * 0.8);
      const [tx, tz] = m.phase === 'back' ? [m.bx, m.bz] : [m.tx, m.tz];
      const dx = tx - u.x, dz = tz - u.z;
      const dist = Math.hypot(dx, dz);
      const step = def.speed * dt;

      if (m.phase === 'hover') {
        // Helikopter: hedef bölgede daireler çizip tarar
        m.hover -= dt;
        m.ang = (m.ang ?? 0) + dt * 0.8;
        u.x = m.tx + Math.cos(m.ang) * 14;
        u.z = m.tz + Math.sin(m.ang) * 14;
        u.rotY = m.ang + Math.PI;
        m.fireCd -= dt;
        if (m.fireCd <= 0) {
          m.fireCd = 0.35;
          this.gunRun(ctx, u, def);
        }
        if (m.hover <= 0) m.phase = 'back';
        continue;
      }

      if (dist > step) {
        u.x += (dx / dist) * step;
        u.z += (dz / dist) * step;
        u.rotY = Math.atan2(dx, dz);
        continue;
      }
      u.x = tx;
      u.z = tz;
      if (m.phase === 'back') {
        world.units.delete(u.id);
        bus.emit('net:remove', { kind: 'unit', id: u.id, reason: 'landed' });
        continue;
      }
      // Hedefte
      if (def.attack === 'gun') { m.phase = 'hover'; continue; }
      if (def.attack === 'nuke') {
        const owner = world.players.get(u.ownerId);
        this.bombs.push({ x: tx, z: tz, at: now + 3200, ownerId: u.ownerId });
        bus.emit('net:missile', { t: 'bomb', id: `bomb${u.id}`, x: tx, z: tz, alt: u.alt, fallMs: 3200 });
        bus.emit('net:alert', { level: 'nuclear', text: `☢️ NÜKLEER BOMBA ATILDI! ${owner?.countryName ?? owner?.name ?? ''}'ın B-2 Spirit'i`, etaMs: 3200 });
      } else if (def.attack === 'carpet') {
        // Halı bombardımanı: hedef boyunca 5 m çaplı bombalar sırayla düşer
        const dir = Math.atan2(tx - m.bx, tz - m.bz);
        for (let k = 0; k < def.strikes; k++) {
          const along = (k - def.strikes / 2) * 4.5;
          const bx = tx + Math.sin(dir) * along + (rng.next() - 0.5) * 4, bz = tz + Math.cos(dir) * along + (rng.next() - 0.5) * 4;
          this.bombs.push({ x: bx, z: bz, at: now + 900 + k * 160, ownerId: u.ownerId, small: def });
          bus.emit('net:missile', { t: 'bomb', id: `cb${u.id}_${k}`, x: bx, z: bz, alt: u.alt, fallMs: 900 + k * 160, small: 1 });
        }
      } else {
        for (let k = 0; k < m.strikes; k++) {
          const ox = (rng.next() - 0.5) * def.radius, oz = (rng.next() - 0.5) * def.radius;
          bus.emit('net:fx', { t: 'airstrike', x: tx + ox, z: tz + oz, r: def.radius, from: [u.x, u.alt, u.z] });
          missiles.blast(ctx, tx + ox, tz + oz, { radius: def.radius, damage: def.damage, label: def.label }, u.ownerId);
        }
      }
      m.phase = 'back';
    }

    // Düşen nükleer bombalar
    this.bombs = this.bombs.filter((b) => {
      if (now < b.at) return true;
      if (b.small) {
        bus.emit('net:fx', { t: 'airstrike', x: b.x, z: b.z, r: b.small.radius });
        missiles.blast(ctx, b.x, b.z, { radius: b.small.radius, damage: b.small.damage, label: b.small.label }, b.ownerId);
        return false;
      }
      const def = MISSILE_TYPES.nuclear;
      bus.emit('net:missile', { t: 'impact', id: `nuke${b.at}`, type: 'nuclear', x: b.x, z: b.z, radius: def.radius });
      missiles.blast(ctx, b.x, b.z, def, b.ownerId, { nuclear: true });
      return false;
    });

    this.airDefense(ctx, now);
  }

  gunRun(ctx, u, def) {
    const { world, bus } = ctx;
    const military = ctx.engine.getSystem('military');
    const target = military.findTarget(ctx, u, def.range, { includeAir: false });
    if (!target) return;
    bus.emit('net:fx', { t: 'shot', k: 'heli', a: [u.x, u.z], b: [target.x, target.z], ay: u.alt });
    military.hit(ctx, u, target, def.dps * 0.35);
  }

  airDefense(ctx, now) {
    const { world, bus, rng } = ctx;
    const defenses = world.buildingsWhere((b) => b.type === 'air_defense' && b.operational && b.ownerKind === 'player');
    for (const d of defenses) {
      if ((d.reloadUntil ?? 0) > now) continue;
      if ((world.players.get(d.ownerId)?.adLockUntil ?? 0) > now) continue;
      const T = adTier(d);
      const range = T.range;
      for (const u of world.units.values()) {
        const def = AIR_TYPES[u.type];
        if (!def || u.dead || (u.engagedUntil ?? 0) > now) continue;
        if (!world.atWar(d.ownerId, u.ownerId)) continue;
        if (Math.hypot(u.x - d.x, u.z - d.z) > range) continue;
        const lead = 1.5;
        const at = { x: u.x + Math.sin(u.rotY) * def.speed * lead * (u.mission?.phase === 'hover' ? 0 : 1), y: u.alt, z: u.z + Math.cos(u.rotY) * def.speed * lead * (u.mission?.phase === 'hover' ? 0 : 1) };
        const success = rng.chance(Math.min(0.97, def.adHit * (0.6 + T.hit)));
        d.reloadUntil = now + T.reload;
        u.engagedUntil = now + AIR_DEFENSE.interceptorFlightMs + 200;
        bus.emit('net:missile', { t: 'intercept', id: world.nextId('i'), missileId: u.id, from: { x: d.x, y: 8, z: d.z }, at, flightMs: AIR_DEFENSE.interceptorFlightMs, success });
        this.shots.push({ unitId: u.id, at: now + AIR_DEFENSE.interceptorFlightMs, success, pos: at, defenseOwner: d.ownerId });
        break;
      }
    }
    this.shots = this.shots.filter((s) => {
      if (now < s.at) return true;
      const u = world.units.get(s.unitId);
      if (u && s.success) {
        u.dead = true;
        world.units.delete(u.id);
        bus.emit('net:remove', { kind: 'unit', id: u.id, reason: 'shot_down' });
        bus.emit('net:missile', { t: 'destroyed', id: u.id, x: u.x, y: u.alt, z: u.z });
        const owner = world.players.get(u.ownerId);
        bus.news('war', `🛡️ ${owner?.countryName ?? owner?.name}'ın ${AIR_TYPES[u.type].label} uçağı hava savunmasınca düşürüldü!`);
      } else if (u) {
        bus.emit('net:missile', { t: 'miss', id: s.unitId, x: s.pos.x, y: s.pos.y, z: s.pos.z });
      }
      return false;
    });
  }
}
