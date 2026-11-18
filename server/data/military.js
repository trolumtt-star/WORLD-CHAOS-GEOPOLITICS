// Askeri katalog. tech: gereken teknoloji seviyesi (Tech Tree için hazır alan).
export const UNIT_TYPES = {
  infantry: { label: 'Piyade Mangası', icon: '🪖', cost: 1500, hp: 100, speed: 9,  range: 28, damage: 7,  fireRate: 1.2, requires: 'barracks', tech: 2 },
  tank:     { label: 'Ana Muharebe Tankı', icon: '🛡️', cost: 6000, hp: 420, speed: 11, range: 45, damage: 32, fireRate: 0.5, requires: 'barracks', tech: 2 },
  // jet: { label: 'Savaş Jeti', requires: 'airbase', tech: 3, ... }  // ileride
};

export const MISSILE_TYPES = {
  tactical:  { label: 'Taktik Füze',         icon: '🎯', cost: 3000,   radius: 20,  damage: 700,    flightMs: 6000,  apex: 90,  interceptChance: 0.85 },
  ballistic: { label: 'Balistik Füze',       icon: '🚀', cost: 12000,  radius: 38,  damage: 2200,   flightMs: 10000, apex: 240, interceptChance: 0.7 },
  nuclear:   { label: 'Nükleer Başlık',      icon: '☢️', cost: 250000, radius: 120, damage: 999999, flightMs: 16000, apex: 420, interceptChance: 0.55, radiationHours: 48, globalAlert: true },
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
