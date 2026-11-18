import { Vehicle } from '../entities/Unit.js';
import { roadPath, stepAlongPath } from '../world/Pathfinding.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Tedarik zinciri: stoğu azalan bina en uygun fabrikadan sipariş verir,
 * para hemen ödenir, mal 3D haritada yol alan bir KAMYONLA teslim edilir.
 * Kamyon yolda patlatılırsa (füze/savaş) mal kaybolur.
 */
export class LogisticsSystem {
  name = 'logistics';

  onHour(time, ctx) {
    if (time.hour < 6 || time.hour >= 21) return;
    const { world, config } = ctx;
    for (const b of world.buildings.values()) {
      if (!b.operational) continue;
      for (const [product, e] of Object.entries(b.stock)) {
        if (!e.autoRestock || !e.restockTo) continue;
        if (e.qty + e.incoming < e.restockTo * config.economy.restockFraction) {
          this.order(ctx, b, product, Math.ceil(e.restockTo - e.qty - e.incoming));
        }
      }
    }
  }

  findSupplier({ world }, b, product) {
    let best = null;
    let bestScore = Infinity;
    for (const f of world.buildingsOf('factory')) {
      const e = f.stock[product];
      if (!f.operational || f.id === b.id || !e?.sell || e.qty < 1) continue;
      const dist = Math.abs(f.x - b.x) + Math.abs(f.z - b.z);
      const score = e.price + dist / 60;
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  // Hem otomatik hem oyuncu siparişi buradan geçer
  order(ctx, b, product, wantQty) {
    const { world, bus, config } = ctx;
    const entry = b.stock[product];
    if (!entry) return { ok: false, error: 'Bu ürün burada satılmıyor.' };
    const supplier = this.findSupplier(ctx, b, product);
    if (!supplier) return { ok: false, error: 'Bu ürünü stoğunda bulunduran fabrika yok.' };

    const sEntry = supplier.stock[product];
    let qty = Math.min(wantQty, Math.floor(sEntry.qty));
    const owner = world.getOwner(b);
    const wallet = b.ownerKind === 'player' && owner ? owner.balance : 0;
    qty = Math.min(qty, Math.floor((b.balance + wallet) / sEntry.price));
    if (qty <= 0) return { ok: false, error: 'Kasada (ve cüzdanında) yeterli para yok.' };

    const cost = round2(qty * sEntry.price);
    const fromTill = Math.min(cost, b.balance);
    b.balance -= fromTill;
    if (cost > fromTill) {
      owner.balance -= cost - fromTill;
      world.touchPlayer(owner);
    }
    supplier.balance += cost;
    supplier.revenueToday += cost;
    sEntry.qty -= qty;
    sEntry.soldToday += qty;
    entry.incoming += qty;

    const truck = new Vehicle({
      id: world.nextId('v'),
      kind: 'truck',
      x: supplier.door.x,
      z: supplier.door.z,
      product,
      qty,
      fromId: supplier.id,
      toId: b.id,
      path: roadPath(world, supplier.door, b.door),
      speed: config.economy.truckSpeed,
    });
    world.vehicles.set(truck.id, truck);
    bus.emit('net:spawn', { kind: 'vehicle', data: truck.toMeta() });
    return { ok: true, qty, cost, supplier: supplier.name };
  }

  onTick(dt, { world, bus, config }) {
    const k = 5000 / config.time.msPerGameHour;
    for (const v of [...world.vehicles.values()]) {
      if (!stepAlongPath(v, v.speed * dt * k)) continue;
      const dest = world.buildings.get(v.toId);
      const e = dest?.stock[v.product];
      if (e) {
        e.incoming = Math.max(0, e.incoming - v.qty);
        if (dest.operational) e.qty += v.qty;
      }
      world.vehicles.delete(v.id);
      bus.emit('net:remove', { kind: 'vehicle', id: v.id, reason: 'delivered' });
    }
  }
}
