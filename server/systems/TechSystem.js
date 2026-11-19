import { TECHS, ERAS, techCost, techBuyCost, techHours, researchChance, playerEra } from '../data/tech.js';

const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

/**
 * Teknoloji araştırması: para öde → süre dolsun → zar at (%30 + bonuslar).
 * Başarısızlıkta para gider, tekrar denemen gerekir. Aynı anda tek araştırma.
 */
export class TechSystem {
  name = 'tech';

  start(ctx, player, techId) {
    const { world, config, bus } = ctx;
    const t = TECHS[techId];
    if (!t) return { ok: false, error: 'Bilinmeyen teknoloji.' };
    if (player.techs.includes(techId)) return { ok: false, error: 'Bunu zaten biliyorsun.' };
    if (player.research) return { ok: false, error: `Zaten ${TECHS[player.research.techId].label} araştırılıyor.` };
    const missing = t.requires.filter((r) => !player.techs.includes(r));
    if (missing.length) return { ok: false, error: `Önce şunlar gerekli: ${missing.map((m) => TECHS[m].label).join(', ')}` };
    const cost = techCost(techId, config);
    if (player.balance < cost) return { ok: false, error: `Araştırma bütçesi yetersiz (${tl(cost)}).` };
    player.balance -= cost;
    const hours = techHours(techId);
    player.research = { techId, hoursLeft: hours, total: hours };
    world.touchPlayer(player);
    bus.emit('net:private', { playerId: player.id, item: { category: 'tech', text: `🔬 ${t.label} araştırması başladı (${hours} saat, başarı şansı %${Math.round(researchChance(player) * 100)}).` } });
    return { ok: true, message: `🔬 ${t.icon} ${t.label} araştırması başladı! ${hours} oyun saati sonra sonuç belli olacak.`, sfx: 'build' };
  }

  /** Şansa bırakma: yüksek bedeli öde, teknoloji anında senin */
  buy(ctx, player, techId) {
    const { world, config, bus } = ctx;
    const t = TECHS[techId];
    if (!t) return { ok: false, error: 'Bilinmeyen teknoloji.' };
    if (player.techs.includes(techId)) return { ok: false, error: 'Bunu zaten biliyorsun.' };
    const missing = t.requires.filter((r) => !player.techs.includes(r));
    if (missing.length) return { ok: false, error: `Önce şunlar gerekli: ${missing.map((m) => TECHS[m].label).join(', ')}` };
    const cost = techBuyCost(techId, config);
    if (player.balance < cost) return { ok: false, error: `${t.label} için ${tl(cost)} gerekiyor.` };
    player.balance -= cost;
    if (player.research?.techId === techId) player.research = null;
    const before = playerEra(player);
    player.techs.push(techId);
    world.touchPlayer(player);
    bus.news('tech', `🔬 ${player.name}, ${t.icon} ${t.label} teknolojisini satın aldı!`);
    if (playerEra(player) > before) { const e = ERAS[playerEra(player)]; bus.emit('net:alert', { level: 'info', text: `${e.icon} ${player.name} ${e.label} çağına geçti! (${e.years})` }); }
    return { ok: true, message: `✅ ${t.icon} ${t.label} artık senin! (−${tl(cost)})`, sfx: 'success' };
  }

  onHour(_time, { world, rng, bus }) {
    for (const p of world.players.values()) {
      const r = p.research;
      if (!r) continue;
      r.hoursLeft--;
      world.touchPlayer(p);
      if (r.hoursLeft > 0) continue;
      const t = TECHS[r.techId];
      p.research = null;
      if (rng.chance(researchChance(p))) {
        const before = playerEra(p);
        p.techs.push(r.techId);
        const after = playerEra(p);
        bus.news('tech', `🔬 ${p.name}, ${t.icon} ${t.label} buldu!`);
        bus.emit('net:private', { playerId: p.id, item: { category: 'tech', text: `✅ BAŞARILI! ${t.icon} ${t.label} artık senin.`, toast: 'ok', sfx: 'success' } });
        if (after > before) {
          const e = ERAS[after];
          bus.emit('net:alert', { level: 'info', text: `${e.icon} ${p.name} ${e.label} çağına geçti! (${e.years})` });
        }
      } else {
        bus.emit('net:private', { playerId: p.id, item: { category: 'tech', text: `❌ ${t.label} deneyi başarısız oldu. Bilim insanların tekrar denemek istiyor!`, toast: 'err', sfx: 'error' } });
      }
    }
  }
}
