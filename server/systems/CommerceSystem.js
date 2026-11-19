import { PRODUCTS, wholesalePrice } from '../data/products.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Perakende: NPC dükkana varınca alışveriş yapar, parası dükkan kasasına (sahibi oyuncuysa onun işletmesine) geçer.
 * NPC/devlet dükkanları her gece fiyatlarını talebe göre ayarlar (rekabet kendiliğinden oluşur).
 */
export class CommerceSystem {
  name = 'commerce';

  init(ctx) {
    this.ctx = ctx;
    ctx.bus.on('npc:arrived', ({ npc, building }) => this.onArrive(npc, building));
  }

  onArrive(npc, b) {
    const { world } = this.ctx;
    const purchases = {
      buy_food: () => {
        const q = this.buy(npc, b, 'food', 4);
        npc.groceries += q;
        if (q && npc.balance > 30 && this.buy(npc, b, 'drink', 1)) npc.happiness += 1;
        return q;
      },
      eat_out: () => {
        const q = this.buy(npc, b, 'food', 1);
        if (q) {
          npc.hunger = Math.max(0, npc.hunger - 60);
          npc.happiness = Math.min(100, npc.happiness + 3);
          this.buy(npc, b, 'drink', 1);
        }
        return q;
      },
      luxury: () => {
        const q = this.buy(npc, b, 'electronics', 1);
        if (q) { npc.happiness = Math.min(100, npc.happiness + 15); npc.plan.luxury = false; }
        return q;
      },
      leisure: () => {
        const q = this.buy(npc, b, 'drink', 1);
        if (q) npc.happiness = Math.min(100, npc.happiness + 3);
        return q;
      },
      weapon: () => {
        const q = this.buy(npc, b, 'weapons', 1);
        if (q) { npc.armed = true; npc.plan.weapon = false; }
        return q;
      },
    };
    const fn = purchases[npc.activity];
    if (!fn) return;
    const fail = () => {
      npc.happiness = Math.max(0, npc.happiness - 2);
      npc.targets[npc.activity] = null;
    };
    if (!world.isOpen(b)) return fail();
    // İçeri girip kasaya yürüsün, kasada ödesin (görünür alışveriş)
    const indoor = this.ctx.engine.getSystem('indoor');
    if (indoor && !npc.ind) {
      const started = indoor.visit(npc, b, () => {
        const before = b.balance;
        const q = fn();
        if (!(q > 0)) fail();
        return b.balance - before;
      });
      if (started) return;
    }
    const ok = fn() > 0;
    if (!ok) {
      npc.happiness = Math.max(0, npc.happiness - 2);
      npc.targets[npc.activity] = null; // bir sonraki saatte başka dükkan denesin
    }
  }

  buy(npc, b, product, maxQty) {
    const entry = b.stock[product];
    if (!entry?.sell) return 0;
    if (entry.qty < 1) { entry.stockouts++; return 0; }
    const qty = Math.min(maxQty, Math.floor(entry.qty), Math.floor(npc.balance / entry.price));
    if (qty <= 0) return 0;
    const total = round2(qty * entry.price);
    npc.balance -= total;
    b.balance += total;
    b.revenueToday += total;
    entry.qty -= qty;
    entry.soldToday += qty;
    return qty;
  }

  onHour(_time, { world }) {
    // Bar / kafede oturanlar saat başı içki söyler
    for (const npc of world.npcs.values()) {
      if (npc.state !== 'inside' || npc.activity !== 'leisure') continue;
      const b = world.buildings.get(npc.locationId);
      if (!b || !world.isOpen(b)) continue;
      if (this.buy(npc, b, 'drink', 1)) npc.happiness = Math.min(100, npc.happiness + 3);
      else npc.plan.goesOut = false;
    }
  }

  onDay(_time, { world, config }) {
    for (const b of world.buildings.values()) {
      for (const [product, e] of Object.entries(b.stock)) {
        if (!e.sell) continue;
        e.soldYesterday = e.soldToday;
        if (b.ownerKind !== 'player') {
          const w = wholesalePrice(product, config);
          if (b.type === 'factory') {
            if (e.qty > 300) e.price *= 0.97;
            else if (e.qty < 30) e.price *= 1.04;
            e.price = round2(Math.min(PRODUCTS[product].baseCost * 2, Math.max(PRODUCTS[product].baseCost, e.price)));
          } else {
            if (e.stockouts > 0) e.price *= 1.04;
            else if (e.soldToday < 3) e.price *= 0.97;
            e.price = round2(Math.min(w * 5, Math.max(w * 1.15, e.price)));
          }
        }
        e.soldToday = 0;
        e.stockouts = 0;
      }
    }
  }
}
