/**
 * İhtiyaçlar: açlık, evde yemek, mutluluk, açlıktan/radyasyondan ölüm, mutsuzluk göçü.
 */
export class NeedsSystem {
  name = 'needs';

  onHour(time, { world, config, rng, bus }) {
    const now = time.totalHours;
    const taxPain = Math.max(0, world.policy.incomeTax - 0.15) * 4 + Math.max(0, world.policy.salesTax - 0.1) * 2;

    for (const npc of [...world.npcs.values()]) {
      const sleeping = npc.activity === 'sleep';
      npc.hunger = Math.min(100, npc.hunger + (sleeping ? 2 : config.npc.hungerPerHour));

      const atHome = npc.state === 'inside' && npc.homeId && npc.locationId === npc.homeId;
      if (atHome && npc.groceries > 0 && npc.hunger >= config.npc.eatAtHomeAbove) {
        npc.groceries--;
        npc.hunger = Math.max(0, npc.hunger - 45);
      }
      // Personel yemeği: gıda satan iş yerinde çalışan, rafından bir porsiyon yer
      if (npc.state === 'inside' && npc.locationId === npc.workId && npc.hunger >= 50) {
        const food = world.buildings.get(npc.workId)?.stock.food;
        if (food?.qty >= 1) {
          food.qty -= 1;
          npc.hunger = Math.max(0, npc.hunger - 50);
        }
      }
      if (npc.jailedUntil > now) npc.hunger = Math.min(npc.hunger, 50); // cezaevi yemeği

      let d = 0;
      if (npc.hunger > 75) d -= 3;
      else if (npc.hunger < 40) d += 0.3;
      if (npc.job === 'unemployed') d -= 0.4;
      if (!npc.homeId) d -= 1;
      if (npc.jailedUntil > now) d -= 1;
      d -= taxPain;
      npc.happiness = Math.max(0, Math.min(100, npc.happiness + d));

      // Açlıktan ölüm (18 saat %100 açlık)
      if (npc.hunger >= 100) {
        npc.starving = (npc.starving ?? 0) + 1;
        if (npc.starving >= 18) {
          bus.news('death', `💀 ${npc.name} açlıktan hayatını kaybetti.`);
          world.killNpc(npc, 'açlık');
          continue;
        }
      } else npc.starving = 0;

      // Radyasyon
      if (world.hazards.length && world.inHazard(npc.x, npc.z) && rng.chance(0.25)) {
        world.killNpc(npc, 'radyasyon');
      }
    }
  }
}
