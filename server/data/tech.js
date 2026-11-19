import { LUX_HOUSES } from '../../shared/catalogs.js';
/**
 * Teknoloji ağacı: gerçek dünya tarihine göre 8 çağ.
 * Her deneme parayla yapılır, araştırma süresi sonunda %30 (bonuslarla daha fazla) başarı şansı.
 * Maliyet çağ ilerledikçe katlanarak artar.
 *
 * unlocks: { buildings: ['type' | 'factory:subtype'], units: [], missiles: [], ads: [], features: [] }
 */
export const ERAS = [
  null,
  { id: 1, label: 'Orta Çağ', icon: '⚔️', years: '500–1450' },
  { id: 2, label: 'Barut Çağı', icon: '💥', years: '1450–1750' },
  { id: 3, label: 'Sanayi Devrimi', icon: '🚂', years: '1760–1880' },
  { id: 4, label: 'Elektrik Çağı', icon: '💡', years: '1880–1914' },
  { id: 5, label: 'Dünya Savaşları', icon: '🛩️', years: '1914–1945' },
  { id: 6, label: 'Soğuk Savaş', icon: '🚀', years: '1945–1990' },
  { id: 7, label: 'Bilgi Çağı', icon: '🌐', years: '1990–2010' },
  { id: 8, label: 'Günümüz', icon: '📱', years: '2010–2026' },
];

export const BASE_SUCCESS = 0.3;

