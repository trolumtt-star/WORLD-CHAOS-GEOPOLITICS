import { BUILDING_TYPES } from '../data/buildingTypes.js';
import { buildingMaxHp } from '../data/military.js';

/**
 * Bina = parsel üstündeki her şey (ev, dükkan, fabrika, arsa, park, askeri tesis).
 * Tip değişebilir: arsa -> inşaat -> market -> (füze) -> enkaz -> arsa
 */
export class Building {
  constructor({ id, type, subtype = null, variant = 0, name, address, x, z, width, depth, height, door, value, balance = 0 }) {
    this.id = id;
    this.type = type;
    this.subtype = subtype;   // fabrika için ürün tipi
    this.variant = variant;   // görsel çeşitlilik için
    this.name = name;
    this.address = address;
    this.x = x;
    this.z = z;
    this.width = width;
    this.depth = depth;
    this.height = height;
    this.door = door;         // her zaman yatay bir yolun üstünde

    // --- Tapu / emlak ---
    this.value = value;
    this.ownerKind = 'state'; // 'state' | 'npc' | 'player'
    this.ownerId = null;
    this.forSale = false;
    this.salePrice = 0;
    this.taxDebt = 0;
    this.rentPerResident = 0;

    // --- İnşaat / hasar ---
    this.construction = null; // { progress: 0..1, hours }
    this.maxHp = buildingMaxHp(this);
    this.hp = this.maxHp;
    this.destroyed = false;

    // --- İşletme ---
    this.balance = balance;   // işletme kasası
    this.stock = {};          // ürün -> { qty, price, sell, autoRestock, restockTo, incoming, soldToday, stockouts }
    this.revenueToday = 0;
    this.unpaidHours = 0;
    this.active = false;      // fabrika şu an üretiyor mu (duman efekti)

    // --- İnsanlar ---
    this.capacity = 0;
    this.residentIds = [];
    this.employeeIds = [];
    this.playerWorkerIds = [];
    this.occupants = new Set();

    // --- Suç ---
    this.crimeHeat = 0;
    this.lastRobbedAt = 0;
  }

  get def() { return BUILDING_TYPES[this.type]; }
  get category() { return this.def.category; }
  get operational() { return !this.destroyed && !this.construction; }
  get isBusiness() { return this.category === 'commercial' || this.category === 'industrial'; }

  // İstemcinin binayı çizmesi için gereken her şey (değişince BUILDING_UPDATE ile tekrar gider)
  toPublic() {
    return {
      id: this.id, type: this.type, subtype: this.subtype, variant: this.variant, name: this.name,
      x: this.x, z: this.z, width: this.width, depth: this.depth, height: this.height, door: this.door,
      ownerKind: this.ownerKind, ownerId: this.ownerKind === 'player' ? this.ownerId : null,
      forSale: this.forSale, price: this.forSale ? this.salePrice : 0,
      construction: this.construction ? { progress: Math.round(this.construction.progress * 100) / 100 } : null,
      hp: this.maxHp ? Math.round((this.hp / this.maxHp) * 100) / 100 : 1,
      destroyed: this.destroyed,
      active: this.active,
    };
  }
}
