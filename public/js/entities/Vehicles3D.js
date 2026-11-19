import * as THREE from 'three';
import { CARS, HELIS } from '../../shared/catalogs.js';

/**
 * Detaylı araç modelleri (kutu değil):
 *  - Gövde ve kabin yan profilden çizilip yuvarlatılmış kenarlarla ekstrüde edilir
 *  - Jantlı tekerlekler, farlar/stoplar, ızgara, ayna, kapı çizgileri, egzoz, spoyler
 *  - Kaplama: normal metalik boya, krom detaylar, altın ve elmas sürümler
 * Helikopterler: damla gövde, kuyruk bomu, dikey/yatay stabilizör, kızaklar, rotor,
 *  taarruz modellerinde kanat, roket kapsülü, burun topu; kargo modelinde çift rotor.
 */
const cache = new Map();
function mat(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }
const std = (color, roughness, metalness, extra = {}) => mat(`s${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

function paint(c) {
  if (c.diamond) return std(0xe8f9ff, 0.04, 0.95, { emissive: 0x1a3440, emissiveIntensity: 0.35 });
  if (c.gold) return std(0xd4af37, 0.18, 1);
  return std(c.color, 0.28, 0.65);
}
const GLASS = () => mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x0d1620, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.78 }));
const RUBBER = () => std(0x111112, 0.92, 0);
const CHROME = () => std(0xe8e8ec, 0.12, 1);
const DARK = () => std(0x1a1a1c, 0.6, 0.3);
const LAMP = () => mat('lamp', () => new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff4c8, emissiveIntensity: 1.4 }));
const TAIL = () => mat('tail', () => new THREE.MeshStandardMaterial({ color: 0xb00000, emissive: 0xff1010, emissiveIntensity: 1.1 }));

// Gövde tipleri: boy, en, bel çizgisi, tavan, kaput, bagaj, cam eğimleri, alt boşluk, teker
const BODY = {
  sedan:   { len: 7.4, wid: 3.2, belt: 1.55, roof: 2.45, hood: 2.2, deck: 1.6, rake: 1.2, back: 1.1, sill: 0.5, nose: 0.35, tail: 0.15, wr: 0.62 },
  coupe:   { len: 7.3, wid: 3.25, belt: 1.45, roof: 2.2, hood: 2.5, deck: 1.4, rake: 1.4, back: 1.6, sill: 0.45, nose: 0.4, tail: 0.15, wr: 0.64 },
  sport:   { len: 7.6, wid: 3.45, belt: 1.25, roof: 1.95, hood: 2.7, deck: 1.6, rake: 1.6, back: 1.7, sill: 0.35, nose: 0.45, tail: 0.1, wr: 0.66, spoiler: true },
  hyper:   { len: 7.8, wid: 3.6, belt: 1.15, roof: 1.8, hood: 2.4, deck: 2.2, rake: 1.9, back: 2.0, sill: 0.3, nose: 0.5, tail: 0.05, wr: 0.68, spoiler: 'wing', intakes: true },
  muscle:  { len: 7.8, wid: 3.4, belt: 1.55, roof: 2.35, hood: 2.8, deck: 1.6, rake: 1.3, back: 1.6, sill: 0.5, nose: 0.15, tail: 0.1, wr: 0.68, scoop: true, stripes: true },
  hatch:   { len: 6.4, wid: 3.1, belt: 1.55, roof: 2.5, hood: 1.8, deck: 0.5, rake: 1.1, back: 0.5, sill: 0.5, nose: 0.35, tail: 0.1, wr: 0.6 },
  suv:     { len: 7.6, wid: 3.4, belt: 1.95, roof: 3.0, hood: 2.0, deck: 0.6, rake: 1.0, back: 0.4, sill: 0.7, nose: 0.3, tail: 0.1, wr: 0.78 },
  offroad: { len: 7.2, wid: 3.4, belt: 2.0, roof: 3.15, hood: 1.9, deck: 0.35, rake: 0.4, back: 0.1, sill: 0.8, nose: 0.15, tail: 0.05, wr: 0.85, spare: true, rack: true, bull: true },
  armored: { len: 7.8, wid: 3.55, belt: 2.0, roof: 3.1, hood: 2.1, deck: 0.5, rake: 0.8, back: 0.3, sill: 0.75, nose: 0.2, tail: 0.05, wr: 0.82, bull: true, armor: true },
  pickup:  { len: 8.2, wid: 3.4, belt: 1.95, roof: 3.0, hood: 2.1, deck: 3.1, rake: 0.9, back: 0.15, sill: 0.75, nose: 0.25, tail: 0.0, wr: 0.82, bed: true },
  van:     { len: 7.8, wid: 3.4, belt: 1.85, roof: 3.4, hood: 1.3, deck: 0.15, rake: 1.0, back: 0.1, sill: 0.6, nose: 0.4, tail: 0.0, wr: 0.7 },
  limo:    { len: 10.6, wid: 3.4, belt: 1.65, roof: 2.6, hood: 2.6, deck: 1.8, rake: 1.2, back: 1.2, sill: 0.55, nose: 0.3, tail: 0.1, wr: 0.66, grille: 'tall' },
};

/** Yan profil (z ileri, y yukarı) -> ekstrüde, yuvarlatılmış */
function extrudeProfile(points, width, bevel = 0.18, curveFront = true) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [x, y, cx, cy] = points[i];
    if (cx !== undefined && curveFront) s.quadraticCurveTo(cx, cy, x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.1, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function wheel(r, w, rim) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22).rotateZ(Math.PI / 2), RUBBER());
  const side = new THREE.Mesh(new THREE.TorusGeometry(r * 0.84, r * 0.14, 8, 22).rotateY(Math.PI / 2), RUBBER());
  side.position.x = w / 2 - 0.02;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.06, 20).rotateZ(Math.PI / 2), rim);
  disc.position.x = w / 2 + 0.01;
  g.add(tire, side, disc);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, r * 0.9, 0.11), rim);
    sp.position.x = w / 2 + 0.04;
    sp.rotation.x = (i / 5) * Math.PI * 2;
    g.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.1, 10).rotateZ(Math.PI / 2), CHROME());
  hub.position.x = w / 2 + 0.07;
  g.add(hub);
  // fren kaliperi
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, r * 0.45, r * 0.3), std(0xd81e1e, 0.4, 0.3));
  cal.position.set(w / 2 - 0.08, r * 0.3, 0);
  g.add(cal);
  return g;
}

export function makeDetailedCar(modelId) {
  const c = CARS[modelId] ?? CARS.sahin;
  const B = { ...(BODY[c.model] ?? BODY.sedan) };
  if (c.long) B.len = 12.4;
  const g = new THREE.Group();
  const body = paint(c);
  const accent = c.color2 != null ? std(c.color2, 0.3, 0.6) : null;
  const trim = c.chrome || c.gold || c.diamond ? CHROME() : DARK();
  const { len, wid, belt, roof, hood, deck, rake, back, sill, nose, tail, wr } = B;
  const zf = len / 2, zr = -len / 2;
  const cabF = zf - hood, cabR = zr + deck;
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };

  // --- gövde (alt kısım): yan profil
  const lower = [
    [zr + 0.35, sill],
    [zr, sill + 0.35, zr, sill],
    [zr, belt - tail - 0.15],
    [zr + 0.45, belt, zr, belt],
    [cabF, belt],
    [zf - 0.35, belt - nose, zf - 0.6, belt - nose * 0.4],
    [zf, belt - nose - 0.35, zf, belt - nose - 0.1],
    [zf, sill + 0.3],
    [zf - 0.35, sill, zf, sill],
  ];
  add(extrudeProfile(lower, wid), body);
  // --- kabin (camlar)
  const cab = [
    [cabR, belt - 0.02],
    [cabR + back, roof, cabR + back * 0.25, roof - 0.05],
    [cabF - rake, roof],
    [cabF, belt - 0.02, cabF - rake * 0.2, roof - 0.1],
  ];
  add(extrudeProfile(cab, wid * 0.86, 0.12), GLASS(), 0, 0.01, 0);
  // tavan (gövde renginde) + direkler
  const rl = Math.max(0.6, cabF - rake * 0.85 - (cabR + back * 0.85));
  add(new THREE.BoxGeometry(wid * 0.84, 0.1, rl), c.model === 'limo' && accent ? accent : body, 0, roof + 0.03, (cabF - rake * 0.85 + cabR + back * 0.85) / 2);
  for (const x of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, roof - belt, 0.22), body, x * wid * 0.425, (roof + belt) / 2, (cabF + cabR) / 2 + (c.model === 'limo' ? 1.2 : 0.2));
    if (c.model === 'limo') add(new THREE.BoxGeometry(0.1, roof - belt, 0.22), body, x * wid * 0.425, (roof + belt) / 2, (cabF + cabR) / 2 - 1.5);
  }

  // --- kasa (pikap)
  if (B.bed) {
    const bl = deck - 0.3;
    for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.16, 0.7, bl), body, x * (wid / 2 - 0.1), belt + 0.3, zr + bl / 2 + 0.1);
    add(new THREE.BoxGeometry(wid - 0.2, 0.7, 0.16), body, 0, belt + 0.3, zr + 0.1);
    add(new THREE.BoxGeometry(wid - 0.4, 0.05, bl), DARK(), 0, belt + 0.02, zr + bl / 2 + 0.1);
    if (c.gun) {
      const mount = add(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), DARK(), 0, belt + 0.8, zr + bl / 2);
      void mount;
      add(new THREE.BoxGeometry(0.3, 0.3, 0.9), DARK(), 0, belt + 1.45, zr + bl / 2 + 0.2);
      add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8).rotateX(Math.PI / 2), DARK(), 0, belt + 1.5, zr + bl / 2 + 1.2);
      add(new THREE.BoxGeometry(0.8, 0.5, 0.06), DARK(), 0, belt + 1.4, zr + bl / 2 + 0.7);
    }
  }
  // --- ızgara, farlar, stoplar
  // ön yüz: bevel gövdeyi 0.18 dışarı taşır, parçalar yüzeye oturur
  const fz = zf + 0.17, rz = zr - 0.17;
  const faceTop = belt - nose, faceBot = sill;
  const gh = Math.min(c.model === 'limo' || c.model === 'suv' || B.armor ? 0.7 : 0.38, (faceTop - faceBot) * 0.55);
  const gy = faceBot + (faceTop - faceBot) * 0.42;
  add(new THREE.BoxGeometry(wid * (B.grille === 'tall' ? 0.36 : 0.5), gh, 0.1), c.chrome || c.gold ? CHROME() : std(0x0b0b0b, 0.5, 0.4), 0, gy, fz);
  if (c.chrome || c.gold) for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.03, gh * 0.9, 0.12), DARK(), (i - 2.5) * wid * 0.07, gy, fz + 0.02);
  const ly = faceBot + (faceTop - faceBot) * 0.72;
  for (const x of [-1, 1]) {
    // farlar: dış kasa + içte parlayan lens + gündüz far şeridi
    add(new THREE.BoxGeometry(0.75, 0.26, 0.12), trim, x * (wid / 2 - 0.55), ly, fz - 0.03);
    add(new THREE.BoxGeometry(0.62, 0.16, 0.1), LAMP(), x * (wid / 2 - 0.55), ly, fz + 0.02);
    add(new THREE.BoxGeometry(0.7, 0.05, 0.08), LAMP(), x * (wid / 2 - 0.55), ly - 0.2, fz + 0.01);
    // stop lambaları
    add(new THREE.BoxGeometry(0.85, 0.2, 0.1), TAIL(), x * (wid / 2 - 0.55), belt - tail - 0.3, rz);
    // aynalar
    add(new THREE.BoxGeometry(0.4, 0.22, 0.32), body, x * (wid / 2 + 0.12), belt + 0.25, cabF - 0.35);
    add(new THREE.BoxGeometry(0.03, 0.17, 0.26), CHROME(), x * (wid / 2 + 0.33), belt + 0.25, cabF - 0.35);
    // kapı kolu ve kapı çizgileri
    add(new THREE.BoxGeometry(0.04, 0.06, 0.32), trim, x * (wid / 2 + 0.02), belt - 0.15, (cabF + cabR) / 2 + 0.6);
    add(new THREE.BoxGeometry(0.02, belt - sill - 0.3, 0.03), DARK(), x * (wid / 2 + 0.01), (belt + sill) / 2, cabF - 0.15);
    add(new THREE.BoxGeometry(0.02, belt - sill - 0.3, 0.03), DARK(), x * (wid / 2 + 0.01), (belt + sill) / 2, (cabF + cabR) / 2);
    // marşpiyel / yan etek
    add(new THREE.BoxGeometry(0.14, 0.12, len * 0.5), accent ?? trim, x * (wid / 2 + 0.02), sill + 0.06, (zf + zr) / 2 + 0.1);
    // egzoz
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 10).rotateX(Math.PI / 2), CHROME(), x * (wid / 2 - 0.7), sill + 0.05, rz - 0.1);
  }
  add(new THREE.BoxGeometry(wid * 0.6, 0.05, 0.06), TAIL(), 0, belt - tail - 0.15, rz);
  // plaka
  add(new THREE.BoxGeometry(0.9, 0.25, 0.03), std(0xf4f4f4, 0.6, 0), 0, sill + 0.45, rz);
  add(new THREE.BoxGeometry(0.9, 0.25, 0.03), std(0xf4f4f4, 0.6, 0), 0, faceBot + 0.2, fz + 0.02);
  // --- tekerlekler
  const ov = c.model === 'limo' ? 1.5 : 1.3;
  const rimM = c.gold ? std(0xffd34d, 0.15, 1) : c.diamond ? std(0xf4fdff, 0.03, 1) : c.chrome ? CHROME() : std(0x9aa0a6, 0.25, 0.9);
  for (const [x, z] of [[-1, zf - ov], [1, zf - ov], [-1, zr + ov], [1, zr + ov]]) {
    const w = wheel(wr, 0.48, rimM);
    w.position.set(x * (wid / 2 - 0.2), wr, z);
    if (x < 0) w.rotation.y = Math.PI;
    g.add(w);
    // çamurluk kemeri
    add(new THREE.TorusGeometry(wr + 0.12, 0.08, 6, 16, Math.PI).rotateY(Math.PI / 2), DARK(), x * (wid / 2 + 0.02), wr, z);
  }
  // --- tipe özel detaylar
  if (B.spoiler === true) add(new THREE.BoxGeometry(wid * 0.8, 0.07, 0.5), accent ?? body, 0, belt + 0.1, zr + 0.3);
  if (B.spoiler === 'wing') {
    add(new THREE.BoxGeometry(wid * 0.95, 0.06, 0.7), accent ?? DARK(), 0, belt + 0.75, zr + 0.4);
    for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.7, 0.3), DARK(), x * wid * 0.32, belt + 0.4, zr + 0.4);
  }
  if (B.intakes) for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.4, 1.1), DARK(), x * (wid / 2 + 0.01), belt - 0.4, cabR + 0.6);
  if (B.scoop) add(new THREE.BoxGeometry(0.9, 0.18, 1.0), DARK(), 0, belt + 0.06, zf - 1.2);
  if (B.stripes && accent) for (const x of [-0.35, 0.35]) add(new THREE.BoxGeometry(0.35, 0.02, len * 0.9), accent, x, belt + 0.01, 0.1);
  if (B.spare) { add(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 18).rotateX(Math.PI / 2), RUBBER(), 0, belt + 0.1, zr - 0.25); add(new THREE.CylinderGeometry(0.45, 0.45, 0.37, 12).rotateX(Math.PI / 2), rimM, 0, belt + 0.1, zr - 0.25); }
  if (B.rack) { for (const z of [-1, 1]) add(new THREE.BoxGeometry(wid * 0.8, 0.06, 0.06), DARK(), 0, roof + 0.2, z * 1.1 + (cabF + cabR) / 2); for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.06, 2.6), DARK(), x * wid * 0.38, roof + 0.2, (cabF + cabR) / 2); }
  if (B.bull) { add(new THREE.BoxGeometry(wid * 0.8, 0.12, 0.12), DARK(), 0, sill + 0.8, zf + 0.35); for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.9, 0.12), DARK(), x * wid * 0.3, sill + 0.5, zf + 0.35); }
  if (B.armor) for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.5, cabF - cabR - 0.4), std(0x050505, 0.5, 0.7), x * (wid / 2 + 0.04), belt - 0.35, (cabF + cabR) / 2);
  if (c.diamond) for (let i = 0; i < 14; i++) add(new THREE.OctahedronGeometry(0.07), mat('gem', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfefff, emissiveIntensity: 1.2, metalness: 1, roughness: 0 })), (Math.random() - 0.5) * wid * 0.9, belt + 0.02, (Math.random() - 0.5) * len * 0.8);
  g.userData.isCar = true;
  g.userData.len = len;
  return g;
}

// ============================================================ HELİKOPTER
export function makeDetailedHeli(modelId) {
  const H = HELIS[modelId] ?? HELIS.robin;
  const g = new THREE.Group();
  const body = paint(H);
  const accent = H.color2 != null ? std(H.color2, 0.35, 0.5) : DARK();
  const add = (geo, m, x = 0, y = 0, z = 0, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  const S = { light: 0.85, exec: 1, twin: 1.15, military: 1.25, gunship: 1.05, cargo: 1.4 }[H.model] ?? 1;
  const gun = H.model === 'gunship';
  const y0 = 2.0 * S;
  // gövde: döndürülmüş damla (lathe)
  const pts = [];
  const L = (gun ? 5.6 : 4.8) * S, R = (gun ? 0.95 : 1.45) * S;
  // arkadan öne: dar kuyruk bağlantısı -> ön tarafta şişkin kabin -> yuvarlak burun
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(Math.max(0.04, Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 1.35))), 0.55) * R), (t - 0.5) * L)); }
  const fus = add(new THREE.LatheGeometry(pts, 20).rotateX(Math.PI / 2), body, 0, y0, 0.2 * S);
  fus.scale.set(1, gun ? 1.25 : 1, 1);
  if (H.model === 'cargo') add(new THREE.BoxGeometry(2.8, 2.6, 10), body, 0, y0, -1);
  // kokpit camı
  const glass = add(new THREE.SphereGeometry(R * 0.92, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2.3), GLASS(), 0, y0 + 0.1 * S, L * 0.28);
  glass.scale.set(1, gun ? 0.7 : 0.95, 1.05);
  if (gun) add(new THREE.SphereGeometry(0.75, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2.3), GLASS(), 0, y0 + 0.75, L * 0.02);
  // şerit
  add(new THREE.BoxGeometry(R * 2.02, 0.22, L * 0.7), accent, 0, y0 - 0.15, 0);
  // motor kaputu + egzoz
  add(new THREE.BoxGeometry(R * 1.1, 0.7 * S, 2.2 * S), body, 0, y0 + R * 0.95, -0.4 * S);
  for (const x of [-1, 1]) add(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10).rotateX(Math.PI / 2), DARK(), x * 0.45 * S, y0 + R * 0.95, -1.6 * S);
  // kuyruk bomu, dikey + yatay stabilizör
  const tb = H.model === 'cargo' ? 0 : 1;
  if (tb) {
    add(new THREE.CylinderGeometry(0.22 * S, 0.5 * S, 6.5 * S, 12).rotateX(Math.PI / 2), body, 0, y0 + 0.35 * S, -L / 2 - 2.6 * S);
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(1.3, 0); fin.lineTo(0.5, 1.9); fin.lineTo(-0.2, 1.9); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false }).rotateY(Math.PI / 2);
    add(fg, accent, 0.06, y0 + 0.2 * S, -L / 2 - 5.2 * S).scale.setScalar(S);
    add(new THREE.BoxGeometry(2.4 * S, 0.08, 0.6 * S), body, 0, y0 + 0.4 * S, -L / 2 - 4.2 * S);
  }
  // kızak ya da tekerlek
  if (H.model === 'twin' || H.model === 'cargo') {
    for (const [x, z] of [[-1, 1.2], [1, 1.2], [0, -2.4]]) { add(new THREE.CylinderGeometry(0.08, 0.08, 1.2 * S, 8), DARK(), x * 1.1 * S, y0 - 1.3 * S, z * S); add(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 14).rotateZ(Math.PI / 2), std(0x111111, 0.9, 0), x * 1.1 * S, y0 - 1.9 * S, z * S); }
  } else {
    for (const x of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.09, 0.09, 4.8 * S, 10).rotateX(Math.PI / 2), H.gold ? std(0xffd34d, 0.2, 1) : CHROME(), x * 1.2 * S, 0.12, 0.3 * S);
      for (const z of [-0.9, 1.4]) add(new THREE.CylinderGeometry(0.07, 0.07, y0 - 0.2, 8), DARK(), x * 1.05 * S, (y0 - 0.2) / 2 + 0.12, z * S).rotation.z = x * 0.2;
    }
  }
  // taarruz: kanatçıklar, roket kapsülleri, füzeler, burun topu
  if (gun || H.model === 'military' || H.guns) {
    for (const x of [-1, 1]) {
      add(new THREE.BoxGeometry(1.8 * S, 0.12, 0.8 * S), body, x * 1.5 * S, y0 - 0.1, -0.2 * S);
      add(new THREE.CylinderGeometry(0.28, 0.28, 1.5, 10).rotateX(Math.PI / 2), DARK(), x * 2.1 * S, y0 - 0.45, -0.2 * S);
      for (let k = 0; k < 2; k++) add(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8).rotateX(Math.PI / 2), std(0xdddddd, 0.4, 0.6), x * (1.2 + k * 0.3) * S, y0 - 0.45, 0);
    }
    const chin = new THREE.Group();
    chin.position.set(0, y0 - R * 0.9, L * 0.38);
    add(new THREE.SphereGeometry(0.3, 10, 8), DARK(), 0, 0, 0, chin);
    add(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8).rotateX(Math.PI / 2), DARK(), 0, -0.05, 0.7, chin);
    g.add(chin);
  }
  // rotor(lar)
  const blades = H.model === 'light' ? 2 : gun || H.model === 'military' ? 4 : 5;
  const mkRotor = (z, r) => {
    const rot = new THREE.Group();
    rot.position.set(0, y0 + R + 0.9 * S, z);
    add(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 10), CHROME(), 0, -0.25, 0, rot);
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 12), DARK(), 0, 0.05, 0, rot);
    for (let i = 0; i < blades; i++) {
      const bl = add(new THREE.BoxGeometry(0.42, 0.05, r), DARK(), 0, 0.08, 0, rot);
      bl.geometry.translate(0, 0, r / 2);
      bl.rotation.y = (i / blades) * Math.PI * 2;
    }
    g.add(rot);
    return rot;
  };
  const rotor = H.model === 'cargo' ? mkRotor(3.5, 7.5) : mkRotor(0, 6.2 * S);
  g.userData.rotors = [rotor];
  if (H.model === 'cargo') g.userData.rotors.push(mkRotor(-5.5, 7.5));
  if (tb) {
    const tr = new THREE.Group();
    tr.position.set(0.3 * S, y0 + 1.1 * S, -L / 2 - 5.4 * S);
    for (let i = 0; i < 3; i++) { const b = add(new THREE.BoxGeometry(0.05, 1.5 * S, 0.2), DARK(), 0, 0, 0, tr); b.rotation.x = (i / 3) * Math.PI; }
    g.add(tr);
    g.userData.tailRotor = tr;
  }
  // seyir ışıkları
  add(new THREE.SphereGeometry(0.1, 8, 6), mat('navR', () => new THREE.MeshBasicMaterial({ color: 0xff2020 })), -R, y0, 0);
  add(new THREE.SphereGeometry(0.1, 8, 6), mat('navG', () => new THREE.MeshBasicMaterial({ color: 0x20ff40 })), R, y0, 0);
  const beacon = add(new THREE.SphereGeometry(0.14, 8, 6), mat('beacon', () => new THREE.MeshBasicMaterial({ color: 0xff3030 })), 0, y0 - R, 0);
  g.userData.beacon = beacon;
  if (H.diamond) for (let i = 0; i < 18; i++) add(new THREE.OctahedronGeometry(0.08), mat('gem', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfefff, emissiveIntensity: 1.2, metalness: 1, roughness: 0 })), (Math.random() - 0.5) * 2 * R, y0 + (Math.random() - 0.2) * R, (Math.random() - 0.5) * L);
  g.userData.isHeli = true;
  return g;
}

/** Lüks kumaş/metal: altın, elmas, platin, ipek */
export function luxMaterial(lux, color) {
  if (lux === 'gold') return std(0xd4af37, 0.22, 1);
  if (lux === 'diamond') return std(0xeaf9ff, 0.05, 0.9, { emissive: 0x2a5566, emissiveIntensity: 0.35 });
  if (lux === 'platinum') return std(0xd9dce1, 0.16, 1);
  if (lux === 'silk') return std(color, 0.25, 0.15);
  return std(color, 0.7, 0);
}
export function gemMaterial() { return mat('gem', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfefff, emissiveIntensity: 1.2, metalness: 1, roughness: 0 })); }
