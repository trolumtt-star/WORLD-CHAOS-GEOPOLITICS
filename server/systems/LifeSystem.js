import { JOBS, inHours } from '../data/jobs.js';
import { PRODUCTS } from '../data/products.js';
import { interiorLayout, interiorOrigin, spotById, entryPoint, JOB_TASKS, WEAPONS } from '../../shared/interiors.js';

/**
 * Oyuncunun gündelik hayatı:
 *  - Açlık / susuzluk / enerji / can; uyku, bayılma, ölüm ve yeniden doğma
 *  - Binalara girip çıkma (iç mekânlar haritanın dışında ayrı odalardır)
 *  - Evde buzdolabı, ocak (çay/kahve), kanepe + TV, yatak; dükkanda alışveriş
 *  - Mesai: meslek görevleri; polis için soygun ihbarları ve kaçan soyguncular
 *  - Yakın dövüş ve silahlı çatışma (NPC ve oyunculara)
 */
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const clamp = (v) => Math.max(0, Math.min(100, v));
const fail = (error) => ({ ok: false, error });

const ENTERABLE_CIVIC = new Set(['police', 'bank', 'hospital', 'palace', 'town_hall']);

export class LifeSystem {
  name = 'life';

  init(ctx) {
    this.ctx = ctx;
    this.syncTimer = 0;
    this.slowTimer = 0;
    ctx.world.incidents = new Map();
    this.incSeq = 0;
    ctx.world.incidentFor = (p) => {
      if (!this.isCopOnDuty(p)) return null;
      for (const inc of ctx.world.incidents.values()) {
        const npc = ctx.world.npcs.get(inc.npcId);
        if (npc) return { id: inc.id, npcId: npc.id, name: npc.name, x: Math.round(npc.x), z: Math.round(npc.z), building: inc.buildingName };
      }
      return null;
    };
  }

  // ------------------------------------------------------------------ tick
  onTick(dt, ctx) {
    const { world, config } = ctx;
    const hrs = (dt * 1000) / config.time.msPerGameHour;
    const L = config.life;
    const now = Date.now();
    for (const p of world.players.values()) {
      if (p.isAI || !p.online) continue;
      if (p.dead) {
        if (now >= p.respawnAt) this.respawn(p);
        continue;
      }
      if (p.jailedUntil > world.clockHours()) continue;
      const sleeping = p.pose === 'sleep';
      p.food = clamp(p.food - L.foodPerHour * hrs * (sleeping ? 0.4 : 1));
      p.water = clamp(p.water - L.waterPerHour * hrs * (sleeping ? 0.4 : 1));
      if (sleeping) {
        p.energy = clamp(p.energy + L.sleepEnergyPerHour * hrs * (p.inside ? 1 : 0.6));
        if (p.energy >= 100) { p.pose = ''; this.say(p, '☀️ Dinç uyandın! Enerjin full.', 'ok'); }
      } else {
        p.energy = clamp(p.energy - L.energyPerHour * hrs * (p.shift ? 1.2 : 1));
        if (p.energy <= 0 && p.pose !== 'sleep') this.passOut(p);
      }
      if (p.food <= 0 || p.water <= 0) {
        p.health = clamp(p.health - L.starveDamagePerHour * hrs);
        if (p.health <= 0) { this.kill(p, null, p.food <= 0 ? 'açlıktan' : 'susuzluktan'); continue; }
      } else if (p.food > 40 && p.water > 40 && p.health < 100) {
        p.health = clamp(p.health + L.regenPerHour * hrs * (sleeping ? 2 : 1));
      }
    }

    this.syncTimer += dt;
    if (this.syncTimer >= 1.5) {
      this.syncTimer = 0;
      for (const p of world.players.values()) if (p.online && !p.isAI) world.touchPlayer(p);
    }
    this.slowTimer += dt;
    if (this.slowTimer >= 1) {
      this.slowTimer = 0;
      this.slowChecks(ctx);
    }
  }

