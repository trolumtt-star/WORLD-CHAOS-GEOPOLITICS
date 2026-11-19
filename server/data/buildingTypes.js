/**
 * Bina kataloğu. Kategori:
 *  residential | commercial | industrial | civic | military | nature | land
 *
 * sells: { ürün: [minMarkup, maxMarkup] } -> perakende satış (toptan fiyat x markup)
 * served: true -> yerinde tüketim (restoran/kafe/bar): açlığı/mutluluğu doğrudan etkiler
 * staff: işe alınan meslek ve kadro
 * buildCost/buildHours: oyuncunun kendi arsasına inşa edebileceği tipler
 */
export const BUILDING_TYPES = {
  // ---------- KONUT ----------
  house:      { label: 'Müstakil Ev', icon: '🏠', category: 'residential', footprint: [14, 22], height: [5, 8],  value: [3000, 6000],   capacity: [2, 4],  rent: [8, 14],  buildCost: 2000,  buildHours: 6 },
  apartment:  { label: 'Apartman',    icon: '🏢', category: 'residential', footprint: [18, 26], height: [16, 34], value: [12000, 25000], capacity: [8, 14], rent: [6, 10],  buildCost: 15000, buildHours: 14 },
  villa:      { label: 'Villa',       icon: '🏡', category: 'residential', footprint: [26, 30], height: [6, 8],  value: [15000, 30000], capacity: [1, 3],  rent: [25, 40], buildCost: 18000, buildHours: 10 },

  // ---------- TİCARET ----------
  market:     { label: 'Market',            icon: '🛒', category: 'commercial', footprint: [18, 26], height: [6, 8],  value: [5000, 9000],  startBalance: [1500, 4000], open: [8, 22],  sells: { food: [1.6, 2.0], drink: [1.6, 2.2] }, restockTo: 80, staff: { job: 'clerk', count: 2 },  buildCost: 3000,  buildHours: 8 },
  cafe:       { label: 'Kafe',              icon: '☕', category: 'commercial', footprint: [14, 20], height: [5, 7],  value: [4000, 8000],  startBalance: [1000, 3000], open: [7, 23],  sells: { drink: [2.5, 3.5], food: [2.5, 3.2] }, served: true, restockTo: 40, staff: { job: 'waiter', count: 2 }, buildCost: 2500, buildHours: 6 },
  restaurant: { label: 'Restoran',          icon: '🍽️', category: 'commercial', footprint: [18, 24], height: [6, 9],  value: [6000, 11000], startBalance: [1500, 4000], open: [11, 23], sells: { food: [3.0, 4.0], drink: [2.0, 3.0] }, served: true, restockTo: 50, staff: { job: 'waiter', count: 3 }, buildCost: 3000, buildHours: 9 },
  tech_store: { label: 'Teknoloji Mağazası', icon: '📱', category: 'commercial', footprint: [16, 22], height: [7, 10], value: [9000, 15000], startBalance: [3000, 6000], open: [10, 21], sells: { electronics: [1.4, 1.8] }, restockTo: 10, staff: { job: 'clerk', count: 1 }, buildCost: 12000, buildHours: 10 },
  gun_shop:   { label: 'Silah Dükkanı',     icon: '🔫', category: 'commercial', footprint: [14, 18], height: [5, 7],  value: [7000, 12000], startBalance: [2000, 5000], open: [10, 20], sells: { weapons: [1.5, 2.0] }, restockTo: 6, staff: { job: 'clerk', count: 1 }, buildCost: 10000, buildHours: 8 },
  bar:        { label: 'Bar',               icon: '🍺', category: 'commercial', footprint: [14, 20], height: [5, 7],  value: [4000, 8000],  startBalance: [1000, 3000], open: [18, 3],  sells: { drink: [3.0, 4.5] }, served: true, restockTo: 60, staff: { job: 'bartender', count: 2 }, buildCost: 5000, buildHours: 6 },

  clothing:   { label: 'Giyim Mağazası',    icon: '👕', category: 'commercial', footprint: [16, 22], height: [6, 9],  value: [8000, 14000], startBalance: [2000, 4000], open: [9, 22],  staff: { job: 'clerk', count: 1 }, buildCost: 9000, buildHours: 8 },
  car_dealer: { label: 'Araba Bayisi',      icon: '🚗', category: 'commercial', footprint: [26, 30], height: [7, 9],  value: [30000, 45000], startBalance: [5000, 9000], open: [9, 20], staff: { job: 'clerk', count: 2 }, buildCost: 30000, buildHours: 14 },

  // ---------- SANAYİ ----------
  factory:    { label: 'Fabrika', icon: '🏭', category: 'industrial', footprint: [28, 32], height: [10, 16], value: [20000, 40000], startBalance: [5000, 10000], staff: { job: 'worker', count: 5 }, buildCost: 12000, buildHours: 20 },

  // ---------- DEVLET ----------
  palace:     { label: 'Belediye Sarayı',    icon: '🏛️', category: 'civic', footprint: [32, 32], height: [22, 22], value: [500000, 500000], staff: { job: 'civil_servant', count: 6 } },
  police:     { label: 'Emniyet Müdürlüğü', icon: '🚓', category: 'civic', footprint: [22, 26], height: [10, 12], value: [60000, 60000],  staff: { job: 'police', count: 5 } },
  bank:       { label: 'Merkez Bankası',    icon: '🏦', category: 'civic', footprint: [24, 26], height: [14, 16], value: [90000, 90000],  staff: { job: 'banker', count: 3 } },
  hospital:   { label: 'Devlet Hastanesi',  icon: '🏥', category: 'civic', footprint: [26, 30], height: [16, 20], value: [80000, 80000],  staff: { job: 'doctor', count: 4 } },
  hideout:    { label: 'Yeraltı İni',        icon: '🕳️', category: 'civic', footprint: [14, 14], height: [5, 6], value: [5000, 5000] },
  court:      { label: 'Adliye',             icon: '⚖️', category: 'civic', footprint: [26, 28], height: [14, 16], value: [70000, 70000],  staff: { job: 'judge', count: 2 } },
  stadium:    { label: 'Stadyum',            icon: '🏟️', category: 'civic', footprint: [34, 34], height: [12, 12], value: [120000, 120000] },
  town_hall:  { label: 'Ülke Sarayı',        icon: '🏰', category: 'civic', footprint: [24, 28], height: [12, 12], value: [5000, 5000] },
  prison:     { label: 'Cezaevi',           icon: '⛓️', category: 'civic', footprint: [30, 32], height: [8, 8],   value: [50000, 50000],  staff: { job: 'guard', count: 3 } },

  // ---------- DOĞA / ARSA ----------
  park:       { label: 'Park',      icon: '🌳', category: 'nature', footprint: [32, 32], height: [0, 0], value: [0, 0] },
  land:       { label: 'Boş Arsa',  icon: '🟫', category: 'land',   footprint: [32, 32], height: [0, 0], value: [1500, 4000] },

  // ---------- ASKERİ (sadece oyuncu inşa eder) ----------
  barracks:     { label: 'Kışla',                icon: '🪖', category: 'military', footprint: [26, 30], height: [6, 6],  value: [8000, 8000],   buildCost: 8000,  buildHours: 10 },
  missile_silo: { label: 'Füze Rampası',         icon: '🚀', category: 'military', footprint: [24, 24], height: [4, 4],  value: [20000, 20000], buildCost: 20000, buildHours: 16 },
  airbase:      { label: 'Hava Üssü',            icon: '🛫', category: 'military', footprint: [30, 32], height: [8, 8],  value: [25000, 25000], buildCost: 25000, buildHours: 16 },
  air_defense:  { label: 'Hava Savunma Sistemi', icon: '📡', category: 'military', footprint: [20, 20], height: [6, 6],  value: [15000, 15000], buildCost: 15000, buildHours: 12, range: 150 },
};

