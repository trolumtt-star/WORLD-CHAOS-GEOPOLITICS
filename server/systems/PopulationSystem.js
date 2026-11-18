import { createRandomNpc, homesWithRoom, vacantSlots } from '../world/WorldGenerator.js';

/**
 * Nüfus: şehir mutluysa göç alır, çok mutsuz insanlar şehri terk eder.
 */
export class PopulationSystem {
  name = 'population';

  onDay(_time, ctx) {
    const { world, rng, config, bus } = ctx;
    const stats = world.stats();

    // Göç veren: dibe vurmuş NPC'ler
    let left = 0;
    for (const npc of [...world.npcs.values()]) {
      if (npc.happiness < 12 && npc.jailedUntil <= world.clockHours() && rng.chance(0.3)) {
        world.killNpc(npc, 'göç');
        left++;
      }
    }
    if (left) bus.news('population', `🧳 ${left} kişi mutsuzluk yüzünden şehri terk etti.`);

    // Göç alan
    if (world.npcs.size >= config.population.target || stats.happiness < 35) return;
    const count = rng.int(1, config.population.maxImmigrantsPerDay);
    for (let i = 0; i < count; i++) {
      const home = rng.pick(homesWithRoom(world));
      const slot = rng.pick(vacantSlots(world)) ?? null;
      const npc = createRandomNpc(world, rng, config, { home, slot, balance: rng.int(100, 600) });
      npc.plan = {};
      const loc = world.buildings.get(npc.locationId);
      loc?.occupants.add(npc.id);
      bus.emit('net:spawn', { kind: 'npc', data: npc.toMeta() });
    }
    bus.news('population', `🚌 Şehre ${count} yeni kişi taşındı. Nüfus: ${world.npcs.size}`);
  }
}
