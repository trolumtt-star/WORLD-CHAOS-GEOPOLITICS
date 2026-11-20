/**
 * Suç & hukuk:
 *  - Çaresiz NPC (parasız + mutsuz + işsiz + aç) ve kanuna saygısı düşükse gece soygun planlar
 *  - Polis memurları olay yerine koşar; tutuklama şansı görevdeki polis sayısına bağlı
 *  - Oyuncu soygunu aranma seviyesi verir; her saat yakalanma riski, yakalanınca cezaevine ışınlanır
 */
export class CrimeSystem {
  name = 'crime';

  init(ctx) {
    this.ctx = ctx;
    ctx.bus.on('npc:arrived', ({ npc, building }) => {
      if (npc.activity === 'crime') this.npcRobbery(npc, building);
    });
  }

  policeOnDuty() {
    let n = 0;
    for (const npc of this.ctx.world.npcs.values()) {
      if (npc.job === 'police' && (npc.activity === 'work' || npc.activity === 'respond')) n++;
    }
    return n;
  }

  dispatchPolice(building, count = 2) {
    const { world, engine } = this.ctx;
    const brain = engine.getSystem('npcBrain');
    const now = world.clockHours();
    const cops = [...world.npcs.values()].filter((n) => n.job === 'police' && n.activity === 'work').slice(0, count);
    for (const cop of cops) {
      cop.plan.respondTo = building.id;
      cop.plan.respondUntil = now + 2;
      brain.decide(cop, world.hour(), this.ctx);
    }
  }

  npcRobbery(npc, b) {
    const { world, rng, bus, engine } = this.ctx;
    npc.plan.crimeTargetId = null;
    if (!b.operational || b.balance <= 0) return;
    const steal = Math.round(Math.min(b.balance, rng.range(80, 300) * (npc.armed ? 2 : 1)));
    b.balance -= steal;
    npc.balance += steal;
    b.crimeHeat += 1;
    b.lastRobbedAt = Date.now();
    npc.criminalRecord++;
    bus.news('crime', `🚨 ${b.name} soyuldu! ₺${steal.toLocaleString('tr-TR')} çalındı.${npc.armed ? ' Fail silahlıydı.' : ''}`);
    // Mesaide polis oyuncu varsa soyguncu kaçar, oyuncular kovalar
    const life = engine.getSystem('life');
    if ([...world.players.values()].some((p) => life.isCopOnDuty(p))) {
      life.startIncident(npc, b, steal);
      return;
    }
    bus.emit('net:fx', { t: 'alarm', x: b.x, z: b.z });
    this.dispatchPolice(b);

    const chance = Math.min(0.9, 0.2 + 0.15 * this.policeOnDuty());
    if (rng.chance(chance)) {
      npc.balance -= steal;
      world.treasury += steal;
      npc.jailedUntil = world.clockHours() + 24;
      bus.news('crime', `👮 Soyguncu ${npc.name} yakalandı ve 24 saatliğine cezaevine gönderildi.`);
      engine.getSystem('npcBrain').decide(npc, world.hour(), this.ctx);
    } else {
      bus.news('crime', `🏃 ${b.name} soyguncusu karanlıkta kayboldu...`);
    }
  }

  onDay(_time, { world, rng }) {
    return; // Ülke modunda NPC soygunu yok
    const businesses = world.buildingsWhere((b) => b.category === 'commercial' && b.operational);
    for (const npc of world.npcs.values()) {
      const desperation = (npc.balance < 60) + (npc.happiness < 35) + (npc.job === 'unemployed') + (npc.hunger > 70);
      if (npc.traits.lawfulness >= 0.45 || desperation < 2) continue;
      if (!rng.chance(0.35 + (npc.armed ? 0.2 : 0))) continue;
      const sample = rng.shuffle(businesses).slice(0, 5).sort((a, b) => b.balance - a.balance);
      npc.plan.crimeTargetId = sample[0]?.id ?? null;
    }
  }

  onHour(time, { world, rng, bus }) {
    const now = time.totalHours;
    const police = this.policeOnDuty();
    for (const p of world.players.values()) {
      if (p.jailedUntil > now) continue;
      if (p.wasJailed) {
        p.wasJailed = false;
        bus.news('crime', `🔓 ${p.name} cezaevinden tahliye edildi.`);
        world.touchPlayer(p);
      }
      if (p.wanted <= 0 || p.isAI) continue;
      const uw = this.ctx.engine.getSystem('underworld');
      const chased = uw?.chases.has(p.id);
      // Gizli zar yok: devriye seni görürse peşine düşer (dışarıdaysan, gündüz daha sık)
      if (!chased && !p.inside && p.online && rng.chance(0.08 * p.wanted * (police > 0 ? 1 : 0.4))) { uw?.startChase(p); continue; }
      if (chased) continue;
      // Kovalanmıyorsan aranman hızla düşer (saklanırsan daha da hızlı)
      p.wantedDecay = (p.wantedDecay ?? 0) + 1 + (p.inside ? 1 : 0) + (p.hidingBonus ?? 0);
      p.hidingBonus = 0;
      if (p.wantedDecay >= 2) {
        p.wanted--;
        p.wantedDecay = 0;
        world.touchPlayer(p);
      }
    }
  }

  arrestPlayer(p) {
    const { world, config, bus } = this.ctx;
    // Hakim oyuncu varsa cezayı mahkeme verir
    if (this.ctx.engine.getSystem('society')?.openCase(p)) return;
    const prison = world.prison;
    const hours = Math.max(2, p.wanted * config.crime.jailHoursPerWanted);
    const fine = Math.round(p.balance * 0.1);
    p.balance -= fine;
    world.treasury += fine;
    p.jailedUntil = world.clockHours() + hours;
    p.wasJailed = true;
    p.wanted = 0;
    if (prison) {
      p.x = prison.door.x;
      p.z = prison.door.z;
      bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z });
    }
    world.touchPlayer(p);
    bus.news('crime', `🚔 ${p.name} polis tarafından yakalandı! ${hours} saat hapis + ₺${fine.toLocaleString('tr-TR')} para cezası.`);
  }
}
