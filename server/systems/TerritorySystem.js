import { Unit } from '../entities/Unit.js';
import { Building } from '../entities/Building.js';
import { setupOperations } from '../world/BuildingSetup.js';
import { hasFeature, playerEra } from '../data/tech.js';

const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
export const TERRAIN_LABELS = { p: '🌾 Ova', f: '🌲 Orman', m: '⛰️ Dağ', w: '🌊 Nehir' };

/**
 * Toprak genişletme:
 *  1) Kaşif gönder → kaşif haritada yürür, parsele varınca orayı keşfeder (sahibi var mı?)
 *  2) Keşfedilmiş, boş ve sınırına komşu parseli parasını ödeyip sahiplen → sınır çiti örülür
 * Ova/orman parselleri inşaata açık arsa olur; dağ sahiplenilir ama inşaat yapılamaz; nehir alınamaz.
 */
export class TerritorySystem {
  name = 'territory';

  claimCost(ctx, player) {
    const { world, config } = ctx;
    const owned = world.ownedTileCount(player.id);
    return Math.round((config.territory.baseClaimCost * (1 + 0.1 * owned) * (1 + 0.35 * (playerEra(player) - 1))) / 10) * 10;
  }

  isAdjacent(world, t, playerId) {
    return world.neighbors(t).some((n) => n.owner === playerId);
  }

  scout(ctx, player, i, j) {
    const { world, config, bus } = ctx;
    const t = world.tile(i, j);
    if (!t) return { ok: false, error: 'Geçersiz parsel.' };
    if (t.exploredBy.has(player.id)) return { ok: false, error: 'Burası zaten keşfedildi.' };
    if ([...world.units.values()].some((u) => u.type === 'scout' && u.ownerId === player.id && u.task?.i === i && u.task?.j === j)) {
      return { ok: false, error: 'Bir kaşifin zaten yolda.' };
    }
    const hall = world.buildings.get(player.homeId);
    if (!hall) return { ok: false, error: 'Köy konağın yok.' };
    const cost = config.territory.scoutCost;
    if (player.balance < cost) return { ok: false, error: 'Kaşife verecek paran yok.' };
    player.balance -= cost;
    world.touchPlayer(player);
    const target = world.lotCenter(i, j);
    const u = new Unit({ id: world.nextId('u'), type: 'scout', ownerId: player.id, color: player.color, x: hall.door.x, z: hall.door.z });
    u.path = [{ x: target.x, z: target.z }];
    u.task = { i, j };
    u.speedMul = hasFeature(player, 'fast_scout') ? 2 : 1;
    world.units.set(u.id, u);
    bus.emit('net:spawn', { kind: 'unit', data: u.toMeta() });
    return { ok: true, message: `🧭 Kaşif yola çıktı! Varınca haber verecek.`, sfx: 'whoosh' };
  }

  claim(ctx, player, i, j) {
    const { world, rng, config, bus } = ctx;
    const t = world.tile(i, j);
    if (!t) return { ok: false, error: 'Geçersiz parsel.' };
    if (t.owner) return { ok: false, error: 'Bu toprağın zaten bir sahibi var.' };
    if (t.terrain === 'w') return { ok: false, error: 'Nehir sahiplenilemez.' };
    if (!t.exploredBy.has(player.id)) return { ok: false, error: 'Önce kaşif gönderip burayı keşfetmelisin.' };
    if (!this.isAdjacent(world, t, player.id)) return { ok: false, error: 'Sadece kendi sınırına komşu parselleri alabilirsin.' };
    const cost = this.claimCost(ctx, player);
    if (player.balance < cost) return { ok: false, error: `Yetersiz bakiye (${tl(cost)} gerekli).` };
    player.balance -= cost;
    world.setTileOwner(t, player.id);

    if (t.terrain !== 'm') {
      const c = world.lotCenter(i, j);
      const land = new Building({
        id: world.nextId('b'), type: 'land', name: `Arsa · ${player.name} Toprakları`, address: `Parsel ${i}-${j}`,
        x: c.x, z: c.z, width: 32, depth: 32, height: 0, door: { x: c.x, z: c.z + world.blockSize / 2 }, value: Math.round(cost * 0.8), variant: rng.int(0, 3),
      });
      land.wasForest = t.terrain === 'f';
      setupOperations(land, rng, config, { fill: false });
      world.addBuilding(land);
      world.setOwner(land, 'player', player.id);
    }
    world.touchPlayer(player);
    bus.news('estate', `🚩 ${player.name} topraklarını genişletti (${world.ownedTileCount(player.id)} parsel).`);
    return { ok: true, message: `🚩 Sınır örüldü! Yeni toprak senin.${t.terrain === 'm' ? ' (Dağa inşaat yapılamaz)' : ' Şimdi üstüne inşaat yapabilirsin.'}`, sfx: 'build' };
  }

  onTick(_dt, { world, bus }) {
    for (const u of [...world.units.values()]) {
      if (u.type !== 'scout' || u.path.length) continue;
      const t = world.tile(u.task.i, u.task.j);
      const p = world.players.get(u.ownerId);
      world.units.delete(u.id);
      bus.emit('net:remove', { kind: 'unit', id: u.id, reason: 'done' });
      if (!t || !p) continue;
      t.exploredBy.add(p.id);
      const owner = t.owner === 'state' ? 'Merkez Kasaba' : t.owner ? world.players.get(t.owner)?.name ?? 'başka biri' : null;
      const adj = !t.owner && this.isAdjacent(world, t, p.id);
      const text = t.terrain === 'w'
        ? `🧭 Kaşif raporu (${t.i}-${t.j}): Burası nehir, yerleşilemez.`
        : owner
          ? `🧭 Kaşif raporu (${t.i}-${t.j}): Bu topraklar ${owner}'a ait!`
          : `🧭 Kaşif raporu (${t.i}-${t.j}): ${TERRAIN_LABELS[t.terrain]} BOŞ!${adj ? ' Hemen sahiplenebilirsin.' : ' Ama sınırına komşu değil.'}`;
      bus.emit('net:private', { playerId: p.id, item: { category: 'estate', text, toast: owner ? 'warn' : 'ok', sfx: 'notify', tile: { i: t.i, j: t.j } } });
      world.touchPlayer(p);
    }
  }
}
