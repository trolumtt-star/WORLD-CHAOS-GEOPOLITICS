import { FIRST_NAMES, LAST_NAMES, NPC_MAYOR_PARTIES } from '../data/names.js';

/**
 * Siyaset: her N günde bir belediye seçimi. NPC'ler mutluluklarına göre oy verir:
 * mutlu halk mevcut başkanı, mutsuz halk muhalefeti seçer. Oyuncular aday olup
 * kampanya bütçesi harcayabilir; işvereni oldukları NPC'lerden ekstra oy alırlar.
 * Kazanan oyuncu vergi oranlarını belirler ve (riskli şekilde) hazineyi yağmalayabilir.
 */
export class PoliticsSystem {
  name = 'politics';

  onDay(time, ctx) {
    if (time.day >= ctx.world.politics.nextElectionDay) this.runElection(ctx);
  }

  runElection({ world, rng, bus, config }) {
    const pol = world.politics;
    const entries = [];
    const incumbentPlayer = pol.mayor?.kind === 'player' ? world.players.get(pol.mayor.id) : null;

    entries.push({ key: 'incumbent', name: pol.mayor.name, party: pol.mayor.party ?? 'Bağımsız', kind: pol.mayor.kind, id: pol.mayor.id, incumbent: true, campaign: incumbentPlayer?.campaign ?? 0 });
    entries.push({ key: 'opposition', name: pol.opposition.name, party: pol.opposition.party, kind: 'npc', id: null, campaign: 0 });
    for (const c of pol.candidates) {
      if (incumbentPlayer && c.playerId === incumbentPlayer.id) continue;
      entries.push({ key: c.playerId, name: c.name, party: 'Bağımsız', kind: 'player', id: c.playerId, campaign: c.campaign });
    }
    const votes = Object.fromEntries(entries.map((e) => [e.key, 0]));

    for (const npc of world.npcs.values()) {
      if (npc.age < 18) continue;
      let best = null;
      let bestScore = -Infinity;
      for (const e of entries) {
        let s = rng.range(-1, 1);
        if (e.incumbent) s += (npc.happiness - 50) / 12 + npc.traits.loyalty * 0.8;
        else if (e.key === 'opposition') s += (50 - npc.happiness) / 12;
        else s += (50 - npc.happiness) / 20;
        if (e.kind === 'player') {
          s += Math.log1p(e.campaign / 300) * 0.9;
          const employer = world.buildings.get(npc.workId);
          if (employer?.ownerKind === 'player' && employer.ownerId === e.id) s += 1.5;
        }
        if (s > bestScore) { bestScore = s; best = e; }
      }
      votes[best.key]++;
    }

    const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
    const ranked = entries.map((e) => ({ ...e, votes: votes[e.key], pct: Math.round((votes[e.key] / total) * 100) }))
      .sort((a, b) => b.votes - a.votes);
    const winner = ranked[0];

    // Unvanları güncelle
    for (const p of world.players.values()) {
      if (p.isMayor) { p.isMayor = false; p.title = 'Vatandaş'; world.touchPlayer(p); }
      p.campaign = 0;
    }
    if (winner.kind === 'player') {
      const p = world.players.get(winner.id);
      if (p) { p.isMayor = true; p.title = 'Belediye Başkanı'; world.touchPlayer(p); }
    }
    if (winner.key === 'opposition') {
      pol.opposition = { name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`, party: rng.pick(NPC_MAYOR_PARTIES) };
    }
    pol.mayor = { kind: winner.kind, id: winner.id, name: winner.name, party: winner.party };
    pol.candidates = [];
    pol.nextElectionDay += config.politics.electionEveryDays;
    pol.lastResult = ranked.map((r) => ({ name: r.name, pct: r.pct }));

    const summary = ranked.map((r) => `${r.name} %${r.pct}`).join(' · ');
    bus.news('politics', `🗳️ SEÇİM SONUCU: ${summary}. Yeni belediye başkanı: ${winner.name}!`);
    bus.emit('net:alert', { level: 'info', text: `🗳️ Yeni Belediye Başkanı: ${winner.name} (%${winner.pct})` });
  }
}
