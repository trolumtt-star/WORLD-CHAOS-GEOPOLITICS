import { UNIT_TYPES, AIR_TYPES } from '../data/military.js';

const r1 = (n) => Math.round(n * 10) / 10;

export class Unit {
  constructor({ id, type, ownerId, color, x, z }) {
    const def = UNIT_TYPES[type] ?? AIR_TYPES[type];
    this.id = id;
    this.type = type;
    this.ownerId = ownerId;
    this.color = color;
    this.x = x;
    this.z = z;
    this.rotY = 0;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.path = [];
    this.cooldown = 0;
    this.attackTarget = null;
  }

  get def() { return UNIT_TYPES[this.type] ?? AIR_TYPES[this.type]; }

  toMeta() {
    return { id: this.id, type: this.type, ownerId: this.ownerId, color: this.color, x: this.x, z: this.z, rotY: this.rotY, hp: 1, air: !!this.def.air, alt: this.alt ?? 0 };
  }

  toSnapshot() {
    return [this.id, r1(this.x), r1(this.z), r1(this.rotY), Math.round((this.hp / this.maxHp) * 100) / 100, r1(this.aimRot ?? this.rotY), r1(this.alt ?? 0)];
  }
}

// Lojistik kamyonları (ileride: otobüs, taksi, polis aracı)
export class Vehicle {
  constructor({ id, kind, x, z, product, qty, fromId, toId, path, speed }) {
    Object.assign(this, { id, kind, x, z, product, qty, fromId, toId, path, speed });
    this.rotY = 0;
  }

  toMeta() { return { id: this.id, kind: this.kind, product: this.product, x: this.x, z: this.z, era: this.era ?? 4 }; }
  toSnapshot() { return [this.id, r1(this.x), r1(this.z), r1(this.rotY)]; }
}
