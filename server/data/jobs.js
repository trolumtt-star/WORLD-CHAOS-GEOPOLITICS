// Meslekler. shift: [başlangıç, bitiş) saat; bitiş < başlangıç ise gece yarısını aşar.
export const JOBS = {
  worker:        { label: 'Fabrika İşçisi', wage: 12, shift: [8, 17] },
  clerk:         { label: 'Tezgahtar',      wage: 9,  shift: [8, 18] },
  waiter:        { label: 'Garson',         wage: 8,  shift: [10, 22] },
  bartender:     { label: 'Barmen',         wage: 9,  shift: [18, 3] },
  civil_servant: { label: 'Memur',          wage: 13, shift: [9, 17] },
  police:        { label: 'Polis',          wage: 14, shift: [8, 20] },
  banker:        { label: 'Bankacı',        wage: 15, shift: [9, 17] },
  doctor:        { label: 'Doktor',         wage: 18, shift: [8, 20] },
  guard:         { label: 'Gardiyan',       wage: 11, shift: [6, 22] },
  judge:         { label: 'Hakim',          wage: 22, shift: [9, 21] },
  unemployed:    { label: 'İşsiz',          wage: 0,  shift: null },
};

/** Enflasyonlu saatlik ücret (her 3 günde bir artar) */
export function wageOf(job, config) {
  return Math.round((JOBS[job]?.wage ?? 0) * (config?.economy?.wageMul ?? 1) * 100) / 100;
}

export function inHours(range, hour) {
  if (!range) return false;
  const [s, e] = range;
  if (s === e) return true;
  return s < e ? hour >= s && hour < e : hour >= s || hour < e;
}

export const ACTIVITY_LABELS = {
  sleep: 'Uyuyor',
  home: 'Evde',
  work: 'İşte',
  buy_food: 'Market alışverişinde',
  eat_out: 'Dışarıda yemek yiyor',
  leisure: 'Eğleniyor',
  luxury: 'Teknoloji alışverişinde',
  weapon: 'Silah dükkanında',
  job_hunt: 'İş arıyor',
  crime: 'Şüpheli hareketler...',
  jail: 'Hapiste',
  respond: 'Olay yerine gidiyor',
};
