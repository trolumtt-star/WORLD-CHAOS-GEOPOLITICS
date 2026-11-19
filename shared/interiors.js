/**
 * Bina içleri. Sunucu ve istemci AYNI dosyayı kullanır:
 *  - Her binanın içi dünya haritasının dışında, sabit bir "iç mekân ızgarasında" durur.
 *    Kapıdan girince oyuncu oraya ışınlanır; hareket, sesli sohbet, görüş hepsi normal çalışır.
 *  - Yerleşim (mobilya + etkileşim noktaları) bina tipine göre belirlenir.
 * Koordinatlar odanın merkezine göredir; kapı +z duvarındadır.
 */

export const INTERIOR_GRID = { x: 2600, z: -1500, step: 90, cols: 32 };

export function interiorOrigin(buildingId) {
  const n = parseInt(String(buildingId).replace(/\D/g, ''), 10) || 0;
  return { x: INTERIOR_GRID.x + (n % INTERIOR_GRID.cols) * INTERIOR_GRID.step, z: INTERIOR_GRID.z + Math.floor(n / INTERIOR_GRID.cols) * INTERIOR_GRID.step };
}

export function isInteriorPos(x) { return x > INTERIOR_GRID.x - 60; }

const KIND_BY_TYPE = {
  house: 'home', villa: 'home', apartment: 'home', town_hall: 'manor',
  market: 'shop', tech_store: 'shop', gun_shop: 'gunshop',
  cafe: 'cafe', restaurant: 'cafe', bar: 'bar',
  factory: 'factory', police: 'police', bank: 'bank', hospital: 'hospital', palace: 'office',
  court: 'court', clothing: 'clothing', stadium: 'stadium', car_dealer: 'showroom',
};

export function interiorKind(type) { return KIND_BY_TYPE[type] ?? null; }

// Mobilya: [tür, x, z, genişlik, derinlik, yükseklik, renk?, dönüş?]
// Nokta: { id, tag, label, icon, x, z, seats? }
const L = {};

L.home = {
  w: 26, d: 20, floor: 0x9c7a54, wall: 0xe9dfcf, accent: 0x7fb3a3,
  items: [
    ['rug', -4, 2.5, 9, 6, 0.05, 0x8e3b46],
    ['sofa', -4, 5.2, 6.4, 2.2, 1.6, 0x4a6fa5],
    ['coffee', -4, 1.6, 3, 1.6, 0.9],
    ['tv', -4, -2.2, 4.6, 0.6, 2.8],
    ['counter', 8.5, -8.9, 9, 2, 1.8, 0xf2f2f2],
    ['stove', 6.2, -8.9, 2, 2, 1.85],
    ['sink', 9.2, -8.9, 1.8, 1.8, 1.85],
    ['fridge', 12, -8.7, 2.2, 2, 4.2],
    ['table', 8, -2.6, 4.2, 3, 1.5, 0x8a5a33],
    ['chair', 6.6, -0.6, 1.3, 1.3, 1.1, null, Math.PI], ['chair', 9.4, -0.6, 1.3, 1.3, 1.1, null, Math.PI], ['chair', 6.6, -4.6, 1.3, 1.3, 1.1], ['chair', 9.4, -4.6, 1.3, 1.3, 1.1],
    ['bed', 9.5, 6, 4.6, 6.6, 1.2, 0xd9e4f5],
    ['nightstand', 12.2, 3.2, 1.4, 1.4, 1.2],
    ['wardrobe', 4.4, 8.6, 3.6, 1.6, 4.4, 0x6b4a2e],
    ['bookcase', -10.5, -9.1, 4, 1.4, 4.6],
    ['plant', -12.3, -6.5, 1.2, 1.2, 2.6], ['plant', -12.3, 8.5, 1.2, 1.2, 2.6],
    ['lamp', -8.6, 5.6, 0.8, 0.8, 3.6],
  ],
  spots: [
    { id: 'fridge', tag: 'fridge', label: 'Buzdolabı', icon: '🧊', x: 12, z: -6.4 },
    { id: 'stove', tag: 'stove', label: 'Ocak · Çay / Kahve', icon: '☕', x: 6.2, z: -6.7 },
    { id: 'sofa', tag: 'sofa', label: 'Kanepe · TV', icon: '🛋️', x: -4, z: 3.3, seats: [[-5.6, 5.0, Math.PI], [-2.4, 5.0, Math.PI]] },
    { id: 'table', tag: 'table', label: 'Yemek Masası', icon: '🍽️', x: 8, z: 0.6, seats: [[6.6, -0.6, Math.PI], [9.4, -0.6, Math.PI], [6.6, -4.6, 0], [9.4, -4.6, 0]] },
    { id: 'bed', tag: 'bed', label: 'Yatak', icon: '🛏️', x: 6.4, z: 6, seats: [[8.6, 5.4, 0], [10.4, 5.4, 0]] },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 8.6 },
  ],
};

