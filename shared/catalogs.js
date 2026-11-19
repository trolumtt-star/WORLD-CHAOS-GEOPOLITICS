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
  // ---------- LÜKS (lux: gold | diamond | platinum | silk) ----------
  suit_gold:    { label: 'Altın Kaplama Takım',     slot: 'top', style: 'suit',   color: 0xd4af37, lux: 'gold',     price: 45000 },
  suit_diamond: { label: 'Elmas İşlemeli Takım',    slot: 'top', style: 'suit',   color: 0xdff6ff, lux: 'diamond',  price: 180000 },
  suit_plat:    { label: 'Platin Takım',            slot: 'top', style: 'suit',   color: 0xc9ccd1, lux: 'platinum', price: 90000 },
  tux_velvet:   { label: 'Kadife Smokin',           slot: 'top', style: 'suit',   color: 0x4a0d2b, lux: 'silk',     price: 22000 },
  jacket_gold:  { label: 'Altın Deri Ceket',        slot: 'top', style: 'jacket', color: 0xc9a227, lux: 'gold',     price: 38000 },
  jacket_croc:  { label: 'Timsah Derisi Ceket',     slot: 'top', style: 'jacket', color: 0x2f3b1d, lux: 'silk',     price: 30000 },
  hoodie_gold:  { label: 'Altın Kapşonlu',          slot: 'top', style: 'hoodie', color: 0xe0b030, lux: 'gold',     price: 18000 },
  hoodie_diam:  { label: 'Elmas Taşlı Kapşonlu',    slot: 'top', style: 'hoodie', color: 0xe8f9ff, lux: 'diamond',  price: 95000 },
  dress_diam:   { label: 'Elmas Gece Elbisesi',     slot: 'top', style: 'dress',  color: 0xeaf8ff, lux: 'diamond',  price: 220000 },
  dress_silk:   { label: 'İpek Abiye',              slot: 'top', style: 'dress',  color: 0x7a1030, lux: 'silk',     price: 26000 },
  pants_gold:   { label: 'Altın Pantolon',          slot: 'bottom', style: 'pants', color: 0xc9a227, lux: 'gold',   price: 16000 },
  pants_diam:   { label: 'Elmas Pantolon',          slot: 'bottom', style: 'pants', color: 0xdff6ff, lux: 'diamond', price: 80000 },
  pants_silk:   { label: 'İpek Kumaş Pantolon',     slot: 'bottom', style: 'pants', color: 0x1a1a24, lux: 'silk',   price: 9000 },
  skirt_gold:   { label: 'Altın Payetli Etek',      slot: 'bottom', style: 'skirt', color: 0xd4af37, lux: 'gold',   price: 15000 },
  crown_diam:   { label: 'Elmas Taç',               slot: 'hat', style: 'crown',  color: 0xe8f9ff, lux: 'diamond',  price: 350000 },
  crown_plat:   { label: 'Platin Taç',              slot: 'hat', style: 'crown',  color: 0xd9dce1, lux: 'platinum', price: 120000 },
  fedora_gold:  { label: 'Altın Fötr',              slot: 'hat', style: 'fedora', color: 0xd4af37, lux: 'gold',     price: 21000 },
  cap_diam:     { label: 'Elmas Şapka',             slot: 'hat', style: 'cap',    color: 0xe8f9ff, lux: 'diamond',  price: 60000 },
  cowboy_gold:  { label: 'Altın Kovboy Şapkası',    slot: 'hat', style: 'cowboy', color: 0xd4af37, lux: 'gold',     price: 24000 },
  chain_diam:   { label: 'Elmas Kolye',             slot: 'acc', style: 'chain',  color: 0xe8f9ff, lux: 'diamond',  price: 150000 },
  chain_plat:   { label: 'Platin Zincir',           slot: 'acc', style: 'chain',  color: 0xd9dce1, lux: 'platinum', price: 40000 },
  chain_cuban:  { label: 'Kalın Altın Küba Zinciri', slot: 'acc', style: 'chain', color: 0xffc83d, lux: 'gold', thick: true, price: 65000 },
  shades_gold:  { label: 'Altın Çerçeve Gözlük',    slot: 'acc', style: 'sunglasses', color: 0xd4af37, lux: 'gold', price: 12000 },
  shades_diam:  { label: 'Elmas Gözlük',            slot: 'acc', style: 'sunglasses', color: 0xe8f9ff, lux: 'diamond', price: 75000 },
};

/**
 * Arabalar. model: gövde şekli (sedan, sport, hyper, suv, offroad, pickup, van, limo, coupe, muscle, hatch, armored)
 * org: true -> örgüt filosuna alınabilir (zırhlı / ekip aracı). armor: canı çarpar.
 * Sıra önemlidir: CAR_CODES ağ kodu (yeni araçlar sona eklenir).
 */
