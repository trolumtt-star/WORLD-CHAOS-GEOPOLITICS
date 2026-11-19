/**
 * Diplomasi: savaş gerekçesi (3 dk) → savaş ilanı → çatışma → barış.
 * Askerler, füzeler ve uçaklar SADECE savaşta olunan ülkeye saldırır.
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

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
    if (p.overlordId === targetId) return { ok: false, error: `🎎 ${this.nameOf(targetId)} senin efendin. Önce sarayında bağımsızlığını satın almalısın.` };
    if (t.overlordId === p.id) return { ok: false, error: `${this.nameOf(targetId)} zaten senin kuklan.` };
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
    const fee = p.isAI ? 0 : Math.round(this.ctx.config.costs.declareWar * (world.society?.econ.mul ?? 1));
    if (p.balance < fee) return { ok: false, error: `⚔️ Seferberlik masrafı ${tl(fee)} (asker toplama, cephane, ikmal). Paran yetmiyor.` };
    p.balance -= fee;
    world.justifications.delete(key);
    world.wars.set(world.warKey(p.id, targetId), { since: world.clockHours(), attacker: p.id });
    this.touchBoth(p.id, targetId);
    bus.news('war', `⚔️ ${this.nameOf(p.id)}, ${this.nameOf(targetId)}'a SAVAŞ İLAN ETTİ!`);
    bus.emit('net:alert', { level: 'warning', text: `⚔️ ${this.nameOf(p.id)} → ${this.nameOf(targetId)}: SAVAŞ!` });
    return { ok: true, message: `⚔️ Savaş ilan edildi! (Seferberlik −${tl(fee)}) Savaş sürdükçe askerlerin saatlik yemek/yakıt masrafı hazineden düşer.`, sfx: 'siren' };
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

  // ------------------------------------------------------------------ FETİH
  capitalOf(id) {
    for (const b of this.ctx.world.buildings.values()) if (b.type === 'town_hall' && b.ownerKind === 'player' && b.ownerId === id && b.capitalOf === id) return b;
    const p = this.ctx.world.players.get(id);
    const h = p && this.ctx.world.buildings.get(p.homeId);
    return h?.type === 'town_hall' && h.ownerId === id ? h : null;
  }

  /** Başkent kuşatması: sarayın 60 m çevresinde en az 3 askerin var ve hiç savunan asker yok, ya da saray yıkılmış */
  siege(attackerId, targetId) {
    const { world } = this.ctx;
    const hall = this.capitalOf(targetId);
    if (!world.atWar(attackerId, targetId) || !hall) return { ok: false, mine: 0, theirs: 0, hall };
    let mine = 0, theirs = 0;
    for (const u of world.units.values()) {
      if (u.def.air || u.def.combat === false) continue;
      if (Math.hypot(u.x - hall.x, u.z - hall.z) > 60) continue;
      if (u.ownerId === attackerId) mine++;
      else if (u.ownerId === targetId) theirs++;
    }
    return { ok: hall.destroyed ? mine >= 1 || theirs === 0 : mine >= 3 && theirs === 0, mine, theirs, hall, destroyed: hall.destroyed };
  }

  conquer(p, targetId, mode) {
    const { world, bus } = this.ctx;
    const t = world.players.get(targetId);
    if (!t?.village) return { ok: false, error: 'Geçersiz hedef.' };
    const s = this.siege(p.id, targetId);
    if (!s.ok) return { ok: false, error: `Başkent henüz düşmedi: sarayın çevresinde ${s.mine}/3 askerin var, ${s.theirs} savunan asker kaldı. (Ya da sarayı yık.)` };
    const name = this.nameOf(targetId);
    this.makePeace(p.id, targetId);
    if (mode === 'puppet') {
      t.overlordId = p.id;
      for (const k of world.warsOf(targetId)) if (k !== p.id) this.makePeace(targetId, k);
      bus.news('war', `🎎 ${name}, ${this.nameOf(p.id)}'ın KUKLA DEVLETİ oldu! Her gün vergi ödeyecek.`);
      bus.emit('net:alert', { level: 'warning', text: `🎎 ${name} artık ${this.nameOf(p.id)}'ın kuklası!` });
      bus.emit('net:private', { playerId: targetId, item: { category: 'war', text: `🎎 Teslim oldun! Artık ${this.nameOf(p.id)}'ın kuklasısın: her gün hazinenin %15'ini vergi olarak ödeyeceksin. Sarayından bağımsızlığını satın alabilirsin.`, toast: 'err', sfx: 'alarm' } });
      this.touchBoth(p.id, targetId);
      return { ok: true, message: `🎎 ${name} artık kuklan! Her sabah sana vergi ödeyecek.`, sfx: 'success' };
    }
    return this.annex(p, t);
  }

  annex(p, t) {
    const { world, bus, rng } = this.ctx;
    const name = this.nameOf(t.id);
    let tiles = 0, buildings = 0, people = world.populationOf(t.id);
    for (const tile of world.tiles) if (tile.owner === t.id) { world.setTileOwner(tile, p.id); tiles++; }
    for (const b of [...world.buildings.values()]) {
      if (b.ownerKind !== 'player' || b.ownerId !== t.id) continue;
      world.setOwner(b, 'player', p.id);
      if (b.type === 'town_hall') { b.name = `${t.countryName ?? 'Eski'} Valiliği`; b.capitalOf = null; }
      world.touch(b);
      buildings++;
    }
    for (const u of [...world.units.values()]) if (u.ownerId === t.id) { world.units.delete(u.id); bus.emit('net:remove', { kind: 'unit', id: u.id, reason: 'disbanded' }); }
    for (const k of world.warsOf(t.id)) world.wars.delete(world.warKey(t.id, k));
    for (const k of [...world.justifications.keys()]) if (k.startsWith(`${t.id}>`) || k.endsWith(`>${t.id}`)) world.justifications.delete(k);
    for (const o of world.players.values()) if (o.overlordId === t.id) { o.overlordId = null; world.touchPlayer(o); }
    // Yenilen lider, fatihin vatandaşı olur
    const houses = world.buildingsWhere((b) => b.operational && b.category === 'residential' && world.ownerAt(b.x, b.z) === p.id);
    t.village = null;
    t.overlordId = null;
    t.research = null;
    t.citizenOf = p.id;
    t.citizenName = p.countryName;
    t.homeId = houses.length ? rng.pick(houses).id : null;
    t.title = 'Sürgün Lider';
    t.formerCountry = t.countryName;
    t.countryName = null;
    if (t.inside) { t.inside = null; }
    world.touchPlayer(t);
    world.touchPlayer(p);
    bus.news('war', `🏴 ${this.nameOf(p.id)}, ${name}'ı İLHAK ETTİ! ${tiles} parsel, ${buildings} bina ve ${people} kişilik nüfus el değiştirdi.`);
    bus.emit('net:alert', { level: 'warning', text: `🏴 ${name} haritadan silindi! (${this.nameOf(p.id)} ilhak etti)` });
    bus.emit('net:private', { playerId: t.id, item: { category: 'war', text: `🏴 Ülken ilhak edildi. Artık ${p.countryName} vatandaşısın. Sınırlardan uzaklaşıp yeniden ülke kurabilirsin.`, toast: 'err', sfx: 'alarm' } });
    return { ok: true, message: `🏴 ${name} ilhak edildi! +${tiles} parsel, +${buildings} bina, +${people} nüfus.`, sfx: 'build' };
  }

  independence(p) {
    const { world, bus } = this.ctx;
    const lord = world.players.get(p.overlordId);
    if (!lord) return { ok: false, error: 'Zaten bağımsızsın.' };
    const cost = this.independenceCost(p);
    if (p.balance < cost) return { ok: false, error: `Bağımsızlık bedeli ₺${cost.toLocaleString('tr-TR')}.` };
    p.balance -= cost;
    lord.balance += cost;
    p.overlordId = null;
    this.touchBoth(p.id, lord.id);
    bus.news('war', `🗽 ${this.nameOf(p.id)}, ${this.nameOf(lord.id)}'a ₺${cost.toLocaleString('tr-TR')} ödeyerek BAĞIMSIZLIĞINI kazandı!`);
    return { ok: true, message: '🗽 Bağımsızsın!', sfx: 'success' };
  }

  release(p, puppetId) {
    const t = this.ctx.world.players.get(puppetId);
    if (t?.overlordId !== p.id) return { ok: false, error: 'Bu ülke senin kuklan değil.' };
    t.overlordId = null;
    this.touchBoth(p.id, t.id);
    this.ctx.bus.news('war', `🗽 ${this.nameOf(p.id)}, kuklası ${this.nameOf(t.id)}'ı serbest bıraktı.`);
    return { ok: true, message: `${this.nameOf(t.id)} serbest.` };
  }

  independenceCost(p) { return 15000 * Math.max(1, p.era ?? 1); }

  // Kuklalar her gün hazinelerinin %15'ini efendiye öder
  onDay(_t, { world, bus }) {
    for (const p of world.players.values()) {
      const lord = world.players.get(p.overlordId);
      if (!lord || !p.village) { if (p.overlordId && !lord) p.overlordId = null; continue; }
      const tax = Math.max(0, Math.round(p.balance * 0.15));
      p.balance -= tax;
      lord.balance += tax;
      this.touchBoth(p.id, lord.id);
      if (tax > 0) {
        bus.emit('net:private', { playerId: lord.id, item: { category: 'war', text: `🎎 Kuklan ${this.nameOf(p.id)} günlük vergisini ödedi: +₺${tax.toLocaleString('tr-TR')}`, toast: 'ok', sfx: 'cash' } });
        bus.emit('net:private', { playerId: p.id, item: { category: 'war', text: `🎎 ${this.nameOf(lord.id)}'a günlük vergi ödendi: -₺${tax.toLocaleString('tr-TR')}`, toast: 'warn' } });
      }
    }
  }

  // Hedef geçerli mi? (füze / uçak)
  canStrike(p, x, z) {
    const owner = this.ctx.world.ownerAt(x, z);
    const pres = this.ctx.world.republic?.presidentId;
    if (owner === 'state' && !(pres && this.ctx.world.atWar(p.id, pres))) return { ok: false, error: 'Tarafsız Merkez Kasaba vurulamaz.' };
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
