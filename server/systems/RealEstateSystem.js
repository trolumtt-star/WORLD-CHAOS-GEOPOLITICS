import { setupOperations } from '../world/BuildingSetup.js';
import { homesWithRoom } from '../world/WorldGenerator.js';

/**
 * Emlak: inşaat ilerlemesi, kira tahsilatı, icra (tahliye), evsizlerin ev bulması,
 * NPC'lerin oyuncu ilanlarını satın alması, emlak değeri dalgalanması.
 */
export class RealEstateSystem {
  name = 'realEstate';

  onHour(_time, { world, rng, config, bus }) {
    for (const b of world.buildings.values()) {
      if (!b.construction) continue;
      b.construction.progress = Math.min(1, b.construction.progress + 1 / b.construction.hours);
      world.touch(b);
      if (b.construction.progress >= 1) {
        b.construction = null;
        setupOperations(b, rng, config, { fill: false });
        bus.news('build', `🏗️ ${b.name} (${world.ownerName(b)}) hizmete açıldı!`);
        bus.emit('net:fx', { t: 'built', x: b.x, z: b.z });
      }
    }
  }

  onDay(_time, { world, rng, bus }) {
    // --- Kira ---
    for (const b of world.buildings.values()) {
      if (b.category !== 'residential' || !b.operational) continue;
      const owner = world.getOwner(b);
      for (const id of [...b.residentIds]) {
        const npc = world.npcs.get(id);
        if (!npc) continue;
        if (npc.balance >= b.rentPerResident) {
          npc.balance -= b.rentPerResident;
          world.credit(b.ownerKind, owner, b.rentPerResident);
          npc.rentMissed = 0;
        } else if (++npc.rentMissed >= 2) {
          b.residentIds = b.residentIds.filter((x) => x !== id);
          npc.homeId = null;
          npc.rentMissed = 0;
          npc.happiness = Math.max(0, npc.happiness - 20);
          bus.news('estate', `⚖️ İCRA: ${npc.name}, kirasını ödeyemediği için ${b.name} binasından tahliye edildi.`);
        }
      }
    }

    // --- Evsizler ev arar ---
    const now = world.clockHours();
    for (const npc of world.npcs.values()) {
      if (npc.homeId || npc.jailedUntil > now) continue;
      const options = homesWithRoom(world).filter((h) => h.rentPerResident <= Math.max(10, npc.balance / 4));
      const home = rng.pick(options);
      if (!home) continue;
      home.residentIds.push(npc.id);
      npc.homeId = home.id;
    }

    // --- NPC'ler oyuncu ilanlarını alır ---
    for (const b of world.buildings.values()) {
      if (!b.forSale || b.ownerKind !== 'player' || b.salePrice > b.value * 1.5) continue;
      const buyer = [...world.npcs.values()].find((n) => n.balance > b.salePrice * 1.2 && n.age >= 25);
      if (!buyer || !rng.chance(0.35)) continue;
      const seller = world.getOwner(b);
      buyer.balance -= b.salePrice;
      world.credit('player', seller, b.salePrice);
      bus.news('estate', `🏷️ ${b.name}, ₺${b.salePrice.toLocaleString('tr-TR')} karşılığında ${buyer.name} tarafından satın alındı.`);
      world.setOwner(b, 'npc', buyer.id);
    }

    // --- Değer dalgalanması: suç ve radyasyon değeri düşürür ---
    for (const b of world.buildings.values()) {
      let drift = rng.range(-0.01, 0.015) - Math.min(0.03, b.crimeHeat * 0.003);
      if (world.inHazard(b.x, b.z)) drift -= 0.1;
      b.value = Math.max(500, Math.round(b.value * (1 + drift)));
      b.crimeHeat *= 0.85;
    }
  }
}