  slowChecks(ctx) {
    const { world, bus } = ctx;
    const hour = world.hour();
    for (const p of world.players.values()) {
      if (!p.inside || p.isAI) continue;
      const b = world.buildings.get(p.inside);
      if (!b || b.destroyed) {
        this.exit(p, '💥 Bina yıkıldı! Enkazın altından zor çıktın.');
        this.damage(p, 35, null, 'enkaz');
        continue;
      }
      // Gece dükkan kapanınca müşteriler dışarı
      if (b.category === 'commercial' && !world.isOpen(b) && !this.isStaff(p, b) && !(b.ownerKind === 'player' && b.ownerId === p.id)) {
        this.exit(p, `🌙 ${b.name} kapandı, görevli seni nazikçe dışarı çıkardı.`);
      }
    }
    for (const p of world.players.values()) {
      if (!p.shift) continue;
      const b = world.buildings.get(p.shift.buildingId);
      const job = b?.def.staff?.job;
      if (!b || !job || !inHours(JOBS[job].shift, hour) || p.jobBuildingId !== b.id) this.endShift(p, '🕔 Mesai bitti! Bugünlük bu kadar.');
    }
    // Kaçan soyguncular
    const nowH = world.clockHours();
    for (const inc of [...world.incidents.values()]) {
      const npc = world.npcs.get(inc.npcId);
      if (!npc || !npc.alive) { this.closeIncident(inc); continue; }
      if (npc.robberUntil <= nowH || (npc.state === 'inside' && npc.locationId === npc.plan.fleeTo)) {
        npc.robberUntil = 0;
        bus.news('crime', `🏃 ${inc.buildingName} soyguncusu ${npc.name} izini kaybettirdi...`);
        this.closeIncident(inc);
      }
    }
  }

  onHour(time, ctx) {
    const { world, rng } = ctx;
    for (const p of world.players.values()) if (p.shift) p.shift.hourDone = 0;
    // Polis oyuncu mesaideyse arada bir soygun ihbarı düşsün
    if (!world.incidents.size && [...world.players.values()].some((p) => this.isCopOnDuty(p)) && rng.chance(0.3)) {
      const shops = world.buildingsWhere((b) => b.category === 'commercial' && b.operational && world.isOpen(b) && b.balance > 50);
      const civ = [...world.npcs.values()].filter((n) => n.alive && n.job !== 'police' && n.jailedUntil <= world.clockHours());
      if (shops.length && civ.length) {
        const b = rng.pick(shops);
        const npc = rng.pick(civ);
        const steal = Math.round(Math.min(b.balance * 0.4, rng.range(150, 600)));
        b.balance -= steal;
        this.startIncident(npc, b, steal);
      }
    }
  }

  // ------------------------------------------------------------------ yardımcılar
  say(p, text, toast = 'info', sfx) {
    this.ctx.bus.emit('net:private', { playerId: p.id, item: { category: 'life', text, toast, sfx } });
  }

  teleport(p, x, z) {
    p.x = x;
    p.z = z;
    p.moveBudget = p.maxSpeed;
    this.ctx.bus.emit('net:teleport', { playerId: p.id, x, z, rotY: p.rotY });
    this.ctx.world.touchPlayer(p);
  }

  isStaff(p, b) { return p.jobBuildingId === b.id; }
  isCop(p) { const b = this.ctx.world.buildings.get(p.jobBuildingId); return b?.def.staff?.job === 'police'; }
  isCopOnDuty(p) { return !!p.shift && p.online && this.isCop(p); }

  canEnter(p, b) {
    const { world } = this.ctx;
    if (!interiorLayout(b.type)) return fail('Bu yapının içine girilemiyor.');
    if (!b.operational) return fail(b.construction ? 'Bina hâlâ inşaat halinde.' : 'Bina yıkık.');
    const owner = b.ownerKind === 'player' && b.ownerId === p.id;
    const cat = b.category;
    if (cat === 'residential' || b.type === 'town_hall') {
      if (owner || p.homeId === b.id || b.guestsOpen) return { ok: true };
      // Ev sahibi içerideyse misafir kabul edilir (kapı çalınır)
      const host = [...world.players.values()].find((o) => o.online && o.inside === b.id && (o.homeId === b.id || (b.ownerKind === 'player' && b.ownerId === o.id)));
      if (host) { this.say(host, `🔔 Kapı çalıyor: ${p.name} misafirliğe geldi!`, 'info', 'notify'); return { ok: true }; }
      return fail('🔒 Kapı kilitli. Ev sahibi içerideyken gelebilir ya da kapıyı misafirlere açabilir.');
    }
    if (cat === 'commercial') {
      if (owner || this.isStaff(p, b) || world.isOpen(b)) return { ok: true };
      return fail(`🌙 ${b.name} şu an kapalı.`);
    }
    if (cat === 'industrial') {
      if (owner || this.isStaff(p, b)) return { ok: true };
      return fail('Fabrikaya sadece çalışanlar girebilir. (Kapıdan işe başvurabilirsin.)');
    }
    if (ENTERABLE_CIVIC.has(b.type)) return { ok: true };
    return fail('Bu yapının içine girilemiyor.');
  }

