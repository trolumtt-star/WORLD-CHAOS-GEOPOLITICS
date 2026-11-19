/** Kıyafet, araba ve futbol kulübü katalogları (sunucu + istemci ortak). Fiyatlar enflasyonla çarpılır. */

// slot: top | bottom | hat | acc   ·  style: modelin nasıl çizileceği
export const OUTFITS = {
  tee_white:   { label: 'Beyaz Tişört',      slot: 'top', style: 'tee',    color: 0xf4f4f4, price: 120 },
  tee_black:   { label: 'Siyah Tişört',      slot: 'top', style: 'tee',    color: 0x1b1b1b, price: 120 },
  tee_red:     { label: 'Kırmızı Tişört',    slot: 'top', style: 'tee',    color: 0xc0392b, price: 140 },
  polo_navy:   { label: 'Lacivert Polo',     slot: 'top', style: 'tee',    color: 0x1f2a44, price: 260 },
  hoodie_grey: { label: 'Gri Kapşonlu',      slot: 'top', style: 'hoodie', color: 0x7f8c8d, price: 420 },
  hoodie_pink: { label: 'Pembe Kapşonlu',    slot: 'top', style: 'hoodie', color: 0xff7ab6, price: 450 },
  jacket_lthr: { label: 'Deri Ceket',        slot: 'top', style: 'jacket', color: 0x2b1d12, price: 1400 },
  jacket_jean: { label: 'Kot Ceket',         slot: 'top', style: 'jacket', color: 0x3d6fa5, price: 800 },
  suit_black:  { label: 'Siyah Takım Elbise', slot: 'top', style: 'suit',  color: 0x15151a, price: 3200 },
  suit_white:  { label: 'Beyaz Takım Elbise', slot: 'top', style: 'suit',  color: 0xeeeeee, price: 3600 },
  jersey_yb:   { label: 'Sarı-Lacivert Forma', slot: 'top', style: 'jersey', color: 0xffd23f, color2: 0x1f2a6b, price: 650 },
  jersey_rw:   { label: 'Kırmızı-Beyaz Forma', slot: 'top', style: 'jersey', color: 0xd62828, color2: 0xffffff, price: 650 },
  dress_red:   { label: 'Kırmızı Elbise',    slot: 'top', style: 'dress',  color: 0xc81e3c, price: 1800 },
  dress_gold:  { label: 'Altın Gece Elbisesi', slot: 'top', style: 'dress', color: 0xd4af37, price: 5200 },
  jeans_blue:  { label: 'Mavi Kot',          slot: 'bottom', style: 'pants',  color: 0x2f5c9a, price: 300 },
  jeans_black: { label: 'Siyah Kot',         slot: 'bottom', style: 'pants',  color: 0x1c1c22, price: 320 },
  chino_beige: { label: 'Bej Kumaş Pantolon', slot: 'bottom', style: 'pants', color: 0xc8b48a, price: 450 },
  shorts_kh:   { label: 'Haki Şort',         slot: 'bottom', style: 'shorts', color: 0x6b6b45, price: 180 },
  track_black: { label: 'Eşofman Altı',      slot: 'bottom', style: 'pants',  color: 0x111111, color2: 0xffffff, price: 260 },
  skirt_black: { label: 'Siyah Etek',        slot: 'bottom', style: 'skirt',  color: 0x18181e, price: 380 },
  cap_red:     { label: 'Kırmızı Şapka',     slot: 'hat', style: 'cap',     color: 0xd62828, price: 90 },
  cap_black:   { label: 'Siyah Şapka',       slot: 'hat', style: 'cap',     color: 0x151515, price: 90 },
  beanie:      { label: 'Bere',              slot: 'hat', style: 'beanie',  color: 0x2e7d32, price: 110 },
  fedora:      { label: 'Fötr Şapka',        slot: 'hat', style: 'fedora',  color: 0x3b2a1a, price: 650 },
  cowboy:      { label: 'Kovboy Şapkası',    slot: 'hat', style: 'cowboy',  color: 0x8a5a2b, price: 700 },
  crown:       { label: 'Altın Taç',         slot: 'hat', style: 'crown',   color: 0xffd700, price: 25000 },
  glasses:     { label: 'Gözlük',            slot: 'acc', style: 'glasses', color: 0x222222, price: 250 },
  sunglasses:  { label: 'Güneş Gözlüğü',     slot: 'acc', style: 'sunglasses', color: 0x050505, price: 400 },
  chain:       { label: 'Altın Kolye',       slot: 'acc', style: 'chain',   color: 0xffd34d, price: 4500 },
  backpack:    { label: 'Sırt Çantası',      slot: 'acc', style: 'backpack', color: 0x2c3e50, price: 350 },
};

export const CARS = {
  sahin:   { label: 'Tofaş Şahin',      model: 'sedan',  color: 0xf2f2f2, price: 18000,  rent: 400,  speed: 24 },
  doblo:   { label: 'Fiat Doblo',       model: 'van',    color: 0xb03a2e, price: 26000,  rent: 550,  speed: 23 },
  corolla: { label: 'Toyota Corolla',   model: 'sedan',  color: 0x95a5a6, price: 42000,  rent: 800,  speed: 27 },
  pickup:  { label: 'Ford Ranger',      model: 'pickup', color: 0x1f3a93, price: 65000,  rent: 1100, speed: 27 },
  bmw:     { label: 'BMW M5',           model: 'sedan',  color: 0x111111, price: 140000, rent: 2400, speed: 34 },
  gwagon:  { label: 'Mercedes G-Class', model: 'suv',    color: 0x2d2d2d, price: 210000, rent: 3500, speed: 31 },
  ferrari: { label: 'Ferrari F8',       model: 'sport',  color: 0xd10000, price: 420000, rent: 7000, speed: 42 },
  lambo:   { label: 'Lamborghini',      model: 'sport',  color: 0xf5c400, price: 520000, rent: 8500, speed: 44 },
};
export const CAR_CODES = ['', ...Object.keys(CARS)];

export const CLUBS = [
  { name: 'Kaosspor', color: 0xffd23f, color2: 0x1f2a6b, power: 74 },
  { name: 'Merkez FK', color: 0xd62828, color2: 0xffffff, power: 70 },
  { name: 'Liman Gücü', color: 0x1e88e5, color2: 0xffffff, power: 66 },
  { name: 'Dağ Kartalları', color: 0x2e7d32, color2: 0x111111, power: 63 },
  { name: 'Nehir United', color: 0x8e24aa, color2: 0xffd23f, power: 60 },
  { name: 'Çarşı Spor', color: 0xff7043, color2: 0x263238, power: 57 },
];

export const priceOf = (base, mul = 1) => Math.round(base * mul);
