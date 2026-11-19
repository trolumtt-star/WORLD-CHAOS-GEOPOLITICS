const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

/**
 * Devlet her gece 00:00'da otomatik vergi keser. Oranlar world.policy'de; belediye başkanı değiştirir.
 *  - Gelir vergisi: günlük kazanç
 *  - KDV: işletmelerin günlük cirosu
 *  - Emlak vergisi: özel mülk değeri (ödenmezse borç birikir)
 */
export class TaxSystem {
  name = 'tax';
  paid = new Map();

  onDay(time, { world, bus }) {
    const { incomeTax, salesTax, propertyTax } = world.policy;
    const c = { income: 0, sales: 0, property: 0 };

    const villageTax = {}; // köy sahibi oyuncu -> toplanan vergi
    const paid = new Map(); // oyuncu -> ödediği toplam vergi (bildirim)
    for (const who of [...world.npcs.values(), ...world.players.values()]) {
      const tax = Math.min(Math.floor(who.earnedToday * incomeTax), Math.max(0, Math.floor(who.balance)));
      who.balance -= tax;
      if (who.token && tax > 0) paid.set(who, (paid.get(who) ?? 0) + tax);
      who.earnedToday = 0;
      // Oyuncunun topraklarında yaşayan NPC'nin vergisi köy sahibine gider
      const home = world.buildings.get(who.homeId);
      const lord = home && who.job !== undefined ? world.tileAt(home.x, home.z)?.owner : null;
      const lordP = lord && lord !== 'state' ? world.players.get(lord) : null;
      if (lordP && lordP !== who) {
        lordP.balance += tax;
        villageTax[lordP.id] = (villageTax[lordP.id] ?? 0) + tax;
      } else c.income += tax;
    }
    for (const [pid, amount] of Object.entries(villageTax)) {
      if (amount > 0) bus.emit('net:private', { playerId: pid, item: { category: 'tax', text: `🏰 Köyünden ${tl(amount)} vergi toplandı.` } });
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
        if (owner.token && paid > 0) this.paid.set(owner, (this.paid.get(owner) ?? 0) + paid);
      }
    }
    for (const p of world.players.values()) world.touchPlayer(p);
    // Herkese otomatik vergi makbuzu
    for (const [p, v] of this.paid) paid.set(p, (paid.get(p) ?? 0) + v);
    this.paid.clear();
    for (const [p, v] of paid) bus.emit('net:private', { playerId: p.id, item: { category: 'tax', text: `🏛️ Otomatik vergi kesildi: −${tl(v)} (gelir %${Math.round(incomeTax * 100)} + emlak)`, toast: 'info' } });

    const total = c.income + c.sales + c.property;
    world.treasury += total;
    bus.emit('economy:taxCollected', { day: time.day, ...c, total });
    bus.news('tax', `🏛️ Gün ${time.day - 1} vergileri: ${tl(total)} (gelir ${tl(c.income)}, KDV ${tl(c.sales)}, emlak ${tl(c.property)})`);
  }
}