L.manor = {
  ...L.home, w: 30, d: 22, floor: 0x7a5236, wall: 0xf3e6c8, accent: 0xc9a227,
  items: [
    ...L.home.items,
    ['desk', -9, -7.5, 5, 2.4, 1.6, 0x5b3a1e], ['flag', -12.4, -9.4, 1, 1, 6], ['flag', -5.6, -9.4, 1, 1, 6],
  ],
  spots: [...L.home.spots.map((s) => (s.id === 'exit' ? { ...s, z: 9.6 } : s)), { id: 'desk', tag: 'desk', label: 'Devlet Masası', icon: '🏛️', x: -9, z: -5.3 }],
};

L.shop = {
  w: 26, d: 22, floor: 0xd8d8d8, wall: 0xf7f3ea, accent: 0x2e86de,
  items: [
    ['counter', -7, 5.5, 8, 2, 1.7, 0x2e86de], ['register', -8.6, 5.5, 1.4, 1.2, 2.4],
    ['shelf', 5, 0, 10, 1.6, 3.6], ['shelf', 5, -5, 10, 1.6, 3.6], ['shelf', -6, -5, 8, 1.6, 3.6],
    ['crate', -10.5, -9, 2.4, 2.4, 2.4], ['crate', -7.8, -9.3, 2.2, 2.2, 1.8], ['crate', -10.2, -6.6, 2, 2, 1.6],
    ['fridgeRow', 11.8, -2.5, 1.8, 10, 4.2], ['plant', 11.8, 9, 1.2, 1.2, 2.4],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Kasa · Alışveriş', icon: '🛒', x: -7, z: 7.8 },
    { id: 'shelf1', tag: 'shelf', label: 'Raf', icon: '📦', x: 5, z: 1.8 },
    { id: 'shelf2', tag: 'shelf', label: 'Raf', icon: '📦', x: 5, z: -3.2 },
    { id: 'shelf3', tag: 'shelf', label: 'Raf', icon: '📦', x: -6, z: -3.2 },
    { id: 'storage', tag: 'storage', label: 'Depo', icon: '📦', x: -8, z: -7.2 },
    { id: 'floor', tag: 'floor', label: 'Zemin', icon: '🧽', x: 1, z: 5 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

L.gunshop = {
  ...L.shop, floor: 0x4a4a4a, wall: 0x5d5148, accent: 0x8b0000,
  items: [
    ['counter', -7, 5.5, 8, 2, 1.7, 0x3a2a1a], ['register', -8.6, 5.5, 1.4, 1.2, 2.4],
    ['gunrack', 0, -9.9, 14, 0.6, 4.4], ['gunrack', 12.2, -1, 0.6, 12, 4.4],
    ['glass', 4, 1, 6, 2, 1.7], ['crate', -10.5, -8.6, 2.4, 2.4, 2.4], ['crate', -8, -9, 2, 2, 1.6],
    ['target', -12.4, 0, 0.4, 3, 4],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Silah Tezgahı', icon: '🔫', x: -7, z: 7.8 },
    { id: 'shelf1', tag: 'shelf', label: 'Silah Rafı', icon: '📦', x: 0, z: -7.8 },
    { id: 'shelf2', tag: 'shelf', label: 'Vitrin', icon: '📦', x: 4, z: 3.2 },
    { id: 'storage', tag: 'storage', label: 'Depo', icon: '📦', x: -9.5, z: -6.4 },
    { id: 'floor', tag: 'floor', label: 'Zemin', icon: '🧽', x: 2, z: 6 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

const cafeTables = [[-7, 0], [7, 0], [-7, 6], [7, 6]];
L.cafe = {
  w: 26, d: 22, floor: 0x8b6b4a, wall: 0xf1e3cf, accent: 0xc0392b,
  items: [
    ['counter', 0, -6, 11, 2, 1.7, 0x6b3e26], ['espresso', -3, -6, 1.6, 1.2, 2.6], ['register', 3.6, -6, 1.4, 1.2, 2.4],
    ['stove', -6, -9.6, 3, 1.6, 1.85], ['sink', 6, -9.6, 2.4, 1.6, 1.85], ['shelf', 0, -10.2, 6, 0.8, 4],
    ...cafeTables.flatMap(([x, z]) => [['roundTable', x, z, 2.6, 2.6, 1.4, 0xf4f4f4], ['chair', x - 2, z, 1.2, 1.2, 1.1, null, Math.PI / 2], ['chair', x + 2, z, 1.2, 1.2, 1.1, null, -Math.PI / 2]]),
    ['plant', -12, 9.5, 1.2, 1.2, 2.4], ['plant', 12, 9.5, 1.2, 1.2, 2.4],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Sipariş Tezgahı', icon: '☕', x: 0, z: -3.8 },
    ...cafeTables.map(([x, z], i) => ({ id: `table${i}`, tag: 'table', label: 'Masa', icon: '🍽️', x, z: z + 2, seats: [[x - 2, z, Math.PI / 2], [x + 2, z, -Math.PI / 2]] })),
    { id: 'kitchen', tag: 'stove', label: 'Mutfak', icon: '🍳', x: -6, z: -7.8 },
    { id: 'sink', tag: 'sink', label: 'Bulaşık', icon: '🧼', x: 6, z: -7.8 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

L.bar = {
  ...L.cafe, floor: 0x3b2a20, wall: 0x2e2a3a, accent: 0x8e44ad,
  items: [
    ['counter', 0, -6, 14, 2, 1.7, 0x4a2c1a], ['bottles', 0, -10.2, 12, 0.8, 4.4],
    ['stool', -4, -4, 1, 1, 1.4], ['stool', 0, -4, 1, 1, 1.4], ['stool', 4, -4, 1, 1, 1.4],
    ['sink', 9, -9.6, 2.4, 1.6, 1.85],
    ...cafeTables.flatMap(([x, z]) => [['roundTable', x, z, 2.6, 2.6, 1.4, 0x2b2b2b], ['chair', x - 2, z, 1.2, 1.2, 1.1, null, Math.PI / 2], ['chair', x + 2, z, 1.2, 1.2, 1.1, null, -Math.PI / 2]]),
    ['jukebox', -12, -3, 1.8, 1.4, 3.4], ['lamp', 12, 9, 0.8, 0.8, 3.6],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Bar Tezgahı', icon: '🍺', x: 0, z: -3.6, seats: [[-4, -4, Math.PI], [0, -4, Math.PI], [4, -4, Math.PI]] },
    ...cafeTables.map(([x, z], i) => ({ id: `table${i}`, tag: 'table', label: 'Masa', icon: '🍻', x, z: z + 2, seats: [[x - 2, z, Math.PI / 2], [x + 2, z, -Math.PI / 2]] })),
    { id: 'shelf', tag: 'shelf', label: 'Şişe Rafı', icon: '🍾', x: -4, z: -8.6 },
    { id: 'sink', tag: 'sink', label: 'Bulaşık', icon: '🧼', x: 9, z: -7.8 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

L.factory = {
  w: 36, d: 26, floor: 0x6d6d6d, wall: 0xb8b0a0, accent: 0xe67e22,
  items: [
    ['machine', -11, -7, 6, 4, 4.4], ['machine', 0, -7, 6, 4, 4.4], ['machine', 11, -7, 6, 4, 4.4],
    ['conveyor', 0, 1, 26, 2, 1.2],
    ['crate', -14, 8, 2.6, 2.6, 2.6], ['crate', -11.2, 8.6, 2.4, 2.4, 2], ['crate', -14, 5, 2.2, 2.2, 1.8],
    ['crate', 14, 8, 2.6, 2.6, 2.6], ['crate', 11.4, 8.4, 2.4, 2.4, 2.4], ['pallet', 14, 4.6, 3, 3, 0.4],
  ],
  spots: [
    { id: 'machine1', tag: 'machine', label: 'Pres Makinesi', icon: '⚙️', x: -11, z: -4.2 },
    { id: 'machine2', tag: 'machine', label: 'Kaynak Makinesi', icon: '⚙️', x: 0, z: -4.2 },
    { id: 'machine3', tag: 'machine', label: 'Paketleme', icon: '⚙️', x: 11, z: -4.2 },
    { id: 'conveyor1', tag: 'conveyor', label: 'Bant', icon: '🏭', x: -6, z: 3.2 },
    { id: 'conveyor2', tag: 'conveyor', label: 'Bant', icon: '🏭', x: 6, z: 3.2 },
    { id: 'storage1', tag: 'storage', label: 'Yükleme', icon: '📦', x: -11, z: 6 },
    { id: 'storage2', tag: 'storage', label: 'Yükleme', icon: '📦', x: 11, z: 6 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 11.6 },
  ],
};

L.police = {
  w: 28, d: 22, floor: 0x5b6470, wall: 0xdfe6ee, accent: 0x1f3a93,
  items: [
    ['desk', -7, -1, 4.4, 2.4, 1.6], ['computer', -7, -1.4, 1.4, 0.4, 2.6], ['desk', 1, -1, 4.4, 2.4, 1.6], ['computer', 1, -1.4, 1.4, 0.4, 2.6],
    ['desk', 9, -7.5, 4, 2, 1.6], ['radio', 9, -7.8, 1.4, 0.8, 2.4],
    ['cell', -8, -8.6, 9, 3.6, 5], ['bench', 5, 8, 4, 1.2, 1], ['flag', 12.6, -9.8, 1, 1, 6], ['lockers', 12.8, 3, 1.2, 6, 4.4],
  ],
  spots: [
    { id: 'desk1', tag: 'desk', label: 'Masa', icon: '🖥️', x: -7, z: 1.2 },
    { id: 'desk2', tag: 'desk', label: 'Masa', icon: '🖥️', x: 1, z: 1.2 },
    { id: 'radio', tag: 'radio', label: 'Telsiz', icon: '📻', x: 9, z: -5.4 },
    { id: 'cell', tag: 'cell', label: 'Nezarethane', icon: '⛓️', x: -8, z: -5.6 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

L.bank = {
  w: 28, d: 22, floor: 0xe8e2d4, wall: 0xf8f4ea, accent: 0x1e5631,
  items: [
    ['counter', 0, -3, 16, 2, 1.8, 0x1e5631], ['vault', -9, -9.4, 7, 2, 6], ['desk', 9, 4, 4, 2.2, 1.6], ['computer', 9, 3.6, 1.4, 0.4, 2.6],
    ['plant', -12.5, 9, 1.2, 1.2, 2.6], ['plant', 12.5, 9, 1.2, 1.2, 2.6], ['bench', -6, 6, 5, 1.2, 1],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Gişe', icon: '🏦', x: 0, z: -0.8 },
    { id: 'vault', tag: 'vault', label: 'Kasa Dairesi', icon: '💰', x: -9, z: -7 },
    { id: 'desk', tag: 'desk', label: 'Kredi Masası', icon: '🖥️', x: 9, z: 6.2 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

L.hospital = {
  w: 30, d: 22, floor: 0xeef3f6, wall: 0xffffff, accent: 0xc0392b,
  items: [
    ['hbed', -9, -6.5, 3.6, 6, 1.4], ['hbed', -3, -6.5, 3.6, 6, 1.4], ['hbed', 3, -6.5, 3.6, 6, 1.4],
    ['curtain', -6, -6.5, 0.2, 6, 4], ['curtain', 0, -6.5, 0.2, 6, 4],
    ['desk', 9, 4, 5, 2.2, 1.6, 0xffffff], ['computer', 9, 3.6, 1.4, 0.4, 2.6], ['cabinet', 13.2, -6, 1.2, 5, 4],
    ['bench', -8, 7.5, 5, 1.2, 1],
  ],
  spots: [
    { id: 'bed1', tag: 'bed', label: 'Hasta Yatağı', icon: '🛏️', x: -9, z: -2.4, seats: [[-9, -5.5, 0]] },
    { id: 'bed2', tag: 'bed', label: 'Hasta Yatağı', icon: '🛏️', x: -3, z: -2.4, seats: [[-3, -5.5, 0]] },
    { id: 'bed3', tag: 'bed', label: 'Hasta Yatağı', icon: '🛏️', x: 3, z: -2.4, seats: [[3, -5.5, 0]] },
    { id: 'reception', tag: 'reception', label: 'Danışma · Tedavi', icon: '🩺', x: 9, z: 6.2 },
    { id: 'desk', tag: 'desk', label: 'Reçete Masası', icon: '📋', x: 12, z: 4 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

L.office = {
  w: 32, d: 24, floor: 0x7a5236, wall: 0xf3ead8, accent: 0xb7950b,
  items: [
    ['bigTable', 0, -2, 12, 4.4, 1.6, 0x5b3a1e],
    ['chair', -4, -5, 1.3, 1.3, 1.1], ['chair', 0, -5, 1.3, 1.3, 1.1], ['chair', 4, -5, 1.3, 1.3, 1.1],
    ['chair', -4, 1, 1.3, 1.3, 1.1, null, Math.PI], ['chair', 0, 1, 1.3, 1.3, 1.1, null, Math.PI], ['chair', 4, 1, 1.3, 1.3, 1.1, null, Math.PI],
    ['desk', -10, 6, 4.4, 2.2, 1.6], ['desk', 10, 6, 4.4, 2.2, 1.6], ['bookcase', -13, -9, 4, 1.4, 5], ['bookcase', -8.6, -10.5, 4, 1.4, 5],
    ['flag', 13.4, -10.6, 1, 1, 6.5], ['flag', 9.6, -10.6, 1, 1, 6.5],
  ],
  spots: [
    { id: 'desk1', tag: 'desk', label: 'Masa', icon: '🗂️', x: -10, z: 8.2 },
    { id: 'desk2', tag: 'desk', label: 'Masa', icon: '🗂️', x: 10, z: 8.2 },
    { id: 'shelf', tag: 'shelf', label: 'Arşiv', icon: '📚', x: -11, z: -7.4 },
    { id: 'table', tag: 'table', label: 'Toplantı Masası', icon: '🏛️', x: 0, z: 2.6, seats: [[-4, 1, Math.PI], [0, 1, Math.PI], [4, 1, Math.PI], [-4, -5, 0], [0, -5, 0], [4, -5, 0]] },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 10.6 },
  ],
};

L.court = {
  w: 30, d: 24, floor: 0x6b4a2e, wall: 0xf1e6d0, accent: 0x7b1f1f,
  items: [
    ['judgeBench', 0, -8.4, 10, 3, 2.6], ['flag', -6.6, -10.8, 1, 1, 6.5], ['flag', 6.6, -10.8, 1, 1, 6.5],
    ['witness', -8, -3.5, 3, 2.4, 1.6], ['desk', -6, 1.5, 5, 2, 1.6], ['desk', 6, 1.5, 5, 2, 1.6],
    ['bench', -7, 6.5, 9, 1.2, 1], ['bench', 7, 6.5, 9, 1.2, 1], ['bench', -7, 9, 9, 1.2, 1], ['bench', 7, 9, 9, 1.2, 1],
  ],
  spots: [
    { id: 'bench', tag: 'bench', label: 'Hakim Kürsüsü · Davalar', icon: '⚖️', x: 0, z: -5.8 },
    { id: 'desk', tag: 'desk', label: 'Dosya Masası', icon: '📁', x: 6, z: 3.6 },
    { id: 'witness', tag: 'witness', label: 'Sanık Kürsüsü', icon: '🧑‍⚖️', x: -8, z: -1.2 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 10.6 },
  ],
};

L.clothing = {
  w: 26, d: 22, floor: 0xe8e0d4, wall: 0xfaf6f0, accent: 0xb03a7a,
  items: [
    ['rack', -7, -4, 8, 1.4, 3.6], ['rack', 5, -4, 8, 1.4, 3.6], ['rack', -7, 2, 8, 1.4, 3.6],
    ['mirror', 12.4, -2, 0.3, 4, 5], ['fitting', 10.5, -8.5, 4, 3, 5], ['counter', 4, 5.5, 7, 2, 1.7, 0xb03a7a], ['register', 2.8, 5.5, 1.4, 1.2, 2.4],
    ['mannequin', -11, 8, 1, 1, 3], ['mannequin', 11, 8, 1, 1, 3], ['plant', -12, -9.2, 1.2, 1.2, 2.4],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Kasa · Kıyafetler', icon: '👕', x: 4, z: 7.8 },
    { id: 'mirror', tag: 'mirror', label: 'Ayna · Gardırobum', icon: '🪞', x: 10.6, z: -2 },
    { id: 'shelf1', tag: 'shelf', label: 'Askılar', icon: '👔', x: -7, z: -2.2 },
    { id: 'shelf2', tag: 'shelf', label: 'Askılar', icon: '👔', x: 5, z: -2.2 },
    { id: 'floor', tag: 'floor', label: 'Zemin', icon: '🧽', x: 0, z: 1 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 9.6 },
  ],
};

L.showroom = {
  w: 40, d: 28, floor: 0xdfe3e8, wall: 0xf6f8fa, accent: 0xc0392b,
  items: [
    ['carDisplay', -12, -5, 6, 10, 2], ['carDisplay', 0, -5, 6, 10, 2], ['carDisplay', 12, -5, 6, 10, 2],
    ['desk', 10, 8, 5, 2.2, 1.6], ['computer', 10, 7.6, 1.4, 0.4, 2.6], ['plant', -18, 12, 1.2, 1.2, 2.6], ['plant', 18, 12, 1.2, 1.2, 2.6],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Satış Danışmanı · Al / Kirala', icon: '🚗', x: 10, z: 10.4 },
    { id: 'shelf1', tag: 'shelf', label: 'Araç Bakımı', icon: '🧽', x: -12, z: 1.5 },
    { id: 'shelf2', tag: 'shelf', label: 'Araç Bakımı', icon: '🧽', x: 12, z: 1.5 },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 12.6 },
  ],
};

L.stadium = {
  w: 76, d: 52, floor: 0x3e3e3e, wall: 0x22303f, accent: 0x2e7d32,
  items: [
    ['pitch', 0, -2, 56, 34, 0.05], ['goal', -28.5, -2, 1.5, 7, 2.6], ['goal', 28.5, -2, 1.5, 7, 2.6, null, Math.PI],
    ['stand', 0, -23, 70, 4, 6], ['stand', -35, -2, 4, 40, 6], ['stand', 35, -2, 4, 40, 6],
    ['scoreboard', 0, -25.4, 14, 1, 9], ['counter', -20, 20, 8, 2, 1.7, 0x2e7d32],
    ['bench', 11, 21.8, 12, 1.2, 1, 0x1e88e5],
  ],
  spots: [
    { id: 'counter', tag: 'counter', label: 'Bilet & Bahis Gişesi', icon: '🎟️', x: -20, z: 22.4 },
    { id: 'pitch', tag: 'pitch', label: 'Saha · Maça Katıl', icon: '⚽', x: 0, z: 17 },
    { id: 'tribune', tag: 'tribune', label: 'Tribün · Maçı İzle', icon: '🏟️', x: 10, z: 20.5, seats: [[6, 21.6, Math.PI], [8, 21.6, Math.PI], [10, 21.6, Math.PI], [12, 21.6, Math.PI], [14, 21.6, Math.PI], [16, 21.6, Math.PI]] },
    { id: 'exit', tag: 'exit', label: 'Dışarı Çık', icon: '🚪', x: 0, z: 24.6 },
  ],
};

export function interiorLayout(type) {
  const k = interiorKind(type);
  return k ? { kind: k, ...L[k] } : null;
}

export function spotById(layout, id) { return layout?.spots.find((s) => s.id === id) ?? null; }

/** Odadaki her şeyin dünya koordinatı */
export function toWorld(origin, x, z) { return { x: origin.x + x, z: origin.z + z }; }

export function entryPoint(layout) { const e = spotById(layout, 'exit'); return { x: 0, z: e.z - 2.4 }; }

// ---------------------------------------------------------------- meslek görevleri
export const JOB_TASKS = {
  clerk: [
    { tag: 'shelf', label: 'Rafları düzenle', secs: 4 },
    { tag: 'counter', label: 'Kasada müşterilere bak', secs: 3 },
    { tag: 'floor', label: 'Yerleri paspasla', secs: 5 },
    { tag: 'storage', label: 'Depodan koli getir', secs: 4 },
  ],
  waiter: [
    { tag: 'table', label: 'Masaları sil', secs: 3 },
    { tag: 'counter', label: 'Siparişleri servis et', secs: 3 },
    { tag: 'sink', label: 'Bulaşıkları yıka', secs: 5 },
    { tag: 'stove', label: 'Mutfakta yemek hazırla', secs: 5 },
  ],
  bartender: [
    { tag: 'counter', label: 'Kokteyl hazırla', secs: 4 },
    { tag: 'sink', label: 'Bardakları yıka', secs: 4 },
    { tag: 'shelf', label: 'Rafa şişe diz', secs: 3 },
    { tag: 'table', label: 'Masaları topla', secs: 3 },
  ],
  worker: [
    { tag: 'machine', label: 'Makineyi çalıştır', secs: 5 },
    { tag: 'conveyor', label: 'Banttaki ürünleri kontrol et', secs: 4 },
    { tag: 'storage', label: 'Kolileri yükle', secs: 5 },
  ],
  police: [
    { tag: 'desk', label: 'Olay raporu yaz', secs: 5 },
    { tag: 'radio', label: 'Telsizi dinle', secs: 3 },
    { tag: 'cell', label: 'Nezarethaneyi kontrol et', secs: 3 },
  ],
  doctor: [
    { tag: 'bed', label: 'Hastayı muayene et', secs: 5 },
    { tag: 'desk', label: 'Reçete yaz', secs: 3 },
    { tag: 'reception', label: 'Hasta kabul et', secs: 3 },
  ],
  banker: [
    { tag: 'desk', label: 'Kredi dosyasını incele', secs: 4 },
    { tag: 'vault', label: 'Kasayı say', secs: 5 },
    { tag: 'counter', label: 'Gişede müşteriye bak', secs: 3 },
  ],
  civil_servant: [
    { tag: 'desk', label: 'Evrak onayla', secs: 4 },
    { tag: 'shelf', label: 'Dilekçeleri arşivle', secs: 4 },
    { tag: 'table', label: 'Toplantıya katıl', secs: 5 },
  ],
  guard: [{ tag: 'cell', label: 'Koğuşları kontrol et', secs: 4 }],
  judge: [
    { tag: 'desk', label: 'Dava dosyalarını incele', secs: 4 },
    { tag: 'bench', label: 'Duruşma tutanağını onayla', secs: 3 },
  ],
};

// ---------------------------------------------------------------- silahlar
export const WEAPONS = {
  fist:   { label: 'Yumruk',  icon: '👊', dmg: 14, range: 3.8, cd: 550, melee: true },
  knife:  { label: 'Bıçak',   icon: '🔪', dmg: 30, range: 4.0, cd: 600, melee: true, price: 300 },
  pistol: { label: 'Tabanca', icon: '🔫', dmg: 30, range: 36, cd: 420, price: 1800, ammo: { price: 80, qty: 12 } },
  rifle:  { label: 'Tüfek',   icon: '🎯', dmg: 45, range: 60, cd: 220, price: 5500, ammo: { price: 150, qty: 30 } },
};
export const WEAPON_CODES = ['fist', 'knife', 'pistol', 'rifle'];
export const POSES = ['', 'sit', 'sleep', 'dead', 'work', 'drive'];

// ---------------------------------------------------------------- ülke kurma uygunluğu (istemci butonu için)
export function canFoundAtTiles(getTile, gridSize, townSize, ci, cj) {
  const a = Math.floor((gridSize - townSize) / 2);
  const b = a + townSize - 1;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const t = getTile(ci + di, cj + dj);
    if (!t || t.owner || t.terrain === 'w' || t.terrain === 'm') return false;
  }
  for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
    if (getTile(ci + di, cj + dj)?.owner) return false;
  }
  return Math.max(Math.max(a - ci, ci - b, 0), Math.max(a - cj, cj - b, 0)) >= 3;
}
