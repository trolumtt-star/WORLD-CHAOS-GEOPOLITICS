import { JOBS, inHours } from '../data/jobs.js';
import { roadPath, stepAlongPath } from '../world/Pathfinding.js';

/**
 * NPC beyni: zaman çizelgesi + ihtiyaçlar + ekonomik karar.
 * Öncelik: hapis > olay yeri (polis) > iş > açlık > suç > iş arama > lüks > alışveriş > eğlence > ev
 * Dükkan seçimi: fiyat + mesafe skoru en düşük, açık ve stoğu olan dükkan (oyuncu dükkanları dahil).
 */
const PURCHASE_ACTIVITIES = new Set(['buy_food', 'eat_out', 'luxury', 'weapon']);

export class NpcBrainSystem {
  name = 'npcBrain';

  init(ctx) {
    for (const npc of ctx.world.npcs.values()) {
      this.planDay(npc, ctx);
      const d = this.desired(npc, ctx.clock.hour, ctx);
      const b = ctx.world.buildings.get(d.buildingId) ?? ctx.world.buildings.get(npc.locationId);
      npc.activity = d.activity;
      this.placeInside(npc, b);
    }
  }

  onDay(_time, ctx) {
    for (const npc of ctx.world.npcs.values()) this.planDay(npc, ctx);
  }

  onHour(time, ctx) {
    for (const npc of [...ctx.world.npcs.values()]) this.decide(npc, time.hour, ctx);
  }

  onTick(dt, ctx) {
    // Hız oyun saatine bağlı: zaman hızlandırılırsa NPC'ler de hızlanır
    const base = ctx.config.npc.speed * dt * (5000 / ctx.config.time.msPerGameHour);
    for (const npc of [...ctx.world.npcs.values()]) {
      if (npc.state === 'moving' && stepAlongPath(npc, base * npc.speedFactor)) this.arrive(npc, ctx);
    }
  }

  // ---------------------------------------------------------------------

  planDay(npc, { rng }) {
    npc.plan = {
      goesOut: npc.balance > 60 && rng.chance(npc.traits.sociability * 0.7),
      luxury: npc.balance > 1200 && rng.chance(0.25),
      weapon: !npc.armed && npc.balance > 500 && npc.traits.lawfulness < 0.35 && rng.chance(0.2),
      crimeTargetId: null,
      respondTo: null,
      respondUntil: 0,
    };
    npc.targets = {};
  }

  decide(npc, hour, ctx) {
    if (!npc.alive) return;
    const d = this.desired(npc, hour, ctx);
    if (!d.buildingId) return;
    if (d.buildingId === npc.targetId) {
      npc.activity = d.activity;
      // Zaten dükkandaysa (ör. açılmadan önce gelmişse) alışverişi tekrar dene
      if (npc.state === 'inside' && PURCHASE_ACTIVITIES.has(d.activity)) {
        ctx.bus.emit('npc:arrived', { npc, building: ctx.world.buildings.get(npc.targetId) });
      }
    } else this.sendTo(npc, d, ctx);
  }

