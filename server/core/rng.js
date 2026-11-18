// Seed'li rastgele sayı üreteci (mulberry32). Aynı seed ile aynı dünya üretilir.
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    // entries: [[deger, agirlik], ...]
    weighted: (entries) => {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, w] of entries) {
        if ((r -= w) <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
  return rng;
}