export const CARS = {
  sahin:    { label: 'Tofaş Şahin',            model: 'sedan',   color: 0xf2f2f2, price: 18000,   rent: 400,   speed: 24, seats: 4 },
  doblo:    { label: 'Fiat Doblo',             model: 'van',     color: 0xb03a2e, price: 26000,   rent: 550,   speed: 23, seats: 4, org: true },
  corolla:  { label: 'Toyota Corolla',         model: 'sedan',   color: 0x95a5a6, price: 42000,   rent: 800,   speed: 27, seats: 4 },
  pickup:   { label: 'Ford Ranger',            model: 'pickup',  color: 0x1f3a93, price: 65000,   rent: 1100,  speed: 27, seats: 2, org: true },
  bmw:      { label: 'BMW M5',                 model: 'sedan',   color: 0x111111, price: 140000,  rent: 2400,  speed: 34, seats: 4, org: true },
  gwagon:   { label: 'Mercedes G-Class',       model: 'offroad', color: 0x2d2d2d, price: 210000,  rent: 3500,  speed: 31, seats: 4, org: true, armor: 1.3 },
  ferrari:  { label: 'Ferrari F8',             model: 'sport',   color: 0xd10000, price: 420000,  rent: 7000,  speed: 42, seats: 2 },
  lambo:    { label: 'Lamborghini',            model: 'hyper',   color: 0xf5c400, price: 520000,  rent: 8500,  speed: 44, seats: 2 },
  // ---- yeni lüks seri ----
  aurum_s:  { label: 'Aurum S-Klasse',         model: 'sedan',   color: 0x0f1a2b, price: 260000,  rent: 4200,  speed: 35, seats: 4, chrome: true },
  phantom:  { label: 'Regalia Phantom',        model: 'limo',    color: 0x111114, color2: 0xc0c0c0, price: 1200000, rent: 18000, speed: 33, seats: 4, chrome: true },
  stretch:  { label: 'Beyaz Stretch Limuzin',  model: 'limo',    color: 0xf5f5f5, price: 680000,  rent: 9000,  speed: 30, seats: 4, chrome: true, long: true },
  veloce:   { label: 'Veloce GT Coupé',        model: 'coupe',   color: 0x1c5fd6, price: 330000,  rent: 5200,  speed: 39, seats: 2 },
  bianca:   { label: 'Bianca Spider',          model: 'sport',   color: 0xffffff, color2: 0x111111, price: 480000, rent: 7600, speed: 42, seats: 2 },
  nero:     { label: 'Nero Hypercar',          model: 'hyper',   color: 0x0b0b0b, color2: 0xff5a00, price: 2400000, rent: 30000, speed: 50, seats: 2 },
  oro:      { label: 'Oro Altın Hypercar',     model: 'hyper',   color: 0xd4af37, price: 5000000, rent: 60000, speed: 52, seats: 2, gold: true },
  diamante: { label: 'Diamante Edition',       model: 'hyper',   color: 0xdff6ff, price: 8000000, rent: 90000, speed: 53, seats: 2, diamond: true },
  mustang:  { label: 'Bronco Muscle V8',       model: 'muscle',  color: 0xff8c00, color2: 0x111111, price: 150000, rent: 2600, speed: 37, seats: 4 },
  cuda:     { label: 'Barracuda 440',          model: 'muscle',  color: 0x6a0dad, color2: 0xffffff, price: 170000, rent: 2900, speed: 38, seats: 4 },
  golfr:    { label: 'Volt R Hatch',           model: 'hatch',   color: 0x2ecc71, price: 90000,   rent: 1500,  speed: 32, seats: 4 },
  range:    { label: 'Royal Rover',            model: 'suv',     color: 0x2c3e50, price: 380000,  rent: 6000,  speed: 33, seats: 4, chrome: true, org: true },
  cullinan: { label: 'Regalia Cullinan',       model: 'suv',     color: 0x7a1f2b, price: 1500000, rent: 22000, speed: 34, seats: 4, chrome: true },
  raptor:   { label: 'Raptor Off-Road',        model: 'pickup',  color: 0x3a3a3a, color2: 0xff4500, price: 210000, rent: 3400, speed: 33, seats: 4, org: true },
  sprinter: { label: 'Kartel Sprinter Van',    model: 'van',     color: 0x0c0c0c, price: 120000,  rent: 2000,  speed: 29, seats: 4, org: true, armor: 1.2 },
  tank_suv: { label: 'Zırhlı Escalade',        model: 'armored', color: 0x050505, price: 900000,  rent: 14000, speed: 31, seats: 4, org: true, armor: 2.5, chrome: true },
  hummer:   { label: 'H1 Askeri Jip',          model: 'offroad', color: 0x4b5320, price: 450000,  rent: 7000,  speed: 30, seats: 4, org: true, armor: 1.8 },
  technical:{ label: 'Silahlı Pikap (Teknik)', model: 'pickup',  color: 0x8a7b5a, price: 300000,  rent: 5000,  speed: 30, seats: 2, org: true, armor: 1.4, gun: true },
};

