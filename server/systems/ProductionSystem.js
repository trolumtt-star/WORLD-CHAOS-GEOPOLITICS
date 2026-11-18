import { FACTORY_SUBTYPES } from '../data/buildingTypes.js';
import { PRODUCTS } from '../data/products.js';
import { JOBS, inHours } from '../data/jobs.js';

export function playerAtWork(player, building, hour, world) {
  if (!player.online || player.jailedUntil > world.clockHours()) return false;
  const job = building.def.staff?.job;
  if (!job || !inHours(JOBS[job].shift, hour)) return false;
  return Math.hypot(player.x - building.door.x, player.z - building.door.z) < 30;
}

/**
 * Fabrikalar: işçi başı üretim. Girdi gerektirenler (elektronik, silah) çelik tüketir;
 * girdisizler ham madde parası öder. Depo dolarsa üretim durur.
 */
export class ProductionSystem {
  name = 'production';

  onHour(time, { world, config, bus }) {
    for (const f of world.buildingsOf('factory')) {
      if (!f.operational) continue;
      const sd = FACTORY_SUBTYPES[f.subtype];
      let workers = 0;
      for (const id of f.occupants) {
        const n = world.npcs.get(id);
        if (n?.activity === 'work' && n.workId === f.id) workers++;
      }
      for (const pid of f.playerWorkerIds) {
        const p = world.players.get(pid);
        if (p && playerAtWork(p, f, time.hour, world)) workers++;
      }

      const out = f.stock[sd.output];
      let qty = workers * sd.perWorker;
      qty = Math.min(qty, config.economy.factoryMaxStock - out.qty);
      for (const [input, ratio] of Object.entries(sd.inputs ?? {})) {
        qty = Math.min(qty, (f.stock[input]?.qty ?? 0) / ratio);
      }
      const unitRaw = sd.inputs ? 0.5 : PRODUCTS[sd.output].baseCost * config.economy.rawMaterialRatio;
      if (unitRaw > 0) qty = Math.min(qty, f.balance / unitRaw);
      qty = Math.max(0, Math.floor(qty * 10) / 10);

      const wasActive = f.active;
      f.active = qty > 0;
      if (wasActive !== f.active) world.touch(f);
      if (!f.active) continue;

      for (const [input, ratio] of Object.entries(sd.inputs ?? {})) f.stock[input].qty -= qty * ratio;
      f.balance -= qty * unitRaw;
      out.qty += qty;
      bus.emit('factory:produced', { factory: f, qty, workers });
    }
  }
}
