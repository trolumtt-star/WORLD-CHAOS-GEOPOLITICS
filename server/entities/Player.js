const r2 = (n) => Math.round(n * 100) / 100;

export class Player {
  constructor({ id, token, name, color, balance, x, z, maxSpeed }) {
    this.id = id;
    this.token = token;       // yeniden bağlanma anahtarı (telefon uyku moduna girse de karakter kaybolmaz)
    this.socketId = null;
    this.online = false;
    this.name = name;
    this.color = color;
    this.balance = balance;
    this.x = x;
    this.z = z;
    this.rotY = 0;

    this.maxSpeed = maxSpeed;
    this.moveBudget = maxSpeed;
    this.lastMoveAt = Date.now();

    this.earnedToday = 0;
    this.ownedBuildingIds = [];
    this.jobBuildingId = null;

    // Hukuk
    this.wanted = 0;          // 0..5 yıldız
    this.jailedUntil = 0;     // totalHours
    this.lastRobAt = 0;

    // Siyaset
    this.title = 'Vatandaş';
    this.isMayor = false;

    // --- İleride: Tech Tree, ülke, ittifak ---
    this.techLevel = 2;       // MVP: kara ordusu açık
    this.countryId = null;
    this.allianceIds = [];
  }

  toPublic() {
    return { id: this.id, name: this.name, color: this.color, x: this.x, z: this.z, rotY: this.rotY, title: this.title };
  }

  toSnapshot() {
    return [this.id, r2(this.x), r2(this.z), r2(this.rotY)];
  }

  // Sadece bu oyuncuya giden özel durum
  toPrivate(world) {
    return {
      balance: Math.round(this.balance),
      wanted: this.wanted,
      jailedUntil: this.jailedUntil,
      jailed: this.jailedUntil > world.clockHours(),
      title: this.title,
      isMayor: this.isMayor,
      jobBuildingId: this.jobBuildingId,
      owned: this.ownedBuildingIds,
    };
  }
}
