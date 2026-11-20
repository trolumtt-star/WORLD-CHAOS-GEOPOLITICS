/**
 * SİBER HAREKÂT — Ülke Sarayındaki bilgisayardan başka ülkelere hack.
 *  - 📡 Hava savunmasını kilitle: 3 dk boyunca hedefin tüm hava savunması kör.
 *  - 🏦 Banka hesabını kilitle: 2 dk harcama yapamaz + bakiyesinin %10'u çalınır.
 *  - 📱 Sosyal medya dezenformasyonu: %25 şans; tutarsa 10 dk isyan (gelir yarı, mutluluk çöker, halk kaçar).
 * Başarısız olursa hedef kimin saldırdığını öğrenir. Siber Güvenlik Merkezi şansı düşürür.
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const fail = (error) => ({ ok: false, error });
const MIN = 60 * 1000;

export const HACK_OPS = {
  ad:   { label: '📡 Hava Savunmasını Kilitle', cost: 250000, chance: 0.6,  cooldown: 15 * MIN, dur: 3 * MIN,  desc: '3 dakika boyunca hedefin hava savunması füze ve uçak düşüremez.' },
  bank: { label: '🏦 Bankayı Kilitle + %10 Çal', cost: 150000, chance: 0.5,  cooldown: 20 * MIN, dur: 2 * MIN,  desc: '2 dakika hedef para harcayamaz, kasasının %10\'u sana geçer (en çok ₺5.000.000).' },
  fake: { label: '📱 Sahte Paylaşım / İç Karışıklık', cost: 100000, chance: 0.25, cooldown: 15 * MIN, dur: 10 * MIN, desc: '%25 ihtimalle tutar: 10 dakika isyan — gelir yarıya iner, mutluluk çöker, halk ülkeyi terk eder.' },
};

export class HackSystem {
  name = 'hack';

  init(ctx) { this.ctx = ctx; }

  say(p, text, toast = 'info', sfx) { this.ctx.bus.emit('net:private', { playerId: p.id, item: { category: 'politics', text, toast, sfx } }); }

  /** Siber Güvenlik Merkezi sayısına göre savunma çarpanı */
  shield(target) {
    const n = this.ctx.world.buildingsWhere((b) => b.type === 'cyber_center' && b.operational && b.ownerKind === 'player' && b.ownerId === target.id).length;
    return Math.pow(0.7, Math.min(4, n));
  }

  info(p) {
    const now = Date.now();
    const targets = [...this.ctx.world.players.values()].filter((t) => t.id !== p.id && t.village)
      .map((t) => ({ id: t.id, name: t.name, country: t.countryName, ai: !!t.isAI, shield: Math.round((1 - this.shield(t)) * 100) }));
    const ops = Object.entries(HACK_OPS).map(([k, o]) => ({ key: k, ...o, ready: Math.max(0, Math.round(((p.hackCd?.[k] ?? 0) - now) / 1000)) }));
    return { targets, ops };
  }

  run(p, { op, targetId }) {
    const { world, rng, bus } = this.ctx;
    const O = HACK_OPS[op];
    if (!O) return fail('Böyle bir siber harekât yok.');
    if (!p.village) return fail('Önce bir ülken olmalı.');
    const t = world.players.get(targetId);
    if (!t || t.id === p.id || !t.village) return fail('Geçersiz hedef ülke.');
    const now = Date.now();
    p.hackCd = p.hackCd ?? {};
    if ((p.hackCd[op] ?? 0) > now) return fail(`Bu harekât ${Math.ceil((p.hackCd[op] - now) / 1000)} sn sonra hazır.`);
    if (p.balance < O.cost) return fail(`Yetersiz bakiye (${tl(O.cost)} gerekli).`);
    p.balance -= O.cost;
    p.hackCd[op] = now + O.cooldown;
    const chance = O.chance * this.shield(t);
    if (!rng.chance(chance)) {
      this.say(t, `🛡️ Siber saldırı püskürtüldü! Saldıran: ${p.countryName} (${p.name}) — ${O.label}`, 'warn', 'error');
      bus.news('war', `🛡️ ${p.countryName}, ${t.countryName}'e siber saldırı denedi ama yakalandı!`);
      world.touchPlayer(p);
      return { ok: true, message: `❌ Saldırı başarısız (şans %${Math.round(chance * 100)}). ${t.countryName} kim olduğunu öğrendi!`, sfx: 'error' };
    }
    let msg;
    if (op === 'ad') {
      t.adLockUntil = now + O.dur;
      this.say(t, '🚨 HAVA SAVUNMAN HACKLENDİ! 3 dakika boyunca füze ve uçak düşüremezsin!', 'error', 'alarm');
      msg = `✅ ${t.countryName} hava savunması 3 dakika kilitlendi. Şimdi vur!`;
    } else if (op === 'bank') {
      const amt = Math.round(Math.min(5_000_000, Math.max(0, t.balance) * 0.1));
      t.balance -= amt; p.balance += amt;
      t.bankLockUntil = now + O.dur;
      this.say(t, `🚨 BANKA HESAPLARIN HACKLENDİ! ${tl(amt)} çalındı, 2 dakika harcama yapamazsın.`, 'error', 'alarm');
      msg = `✅ ${t.countryName} bankası kilitlendi, ${tl(amt)} hesabına geçti!`;
    } else {
      t.unrestUntil = now + O.dur;
      t.happy = Math.max(0, (t.happy ?? 60) - 40);
      t.pop = Math.round((t.pop ?? 0) * 0.95);
      this.say(t, '🔥 Sosyal medyada sahte paylaşımlar yayıldı! Ülkende İSYAN var: 10 dk gelir yarıya düştü, halk kaçıyor!', 'error', 'alarm');
      bus.news('war', `🔥 ${t.countryName} karıştı! Sosyal medyadaki sahte haberler sonrası sokaklar ayakta.`);
      msg = `✅ Dezenformasyon tuttu! ${t.countryName} 10 dakika isyanda.`;
    }
    world.touchPlayer(p); world.touchPlayer(t);
    return { ok: true, message: msg, sfx: 'cash' };
  }

  /** AI ülkeler de ara sıra hackler */
  onHour() {
    const { world, rng } = this.ctx;
    for (const ai of world.players.values()) {
      if (!ai.isAI || !ai.village || !rng.chance(0.04)) continue;
      const foes = world.warsOf(ai.id).map((id) => world.players.get(id)).filter((t) => t && !t.isAI);
      const t = foes[0];
      if (!t) continue;
      const op = rng.pick(['ad', 'bank', 'fake']);
      if (ai.balance > HACK_OPS[op].cost * 2) this.run(ai, { op, targetId: t.id });
    }
  }
}
