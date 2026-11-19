// Askeri katalog. tech: gereken teknoloji seviyesi (Tech Tree için hazır alan).
// melee: yakın dövüş (iz yok, kıvılcım) · combat:false -> savaşmaz (kaşif)
export const UNIT_TYPES = {
  scout:     { label: 'Kaşif',              icon: '🧭', cost: 100,  hp: 30,  speed: 18, range: 0,  damage: 0,  fireRate: 0,   combat: false },
  swordsman: { label: 'Kılıçlı Asker',      icon: '⚔️', cost: 300,  hp: 225,  speed: 8,  range: 5,  damage: 9,  fireRate: 1,   requires: 'barracks', melee: true },
  archer:    { label: 'Okçu Birliği',       icon: '🏹', cost: 450,  hp: 150,  speed: 8,  range: 30, damage: 6,  fireRate: 0.9, requires: 'barracks', projectile: 'arrow' },
  cavalry:   { label: 'Süvari',             icon: '🐎', cost: 800,  hp: 350, speed: 16, range: 6,  damage: 14, fireRate: 1,   requires: 'barracks', melee: true },
  musketeer: { label: 'Tüfekli Asker',      icon: '🔫', cost: 900,  hp: 200,  speed: 8,  range: 34, damage: 10, fireRate: 0.6, requires: 'barracks' },
  cannon:    { label: 'Top Bataryası',      icon: '💣', cost: 2200, hp: 400, speed: 5,  range: 55, damage: 40, fireRate: 0.25, requires: 'barracks', projectile: 'ball' },
  infantry:  { label: 'Modern Piyade',      icon: '🪖', cost: 1500, hp: 250, speed: 9,  range: 32, damage: 8,  fireRate: 1.4, requires: 'barracks' },
  tank:      { label: 'Ana Muharebe Tankı', icon: '🛡️', cost: 6000, hp: 1050, speed: 11, range: 45, damage: 32, fireRate: 0.5, requires: 'barracks' },
  // Sokak: polis memuru ve çete üyesi (savaşmaz, sistemler yönetir)
  // fight: sokak çatışmasına girer (OrgSystem) · dmg/range/cd: tabanca-tüfek değerleri
  cop:      { label: 'Polis Memuru',      icon: '👮', cost: 0, hp: 120, speed: 9,  range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 9,  range: 24, cd: 1.1 } },
  swat:     { label: 'Özel Harekât',      icon: '🪖', cost: 0, hp: 240, speed: 11, range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 16, range: 32, cd: 0.8 } },
  gang:     { label: 'Çete Üyesi',        icon: '🕶️', cost: 0, hp: 110, speed: 14, range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 10, range: 24, cd: 1.1 } },
  guard:    { label: 'Koruma',            icon: '🛡️', cost: 0, hp: 180, speed: 15, range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 13, range: 26, cd: 0.9 } },
  hitman:   { label: 'Kiralık Katil',     icon: '🎯', cost: 0, hp: 140, speed: 15, range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 30, range: 34, cd: 1.3 } },
  bomber:   { label: 'Bombacı',           icon: '💣', cost: 0, hp: 120, speed: 14, range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 8,  range: 20, cd: 1.2 } },
  enforcer: { label: 'Tetikçi',           icon: '🔫', cost: 0, hp: 160, speed: 14, range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 14, range: 28, cd: 0.9 } },
  kidnapper:{ label: 'Kaçırıcı',          icon: '🥷', cost: 0, hp: 140, speed: 16, range: 0, damage: 0, fireRate: 0, combat: false, street: true, fight: { dmg: 9,  range: 22, cd: 1.1 } },
  gangcar:  { label: 'Kartel Aracı',      icon: '🚙', cost: 0, hp: 420, speed: 34, range: 0, damage: 0, fireRate: 0, combat: false, street: true, car: true },
  // Faz 3: jet, helicopter, drone, siha
};

// Hava görevi: üsten kalkar, hedefe gider, vurur, geri döner. adHit = hava savunmasının düşürme şansı
export const AIR_TYPES = {
  jet:   { label: 'F-16 Savaş Jeti',      icon: '✈️', cost: 4000,   hp: 1, speed: 85, alt: 60,  attack: 'missiles', radius: 16, damage: 900,  strikes: 2, adHit: 0.5,  air: true },
  heli:  { label: 'Taarruz Helikopteri',  icon: '🚁', cost: 3500,   hp: 1, speed: 38, alt: 22,  attack: 'gun', range: 34, dps: 70, hover: 9, adHit: 0.6, air: true },
  drone: { label: 'SİHA',                 icon: '🎯', cost: 2500,   hp: 1, speed: 48, alt: 48,  attack: 'missiles', radius: 10, damage: 750, strikes: 1, adHit: 0.55, air: true },
  bomber:{ label: 'Bombardıman Uçağı',    icon: '🛩️', cost: 6000,   hp: 1, speed: 60, alt: 70,  attack: 'carpet', radius: 5, damage: 520, strikes: 12, adHit: 0.45, air: true },
  b2:    { label: 'B-2 Spirit (Nükleer)', icon: '🦇', cost: 250000, hp: 1, speed: 52, alt: 115, attack: 'nuke', adHit: 0.15, air: true },
};

export const MISSILE_TYPES = {
  tactical:  { label: 'Taktik Füze',         icon: '🎯', cost: 3000,   radius: 20,  damage: 700,    flightMs: 6000,  apex: 90,  interceptChance: 0.85 },
  ballistic: { label: 'Balistik Füze',       icon: '🚀', cost: 12000,  radius: 38,  damage: 2200,   flightMs: 10000, apex: 240, interceptChance: 0.7 },
  nuclear:   { label: 'Nükleer Bomba',       icon: '☢️', cost: 0,      radius: 120, damage: 999999, flightMs: 16000, apex: 420, interceptChance: 0.55, radiationHours: 48, globalAlert: true, airOnly: true },
};

export const AIR_DEFENSE = {
  interceptorFlightMs: 1500,
  reloadMs: 4000,
};

// Bina dayanıklılığı (hacme göre)
export function buildingMaxHp(b) {
  if (b.type === 'land' || b.type === 'park') return 1;
  return Math.round(Math.min(8000, Math.max(300, b.width * b.depth * Math.max(b.height, 4) * 0.15)));
}