  enter(p, b) {
    if (p.inside) return fail('Zaten bir binanın içindesin.');
    if (p.dead) return fail('Ölüsün...');
    if (Math.hypot(p.x - b.door.x, p.z - b.door.z) > 18) return fail('Kapıya yaklaş.');
    const ok = this.canEnter(p, b);
    if (!ok.ok) return ok;
    const layout = interiorLayout(b.type);
    const o = interiorOrigin(b.id);
    const e = entryPoint(layout);
    p.inside = b.id;
    p.pose = '';
    p.tv = false;
    this.teleport(p, o.x + e.x, o.z + e.z);
    return { ok: true, message: `🚪 ${b.name}`, sfx: 'door', entered: b.id };
  }

  exit(p, msg) {
    const b = this.ctx.world.buildings.get(p.inside);
    p.inside = null;
    p.pose = '';
    p.tv = false;
    if (p.shift && !this.isCop(p)) this.endShift(p, null);
    const d = b?.door ?? { x: p.x, z: p.z };
    this.teleport(p, d.x, d.z + 1.5);
    if (msg) this.say(p, msg, 'warn', 'door');
    return { ok: true, sfx: 'door', exited: true };
  }

  spotWorld(p, spotId) {
    const b = this.ctx.world.buildings.get(p.inside);
    const layout = b && interiorLayout(b.type);
    const s = spotById(layout, spotId);
    if (!s) return {};
    const o = interiorOrigin(b.id);
    return { b, layout, s, o, x: o.x + s.x, z: o.z + s.z };
  }

  nearSpot(p, spotId, max = 5) {
    const r = this.spotWorld(p, spotId);
    if (!r.s) return [null, fail('Burada öyle bir şey yok.')];
    if (Math.hypot(p.x - r.x, p.z - r.z) > max) return [null, fail(`${r.s.icon} ${r.s.label} yanına git.`)];
    return [r, null];
  }

  seat(p, r) {
    const seats = r.s.seats;
    if (!seats?.length) return;
    const { world } = this.ctx;
    const taken = (sx, sz) => [...world.players.values()].some((o) => o !== p && o.inside === p.inside && o.pose && Math.hypot(o.x - sx, o.z - sz) < 0.6);
    const free = seats.find(([x, z]) => !taken(r.o.x + x, r.o.z + z)) ?? seats[0];
    p.rotY = free[2] ?? 0;
    this.teleport(p, r.o.x + free[0], r.o.z + free[1]);
  }