export const TECHS = {
  // ---------------- 1. ORTA ÇAĞ
  okculuk:      { era: 1, label: 'Okçuluk',          icon: '🏹', requires: [], unlocks: { units: ['archer'] }, desc: 'Uzaktan ok atan birlikler.' },
  atcilik:      { era: 1, label: 'Atçılık',          icon: '🐎', requires: [], unlocks: { units: ['cavalry'], features: ['fast_scout'] }, desc: 'Atlı süvari; kaşifler iki kat hızlı.' },
  demircilik:   { era: 1, label: 'Demircilik',       icon: '⚒️', requires: [], unlocks: { buildings: ['gun_shop'] }, desc: 'Silahçı dükkanı açabilirsin.' },
  tas_isciligi: { era: 1, label: 'Taş İşçiliği',     icon: '🧱', requires: [], unlocks: { buildings: ['villa', 'cafe', 'restaurant'] }, desc: 'Taş konak, kahvehane ve lokanta.' },

  // ---------------- 2. BARUT
  barut:        { era: 2, label: 'Barut',            icon: '💥', requires: ['demircilik'], unlocks: { units: ['musketeer'], buildings: ['factory:arms'] }, desc: 'Tüfekli askerler ve silah atölyesi.' },
  matbaa:       { era: 2, label: 'Matbaa',           icon: '📰', requires: ['tas_isciligi'], unlocks: { ads: ['gazete'], features: ['news'] }, desc: 'Gazete: şehir haberlerini okursun, gazeteye reklam verirsin.' },
  topculuk:     { era: 2, label: 'Topçuluk',         icon: '💣', requires: ['barut'], unlocks: { units: ['cannon'] }, desc: 'Surları yıkan toplar.' },

  // ---------------- 3. SANAYİ
  buhar:        { era: 3, label: 'Buhar Makinesi',   icon: '⚙️', requires: ['barut'], unlocks: { buildings: ['factory:steel', 'factory:drink'] }, desc: 'Demir-çelik ve içecek fabrikaları.' },
  demiryolu:    { era: 3, label: 'Demiryolu',        icon: '🚂', requires: ['buhar'], unlocks: { features: ['fast_logistics'] }, desc: 'Mal teslimatı %50 daha hızlı.' },
  telgraf:      { era: 3, label: 'Telgraf',          icon: '📡', requires: ['matbaa'], unlocks: { features: ['research_bonus'] }, desc: 'Bilgi hızlanır: araştırma başarısı +%5.' },

  // ---------------- 4. ELEKTRİK
  elektrik:     { era: 4, label: 'Elektrik',         icon: '💡', requires: ['buhar'], unlocks: { buildings: ['apartment'] }, desc: 'Apartmanlar ve geceyi aydınlatan lambalar.' },
  telefon:      { era: 4, label: 'Telefon',          icon: '☎️', requires: ['elektrik', 'telgraf'], unlocks: { features: ['phone'] }, desc: 'Telefon uygulaması: haber, reklam, piyasa fiyatları.' },
  otomobil:     { era: 4, label: 'Otomobil',         icon: '🚗', requires: ['elektrik'], unlocks: { features: ['asphalt'] }, desc: 'Asfalt yollar. (Araba galerisi Faz 2\'de)' },
  tufek:        { era: 4, label: 'Modern Piyade',    icon: '🪖', requires: ['barut', 'elektrik'], unlocks: { units: ['infantry'] }, desc: 'Otomatik tüfekli piyade mangası.' },

  // ---------------- 5. DÜNYA SAVAŞLARI
  tank:         { era: 5, label: 'Tank',             icon: '🛡️', requires: ['otomobil', 'tufek'], unlocks: { units: ['tank'] }, desc: 'Zırhlı muharebe aracı.' },
  radyo:        { era: 5, label: 'Radyo',            icon: '📻', requires: ['telefon'], unlocks: { ads: ['radyo'] }, desc: 'Radyo reklamı.' },
  radar:        { era: 5, label: 'Radar',            icon: '📡', requires: ['radyo'], unlocks: { buildings: ['air_defense'] }, desc: 'Hava savunma sistemi.' },
  ucak:         { era: 5, label: 'Savaş Uçağı',      icon: '✈️', requires: ['otomobil'], unlocks: { buildings: ['airbase'], air: ['jet', 'bomber'] }, desc: 'Hava üssü, savaş jeti ve bombardıman uçağı (halı bombardımanı: 5 m çaplı bombalar).' },

  // ---------------- 6. SOĞUK SAVAŞ
  fuze:         { era: 6, label: 'Roket Bilimi',     icon: '🚀', requires: ['radar'], unlocks: { buildings: ['missile_silo'], missiles: ['tactical', 'ballistic'] }, desc: 'Füze rampası, taktik ve balistik füze.' },
  televizyon:   { era: 6, label: 'Televizyon',       icon: '📺', requires: ['radyo'], unlocks: { ads: ['tv'] }, desc: 'TV reklamı.' },
  nukleer:      { era: 6, label: 'Nükleer Fizik',    icon: '☢️', requires: ['fuze'], unlocks: { features: ['nuclear'] }, desc: 'Nükleer bomba (B-2 Spirit ile taşınır).' },
  helikopter:   { era: 6, label: 'Helikopter',       icon: '🚁', requires: ['ucak'], unlocks: { air: ['heli'] }, desc: 'Taarruz helikopteri: askerleri tarar.' },

  // ---------------- 7. BİLGİ ÇAĞI
  bilgisayar:   { era: 7, label: 'Bilgisayar',       icon: '💻', requires: ['televizyon'], unlocks: { buildings: ['tech_store', 'factory:electronics'] }, desc: 'Elektronik fabrikası ve teknoloji mağazası.' },
  internet:     { era: 7, label: 'İnternet',         icon: '🌐', requires: ['bilgisayar'], unlocks: { ads: ['internet'] }, desc: 'İnternet reklamı.' },
  cep_telefonu: { era: 7, label: 'Cep Telefonu',     icon: '📱', requires: ['internet', 'telefon'], unlocks: { features: ['ad_bonus'] }, desc: 'Herkes cebinde reklam görür: reklam başarısı +%10.' },
  iha:          { era: 7, label: 'İHA',              icon: '🛸', requires: ['bilgisayar', 'ucak'], unlocks: { features: ['recon'] }, desc: 'Keşif İHA\'sı: kaşifler anında rapor verir.' },
  gizlilik:     { era: 7, label: 'Hayalet Uçak',     icon: '🦇', requires: ['bilgisayar', 'ucak', 'nukleer'], unlocks: { air: ['b2'] }, desc: 'B-2 Spirit: radara zor yakalanır, nükleer bomba taşır.' },

  // ---------------- 8. GÜNÜMÜZ (2026)
  sosyal_medya: { era: 8, label: 'Sosyal Medya',     icon: '💬', requires: ['cep_telefonu'], unlocks: { ads: ['sosyal'] }, desc: 'Viral reklam kampanyaları.' },
  yapay_zeka:   { era: 8, label: 'Yapay Zekâ',       icon: '🤖', requires: ['internet'], unlocks: { features: ['ai_research'] }, desc: 'Araştırma başarısı +%15.' },
  siha:         { era: 8, label: 'SİHA',             icon: '🎯', requires: ['iha'], unlocks: { air: ['drone'] }, desc: 'Silahlı İHA: ucuz, hassas vuruş.' },
};

