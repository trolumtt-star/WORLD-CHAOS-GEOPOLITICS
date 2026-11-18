/**
 * Diplomasi: savaş gerekçesi (3 dk) → savaş ilanı → çatışma → barış.
 * Askerler, füzeler ve uçaklar SADECE savaşta olunan ülkeye saldırır.
 */
export class DiplomacySystem {
  name = 'diplomacy';

  init(ctx) {
    this.ctx = ctx;
    this.peaceOffers = new Map(); // 'from>to' -> true
  }

  nameOf(id) {
    const p = this.ctx.world.players.get(id);
    return p ? p.countryName ?? p.name : '?';
  }

  justify(p, targetId) {
    const { world, config, bus } = this.ctx;
    const t = world.players.get(targetId);
    if (!t || t.id === p.id || !t.village) return { ok: false, error: 'Geçersiz hedef ülke.' };
    if (!p.village) return { ok: false, error: 'Önce kendi ülkeni kurmalısın.' };
    if (world.atWar(p.id, targetId)) return { ok: false, error: 'Zaten savaştasınız.' };
    const key = `${p.id}>${targetId}`;
    if (world.justifications.has(key)) return { ok: false, error: 'Gerekçe zaten hazırlanıyor.' };
    world.justifications.set(key, Date.now() + config.war.justifyMs);
    world.touchPlayer(p);
    bus.emit('net:private', { playerId: targetId, item: { category: 'war', text: `⚠️ İstihbarat: ${this.nameOf(p.id)} sana karşı savaş gerekçesi hazırlıyor!`, toast: 'warn', sfx: 'alarm' } });
    return { ok: true, message: `📜 Savaş gerekçesi hazırlanıyor. ${Math.round(config.war.justifyMs / 60000)} dakika sonra savaş ilan edebilirsin.`, sfx: 'notify' };
  }

  declare(p, targetId) {
    const { world, bus } = this.ctx;
    const key = `${p.id}>${targetId}`;
    const ready = world.justifications.get(key);
    if (!ready) return { ok: false, error: 'Önce savaş gerekçesi hazırlamalısın.' };
    if (Date.now() < ready) return { ok: false, error: `Gerekçe hazır değil (${Math.ceil((ready - Date.now()) / 1000)} sn).` };
    world.justifications.delete(key);
    world.wars.set(world.warKey(p.id, targetId), { since: world.clockHours(), attacker: p.id });
    this.touchBoth(p.id, targetId);
    bus.news('war', `⚔️ ${this.nameOf(p.id)}, ${this.nameOf(targetId)}'a SAVAŞ İLAN ETTİ!`);
    bus.emit('net:alert', { level: 'warning', text: `⚔️ ${this.nameOf(p.id)} → ${this.nameOf(targetId)}: SAVAŞ!` });
    return { ok: true, message: '⚔️ Savaş ilan edildi! Birliklerin artık düşmana saldırır.', sfx: 'siren' };
  }

  offerPeace(p, targetId) {
    const { world, rng, bus } = this.ctx;
    if (!world.atWar(p.id, targetId)) return { ok: false, error: 'Savaşta değilsiniz.' };
    const t = world.players.get(targetId);
    if (t?.isAI) {
      const mine = world.populationOf(p.id) + 1;
      const theirs = world.populationOf(targetId) + 1;
      const chance = Math.min(0.85, 0.25 + 0.4 * (mine / (mine + theirs)));
      if (!rng.chance(chance)) return { ok: true, message: `🙅 ${this.nameOf(targetId)} barışı reddetti.`, sfx: 'error' };
      this.makePeace(p.id, targetId);
      return { ok: true, message: '🕊️ Barış imzalandı!', sfx: 'success' };
    }
    this.peaceOffers.set(`${p.id}>${targetId}`, true);
    bus.emit('net:private', { playerId: targetId, item: { category: 'war', text: `🕊️ ${this.nameOf(p.id)} barış teklif ediyor. Sarayına gidip kabul edebilirsin.`, toast: 'info', sfx: 'notify' } });
    return { ok: true, message: '🕊️ Barış teklifi gönderildi.' };
  }

  acceptPeace(p, fromId) {
    if (!this.peaceOffers.has(`${fromId}>${p.id}`)) return { ok: false, error: 'Bekleyen barış teklifi yok.' };
    this.makePeace(fromId, p.id);
    return { ok: true, message: '🕊️ Barış imzalandı!', sfx: 'success' };
  }

  makePeace(a, b) {
    const { world, bus } = this.ctx;
    world.wars.delete(world.warKey(a, b));
    this.peaceOffers.delete(`${a}>${b}`);
    this.peaceOffers.delete(`${b}>${a}`);
    this.touchBoth(a, b);
    bus.news('war', `🕊️ ${this.nameOf(a)} ile ${this.nameOf(b)} barış imzaladı.`);
    bus.emit('net:alert', { level: 'info', text: `🕊️ BARIŞ: ${this.nameOf(a)} & ${this.nameOf(b)}` });
  }

  touchBoth(a, b) {
    const { world } = this.ctx;
    for (const id of [a, b]) { const p = world.players.get(id); if (p) world.touchPlayer(p); }
  }

  // Hedef geçerli mi? (füze / uçak)
  canStrike(p, x, z) {
    const owner = this.ctx.world.ownerAt(x, z);
    if (owner === 'state') return { ok: false, error: 'Tarafsız Merkez Kasaba vurulamaz.' };
    if (owner && owner !== p.id && !this.ctx.world.atWar(p.id, owner)) return { ok: false, error: `Önce ${this.nameOf(owner)}'a savaş ilan etmelisin.` };
    if (owner === p.id) return { ok: false, error: 'Kendi toprağını vuramazsın.' };
    return { ok: true };
  }

  // Ölen sivilleri saatlik bülten olarak duyur
  onHour(_t, { world, bus }) {
    if (!world.casualties) return;
    for (const [owner, n] of Object.entries(world.casualties)) {
      if (n > 0) bus.news('war', `⚰️ Çatışmalarda ${this.nameOf(owner)} topraklarında ${n} sivil hayatını kaybetti.`);
    }
    world.casualties = {};
  }
}