  // ------------------------------------------------------------------ eşya kullanımı
  use(p, spotId, act, params = {}) {
    const { world, config } = this.ctx;
    if (p.dead) return fail('Ölüsün...');
    if (spotId === 'exit') return this.exit(p);
    const [r, err] = this.nearSpot(p, spotId);
    if (err) return err;
    const b = r.b;
    const home = b.category === 'residential' || b.type === 'town_hall';
    b.fridge ??= { food: 0, drink: 0 };

    switch (`${r.s.tag}:${act}`) {
      case 'fridge:store': {
        const f = p.inventory.food ?? 0, d = p.inventory.drink ?? 0;
        if (!f && !d) return fail('Çantanda koyacak yiyecek/içecek yok. Marketten al!');
        b.fridge.food += f; b.fridge.drink += d;
        p.inventory.food = 0; p.inventory.drink = 0;
        world.touchPlayer(p);
        return { ok: true, message: `🧊 Buzdolabına koydun: 🍞${f} 🥤${d}`, sfx: 'door' };
      }
      case 'fridge:eat': {
        if (b.fridge.food < 1) return fail('Buzdolabında yiyecek kalmamış! 🛒 Markete git.');
        b.fridge.food--;
        p.food = clamp(p.food + 38);
        p.health = clamp(p.health + 3);
        return { ok: true, message: '🍽️ Afiyet olsun! Karnın doydu.', sfx: 'eat' };
      }
      case 'fridge:drink': {
        if (b.fridge.drink < 1) return fail('Buzdolabında içecek kalmamış!');
        b.fridge.drink--;
        p.water = clamp(p.water + 42);
        return { ok: true, message: '🥤 Oh be, serinledin.', sfx: 'drink' };
      }
      case 'fridge:take': {
        if (b.fridge.food < 1 && b.fridge.drink < 1) return fail('Buzdolabı boş.');
        const f = Math.min(2, b.fridge.food), d = Math.min(2, b.fridge.drink);
        b.fridge.food -= f; b.fridge.drink -= d;
        p.inventory.food = (p.inventory.food ?? 0) + f;
        p.inventory.drink = (p.inventory.drink ?? 0) + d;
        return { ok: true, message: `🎒 Çantana aldın: 🍞${f} 🥤${d}` };
      }
      case 'stove:tea':
      case 'stove:coffee': {
        if (!home) return fail('Burası senin mutfağın değil.');
        const coffee = act === 'coffee';
        p.water = clamp(p.water + 22);
        if (coffee) p.energy = clamp(p.energy + 12);
        p.pose = '';
        const guests = [...world.players.values()].filter((o) => o !== p && o.online && o.inside === p.inside);
        for (const g of guests) {
          g.water = clamp(g.water + 22);
          if (coffee) g.energy = clamp(g.energy + 12);
          this.say(g, `${coffee ? '☕' : '🍵'} ${p.name} herkese ${coffee ? 'Türk kahvesi' : 'çay'} ikram etti!`, 'ok', 'drink');
        }
        return { ok: true, message: `${coffee ? '☕ Kahve' : '🍵 Çay'} demlendi${guests.length ? `, ${guests.length} misafirine de ikram ettin` : ''}!`, sfx: 'drink' };
      }
      case 'sofa:sit':
      case 'table:sit':
      case 'counter:sit': {
        this.seat(p, r);
        p.pose = 'sit';
        p.tv = false;
        return { ok: true };
      }
      case 'sofa:tv': {
        this.seat(p, r);
        p.pose = 'sit';
        p.tv = true;
        return { ok: true, message: '📺 TV açıldı. Haberler başlıyor...' };
      }
      case 'bed:sleep': {
        if (!home && b.type !== 'hospital') return fail('Burada uyuyamazsın.');
        if (p.energy > 85) return fail('Uykun yok, enerjin yerinde!');
        this.seat(p, r);
        if (!r.s.seats) this.teleport(p, r.x, r.z);
        p.pose = 'sleep';
        p.tv = false;
        return { ok: true, message: '😴 İyi uykular... (hareket edersen uyanırsın)' };
      }
      case 'reception:heal': {
        const cost = config.life.healCost;
        if (p.health >= 100) return fail('Sağlığın gayet iyi.');
        if (p.balance < cost) return fail(`Tedavi ücreti ${tl(cost)}.`);
        p.balance -= cost;
        world.treasury += cost;
        p.health = 100;
        return { ok: true, message: '🩺 Tedavi edildin, turp gibisin!', sfx: 'success' };
      }
      default:
        return fail('Bunu burada yapamazsın.');
    }
  }

  stand(p) {
    if (p.pose === 'dead') return fail('Ölüsün...');
    if (p.pose === 'sleep' && p.energy < 15) return fail('😵 Çok yorgunsun, gözlerini açamıyorsun... (enerji %15 olunca kalkabilirsin)');
    p.pose = '';
    p.tv = false;
    return { ok: true };
  }

  consume(p, item) {
    if (p.dead) return fail('Ölüsün...');
    if (!['food', 'drink'].includes(item) || (p.inventory[item] ?? 0) < 1) return fail('Çantanda yok.');
    p.inventory[item]--;
    if (item === 'food') p.food = clamp(p.food + 32);
    else p.water = clamp(p.water + 36);
    return { ok: true, message: item === 'food' ? '🥪 Ayaküstü bir şeyler atıştırdın.' : '🥤 Kana kana içtin.', sfx: item === 'food' ? 'eat' : 'drink' };
  }

