import { playerEra } from '../data/tech.js';
import { POSES, WEAPON_CODES } from '../../shared/interiors.js';
import { CAR_CODES } from '../../shared/catalogs.js';

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

    // Hayat: 0..100 (100 = iyi)
    this.food = 85;
    this.water = 85;
    this.energy = 90;
    this.health = 100;
    this.dead = false;
    this.respawnAt = 0;
    this.pose = '';           // '' | sit | sleep | dead | work
    this.tv = false;
    this.inside = null;       // içinde bulunulan bina id
    this.inventory = { food: 2, drink: 2 };
    this.weapons = ['fist'];
    this.weapon = 'fist';
    this.ammo = { pistol: 0, rifle: 0 };
    this.lastAttackAt = 0;
    this.shift = null;        // { buildingId, task, done, hourDone }
    this.citizenOf = null;    // vatandaşı olunan ülke (oyuncu/NPC ülke id) ya da 'state'

    // --- İleride: ülke, ittifak ---
    this.countryId = null;
    this.allianceIds = [];
  }

  get era() { return playerEra(this); }

  toPublic() {
    return { id: this.id, name: this.name, color: this.color, x: this.x, z: this.z, rotY: this.rotY, title: this.title, era: this.era, countryName: this.countryName, outfit: this.outfit ?? {}, gender: this.gender ?? 'm' };
  }

  toSnapshot() {
    return [this.id, r2(this.x), r2(this.z), r2(this.rotY), POSES.indexOf(this.pose), WEAPON_CODES.indexOf(this.weapon), this.inside ?? 0, this.driving ? CAR_CODES.indexOf(this.driving) : this.rideWith ? -this.seat : 0, this.rideWith ?? 0];
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
      rent: this.rent ?? null,
      gender: this.gender ?? 'm',
      ownedTiles: world.ownedTileCount(this.id),
      countryName: this.countryName,
      population: world.populationOf(this.id),
      wars: world.warsOf(this.id),
      justifications: world.justificationsOf(this.id),
      citizenOf: this.citizenOf,
      overlordId: this.overlordId ?? null,
      overlordName: this.overlordId ? (world.players.get(this.overlordId)?.countryName ?? null) : null,
      puppets: [...world.players.values()].filter((o) => o.overlordId === this.id).map((o) => o.countryName ?? o.name),
      citizenName: this.citizenName ?? null,
      food: Math.round(this.food), water: Math.round(this.water), energy: Math.round(this.energy), health: Math.round(this.health),
      dead: this.dead, respawnAt: this.respawnAt, pose: this.pose, tv: this.tv,
      inside: this.inside,
      inventory: this.inventory,
      fridge: this.inside ? world.buildings.get(this.inside)?.fridge ?? null : null,
      weapons: this.weapons, weapon: this.weapon, ammo: this.ammo,
      shift: this.shift ? { buildingId: this.shift.buildingId, done: this.shift.done, task: this.shift.task && { label: this.shift.task.label, spotId: this.shift.task.spotId, secs: this.shift.task.secs } } : null,
      incident: world.incidentFor?.(this) ?? null,
      followers: this.followers ?? 0,
      admin: this.admin ?? null,
      chase: world.chaseFor?.(this) ?? null,
      org: world.orgFor?.(this) ?? null,
      ...(world.societyFor?.(this) ?? {}),
    };
  }
}