// Varsayılan (teknoloji gerektirmeyen) içerik
export const DEFAULT_UNLOCKS = {
  buildings: ['house', 'market', 'bar', 'factory:food', 'barracks', ...Object.keys(LUX_HOUSES).map((k) => `mansion:${k}`)],
  units: ['swordsman', 'scout'],
  missiles: [],
  ads: ['tellal'],
  air: [],
};

// Reklam kanalları: power = kaç müşteri çeker + kaç saat etkili
export const ADS = {
  tellal:   { label: 'Tellal (köy meydanında bağırır)', icon: '📢', cost: 120,   power: 4,  hours: 6 },
  gazete:   { label: 'Gazete ilanı',                    icon: '📰', cost: 500,   power: 7,  hours: 10 },
  radyo:    { label: 'Radyo reklamı',                   icon: '📻', cost: 1800,  power: 11, hours: 12 },
  tv:       { label: 'TV reklamı',                      icon: '📺', cost: 5000,  power: 16, hours: 16 },
  internet: { label: 'İnternet reklamı',                icon: '🌐', cost: 9000,  power: 22, hours: 20 },
  sosyal:   { label: 'Sosyal medya kampanyası',         icon: '💬', cost: 15000, power: 30, hours: 24 },
};
export const AD_SUCCESS = 0.4;

export function techCost(id, config) {
  const t = TECHS[id];
  return Math.round(config.tech.baseCost * Math.pow(config.tech.costGrowth, t.era - 1) / 10) * 10;
}

/** Direkt satın alma: araştırmanın 10 katı (1. çağ ₺3.000, sonra çağ çağ artar) */
export function techBuyCost(id, config) {
  return techCost(id, config) * 10;
}

export function techHours(id) {
  return 2 + TECHS[id].era;
}

export function hasTech(player, id) {
  return player.techs.includes(id);
}

export function hasFeature(player, feature) {
  return player.techs.some((t) => TECHS[t]?.unlocks.features?.includes(feature));
}

// kind: 'buildings' | 'units' | 'missiles' | 'ads' | 'air'
export function isUnlocked(player, kind, id) {
  if (DEFAULT_UNLOCKS[kind]?.includes(id)) return true;
  return player.techs.some((t) => TECHS[t]?.unlocks[kind]?.includes(id));
}

export function requiredTech(kind, id) {
  if (DEFAULT_UNLOCKS[kind]?.includes(id)) return null;
  return Object.entries(TECHS).find(([, t]) => t.unlocks[kind]?.includes(id))?.[0] ?? null;
}

export function playerEra(player) {
  let e = 1;
  for (const t of player.techs) e = Math.max(e, TECHS[t]?.era ?? 1);
  return e;
}

export function researchChance(player) {
  let c = BASE_SUCCESS;
  if (hasFeature(player, 'research_bonus')) c += 0.05;
  if (hasFeature(player, 'ai_research')) c += 0.15;
  return Math.min(0.9, c);
}

export function adChance(player) {
  return Math.min(0.9, AD_SUCCESS + (hasFeature(player, 'ad_bonus') ? 0.1 : 0));
}