  // ------------------------------------------------------------------ alışveriş (içeride, kasada)
  buy(p, product, qty, consumeNow) {
    const { world } = this.ctx;
    const b = world.buildings.get(p.inside);
    if (!b || b.category !== 'commercial') return fail('Önce dükkanın içine gir.');
    const [, err] = this.nearSpot(p, 'counter', 6);
    if (err) return err;
    if (!world.isOpen(b)) return fail('Dükkan kapalı.');
    const s = b.stock[product];
    const q = Math.max(1, Math.min(10, Math.round(Number(qty) || 1)));
    if (!s?.sell || s.qty < q) return fail('Stokta yok, kusura bakma.');
    if (!PRODUCTS[product] || !['food', 'drink', 'electronics'].includes(product)) return fail('Bu ürün buradan alınamaz.');
    const cost = s.price * q;
    if (p.balance < cost) return fail(`Paran yetmiyor (${tl(cost)}).`);
    p.balance -= cost;
    s.qty -= q;
    s.soldToday = (s.soldToday ?? 0) + q;
    const tax = cost * world.policy.salesTax;
    world.treasury += tax;
    b.balance += cost - tax;
    b.revenueToday += cost;
    world.touch(b);
    if (product === 'electronics') {
      p.hasPhone = true;
      return { ok: true, message: '📱 Yeni telefonun hayırlı olsun!', sfx: 'cash' };
    }
    if (consumeNow || b.def.served) {
      if (product === 'food') p.food = clamp(p.food + 40 * q);
      else { p.water = clamp(p.water + 40 * q); if (b.type === 'cafe') p.energy = clamp(p.energy + 8); }
      return { ok: true, message: product === 'food' ? '🍽️ Yemeğin geldi, afiyet olsun!' : (b.type === 'bar' ? '🍺 Şerefe!' : '☕ Siparişin hazır!'), sfx: product === 'food' ? 'eat' : 'drink' };
    }
    p.inventory[product] = (p.inventory[product] ?? 0) + q;
    return { ok: true, message: `🛍️ ${q} × ${PRODUCTS[product].label} çantana kondu (${tl(cost)}). Evde buzdolabına koyabilirsin.`, sfx: 'cash' };
  }

  buyWeapon(p, weapon, ammoOnly) {
    const { world } = this.ctx;
    const b = world.buildings.get(p.inside);
    if (b?.type !== 'gun_shop') return fail('Silah dükkanının içinde olmalısın.');
    const [, err] = this.nearSpot(p, 'counter', 6);
    if (err) return err;
    if (!world.isOpen(b)) return fail('Dükkan kapalı.');
    const w = WEAPONS[weapon];
    if (!w?.price) return fail('Böyle bir silah yok.');
    if (ammoOnly) {
      if (!w.ammo) return fail('Bu silah mermi kullanmaz.');
      if (!p.weapons.includes(weapon)) return fail('Önce silahı almalısın.');
      if (p.balance < w.ammo.price) return fail('Paran yetmiyor.');
      p.balance -= w.ammo.price;
      b.balance += w.ammo.price;
      p.ammo[weapon] = (p.ammo[weapon] ?? 0) + w.ammo.qty;
      return { ok: true, message: `📦 +${w.ammo.qty} mermi`, sfx: 'cash' };
    }
    if (p.weapons.includes(weapon)) return fail('Bu silah zaten sende.');
    if (weapon !== 'knife' && (b.stock.weapons?.qty ?? 0) < 1) return fail('Silah stoğu tükenmiş.');
    if (p.balance < w.price) return fail(`${w.label} ${tl(w.price)}.`);
    p.balance -= w.price;
    b.balance += w.price;
    if (weapon !== 'knife') { b.stock.weapons.qty--; world.touch(b); }
    p.weapons.push(weapon);
    p.weapon = weapon;
    if (w.ammo) p.ammo[weapon] = (p.ammo[weapon] ?? 0) + w.ammo.qty;
    return { ok: true, message: `${w.icon} ${w.label} satın aldın! Ruhsatı sorulmadı... 😏`, sfx: 'cash' };
  }

  // ------------------------------------------------------------------ mesai
  startShift(p) {
    const { world } = this.ctx;
    const b = world.buildings.get(p.jobBuildingId);
    if (!b) return fail('Bir işin yok. Bir işyerinin kapısında "İşe Başvur"a bas.');
    if (p.inside !== b.id) return fail(`Mesaiye başlamak için ${b.name} içine gir.`);
    const job = b.def.staff?.job;
    const shift = JOBS[job]?.shift;
    const h = world.hour();
    if (!inHours(shift, h) && !inHours(shift, (h + 1) % 24)) return fail(`Mesai saatin: ${shift[0]}:00 - ${shift[1]}:00`);
    if (p.shift) return fail('Zaten mesaidesin.');
    p.shift = { buildingId: b.id, done: 0, hourDone: 0, task: null };
    this.assignTask(p);
    return { ok: true, message: `👔 Mesai başladı! İlk görev: ${p.shift.task.label}`, sfx: 'task' };
  }

