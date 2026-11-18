import { FACTORY_SUBTYPES } from '../data/buildingTypes.js';
import { wholesalePrice } from '../data/products.js';
import { buildingMaxHp } from '../data/military.js';

const round2 = (n) => Math.round(n * 100) / 100;

function stockEntry(over) {
  return { qty: 0, price: 0, sell: true, autoRestock: true, restockTo: 0, incoming: 0, soldToday: 0, stockouts: 0, ...over };
}

/**
 * Bir binayı tipine göre "çalışır" hale getirir: stok, fiyatlar, kapasite, kira, can.
 * Genesis'te (fill=true, raflar dolu) ve inşaat bitince (fill=false, raflar boş) çağrılır.
 */
export function setupOperations(b, rng, config, { fill = true } = {}) {
  const def = b.def;
  b.maxHp = buildingMaxHp(b);
  b.hp = b.maxHp;
  b.stock = {};

  if (def.sells) {
    for (const [product, [lo, hi]] of Object.entries(def.sells)) {
      b.stock[product] = stockEntry({
        qty: fill ? Math.round(def.restockTo * rng.range(0.5, 0.9)) : 0,
        price: round2(wholesalePrice(product, config) * rng.range(lo, hi)),
        restockTo: def.restockTo,
      });
    }
  }

  if (b.type === 'factory') {
    const sd = FACTORY_SUBTYPES[b.subtype];
    b.stock[sd.output] = stockEntry({
      qty: fill ? 80 : 0,
      price: wholesalePrice(sd.output, config),
      autoRestock: false,
    });
    for (const input of Object.keys(sd.inputs ?? {})) {
      b.stock[input] = stockEntry({ qty: fill ? 30 : 0, sell: false, restockTo: 80 });
    }
  }

  if (def.category === 'residential') {
    b.capacity = rng.int(def.capacity[0], def.capacity[1]);
    b.rentPerResident = rng.int(def.rent[0], def.rent[1]);
  }
}