  desired(npc, hour, ctx) {
    const { world } = ctx;
    const now = world.clockHours();
    const go = (activity, b) => (b ? { activity, buildingId: b.id ?? b } : null);

    if (npc.jailedUntil > now && world.ids.prison) return { activity: 'jail', buildingId: world.ids.prison };
    if (npc.robberUntil > now && npc.plan.fleeTo) return { activity: 'flee', buildingId: npc.plan.fleeTo };
    if (npc.plan.respondTo && npc.plan.respondUntil > now) return { activity: 'respond', buildingId: npc.plan.respondTo };

    const job = JOBS[npc.job];
    // Çok açsa mesaiye öğle molası verir
    if (npc.workId && npc.hunger < 85 && (inHours(job.shift, hour) || inHours(job.shift, (hour + 1) % 24) || inHours(job.shift, (hour + 2) % 24))) {
      const w = world.buildings.get(npc.workId);
      if (w?.operational) return { activity: 'work', buildingId: w.id };
    }

    const awake = hour >= 7 && hour < 23;
    if (awake && npc.hunger >= 55 && npc.groceries === 0) {
      const eatOut = npc.traits.sociability > 0.5 && npc.balance > 40;
      const r = (eatOut && go('eat_out', this.pickShop(npc, ctx, 'eat_out', ['cafe', 'restaurant'], 'food')))
        || go('buy_food', this.pickShop(npc, ctx, 'buy_food', ['market'], 'food'))
        || go('eat_out', this.pickShop(npc, ctx, 'eat_out', ['cafe', 'restaurant'], 'food'));
      if (r) return r;
    }

    if (npc.plan.crimeTargetId && hour >= 1 && hour < 4) {
      const t = world.buildings.get(npc.plan.crimeTargetId);
      if (t?.operational) return { activity: 'crime', buildingId: t.id };
    }

    if (npc.job === 'unemployed' && hour >= 9 && hour < 15 && world.ids.palace) {
      return { activity: 'job_hunt', buildingId: world.ids.palace };
    }

    if (npc.plan.luxury && hour >= 11 && hour < 19) {
      const r = go('luxury', this.pickShop(npc, ctx, 'luxury', ['tech_store'], 'electronics'));
      if (r) return r;
    }
    if (npc.plan.weapon && hour >= 11 && hour < 19) {
      const r = go('weapon', this.pickShop(npc, ctx, 'weapon', ['gun_shop'], 'weapons'));
      if (r) return r;
    }
    if (hour >= 17 && hour < 20 && npc.groceries < 3 && npc.balance > 20) {
      const r = go('buy_food', this.pickShop(npc, ctx, 'buy_food', ['market'], 'food'));
      if (r) return r;
    }
    if (npc.plan.goesOut && hour >= 19 && hour < 23) {
      const types = npc.traits.sociability > 0.65 ? ['bar'] : ['bar', 'cafe'];
      const r = go('leisure', this.pickShop(npc, ctx, 'leisure', types, 'drink'));
      if (r) return r;
    }

    const rest = hour >= 23 || hour < 7 ? 'sleep' : 'home';
    if (npc.homeId && world.buildings.get(npc.homeId)?.operational) return { activity: rest, buildingId: npc.homeId };
    // Evsiz: en yakın park (yoksa saray önü)
    const park = this.nearest(npc, world.buildingsOf('park')) ?? world.palace;
    return { activity: rest, buildingId: park?.id ?? null };
  }

  // Fiyat + mesafe; aynı gün aynı aktivite için seçimi hatırla
  pickShop(npc, { world }, activity, types, product) {
    const hour = world.hour();
    const valid = (b) => b && b.operational && types.includes(b.type)
      && (world.isOpen(b, hour) || world.isOpen(b, (hour + 1) % 24))
      && b.stock[product]?.qty >= 1 && b.stock[product].price <= npc.balance;

    const cached = world.buildings.get(npc.targets[activity]);
    if (valid(cached)) return cached;

    let best = null;
    let bestScore = Infinity;
    for (const b of world.buildings.values()) {
      if (!valid(b)) continue;
      const dist = Math.abs(b.door.x - npc.x) + Math.abs(b.door.z - npc.z);
      // Fiyat hassasiyeti: fakir NPC fiyata, zengin mesafeye bakar
      const priceWeight = npc.balance < 300 ? 3 : 1;
      let score = b.stock[product].price * priceWeight + dist / 25;
      if ((b.adUntil ?? 0) > world.clockHours()) score *= 0.45; // reklamı tutmuş dükkan cazip
      if (score < bestScore) { bestScore = score; best = b; }
    }
    npc.targets[activity] = best?.id ?? null;
    return best;
  }

  nearest(npc, list) {
    let best = null;
    let bd = Infinity;
    for (const b of list) {
      if (!b.operational) continue;
      const d = Math.abs(b.x - npc.x) + Math.abs(b.z - npc.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  sendTo(npc, d, { world }) {
    const target = world.buildings.get(d.buildingId);
    if (!target) return;
    if (npc.state === 'inside') {
      const cur = world.buildings.get(npc.locationId);
      if (cur) {
        cur.occupants.delete(npc.id);
        npc.x = cur.door.x;
        npc.z = cur.door.z;
      }
      npc.locationId = null;
    }
    npc.state = 'moving';
    npc.activity = d.activity;
    npc.targetId = target.id;
    npc.path = roadPath(world, { x: npc.x, z: npc.z }, target.door);
  }

  arrive(npc, ctx) {
    const b = ctx.world.buildings.get(npc.targetId);
    if (!b) {
      npc.state = 'inside';
      return;
    }
    this.placeInside(npc, b);
    ctx.bus.emit('npc:arrived', { npc, building: b });
  }

  placeInside(npc, b) {
    npc.state = 'inside';
    npc.locationId = b.id;
    npc.targetId = b.id;
    npc.x = b.door.x;
    npc.z = b.door.z;
    npc.path = [];
    b.occupants.add(npc.id);
  }
}