  endShift(p, msg) {
    if (!p.shift) return { ok: true };
    const done = p.shift.done;
    p.shift = null;
    if (p.pose === 'work') p.pose = '';
    if (msg) this.say(p, `${msg} (${done} görev tamamladın)`, 'info');
    this.ctx.world.touchPlayer(p);
    return { ok: true, message: `Mesaiden çıktın. ${done} görev tamamladın.` };
  }

  assignTask(p) {
    const { world, rng } = this.ctx;
    const b = world.buildings.get(p.shift.buildingId);
    const layout = interiorLayout(b.type);
    const tasks = (JOB_TASKS[b.def.staff.job] ?? []).filter((t) => layout.spots.some((s) => s.tag === t.tag));
    const prev = p.shift.task?.spotId;
    const options = tasks.flatMap((t) => layout.spots.filter((s) => s.tag === t.tag && s.id !== prev).map((s) => ({ t, s })));
    const pick = rng.pick(options.length ? options : layout.spots.filter((s) => s.tag !== 'exit').map((s) => ({ t: { label: 'Etrafı topla', secs: 3 }, s })));
    p.shift.task = { label: pick.t.label, spotId: pick.s.id, secs: pick.t.secs, givenAt: Date.now() };
    world.touchPlayer(p);
  }

  doTask(p) {
    const { world, engine } = this.ctx;
    if (!p.shift?.task) return fail('Şu an görevin yok. Önce mesaiye başla.');
    const t = p.shift.task;
    const [r, err] = this.nearSpot(p, t.spotId, 4.5);
    if (err) return err;
    if (Date.now() - t.givenAt < t.secs * 700) return fail('Daha bitmedi, biraz daha çalış!');
    const b = r.b;
    const wage = JOBS[b.def.staff.job].wage;
    const bonus = Math.max(3, Math.round(wage * 0.6));
    let paid = false;
    if (engine.getSystem('payroll').payWage(this.ctx, b, bonus)) {
      p.balance += bonus;
      p.earnedToday += bonus;
      paid = true;
    }
    p.shift.done++;
    p.shift.hourDone++;
    p.energy = clamp(p.energy - 1);
    if (b.category === 'commercial') b.crimeHeat = Math.max(0, b.crimeHeat - 0.2);
    const done = t.label;
    this.assignTask(p);
    return { ok: true, message: `✅ ${done}${paid ? ` · +${tl(bonus)} prim` : ' · (işyerinin kasası boş, prim yok!)'} → Sıradaki: ${p.shift.task.label}`, sfx: paid ? 'cash' : 'task' };
  }

  // ------------------------------------------------------------------ polis olayları
  startIncident(npc, b, steal) {
    const { world, rng, bus, engine } = this.ctx;
    const brain = engine.getSystem('npcBrain');
    if (npc.state === 'inside') world.buildings.get(npc.locationId)?.occupants.delete(npc.id);
    brain.placeInside(npc, b);
    const far = world.buildingsWhere((x) => x.category === 'residential' && x.operational && Math.hypot(x.x - b.x, x.z - b.z) > 220);
    const fleeTo = (far.length ? rng.pick(far) : rng.pick(world.buildingsWhere((x) => x.operational && x.id !== b.id)))?.id;
    npc.plan.fleeTo = fleeTo;
    npc.robberUntil = world.clockHours() + 3;
    npc.robLoot = steal;
    npc.robFrom = b.id;
    brain.sendTo(npc, { activity: 'flee', buildingId: fleeTo }, this.ctx);
    const inc = { id: `i${++this.incSeq}`, npcId: npc.id, buildingId: b.id, buildingName: b.name };
    world.incidents.set(inc.id, inc);
    bus.emit('net:fx', { t: 'robber', id: npc.id, on: 1 });
    bus.emit('net:fx', { t: 'alarm', x: b.x, z: b.z });
    bus.news('crime', `🚨 ${b.name} soyuldu! Soyguncu ${npc.name} ${tl(steal)} ile kaçıyor!`);
    for (const p of world.players.values()) {
      if (this.isCopOnDuty(p)) {
        bus.emit('net:alert', { level: 'warning', text: `🚨 İHBAR: ${b.name} soyuldu! Kırmızı işaretli soyguncuyu yakala!`, to: p.id });
        world.touchPlayer(p);
      }
    }
    return inc;
  }

