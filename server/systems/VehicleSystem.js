import { Unit } from '../entities/Unit.js';
import { CARS, HELIS, priceOf } from '../../shared/catalogs.js';

/**
 * ARAÇLAR DÜNYADA KALIR
 *  - Arabadan inince araba park edilir (kilitli), yok olmaz. Birden fazla araban park halinde durabilir.
 *  - Park halindeki araç/helikopter vurulabilir, patlatılabilir, çalınabilir (kilitliyse zor).
 *  - Kişisel helikopter: bin, haritadan iniş yeri seç, seni oraya bırakır ve orada bekler.
 *  - Örgüt filosu: kartel araçları (görevlerde kullanılır) ve taarruz helikopterleri
 *    (gönder ya da bin: hedefi tarar/bombalar, istediğin an geri çağır).
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const fail = (error) => ({ ok: false, error });

export class VehicleSystem {
  name = 'vehicles';

  init(ctx) {
    this.ctx = ctx;
    const { world } = ctx;
    // kayıttan dönüş: uçuştakiler olduğu yere iner
    for (const u of world.units.values()) {
      if (u.type === 'pheli' || u.type === 'oheli') { u.alt = 0; u.flight = null; }
      if (u.type === 'oheli') world.units.delete(u.id);
    }
    for (const p of world.players.values()) p.flying = null;
    world.vehFor = (p) => this.privateFor(p);
  }

  get world() { return this.ctx.world; }
  mul() { return this.world.society?.econ.mul ?? 1; }
  say(pid, text, toast = 'info', sfx) { this.ctx.bus.emit('net:private', { playerId: pid?.id ?? pid, item: { category: 'estate', text, toast, sfx } }); }

  spawn(type, x, z, owner, color, extra = {}) {
    const { world, bus } = this.ctx;
    const u = new Unit({ id: world.nextId('u'), type, ownerId: owner, color, x, z });
    Object.assign(u, extra);
    if (extra.hp) { u.hp = extra.hp; u.maxHp = extra.hp; }
    world.units.set(u.id, u);
    bus.emit('net:spawn', { kind: 'unit', data: { ...u.toMeta(), tag: extra.tag, model: extra.model } });
    return u;
  }

  despawn(id, reason = 'gone') {
    if (!this.world.units.delete(id)) return;
    this.ctx.bus.emit('net:remove', { kind: 'unit', id, reason });
  }

  // ------------------------------------------------------------------ satın alma (Telefon › Galeri)
  buy(p, { kind, model, forOrg }) {
    const { world, bus } = this.ctx;
    const C = kind === 'heli' ? HELIS[model] : CARS[model];
    if (!C) return fail('Model bulunamadı.');
    const price = priceOf(C.price, this.mul());
    if (p.balance < price) return fail(`${C.label}: ${tl(price)}.`);
    if (forOrg) {
      const o = p.orgId && world.orgs?.[p.orgId];
      if (!o) return fail('Önce örgüt kur.');
      if (!C.org) return fail('Bu model örgüt filosuna uygun değil.');
      p.balance -= price;
      o.fleet = o.fleet ?? { cars: {}, helis: {} };
      const bag = kind === 'heli' ? o.fleet.helis : o.fleet.cars;
      bag[model] = (bag[model] ?? 0) + 1;
      world.touchPlayer(p);
      bus.news('crime', `🕴️ "${o.name}" filosuna ${C.label} kattı.`);
      return { ok: true, message: `${kind === 'heli' ? '🚁' : '🚙'} ${C.label} örgüt filosunda! ${kind === 'heli' ? 'Telefon › Örgüt › Hava Filosu\'ndan gönder.' : 'Görevlerde adamlar bu araçlarla gidecek.'}`, sfx: 'cash' };
    }
    const list = kind === 'heli' ? (p.helis = p.helis ?? []) : (p.cars = p.cars ?? []);
    if (list.some((x) => x.model === model && !x.until)) return fail('Bu model zaten sende.');
    p.balance -= price;
    const entry = { model };
    list.push(entry);
    // kapına teslim: yanında park halinde
    if (!p.inside) this.parkAt(p, kind, entry, p.x + 4, p.z + 3, p.rotY);
    world.touchPlayer(p);
    bus.news('estate', `${kind === 'heli' ? '🚁' : '🚗'} ${p.name} yeni ${C.label} aldı!`);
    return { ok: true, message: `${kind === 'heli' ? '🚁' : '🚗'} ${C.label} senin! ${p.inside ? 'Garajında bekliyor.' : 'Hemen yanına park edildi (kilitli).'}`, sfx: 'cash' };
  }

  parkAt(p, kind, entry, x, z, rotY = 0) {
    const C = kind === 'heli' ? HELIS[entry.model] : CARS[entry.model];
    const hp = Math.round((kind === 'heli' ? 500 : 650) * (C?.armor ?? 1));
    const u = this.spawn(kind === 'heli' ? 'pheli' : 'pcar', x, z, p.id, p.color, { model: entry.model, tag: `${p.name}`, locked: true, hp, kindV: kind });
    u.rotY = rotY;
    entry.unitId = u.id;
    return u;
  }

  unitOf(p, kind, model) {
    const list = kind === 'heli' ? p.helis : p.cars;
    const e = list?.find((x) => x.model === model);
    return e && e.unitId ? [e, this.world.units.get(e.unitId)] : [e, null];
  }

  // ------------------------------------------------------------------ araba: bin / park / kilit / çal
  /** Park halindeki arabana bin (yakınında olmalısın); park halinde değilse garajdan gelir */
  board(p, model) {
    const [e, u] = this.unitOf(p, 'car', model);
    if (!e) return fail('Bu araba sende yok.');
    if (u) {
      if (Math.hypot(u.x - p.x, u.z - p.z) > 9) return fail(`🚗 ${CARS[model].label} park ettiğin yerde duruyor. Yanına git (Telefon › Galeri'den haritada göster).`);
      p.x = u.x; p.z = u.z; p.rotY = u.rotY;
      this.ctx.bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z, rotY: p.rotY });
      this.despawn(u.id);
      e.unitId = null;
    }
    return null; // devam: SocietySystem.drive sürmeyi başlatır
  }

  /** Arabadan in: araç olduğu yerde kilitli park edilir */
  parkCar(p) {
    if (!p.driving) return;
    const e = (p.cars ?? []).find((x) => x.model === p.driving);
    if (e && !e.until) this.parkAt(p, 'car', e, p.x + Math.cos(p.rotY) * 2.2, p.z - Math.sin(p.rotY) * 2.2, p.rotY);
  }

  lock(p, { unitId }) {
    const u = this.world.units.get(unitId);
    if (!u || u.ownerId !== p.id || !u.def?.keep) return fail('Bu araç senin değil.');
    u.locked = !u.locked;
    return { ok: true, message: u.locked ? '🔒 Kilitlendi.' : '🔓 Kilit açıldı.', sfx: 'click', locked: u.locked };
  }

  steal(p, { unitId }) {
    const { world, bus, engine } = this.ctx;
    const u = world.units.get(unitId);
    if (!u || !u.def?.keep) return fail('Burada araç yok.');
    if (u.ownerId === p.id) return fail('Kendi aracın, bin!');
    if (p.inside || p.driving || p.flying) return fail('Şu an olmaz.');
    if (Math.hypot(u.x - p.x, u.z - p.z) > 6) return fail('Araca yaklaş.');
    const kind = u.kindV ?? (u.type === 'pheli' ? 'heli' : 'car');
    const C = kind === 'heli' ? HELIS[u.model] : CARS[u.model];
    p.wanted = Math.min(5, (p.wanted ?? 0) + 1);
    world.logCrime?.(p, `Araç hırsızlığı: ${C?.label}`);
    const owner = world.players.get(u.ownerId);
    if (u.locked && Math.random() > 0.35) {
      bus.emit('net:fx', { t: 'alarm', x: u.x, z: u.z });
      if (owner) this.say(owner, `🚨 ${C?.label} aracının alarmı çaldı! ${p.name} çalmaya çalıştı.`, 'warn', 'alarm');
      engine.getSystem('underworld')?.startChase(p, true);
      return fail('🚨 Kilit kırılamadı, alarm çaldı! Polis geliyor.');
    }
    this.transfer(u, p, kind);
    p.wanted = Math.min(5, p.wanted + 1);
    if (owner) this.say(owner, `🚗💨 ${C?.label} aracın ÇALINDI! Hırsız: ${p.name}`, 'err', 'alarm');
    bus.news('crime', `🚗💨 ${owner?.name ?? 'Birinin'} ${C?.label} aracı çalındı!`);
    if (kind === 'car') { engine.getSystem('society').drive(p, { model: u.model }); }
    return { ok: true, message: `😈 ${C?.label} artık senin! ${kind === 'car' ? 'Gaza bas!' : 'Helikopter senin.'}`, sfx: 'success' };
  }

  /** Aracı yeni sahibine geçir (çalındı) */
  transfer(u, to, kind) {
    const { world } = this.ctx;
    const owner = world.players.get(u.ownerId);
    const key = kind === 'heli' ? 'helis' : 'cars';
    if (owner) owner[key] = (owner[key] ?? []).filter((x) => x.unitId !== u.id);
    this.despawn(u.id);
    if (to) {
      to[key] = (to[key] ?? []).filter((x) => x.model !== u.model);
      const e = { model: u.model };
      to[key].push(e);
      if (kind === 'heli') this.parkAt(to, 'heli', e, u.x, u.z, u.rotY);
      world.touchPlayer(to);
    }
    if (owner) world.touchPlayer(owner);
  }

  /** Park halindeki araç yok edildi (vuruldu / füze / bomba) */
  destroyed(u) {
    const { world, bus } = this.ctx;
    const kind = u.kindV ?? (u.type === 'pheli' ? 'heli' : 'car');
    const owner = world.players.get(u.ownerId);
    const C = kind === 'heli' ? HELIS[u.model] : CARS[u.model];
    bus.emit('net:fx', { t: 'explosion', x: u.x, z: u.z, r: 6 });
    if (!owner) return;
    const key = kind === 'heli' ? 'helis' : 'cars';
    owner[key] = (owner[key] ?? []).filter((x) => x.unitId !== u.id);
    if (owner.flying?.unitId === u.id) this.dropRider(owner, u);
    world.touchPlayer(owner);
    this.say(owner, `💥 ${C?.label ?? 'Aracın'} PATLATILDI!`, 'err', 'alarm');
  }

  // ------------------------------------------------------------------ kişisel helikopter
  fly(p, { unitId, x, z }) {
    const { world } = this.ctx;
    const u = world.units.get(unitId);
    if (!u || u.type !== 'pheli' || u.ownerId !== p.id) return fail('Bu helikopter senin değil.');
    if (u.flight) return fail('Helikopter zaten havada.');
    if (p.inside || p.driving || p.dead) return fail('Şu an binemezsin.');
    if (Math.hypot(u.x - p.x, u.z - p.z) > 12) return fail('🚁 Helikoptere yaklaş.');
    if (![x, z].every(Number.isFinite)) return fail('Haritadan iniş yeri seç.');
    const c = world.clampToBounds(x, z);
    u.flight = { tx: c.x, tz: c.z, phase: 'up' };
    u.locked = true;
    p.flying = { unitId: u.id };
    p.pose = 'drive';
    world.touchPlayer(p);
    return { ok: true, message: `🚁 Kalkış! ${Math.round(Math.hypot(c.x - u.x, c.z - u.z))} m uçacağız. Seni oraya bırakıp bekleyeceğim.`, sfx: 'launch' };
  }

  dropRider(p, u) {
    p.flying = null;
    if (p.pose === 'drive') p.pose = '';
    p.x = u.x + 4; p.z = u.z + 2;
    p.moveBudget = p.maxSpeed;
    this.ctx.bus.emit('net:teleport', { playerId: p.id, x: p.x, z: p.z });
    this.world.touchPlayer(p);
  }

  // ------------------------------------------------------------------ örgüt hava filosu
  sendHeli(p, { model, targetKind, targetId, ride }) {
    const { world, bus } = this.ctx;
    const o = p.orgId && world.orgs?.[p.orgId];
    if (!o) return fail('Örgütün yok.');
    const H = HELIS[model];
    const have = o.fleet?.helis?.[model] ?? 0;
    const out = [...world.units.values()].filter((u) => u.type === 'oheli' && u.org === o.id && u.model === model).length;
    if (!H || have - out < 1) return fail('Filoda boşta bu model yok. Telefon › Galeri › Örgüt Filosu.');
    let T = null;
    if (targetKind === 'player') { const t = world.players.get(targetId); if (t && t !== p) T = { x: t.x, z: t.z, pid: t.id, name: t.name }; }
    else { const b = world.buildings.get(targetId); if (b && !b.destroyed) T = { x: b.x, z: b.z, bid: b.id, name: b.name }; }
    if (!T) return fail('Hedef seç.');
    if (ride && (p.inside || p.driving || p.dead)) return fail('Binmek için dışarıda olmalısın.');
    const orgSys = this.ctx.engine.getSystem('orgs');
    const hq = orgSys.hqOf(o);
    const from = ride ? { x: p.x, z: p.z } : hq ? { x: hq.x, z: hq.z } : orgSys.edgePoint(T);
    const fee = Math.round(1500 * this.mul());
    if (p.balance < fee) return fail(`Yakıt + mühimmat ${tl(fee)}.`);
    p.balance -= fee;
    const u = this.spawn('oheli', from.x, from.z, `org:${o.id}`, o.color, { model, tag: o.name, hp: Math.round(700 * (H.armor ?? 1)) });
    u.org = o.id; u.hostile = true; u.alt = 0;
    u.flight = { phase: 'up', tx: T.x, tz: T.z, target: T, home: from, bombCd: 2, byId: p.id };
    u.aggro = T.pid ? { [T.pid]: Date.now() + 10 * 60000 } : {};
    if (ride) { p.flying = { unitId: u.id, org: true }; p.pose = 'drive'; }
    world.touchPlayer(p);
    bus.news('crime', `🚁 "${o.name}" bir ${H.label} havalandırdı! Hedef: ${T.name}`);
    if (T.pid) this.say(T.pid, `🚁 "${o.name}" helikopteri seni hedef aldı! Saklan!`, 'err', 'siren');
    return { ok: true, message: `🚁 ${H.label} kalktı${ride ? ', sen de içindesin' : ''}! Hedef: ${T.name}. İstediğin an Telefon › Örgüt › Geri Çağır.`, sfx: 'launch' };
  }

  recall(p) {
    const o = p.orgId && this.world.orgs?.[p.orgId];
    if (!o) return fail('Örgütün yok.');
    let n = 0;
    for (const u of this.world.units.values()) if (u.type === 'oheli' && u.org === o.id && u.flight && u.flight.phase !== 'home') { u.flight.phase = 'home'; n++; }
    return n ? { ok: true, message: `🚁 ${n} helikopter üsse dönüyor.` } : fail('Havada helikopter yok.');
  }

  tickFlights(dt) {
    const { world, bus, engine } = this.ctx;
    const missiles = engine.getSystem('missiles');
    for (const u of [...world.units.values()]) {
      const f = u.flight;
      if (!f) continue;
      const H = HELIS[u.model] ?? HELIS.robin;
      const cruise = u.type === 'oheli' ? 28 : 34;
      if (f.phase === 'up') { u.alt = Math.min(cruise, (u.alt ?? 0) + dt * 14); if (u.alt >= cruise - 0.5) f.phase = 'go'; }
      else if (f.phase === 'go' || f.phase === 'home') {
        if (u.type === 'oheli' && f.phase === 'go' && f.target.pid) { const t = world.players.get(f.target.pid); if (t && !t.inside) { f.tx = t.x; f.tz = t.z; } }
        const tx = f.phase === 'home' ? f.home.x : f.tx, tz = f.phase === 'home' ? f.home.z : f.tz;
        const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
        const step = H.speed * dt;
        if (d > (u.type === 'oheli' && f.phase === 'go' ? 16 : step)) { u.x += (dx / d) * Math.min(d, step); u.z += (dz / d) * Math.min(d, step); u.rotY = Math.atan2(dx, dz); }
        else if (u.type === 'oheli' && f.phase === 'go') { f.phase = 'attack'; f.ang = Math.atan2(u.x - tx, u.z - tz); f.t = 0; }
        else { u.x = tx; u.z = tz; f.phase = 'down'; }
      } else if (f.phase === 'attack') {
        // hedefin etrafında daire çizip tarar, bombalı modeller 5 m bombalar bırakır
        f.t += dt;
        f.ang += dt * 0.6;
        if (f.target.pid) { const t = world.players.get(f.target.pid); if (t && !t.inside) { f.tx = t.x; f.tz = t.z; } }
        u.x = f.tx + Math.sin(f.ang) * 16; u.z = f.tz + Math.cos(f.ang) * 16;
        u.rotY = f.ang + Math.PI / 2;
        f.bombCd -= dt;
        if (f.bombCd <= 0) {
          f.bombCd = H.bombs ? 2.2 : 3.5;
          const bx = f.tx + (Math.random() - 0.5) * 10, bz = f.tz + (Math.random() - 0.5) * 10;
          bus.emit('net:fx', { t: 'gun', a: [u.x, u.z], b: [bx, bz], w: 'rifle', hit: 1 });
          if (H.bombs) { bus.emit('net:fx', { t: 'airstrike', x: bx, z: bz, r: 5 }); missiles.blast(this.ctx, bx, bz, { radius: 5, damage: 260 + (H.dmg ?? 20) * 6, label: H.label }, null); }
          else if (f.target.bid) { const b = world.buildings.get(f.target.bid); if (b) world.damageBuilding(b, (H.dmg ?? 10) * 6, null); }
          if (f.target.pid) { const t = world.players.get(f.target.pid); if (t && !t.inside && Math.hypot(t.x - f.tx, t.z - f.tz) < 14) engine.getSystem('life').damage(t, H.dmg ?? 12, null, 'helikopter ateşiyle'); }
        }
        if (f.t > 90) f.phase = 'home';
      } else if (f.phase === 'down') {
        u.alt = Math.max(0, u.alt - dt * 12);
        if (u.alt <= 0) {
          u.flight = null;
          const rider = [...world.players.values()].find((x) => x.flying?.unitId === u.id);
          if (rider) this.dropRider(rider, u);
          if (u.type === 'oheli') this.despawn(u.id);
          else if (rider) this.say(rider, '🚁 İndik. Helikopter burada seni bekliyor; tekrar binmek için yanına gel.', 'ok', 'success');
        }
      }
      // yolcu helikopterle birlikte
      for (const pl of world.players.values()) if (pl.flying?.unitId === u.id) { pl.x = u.x; pl.z = u.z; pl.rotY = u.rotY; pl.moveBudget = pl.maxSpeed; }
    }
  }

  // ------------------------------------------------------------------ zaman
  onTick(dt) { this.tickFlights(dt); }

  /** Kayıp araçları temizle: park kaydı olup birimi kalmayan (füzeyle vurulan vb.) araçlar gitti */
  onHour() {
    const { world } = this.ctx;
    for (const p of world.players.values()) {
      for (const key of ['cars', 'helis']) {
        const list = p[key] ?? [];
        const keep = list.filter((e) => !e.unitId || world.units.has(e.unitId));
        if (keep.length !== list.length) { p[key] = keep; world.touchPlayer(p); this.say(p, '💥 Park halindeki bir aracın yok edildi.', 'err', 'alarm'); }
      }
    }
  }

  privateFor(p) {
    const { world } = this.ctx;
    const pos = (e) => { const u = e.unitId && world.units.get(e.unitId); return u ? { unitId: u.id, x: Math.round(u.x), z: Math.round(u.z), locked: !!u.locked, hp: Math.round((u.hp / u.maxHp) * 100), flying: !!u.flight } : null; };
    return {
      cars: (p.cars ?? []).map((e) => ({ model: e.model, until: e.until ?? null, parked: pos(e) })),
      helis: (p.helis ?? []).map((e) => ({ model: e.model, parked: pos(e) })),
      flying: p.flying ? { unitId: p.flying.unitId, org: !!p.flying.org } : null,
    };
  }
}
