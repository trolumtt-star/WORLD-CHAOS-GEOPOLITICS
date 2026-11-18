import { playerEra } from '../data/tech.js';

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

    // Köy, toprak, teknoloji
    this.isAI = false;        // NPC ülke mi
    this.countryName = null;  // ülke kurulunca
    this.village = null;      // { i, j } köy merkezi parseli
    this.homeId = null;       // Köy Konağı
    this.techs = [];          // öğrenilen teknolojiler
    this.research = null;     // { techId, hoursLeft, total }

    // --- İleride: ülke, ittifak ---
    this.countryId = null;
    this.allianceIds = [];
  }

  get era() { return playerEra(this); }

  toPublic() {
    return { id: this.id, name: this.name, color: this.color, x: this.x, z: this.z, rotY: this.rotY, title: this.title, era: this.era, countryName: this.countryName };
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
      techs: this.techs,
      research: this.research,
      era: this.era,
      village: this.village,
      homeId: this.homeId,
      ownedTiles: world.ownedTileCount(this.id),
      countryName: this.countryName,
      population: world.populationOf(this.id),
      wars: world.warsOf(this.id),
      justifications: world.justificationsOf(this.id),
    };
  }
}