  closeIncident(inc) {
    const { world, bus } = this.ctx;
    world.incidents.delete(inc.id);
    bus.emit('net:fx', { t: 'robber', id: inc.npcId, on: 0 });
    for (const p of world.players.values()) if (this.isCopOnDuty(p)) world.touchPlayer(p);
  }

  arrest(p, npcId) {
    const { world, bus, engine } = this.ctx;
    const npc = world.npcs.get(npcId);
    if (!npc || !(npc.robberUntil > world.clockHours())) return fail('Bu kişi aranmıyor.');
    if (!this.isCop(p)) return fail('Sadece polisler tutuklama yapabilir.');
    if (!p.shift) return fail('Mesaide değilsin. Önce karakolda mesaiye başla.');
    if (Math.hypot(p.x - npc.x, p.z - npc.z) > 8) return fail('Soyguncuya yaklaş!');
    const inc = [...world.incidents.values()].find((i) => i.npcId === npc.id);
    npc.robberUntil = 0;
    npc.jailedUntil = world.clockHours() + 24;
    const from = world.buildings.get(npc.robFrom);
    if (from) from.balance += npc.robLoot ?? 0;
    npc.balance = Math.max(0, npc.balance - (npc.robLoot ?? 0));
    const bonus = 450;
    world.treasury -= bonus;
    p.balance += bonus;
    p.earnedToday += bonus;
    bus.news('crime', `👮 Polis ${p.name}, soyguncu ${npc.name}'i kıskıvrak yakaladı! Çalınan para iade edildi.`);
    if (inc) this.closeIncident(inc);
    engine.getSystem('npcBrain').decide(npc, world.hour(), this.ctx);
    world.touchPlayer(p);
    return { ok: true, message: `🚔 Yakaladın! +${tl(bonus)} ödül`, sfx: 'siren' };
  }

  // ------------------------------------------------------------------ ölüm / bayılma
  passOut(p) {
    p.pose = 'sleep';
    p.tv = false;
    p.energy = 0;
    if (p.shift) this.endShift(p, null);
    this.say(p, '😵 Yorgunluktan bayıldın! Yerde uyuyorsun... (Evde yatakta uyumak çok daha hızlı dinlendirir)', 'warn', 'hurt');
  }

  damage(p, dmg, attacker, cause) {
    if (p.dead) return;
    p.health = clamp(p.health - dmg);
    if (p.pose === 'sleep' || p.pose === 'sit') p.pose = '';
    this.ctx.world.touchPlayer(p);
    if (p.health <= 0) this.kill(p, attacker, cause);
  }

  kill(p, attacker, cause) {
    const { world, bus, config } = this.ctx;
    if (p.dead) return;
    const loss = Math.round(Math.max(0, p.balance) * config.life.deathCashLoss);
    p.balance -= loss;
    if (attacker) attacker.balance += loss; else world.treasury += loss;
    p.dead = true;
    p.pose = 'dead';
    p.tv = false;
    p.health = 0;
    p.respawnAt = Date.now() + config.life.respawnMs;
    if (p.shift) this.endShift(p, null);
    world.touchPlayer(p);
    bus.news('crime', attacker ? `💀 ${attacker.name}, ${p.name}'i öldürdü!` : `💀 ${p.name} ${cause ?? ''} öldü.`);
    this.say(p, `💀 ÖLDÜN${attacker ? ` (${attacker.name})` : ''}. Cebindeki ${tl(loss)} gitti.`, 'err', 'death');
  }

  respawn(p) {
    const { world } = this.ctx;
    p.dead = false;
    p.pose = '';
    p.health = 70;
    p.food = Math.max(p.food, 45);
    p.water = Math.max(p.water, 45);
    p.energy = Math.max(p.energy, 40);
    p.inside = null;
    const home = world.buildings.get(p.homeId);
    const spot = home?.operational ? home : world.hospital ?? home;
    const d = spot?.door ?? world.randomRoadPoint(this.ctx.rng);
    this.teleport(p, d.x, d.z + 1.5);
    this.say(p, `🏥 ${spot === home ? 'Evinin önünde' : 'Hastanede'} gözlerini açtın.`, 'info');
  }