/** Helikopterler. model: light | exec | twin | military | gunship | cargo · org: saldırı yapabilir */
export const HELIS = {
  robin:     { label: 'Robin R22 Mini',         model: 'light',    color: 0xd62828, price: 350000,  speed: 45, seats: 2 },
  colibri:   { label: 'Colibri 120',            model: 'light',    color: 0x2e86de, price: 480000,  speed: 48, seats: 2 },
  jetranger: { label: 'JetRanger Klasik',       model: 'light',    color: 0xf5f5f5, color2: 0x1f2a44, price: 700000, speed: 50, seats: 4 },
  ecureuil:  { label: 'Écureuil B3',            model: 'exec',     color: 0xffc300, price: 1100000, speed: 54, seats: 4 },
  vip109:    { label: 'VIP 109 Grand',          model: 'exec',     color: 0x111111, color2: 0xd4af37, price: 2200000, speed: 60, seats: 4 },
  aw139:     { label: 'Executive 139',          model: 'twin',     color: 0x1b2631, color2: 0xc0c0c0, price: 4500000, speed: 62, seats: 4 },
  s76:       { label: 'Sky Sovereign 76',       model: 'twin',     color: 0xffffff, color2: 0x7a1f2b, price: 6000000, speed: 64, seats: 4 },
  goldhawk:  { label: 'Altın Şahin VIP',        model: 'twin',     color: 0xd4af37, price: 12000000, speed: 66, seats: 4, gold: true },
  diamondsky:{ label: 'Elmas Gökyüzü',          model: 'exec',     color: 0xe8f9ff, price: 20000000, speed: 68, seats: 4, diamond: true },
  medevac:   { label: 'Sağlık Helikopteri',     model: 'twin',     color: 0xf1c40f, color2: 0xc0392b, price: 3200000, speed: 58, seats: 4 },
  police:    { label: 'Polis Helikopteri',      model: 'light',    color: 0x1f3a93, color2: 0xffffff, price: 1800000, speed: 56, seats: 4 },
  huey:      { label: 'Huey Nakliye',           model: 'military', color: 0x4b5320, price: 2500000, speed: 52, seats: 4, org: true, dmg: 10, armor: 1.3 },
  blackhawk: { label: 'Kara Şahin',             model: 'military', color: 0x1e2420, price: 7000000, speed: 60, seats: 4, org: true, dmg: 16, armor: 1.8 },
  littlebird:{ label: 'Küçük Kuş Taarruz',      model: 'light',    color: 0x0b0b0b, price: 3000000, speed: 62, seats: 2, org: true, dmg: 14, armor: 1.1, guns: true },
  cobra:     { label: 'Kobra Taarruz',          model: 'gunship',  color: 0x3d4a2f, price: 9000000, speed: 64, seats: 2, org: true, dmg: 26, armor: 2, bombs: true },
  apache:    { label: 'Apaçi Taarruz',          model: 'gunship',  color: 0x2b3424, price: 14000000, speed: 66, seats: 2, org: true, dmg: 34, armor: 2.6, bombs: true },
  tiger:     { label: 'Kaplan Saldırı',         model: 'gunship',  color: 0x6b6f5a, price: 12000000, speed: 68, seats: 2, org: true, dmg: 30, armor: 2.3, bombs: true },
  hind:      { label: 'Timsah Ağır Taarruz',    model: 'gunship',  color: 0x5b6b4b, color2: 0x3a3a2a, price: 18000000, speed: 60, seats: 4, org: true, dmg: 40, armor: 3.2, bombs: true },
  chinook:   { label: 'Çift Rotor Kargo',       model: 'cargo',    color: 0x55602f, price: 10000000, speed: 50, seats: 4, org: true, dmg: 8, armor: 2.5 },
  stealth:   { label: 'Gölge Hayalet',          model: 'gunship',  color: 0x111111, price: 30000000, speed: 72, seats: 2, org: true, dmg: 45, armor: 2.8, bombs: true },
};