export const FACTORY_SUBTYPES = {
  food:        { label: 'Çiftlik / Gıda Üretimi',        output: 'food',        perWorker: 6,   inputs: null },
  drink:       { label: 'İçecek Fabrikası',      output: 'drink',       perWorker: 8,   inputs: null },
  steel:       { label: 'Demir-Çelik Fabrikası', output: 'steel',       perWorker: 5,   inputs: null },
  electronics: { label: 'Elektronik Fabrikası',  output: 'electronics', perWorker: 1,   inputs: { steel: 1 } },
  arms:        { label: 'Silah Fabrikası',       output: 'weapons',     perWorker: 0.5, inputs: { steel: 2 } },
};

// Oyuncunun boş arsaya inşa edebileceği seçenekler (istemci menüsü buradan üretilir)
export function buildOptions() {
  const out = [];
  for (const [type, def] of Object.entries(BUILDING_TYPES)) {
    if (!def.buildCost) continue;
    if (type === 'factory') {
      for (const [sub, sd] of Object.entries(FACTORY_SUBTYPES)) {
        out.push({ key: `factory:${sub}`, type, subtype: sub, label: sd.label, icon: def.icon, category: def.category, cost: def.buildCost, hours: def.buildHours });
      }
    } else {
      out.push({ key: type, type, subtype: null, label: def.label, icon: def.icon, category: def.category, cost: def.buildCost, hours: def.buildHours });
    }
  }
  return out;
}

export function labelOf(building) {
  if (building.type === 'factory' && building.subtype) return FACTORY_SUBTYPES[building.subtype].label;
  return BUILDING_TYPES[building.type].label;
}