  // ------------------------------------------------------------------ dövüş
  attack(p, kind, id) {
    const { world, bus, engine } = this.ctx;
    if (p.dead) return fail('Ölüsün...');
    if (p.pose === 'sleep') return fail('Uyuyorsun.');
    const w = WEAPONS[p.weapon] ?? WEAPONS.fist;
    const now = Date.now();
    if (now - p.lastAttackAt < w.cd * 0.85) return { ok: false, error: null, quiet: true };
    if (w.ammo && (p.ammo[p.weapon] ?? 0) < 1) return fail('Mermin bitti! Silah dükkanından al. (Q: silah değiştir)');

    let target, victim = null, npc = null;
    if (kind === 'npc') {
      npc = world.npcs.get(id);
      if (!npc || !npc.alive || npc.state === 'inside' || p.inside) return fail('Hedef görünmüyor.');
      target = npc;
    } else if (kind === 'player') {
      victim = world.players.get(id);
      if (!victim || victim === p || !victim.online || victim.dead || victim.inside !== p.inside) return fail('Hedef görünmüyor.');
      target = victim;
    } else return fail('Geçersiz hedef.');
    const dist = Math.hypot(target.x - p.x, target.z - p.z);
    if (dist > w.range + 3.5) return fail(w.melee ? 'Çok uzak, yaklaş!' : 'Menzil dışında!');

    p.lastAttackAt = now;
    if (w.ammo) p.ammo[p.weapon]--;
    p.pose = '';
    p.rotY = Math.atan2(target.x - p.x, target.z - p.z);
    const hit = w.melee || Math.random() < Math.max(0.45, 0.95 - dist / (w.range * 2));
    const dmg = hit ? Math.round(w.dmg * (0.8 + Math.random() * 0.4)) : 0;
    bus.emit('net:fx', w.melee
      ? { t: 'punch', by: p.id, a: [p.x, p.z], b: [target.x, target.z], w: p.weapon }
      : { t: 'gun', by: p.id, a: [p.x, p.z], b: [target.x, target.z], w: p.weapon, hit: hit ? 1 : 0 });

    const robber = npc && npc.robberUntil > world.clockHours();
    let msg = null;
    if (npc && hit) {
      npc.hp -= dmg;
      if (npc.hp <= 0) {
        world.killNpc(npc, 'öldürüldü');
        if (robber) {
          msg = `☠️ Soyguncu ${npc.name} etkisiz hale getirildi.`;
          const inc = [...world.incidents.values()].find((i) => i.npcId === npc.id);
          if (inc) this.closeIncident(inc);
        } else {
          p.wanted = Math.min(5, p.wanted + 2);
          bus.news('crime', `💀 ${p.name} sokak ortasında ${npc.name}'i öldürdü! Polis alarmda.`);
          msg = `💀 ${npc.name} öldü. Aranma: ${'⭐'.repeat(p.wanted)}`;
          this.callPolice(p);
        }
      } else {
        // Saldırıya uğrayan NPC kaçar
        if (!robber && npc.homeId) engine.getSystem('npcBrain').sendTo(npc, { activity: 'home', buildingId: npc.homeId }, this.ctx);
        if (!robber && p.wanted < 1) { p.wanted = 1; this.callPolice(p); }
      }
    } else if (victim && hit) {
      this.damage(victim, dmg, p, 'saldırı');
      this.say(victim, `🩸 ${p.name} sana saldırıyor! (-${dmg} can)`, 'err', 'hurt');
      if (victim.dead) p.wanted = Math.min(5, p.wanted + 2);
      else if (p.wanted < 1) p.wanted = 1;
    }
    world.touchPlayer(p);
    return { ok: true, quiet: true, message: msg, hit, dmg };
  }

  callPolice(p) {
    const crime = this.ctx.engine.getSystem('crime');
    let best = null, bd = Infinity;
    for (const b of this.ctx.world.buildings.values()) {
      const d = Math.abs(b.x - p.x) + Math.abs(b.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) crime.dispatchPolice(best, 2);
  }

  equip(p, weapon) {
    if (!p.weapons.includes(weapon)) return fail('Bu silah sende yok.');
    p.weapon = weapon;
    return { ok: true, quiet: true };
  }
}