/** Lüks evler (Arsa › İnşa Et › Lüks Ev). style: modern | glass | classic | tuscan | tower | palace */
export const LUX_HOUSES = {
  aqua:     { label: 'Aqua Modern Villa',       style: 'modern',  floors: 2, pool: true,  color: 0xf2f2f2, accent: 0x2c3e50, cost: 250000,  hours: 12 },
  cube:     { label: 'Beyaz Küp Villa',          style: 'modern',  floors: 3, pool: true,  color: 0xffffff, accent: 0x111111, cost: 380000,  hours: 14 },
  glass:    { label: 'Cam Köşk',                 style: 'glass',   floors: 2, pool: true,  color: 0xdfe6e9, accent: 0x1b2631, cost: 520000,  hours: 14 },
  skyglass: { label: 'Gökyüzü Cam Rezidans',     style: 'glass',   floors: 4, pool: true,  color: 0xd6eaf8, accent: 0x34495e, cost: 900000,  hours: 18 },
  sunset:   { label: 'Gün Batımı Villası',       style: 'tuscan',  floors: 2, pool: true,  color: 0xf0d9b5, accent: 0xa0522d, cost: 300000,  hours: 12 },
  toscana:  { label: 'Toskana Çiftlik Evi',      style: 'tuscan',  floors: 2, pool: false, color: 0xe6c79c, accent: 0x8b4513, cost: 220000,  hours: 10 },
  marbella: { label: 'Marbella Sahil Evi',       style: 'tuscan',  floors: 3, pool: true,  color: 0xfaf3e0, accent: 0xc0392b, cost: 600000,  hours: 15 },
  colonial: { label: 'Sütunlu Konak',            style: 'classic', floors: 2, pool: false, color: 0xf8f8f0, accent: 0x2c3e50, cost: 450000,  hours: 14 },
  whitehouse:{ label: 'Beyaz Saray Konağı',      style: 'classic', floors: 3, pool: true,  color: 0xffffff, accent: 0x1f2a44, cost: 1500000, hours: 20 },
  chateau:  { label: 'Şato Malikanesi',          style: 'classic', floors: 3, pool: true,  color: 0xe8e0d0, accent: 0x3b3b5b, cost: 2500000, hours: 22 },
  bosphorus:{ label: 'Boğaz Yalısı',             style: 'classic', floors: 3, pool: false, color: 0xf3e5d0, accent: 0x6d4c41, cost: 1800000, hours: 20 },
  tower:    { label: 'Penthouse Kulesi',         style: 'tower',   floors: 8, pool: true,  color: 0x2c3e50, accent: 0xd4af37, cost: 3000000, hours: 24 },
  obsidian: { label: 'Obsidyen Kule',            style: 'tower',   floors: 10, pool: true, color: 0x111111, accent: 0x8e44ad, cost: 4500000, hours: 26 },
  goldtower:{ label: 'Altın Kule',               style: 'tower',   floors: 12, pool: true, color: 0xd4af37, accent: 0x111111, cost: 9000000, hours: 30, gold: true },
  palazzo:  { label: 'Palazzo Saray',            style: 'palace',  floors: 3, pool: true,  color: 0xf5e6c8, accent: 0xb8860b, cost: 6000000, hours: 28 },
  sultan:   { label: 'Sultan Sarayı',            style: 'palace',  floors: 3, pool: true,  color: 0xfdf5e6, accent: 0x1abc9c, cost: 12000000, hours: 32, gold: true },
  diamond:  { label: 'Elmas Saray',              style: 'palace',  floors: 4, pool: true,  color: 0xeaf8ff, accent: 0x85c1e9, cost: 25000000, hours: 36, diamond: true },
  nordic:   { label: 'İskandinav Ahşap Ev',      style: 'modern',  floors: 2, pool: false, color: 0x8d6e63, accent: 0x263238, cost: 180000,  hours: 9, wood: true },
  bunker:   { label: 'Lüks Sığınak Villa',       style: 'modern',  floors: 1, pool: true,  color: 0x7f8c8d, accent: 0x2d3436, cost: 700000,  hours: 16, bunker: true },
  oasis:    { label: 'Çöl Vahası Malikanesi',    style: 'tuscan',  floors: 2, pool: true,  color: 0xe9c46a, accent: 0x264653, cost: 1100000, hours: 18, palms: 8 },
};

export const CAR_CODES = ['', ...Object.keys(CARS)];
export const HELI_CODES = Object.keys(HELIS);

export const CLUBS = [
  { name: 'Kaosspor', color: 0xffd23f, color2: 0x1f2a6b, power: 74 },
  { name: 'Merkez FK', color: 0xd62828, color2: 0xffffff, power: 70 },
  { name: 'Liman Gücü', color: 0x1e88e5, color2: 0xffffff, power: 66 },
  { name: 'Dağ Kartalları', color: 0x2e7d32, color2: 0x111111, power: 63 },
  { name: 'Nehir United', color: 0x8e24aa, color2: 0xffd23f, power: 60 },
  { name: 'Çarşı Spor', color: 0xff7043, color2: 0x263238, power: 57 },
];

export const priceOf = (base, mul = 1) => Math.round(base * mul);
