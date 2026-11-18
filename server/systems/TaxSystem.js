const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

/**
 * Devlet her gece 00:00'da otomatik vergi keser. Oranlar world.policy'de; belediye başkanı değiştirir.
 *  - Gelir vergisi: günlük kazanç
 *  - KDV: işletmelerin günlük cirosu
 *  - Emlak vergisi: özel mülk değeri (ödenmezse borç birikir)
 */
export class TaxSystem {
  name = 'tax';

  onDay(time, { world, bus }) {
    const { incomeTax, salesTax, propertyTax } = world.policy;
    const c = { income: 0, sales: 0, property: 0 };

    for (const who of [...world.npcs.values(), ...world.players.values()]) {
      const tax = Math.min(Math.floor(who.earnedToday * incomeTax), Math.max(0, Math.floor(who.balance)));
      who.balance -= tax;
      c.income += tax;
      who.earnedToday = 0;
    }

    for (const b of world.buildings.values()) {
      if (b.isBusiness && b.revenueToday > 0) {
        const tax = Math.min(Math.floor(b.revenueToday * salesTax), Math.max(0, Math.floor(b.balance)));
        b.balance -= tax;
        c.sales += tax;
      }
      b.revenueYesterday = b.revenueToday;
      b.revenueToday = 0;

      const owner = world.getOwner(b);
      if (owner) {
        const due = Math.ceil(b.value * propertyTax) + b.taxDebt;
        const paid = Math.min(due, Math.max(0, Math.floor(owner.balance)));
        owner.balance -= paid;
        b.taxDebt = due - paid;
        c.property += paid;
      }
    }
    for (const p of world.players.values()) world.touchPlayer(p);

    const total = c.income + c.sales + c.property;
    world.treasury += total;
    bus.emit('economy:taxCollected', { day: time.day, ...c, total });
    bus.news('tax', `🏛️ Gün ${time.day - 1} vergileri: ${tl(total)} (gelir ${tl(c.income)}, KDV ${tl(c.sales)}, emlak ${tl(c.property)})`);
  }
}
