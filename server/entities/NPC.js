const r1 = (n) => Math.round(n * 10) / 10;

export class NPC {
  constructor({ id, name, age, gender, job, homeId, workId, balance, traits, speedFactor }) {
    this.id = id;
    this.name = name;
    this.age = age;
    this.gender = gender;
    this.job = job;
    this.homeId = homeId;     // null = evsiz
    this.workId = workId;
    this.balance = balance;
    this.alive = true;

    // Kişilik 0..1
    this.traits = traits;     // { greed, lawfulness, sociability, loyalty }

    // İhtiyaçlar
    this.hunger = 20;         // 0 tok, 100 açlıktan ölüyor
    this.happiness = 65;      // 0..100
    this.groceries = 2;       // evdeki yiyecek
    this.armed = false;

    // Rutin / konum
    this.activity = 'sleep';
    this.state = 'inside';    // 'inside' | 'moving'
    this.locationId = homeId;
    this.targetId = homeId;
    this.path = [];
    this.x = 0;
    this.z = 0;
    this.speedFactor = speedFactor;
    this.plan = {};           // günlük plan (NpcBrainSystem)
    this.targets = {};        // aktivite -> seçilen bina id

    // Ekonomi / hukuk
    this.earnedToday = 0;
    this.ownedBuildingIds = [];
    this.rentMissed = 0;
    this.jailedUntil = 0;     // totalHours
    this.criminalRecord = 0;

    // --- İleride ---
    this.factionId = null;    // mafya / milis
    this.votingIntent = null;
  }

  get visible() { return this.state === 'moving'; }
  get isBoss() { return this.ownedBuildingIds.length > 0; }

  toMeta() {
    return { id: this.id, name: this.name, job: this.job, gender: this.gender, x: this.x, z: this.z };
  }

  toSnapshot() {
    return [this.id, r1(this.x), r1(this.z), this.visible ? 1 : 0];
  }
}
