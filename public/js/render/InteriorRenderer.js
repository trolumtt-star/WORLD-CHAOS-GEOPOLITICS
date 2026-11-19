import * as THREE from 'three';
import { interiorLayout, interiorOrigin } from '../../shared/interiors.js';
import { textSprite, glowTexture } from './geometry.js';
import { makeCar, makeCharacter } from '../entities/EntityManager.js';
import { CARS, CLUBS } from '../../shared/catalogs.js';
let carDisplayIdx = 0;

/**
 * Bina içi: sunucuyla aynı yerleşim dosyasından (shared/interiors.js) üretilir.
 * Duvarlar yalnızca içeriden görünür (Sims usulü kesit): kamera duvarın dışında kalsa da oda görünür.
 */
const mats = new Map();
const MAT = (c, o = {}) => {
  const k = `${c}|${JSON.stringify(o)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }));
  return mats.get(k);
};
const GLOW = (c) => MAT(c, { emissive: c, emissiveIntensity: 0.9 });
const PRODUCT_COLORS = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];

function box(g, w, h, d, mat, x, y, z, { shadow = true, ry = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function cyl(g, rt, rb, h, mat, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

function screenTexture(lines, bg = '#0b2a4a', fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 144;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 256, 144);
  x.fillStyle = '#c0392b'; x.fillRect(0, 108, 256, 36);
  x.fillStyle = fg; x.font = 'bold 22px sans-serif';
  x.fillText(lines[0] ?? '', 12, 40);
  x.font = '15px sans-serif';
  x.fillText(lines[1] ?? '', 12, 72);
  x.font = 'bold 16px sans-serif';
  x.fillText(lines[2] ?? 'SON DAKİKA', 12, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Her mobilya: (g, w, d, h, color, accent) -> grup içine çizer; merkez (0,0), zemin y=0
const ITEMS = {
  rug: (g, w, d, h, c) => { const m = box(g, w, 0.06, d, MAT(c ?? 0x8e3b46, { roughness: 1 }), 0, 0.03, 0, { shadow: false }); m.castShadow = false; box(g, w * 0.8, 0.07, d * 0.7, MAT(0xe8d8b0, { roughness: 1 }), 0, 0.035, 0, { shadow: false }); },
  sofa: (g, w, d, h, c) => {
    const m = MAT(c ?? 0x4a6fa5);
    box(g, w, 0.9, d, m, 0, 0.45, 0);
    box(g, w, 1.3, 0.5, m, 0, 1.25, d / 2 - 0.25);
    box(g, 0.5, 1.1, d, m, -w / 2 + 0.25, 0.85, 0);
    box(g, 0.5, 1.1, d, m, w / 2 - 0.25, 0.85, 0);
    for (const sx of [-w / 4, w / 4]) box(g, w / 2 - 0.6, 0.3, d - 0.6, MAT(new THREE.Color(c ?? 0x4a6fa5).offsetHSL(0, 0, 0.08).getHex()), sx, 1.0, -0.15);
  },
  coffee: (g, w, d) => { box(g, w, 0.12, d, MAT(0x5b3a1e), 0, 0.85, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.12, 0.8, 0.12, MAT(0x3a2412), x * (w / 2 - 0.2), 0.4, z * (d / 2 - 0.2)); cyl(g, 0.18, 0.15, 0.3, MAT(0xffffff), 0.5, 1.06, 0); },
  tv: (g, w, d, h) => {
    box(g, w * 0.9, 0.9, d + 0.4, MAT(0x2b2b2b), 0, 0.45, 0);
    box(g, w, h - 1.1, 0.2, MAT(0x111111), 0, 0.9 + (h - 1.1) / 2, 0);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 1.4), new THREE.MeshBasicMaterial({ map: screenTexture(['📺 WORLD CHAOS TV', 'Haberler 20:00\'de']) }));
    scr.position.set(0, 0.9 + (h - 1.1) / 2, 0.11);
    scr.userData.screen = true;
    g.add(scr);
  },
  counter: (g, w, d, h, c) => { box(g, w, h - 0.1, d, MAT(c ?? 0xf2f2f2), 0, (h - 0.1) / 2, 0); box(g, w + 0.1, 0.1, d + 0.1, MAT(0x3d3d3d, { roughness: 0.3 }), 0, h - 0.05, 0); },
  stove: (g, w, d, h) => { box(g, w, h, d, MAT(0xdedede), 0, h / 2, 0); box(g, w - 0.1, 0.05, d - 0.1, MAT(0x111111), 0, h + 0.02, 0); for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) cyl(g, 0.28, 0.28, 0.05, GLOW(0x661100), x * (w / 2), h + 0.05, z * (d / 2)); cyl(g, 0.3, 0.28, 0.45, MAT(0xc0392b), -0.45 * (w / 2), h + 0.3, -0.45 * (d / 2)); },
  sink: (g, w, d, h) => { box(g, w, h, d, MAT(0xf2f2f2), 0, h / 2, 0); box(g, w - 0.4, 0.08, d - 0.5, MAT(0x9aa0a6, { metalness: 0.8, roughness: 0.2 }), 0, h + 0.01, 0); cyl(g, 0.06, 0.06, 0.6, MAT(0xcccccc, { metalness: 0.9 }), 0, h + 0.3, -d / 2 + 0.2); },
  fridge: (g, w, d, h) => { box(g, w, h, d, MAT(0xf4f6f7, { roughness: 0.35 }), 0, h / 2, 0); box(g, w + 0.02, 0.04, d + 0.02, MAT(0xaaaaaa), 0, h * 0.62, 0); box(g, 0.08, 0.9, 0.12, MAT(0x888888, { metalness: 0.8 }), w / 2 - 0.3, h * 0.8, d / 2 + 0.05); box(g, 0.08, 1.2, 0.12, MAT(0x888888, { metalness: 0.8 }), w / 2 - 0.3, h * 0.35, d / 2 + 0.05); },
  table: (g, w, d, h, c) => { box(g, w, 0.14, d, MAT(c ?? 0x8a5a33), 0, h, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.16, h, 0.16, MAT(0x5b3a1e), x * (w / 2 - 0.2), h / 2, z * (d / 2 - 0.2)); cyl(g, 0.3, 0.3, 0.05, MAT(0xffffff), 0, h + 0.1, 0); },
  bigTable: (g, w, d, h, c) => ITEMS.table(g, w, d, h, c),
  roundTable: (g, w, d, h, c) => { cyl(g, w / 2, w / 2, 0.12, MAT(c ?? 0xf4f4f4), 0, h, 0, 20); cyl(g, 0.12, 0.3, h, MAT(0x333333), 0, h / 2, 0); cyl(g, 0.15, 0.15, 0.25, MAT(0xffffff), 0.3, h + 0.18, 0.2); },
  chair: (g, w, d, h, c) => { const m = MAT(c ?? 0x6b4a2e); box(g, w, 0.12, d, m, 0, h, 0); box(g, w, 1.2, 0.12, m, 0, h + 0.6, -d / 2 + 0.06); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.1, h, 0.1, m, x * (w / 2 - 0.1), h / 2, z * (d / 2 - 0.1)); },
  stool: (g, w, d, h) => { cyl(g, w / 2, w / 2, 0.15, MAT(0xb03a2e), 0, h, 0); cyl(g, 0.08, 0.2, h, MAT(0x999999, { metalness: 0.8 }), 0, h / 2, 0); },
  bed: (g, w, d, h, c) => {
    box(g, w, 0.6, d, MAT(0x6b4a2e), 0, 0.3, 0);
    box(g, w - 0.2, 0.45, d - 0.2, MAT(0xffffff), 0, 0.82, 0);
    box(g, w - 0.1, 0.5, d * 0.62, MAT(c ?? 0xd9e4f5), 0, 0.85, d * 0.18);
    box(g, w * 0.38, 0.3, 1, MAT(0xffffff), -w * 0.22, 1.15, -d / 2 + 0.8);
    box(g, w * 0.38, 0.3, 1, MAT(0xffffff), w * 0.22, 1.15, -d / 2 + 0.8);
    box(g, w, 2.2, 0.3, MAT(0x5b3a1e), 0, 1.1, -d / 2 + 0.15);
  },
  hbed: (g, w, d, h) => { box(g, w, 0.9, d, MAT(0xdfe6ee, { metalness: 0.4 }), 0, 0.7, 0); box(g, w - 0.2, 0.3, d - 0.2, MAT(0xffffff), 0, 1.25, 0); box(g, w * 0.7, 0.25, 1, MAT(0xaed6f1), 0, 1.5, -d / 2 + 0.8); box(g, w, 0.8, 0.12, MAT(0xbdc3c7, { metalness: 0.6 }), 0, 1.5, -d / 2); },
  nightstand: (g, w, d, h) => { box(g, w, h, d, MAT(0x6b4a2e), 0, h / 2, 0); cyl(g, 0.12, 0.2, 0.5, MAT(0xaaaaaa), 0, h + 0.25, 0); const s = cyl(g, 0.35, 0.25, 0.4, GLOW(0xfff1c0), 0, h + 0.7, 0); s.castShadow = false; },
  wardrobe: (g, w, d, h, c) => { box(g, w, h, d, MAT(c ?? 0x6b4a2e), 0, h / 2, 0); box(g, 0.05, h - 0.4, d + 0.02, MAT(0x3a2412), 0, h / 2, 0); for (const x of [-0.25, 0.25]) box(g, 0.08, 0.5, 0.1, MAT(0xc9a227, { metalness: 0.8 }), x, h / 2, -d / 2 - 0.05); },
  bookcase: (g, w, d, h) => {
    box(g, w, h, d, MAT(0x5b3a1e), 0, h / 2, 0);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
      const bh = 0.6 + ((i * 7 + r * 3) % 4) * 0.1;
      box(g, w / 10, bh, d * 0.7, MAT(PRODUCT_COLORS[(i + r * 3) % PRODUCT_COLORS.length]), -w / 2 + w / 10 * (i + 0.8), 0.3 + r * (h / 4) + bh / 2, 0.15, { shadow: false });
    }
  },
  plant: (g, w, d, h) => { cyl(g, w * 0.4, w * 0.3, 0.9, MAT(0xb5651d), 0, 0.45, 0); const s = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.75, 0), MAT(0x2e8b57, { flatShading: true })); s.position.y = h - w * 0.6; s.castShadow = true; g.add(s); },
  lamp: (g, w, d, h) => { cyl(g, 0.4, 0.4, 0.08, MAT(0x333333), 0, 0.04, 0); cyl(g, 0.05, 0.05, h - 0.6, MAT(0x333333), 0, (h - 0.6) / 2, 0); const s = cyl(g, 0.5, 0.3, 0.6, GLOW(0xfff1c0), 0, h - 0.3, 0); s.castShadow = false; },
  register: (g, w, d, h) => { box(g, w, 0.5, d, MAT(0x222222), 0, h - 0.25, 0); box(g, w * 0.8, 0.5, 0.1, GLOW(0x2ecc71), 0, h + 0.2, -d / 2 + 0.2); },
  shelf: (g, w, d, h, c, acc) => {
    box(g, w, h, 0.2, MAT(0xdcdcdc), 0, h / 2, 0);
    for (let r = 0; r < 4; r++) {
      const y = 0.3 + r * (h / 4);
      box(g, w, 0.08, d, MAT(0xbcbcbc), 0, y, 0, { shadow: false });
      for (let i = 0; i < Math.floor(w / 0.7); i++) {
        const col = PRODUCT_COLORS[(i * 3 + r * 5) % PRODUCT_COLORS.length];
        box(g, 0.5, 0.55 + (i % 3) * 0.1, d * 0.38, MAT(col), -w / 2 + 0.45 + i * 0.7, y + 0.35, -d / 4, { shadow: false });
        box(g, 0.5, 0.55 + ((i + 1) % 3) * 0.1, d * 0.38, MAT(PRODUCT_COLORS[(i * 5 + r) % 8]), -w / 2 + 0.45 + i * 0.7, y + 0.35, d / 4, { shadow: false });
      }
    }
  },
  fridgeRow: (g, w, d, h) => { box(g, w, h, d, MAT(0xecf0f1), 0, h / 2, 0); box(g, 0.1, h - 0.6, d - 0.4, GLOW(0xaee6ff), -w / 2 - 0.02, h / 2, 0, { shadow: false }); },
  crate: (g, w, d, h) => { box(g, w, h, d, MAT(0xb08850, { roughness: 0.95 }), 0, h / 2, 0); box(g, w + 0.02, 0.15, d + 0.02, MAT(0x8a6a3a), 0, h * 0.75, 0, { shadow: false }); },
  pallet: (g, w, d, h) => box(g, w, h, d, MAT(0x9c7a4a), 0, h / 2, 0),
  gunrack: (g, w, d, h) => { box(g, w, h, d, MAT(0x3a2a1a), 0, h / 2, 0); const n = Math.floor(Math.max(w, d) / 1.2); for (let i = 0; i < n; i++) { const along = -Math.max(w, d) / 2 + 0.7 + i * 1.2; const gm = MAT(0x1a1a1a, { metalness: 0.6 }); if (w > d) box(g, 0.15, 2.2, 0.15, gm, along, h / 2, d / 2 + 0.1); else box(g, 0.15, 2.2, 0.15, gm, d / 2 + 0.1, h / 2, along); } },
  glass: (g, w, d, h) => { box(g, w, h * 0.6, d, MAT(0x3a2a1a), 0, h * 0.3, 0); box(g, w, h * 0.4, d, MAT(0xaee6ff, { transparent: true, opacity: 0.35 }), 0, h * 0.8, 0, { shadow: false }); },
  target: (g, w, d, h) => { box(g, w, h, d, MAT(0xf4f4f4), 0, h / 2 + 0.5, 0); for (let r = 0; r < 3; r++) box(g, w + 0.05, d * (0.8 - r * 0.25), d * (0.8 - r * 0.25), MAT(r % 2 ? 0xffffff : 0xc0392b), 0, h / 2 + 0.5, 0, { shadow: false }); },
  espresso: (g, w, d, h) => { box(g, w, h - 1.7, d, MAT(0xb0b0b0, { metalness: 0.8, roughness: 0.25 }), 0, 1.7 + (h - 1.7) / 2, 0); },
  bottles: (g, w, d, h) => { box(g, w, h, d, MAT(0x2b1d12), 0, h / 2, 0); for (let r = 0; r < 3; r++) for (let i = 0; i < Math.floor(w / 0.45); i++) cyl(g, 0.12, 0.14, 0.6, MAT(PRODUCT_COLORS[(i + r * 2) % 8], { transparent: true, opacity: 0.85, emissive: PRODUCT_COLORS[(i + r * 2) % 8], emissiveIntensity: 0.25 }), -w / 2 + 0.3 + i * 0.45, 0.9 + r * 1.3, d / 2 - 0.2, 8); },
  jukebox: (g, w, d, h) => { box(g, w, h, d, MAT(0x5b2c6f), 0, h / 2, 0); box(g, w - 0.3, h * 0.5, 0.1, GLOW(0xff7ad9), 0, h * 0.6, d / 2 + 0.02, { shadow: false }); },
  machine: (g, w, d, h) => { box(g, w, h * 0.7, d, MAT(0xe67e22, { metalness: 0.4 }), 0, h * 0.35, 0); box(g, w * 0.4, h * 0.5, d * 0.4, MAT(0x7f8c8d, { metalness: 0.7 }), 0, h * 0.85, 0); box(g, 0.6, 0.3, 0.1, GLOW(0x2ecc71), w / 3, h * 0.55, d / 2 + 0.05, { shadow: false }); box(g, 0.3, 0.3, 0.1, GLOW(0xe74c3c), -w / 3, h * 0.55, d / 2 + 0.05, { shadow: false }); },
  conveyor: (g, w, d, h) => { box(g, w, 0.2, d, MAT(0x222222), 0, h, 0); for (let i = 0; i < w / 2; i++) box(g, 0.2, h, 0.2, MAT(0x7f8c8d), -w / 2 + 1 + i * 2, h / 2, 0); for (let i = 0; i < 5; i++) box(g, 1, 0.8, 1, MAT(0xb08850), -w / 2 + 3 + i * 5, h + 0.5, 0); },
  desk: (g, w, d, h, c) => { box(g, w, 0.14, d, MAT(c ?? 0x6b4a2e), 0, h, 0); box(g, 0.2, h, d, MAT(c ?? 0x6b4a2e), -w / 2 + 0.1, h / 2, 0); box(g, w * 0.35, h, d - 0.1, MAT(c ?? 0x6b4a2e), w / 2 - w * 0.175, h / 2, 0); },
  computer: (g, w, d, h) => { box(g, w, 0.9, 0.08, MAT(0x111111), 0, h - 0.45, 0); box(g, w - 0.15, 0.75, 0.02, GLOW(0x5dade2), 0, h - 0.45, 0.05, { shadow: false }); box(g, 0.1, 0.5, 0.1, MAT(0x111111), 0, h - 1.1, 0); },
  radio: (g, w, d, h) => { box(g, w, 0.7, d, MAT(0x2c3e50), 0, h - 0.35, 0); cyl(g, 0.03, 0.03, 1.2, MAT(0x111111), w / 3, h + 0.5, 0); box(g, 0.3, 0.15, 0.05, GLOW(0xe74c3c), -w / 4, h - 0.3, d / 2, { shadow: false }); },
  cell: (g, w, d, h) => { box(g, w, 0.2, d, MAT(0x555555), 0, 0.1, 0); for (let i = 0; i <= w / 0.5; i++) cyl(g, 0.05, 0.05, h, MAT(0x333333, { metalness: 0.8 }), -w / 2 + i * 0.5, h / 2, d / 2, 6); box(g, w, 0.15, 0.15, MAT(0x333333, { metalness: 0.8 }), 0, h, d / 2); box(g, 3, 0.4, 1.2, MAT(0x777777), -w / 4, 0.6, -d / 2 + 0.7); },
  bench: (g, w, d, h) => { box(g, w, 0.15, d, MAT(0x8a6a3a), 0, h, 0); box(g, 0.2, h, d, MAT(0x555555), -w / 2 + 0.3, h / 2, 0); box(g, 0.2, h, d, MAT(0x555555), w / 2 - 0.3, h / 2, 0); },
  flag: (g, w, d, h, c, acc) => { cyl(g, 0.06, 0.06, h, MAT(0xc9a227, { metalness: 0.8 }), 0, h / 2, 0, 6); box(g, 0.05, 1.6, 2.4, MAT(acc ?? 0xc0392b), 0, h - 1, 1.2, { shadow: false }); },
  lockers: (g, w, d, h) => { box(g, w, h, d, MAT(0x5d6d7e, { metalness: 0.5 }), 0, h / 2, 0); for (let i = 0; i < 4; i++) box(g, 0.04, h - 0.3, 0.04, MAT(0x2c3e50), -w / 2, h / 2, -d / 2 + (i + 0.5) * (d / 4)); },
  vault: (g, w, d, h) => { box(g, w, h, d, MAT(0x7f8c8d, { metalness: 0.7, roughness: 0.3 }), 0, h / 2, 0); const door = cyl(g, h * 0.38, h * 0.38, 0.4, MAT(0xbdc3c7, { metalness: 0.9, roughness: 0.2 }), 0, h / 2, d / 2 + 0.1, 24); door.rotation.x = Math.PI / 2; },
  curtain: (g, w, d, h) => box(g, w, h, d, MAT(0xaed6f1, { transparent: true, opacity: 0.8 }), 0, h / 2 + 0.3, 0),
  judgeBench: (g, w, d, h) => { box(g, w, h, d, MAT(0x4a2c17), 0, h / 2, 0); box(g, w + 0.2, 0.15, d + 0.2, MAT(0x2b1a0e), 0, h, 0); box(g, w * 0.3, 3.4, 0.4, MAT(0x3a2412), 0, h + 1.7, -d / 2 + 0.2); cyl(g, 0.12, 0.2, 0.5, MAT(0x8a5a33), 1.6, h + 0.3, 0); const s = textSprite('⚖️ T.C. ADALET', { color: '#ffd34d', border: '#ffd34d', scale: 0.6 }); s.position.set(0, h + 4.4, -d / 2); g.add(s); },
  witness: (g, w, d, h) => { box(g, w, h, d, MAT(0x6b4a2e), 0, h / 2, 0); box(g, w, 0.12, d, MAT(0x3a2412), 0, h, 0); },
  rack: (g, w, d, h) => {
    cyl(g, 0.05, 0.05, w, MAT(0xaaaaaa, { metalness: 0.8 }), 0, h, 0, 6).rotation.z = Math.PI / 2;
    for (const x of [-w / 2, w / 2]) cyl(g, 0.06, 0.06, h, MAT(0xaaaaaa, { metalness: 0.8 }), x, h / 2, 0, 6);
    for (let i = 0; i < Math.floor(w / 0.55); i++) { const c = PRODUCT_COLORS[(i * 3) % 8]; box(g, 0.45, 1.6, 0.9, MAT(c), -w / 2 + 0.4 + i * 0.55, h - 0.95, 0, { shadow: false }); }
  },
  mirror: (g, w, d, h) => { box(g, w, h, d, MAT(0xc9a227, { metalness: 0.8 }), 0, h / 2 + 0.3, 0); box(g, w + 0.02, h - 0.4, d - 0.4, MAT(0xdff3ff, { metalness: 1, roughness: 0.05 }), -0.03, h / 2 + 0.3, 0, { shadow: false }); },
  fitting: (g, w, d, h) => { box(g, 0.15, h, d, MAT(0x6b4a2e), -w / 2, h / 2, 0); box(g, w, h, 0.15, MAT(0x6b4a2e), 0, h / 2, -d / 2); box(g, w, h * 0.8, 0.05, MAT(0xb03a7a, { transparent: true, opacity: 0.85 }), 0, h * 0.45, d / 2); },
  gangster: (g) => { const m = makeCharacter(0x111111, { seed: Math.random() * 1e6, pants: 0x0a0a0a, outfit: { acc: 'sunglasses', hat: 'fedora' } }); m.rotation.y = Math.PI; g.add(m); },
  mannequin: (g) => { const m = makeCharacter(0xb03a7a, { seed: 11, outfit: { top: 'suit_white', hat: 'fedora' } }); m.position.y = 0.3; g.add(m); cyl(g, 0.6, 0.6, 0.3, MAT(0x333333), 0, 0.15, 0, 16); },
  carDisplay: (g, w, d, h) => {
    cyl(g, w * 0.75, w * 0.75, 0.3, MAT(0x2c3e50, { metalness: 0.6, roughness: 0.3 }), 0, 0.15, 0, 28);
    const ids = Object.keys(CARS);
    const id = ids[(carDisplayIdx++) % ids.length];
    const car = makeCar(id);
    car.position.y = 0.3;
    car.rotation.y = 0.6;
    car.userData.spin = true;
    g.add(car);
    const t = textSprite(`${CARS[id].label}`, { color: '#ffffff', border: '#c0392b', scale: 0.55 });
    t.position.set(0, 5, 0);
    g.add(t);
  },
  pitch: (g, w, d) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT(0x2e8b3a, { roughness: 1 }));
    f.rotation.x = -Math.PI / 2; f.position.y = 0.03; f.receiveShadow = true; g.add(f);
    for (let i = 0; i < 8; i++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(w / 8, d), MAT(0x37a043, { roughness: 1 })); st.rotation.x = -Math.PI / 2; st.position.set(-w / 2 + w / 16 + i * (w / 8), 0.035, 0); if (i % 2) g.add(st); }
    const line = MAT(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 });
    for (const [lw, ld, x, z] of [[w, 0.25, 0, -d / 2], [w, 0.25, 0, d / 2], [0.25, d, -w / 2, 0], [0.25, d, w / 2, 0], [0.25, d, 0, 0]]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), line); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.05, z); g.add(l); }
    const c = new THREE.Mesh(new THREE.RingGeometry(5, 5.3, 40), line); c.rotation.x = -Math.PI / 2; c.position.y = 0.05; g.add(c);
  },
  goal: (g, w, d, h) => { const m = MAT(0xffffff); for (const z of [-d / 2, d / 2]) cyl(g, 0.12, 0.12, h, m, 0, h / 2, z, 8); const bar = cyl(g, 0.12, 0.12, d, m, 0, h, 0, 8); bar.rotation.x = Math.PI / 2; box(g, w, h, d, MAT(0xffffff, { transparent: true, opacity: 0.18 }), -w / 2, h / 2, 0, { shadow: false }); void m; },
  stand: (g, w, d, h) => {
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const along = w > d;
      const off = (r - rows / 2) * (along ? d / rows : w / rows);
      box(g, along ? w : w / rows, 0.8 + r * 1.1, along ? d / rows : d, MAT(r % 2 ? 0x1e88e5 : 0xd62828), along ? 0 : off, (0.8 + r * 1.1) / 2, along ? off : 0, { shadow: false });
    }
    // Seyirciler: renkli küçük kafalar
    const n = Math.floor(Math.max(w, d) / 1.4) * 3;
    const geo = new THREE.SphereGeometry(0.32, 6, 4);
    const crowd = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff }), n);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const r = i % 3 + 1, t = Math.floor(i / 3) / (n / 3);
      const along = w > d;
      const L = (along ? w : d) * (t - 0.5);
      const off = (r - rows / 2) * (along ? d / rows : w / rows);
      m4.makeTranslation(along ? L : off, 1.4 + r * 1.1, along ? off : L);
      crowd.setMatrixAt(i, m4);
      crowd.setColorAt(i, col.setHSL(Math.random(), 0.6, 0.55));
    }
    crowd.userData.crowd = true;
    g.add(crowd);
  },
  scoreboard: (g, w, d, h) => {
    box(g, 0.6, h, 0.6, MAT(0x333333), -w / 2 + 1, h / 2, 0); box(g, 0.6, h, 0.6, MAT(0x333333), w / 2 - 1, h / 2, 0);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.5), new THREE.MeshBasicMaterial({ map: tex }));
    scr.position.set(0, h - 1.5, 0.35);
    scr.userData.scoreboard = { canvas: c, tex };
    g.add(scr);
  },
  cabinet: (g, w, d, h) => { box(g, w, h, d, MAT(0xffffff), 0, h / 2, 0); box(g, 0.05, 0.5, 0.5, MAT(0xc0392b), -w / 2, h * 0.75, 0, { shadow: false }); },
};

export class InteriorRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.colliders = [];
    this.buildingId = null;
    this.light = null;
  }

  get active() { return !!this.group; }

  build(b, { accent } = {}) {
    this.clear();
    const layout = interiorLayout(b.type);
    if (!layout) return;
    const o = interiorOrigin(b.id);
    this.origin = o;
    this.layout = layout;
    this.buildingId = b.id;
    const g = new THREE.Group();
    g.position.set(o.x, 0, o.z);
    const { w, d } = layout;
    const H = 7;

    // Zemin + parke çizgileri
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT(layout.floor, { roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    for (let i = 1; i < w / 2; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.04, d), MAT(new THREE.Color(layout.floor).offsetHSL(0, 0, -0.08).getHex()));
      l.rotation.x = -Math.PI / 2;
      l.position.set(-w / 2 + i * 2, 0.01, 0);
      g.add(l);
    }
    // Duvarlar (yalnızca içten görünür)
    const wallMat = new THREE.MeshStandardMaterial({ color: layout.wall, roughness: 0.9, side: THREE.FrontSide });
    const wall = (len, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat);
      m.position.set(x, H / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      g.add(m);
      // süpürgelik
      const sb = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.4), MAT(0x5b3a1e));
      sb.position.set(x, 0.2, z);
      sb.rotation.y = ry;
      sb.translateZ(0.02);
      g.add(sb);
      return m;
    };
    wall(w, 0, -d / 2, 0);
    wall(w, 0, d / 2, Math.PI);
    wall(d, -w / 2, 0, Math.PI / 2);
    wall(d, w / 2, 0, -Math.PI / 2);
    // Pencereler
    for (const [x, z, ry] of [[-w / 4, -d / 2 + 0.03, 0], [w / 4, -d / 2 + 0.03, 0], [-w / 2 + 0.03, -d / 6, Math.PI / 2], [w / 2 - 0.03, -d / 6, -Math.PI / 2]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), MAT(0xbfe6ff, { emissive: 0x9fd8ff, emissiveIntensity: 0.6 }));
      win.position.set(x, 4, z);
      win.rotation.y = ry;
      win.userData.window = true;
      g.add(win);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.5), MAT(0xffffff));
      frame.position.set(x, 4, z);
      frame.rotation.y = ry;
      frame.translateZ(-0.01);
      g.add(frame);
    }
    // Kapı (iç taraf)
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), MAT(0x5b3a1e));
    door.position.set(0, 2.5, d / 2 - 0.03);
    door.rotation.y = Math.PI;
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), MAT(0xc9a227, { metalness: 0.9 }));
    knob.position.set(-1, 2.4, d / 2 - 0.12);
    g.add(knob);
    const exitSign = textSprite('🚪 ÇIKIŞ', { color: '#3ddc84', border: '#3ddc84', scale: 0.55 });
    exitSign.position.set(0, 5.7, d / 2 - 0.4);
    g.add(exitSign);

    // Mobilyalar
    this.colliders = [];
    for (const [kind, x, z, iw, id, ih, color, ry = 0] of layout.items) {
      const fn = ITEMS[kind];
      if (!fn) continue;
      const ig = new THREE.Group();
      ig.position.set(x, 0, z);
      ig.rotation.y = ry;
      fn(ig, iw, id, ih, color ?? undefined, accent ?? layout.accent);
      g.add(ig);
      if (kind !== 'rug' && kind !== 'curtain') {
        const rot = Math.abs(Math.sin(ry)) > 0.7;
        this.colliders.push({ x: o.x + x, z: o.z + z, hw: (rot ? id : iw) / 2, hd: (rot ? iw : id) / 2 });
      }
      if (kind === 'tv') { this.tvScreen = ig.children.find((c) => c.userData.screen); this.tvPos = { x: o.x + x, z: o.z + z, y: ih - 0.2 }; }
      if (kind === 'scoreboard') this.scoreboard = ig.children.find((c) => c.userData.scoreboard)?.userData.scoreboard;
      if (kind === 'pitch') this.pitch = { x: o.x + x, z: o.z + z, w: iw, d: id };
      ig.traverse((c) => { if (c.userData.spin) (this.spinners ??= []).push(c); });
    }
    // Duvar çarpışmaları
    const T = 2;
    this.colliders.push(
      { x: o.x, z: o.z - d / 2 - T / 2, hw: w / 2 + T, hd: T / 2 },
      { x: o.x, z: o.z + d / 2 + T / 2, hw: w / 2 + T, hd: T / 2 },
      { x: o.x - w / 2 - T / 2, z: o.z, hw: T / 2, hd: d / 2 + T },
      { x: o.x + w / 2 + T / 2, z: o.z, hw: T / 2, hd: d / 2 + T },
    );

    // Tavan lambaları (görsel) + tek bir oda ışığı
    for (const [x, z] of [[-w / 4, 0], [w / 4, 0]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16), GLOW(0xfff6dd));
      l.position.set(x, H - 0.05, z);
      g.add(l);
    }
    this.light = new THREE.PointLight(0xfff1d6, 16, Math.max(w, d) * 1.5, 1); // r160: fiziksel ışık birimleri
    this.light.position.set(o.x, H - 1, o.z);

    // Görev işaretçisi
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 28), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    arrow.rotation.x = Math.PI;
    arrow.position.y = 3.6;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd34d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3, 3, 1);
    glow.position.y = 3.6;
    this.taskMarker = new THREE.Group();
    this.taskMarker.add(ring, arrow, glow);
    this.taskMarker.visible = false;
    this.taskMarker.renderOrder = 25;
    g.add(this.taskMarker);

    this.group = g;
    this.scene.add(g, this.light);
    if (this.pitch) this.setupMatch(g, o);
  }

  // ---- stadyum: 10 futbolcu + top, sunucudaki skora göre canlanır
  setupMatch(g, o) {
    this.footballers = [];
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), MAT(0xffffff));
    this.ball.position.set(this.pitch.x - o.x, 0.45, this.pitch.z - o.z);
    this.ball.castShadow = true;
    g.add(this.ball);
    this.ballTarget = { x: 0, z: 0 };
    this.matchOrigin = o;
  }

  setMatch(match) {
    this.match = match;
    if (!this.pitch || !this.group) return;
    const want = match && match.status === 'live' ? 14 : 0;
    if (this.footballers.length === want && this.matchTeams === `${match?.id}`) return;
    for (const f of this.footballers) this.group.remove(f.g);
    this.footballers = [];
    this.matchTeams = `${match?.id}`;
    if (!want) return;
    for (let i = 0; i < want; i++) {
      const side = i < 7 ? 0 : 1;
      const club = CLUBS[side ? match.away : match.home];
      const ch = makeCharacter(i % 7 === 0 ? 0x30d158 : club.color, { seed: i * 31 + 5, pants: club.color2, outfit: {} }); // kaleci yeşil
      this.group.add(ch);
      this.footballers.push({ g: ch });
    }
  }

  /** MatchSim durumunu 3D sahneye uygula */
  renderMatch(sim, dt) {
    if (!this.pitch || !this.ball || !this.footballers.length || !sim.players.length) return;
    const P = this.pitch, o = this.matchOrigin;
    const cx = P.x - o.x, cz = P.z - o.z;
    const kx = P.w / sim.W, kz = P.d / sim.D;
    sim.players.forEach((p, i) => {
      const f = this.footballers[i];
      if (!f) return;
      f.g.position.set(cx + p.x * kx, 0, cz + p.z * kz);
      f.g.rotation.y = p.rot;
      animateFootballer(f.g, p.speed, dt);
    });
    const b = sim.ball;
    this.ball.position.set(cx + b.x * kx, 0.45 + b.air * 3, cz + b.z * kz);
    this.ball.rotation.x += dt * Math.hypot(b.vx, b.vz) * 0.5;
  }

  goalFx(side) {
    if (!this.pitch || !this.ball) return;
    this.ballTarget = { x: (side ? -1 : 1) * (this.pitch.w / 2 + 0.5), z: (Math.random() - 0.5) * 4, goal: 1.2 };
  }

  drawScoreboard(match, clubName) {
    const sb = this.scoreboard;
    if (!sb) return;
    const x = sb.canvas.getContext('2d');
    x.fillStyle = '#0b0f17'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#ffd34d'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
    if (!match) { x.fillText('KAOS ARENA', 256, 75); sb.tex.needsUpdate = true; return; }
    const min = match.status === 'live' && match.startedAt ? Math.min(90, Math.floor(((Date.now() - match.startedAt) / 120000) * 90)) : match.status === 'done' ? 90 : 0;
    x.fillStyle = '#ffffff'; x.font = 'bold 26px sans-serif';
    x.fillText(`${clubName(match.home)}  ${match.score[0]} - ${match.score[1]}  ${clubName(match.away)}`, 256, 60);
    x.fillStyle = match.status === 'live' ? '#3ddc84' : '#aaaaaa'; x.font = 'bold 22px sans-serif';
    x.fillText(match.status === 'live' ? `CANLI · ${min}'` : match.status === 'done' ? 'MAÇ SONU' : 'BUGÜN 14:00', 256, 100);
    sb.tex.needsUpdate = true;
  }

  setTask(spotId) {
    if (!this.taskMarker) return;
    const s = this.layout?.spots.find((x) => x.id === spotId);
    this.taskMarker.visible = !!s;
    if (s) this.taskMarker.position.set(s.x, 0, s.z);
  }

  setTv(lines) {
    if (!this.tvScreen) return;
    this.tvScreen.material.map?.dispose();
    this.tvScreen.material.map = screenTexture(lines);
    this.tvScreen.material.needsUpdate = true;
  }

  /** Oyuncunun yanındaki etkileşim noktası */
  nearestSpot(x, z, max = 3.4) {
    if (!this.layout) return null;
    let best = null, bd = max;
    for (const s of this.layout.spots) {
      const d = Math.hypot(this.origin.x + s.x - x, this.origin.z + s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  spotWorld(spotId) {
    const s = this.layout?.spots.find((x) => x.id === spotId);
    return s ? { x: this.origin.x + s.x, z: this.origin.z + s.z } : null;
  }

  update(dt, night) {
    if (!this.group) return;
    if (this.spinners) for (const c of this.spinners) c.rotation.y += dt * 0.3;
    if (this.taskMarker.visible) {
      this.taskMarker.children[0].rotation.z += dt * 2;
      this.taskMarker.children[1].position.y = 3.6 + Math.sin(performance.now() / 200) * 0.3;
    }
    this.light.intensity = 14 + night * 10;
    for (const c of this.group.children) {
      if (c.userData.window) c.material.emissiveIntensity = 0.7 * (1 - night) + 0.05;
    }
  }

  clear() {
    if (!this.group) return;
    this.scene.remove(this.group, this.light);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material && !mats.has(o.material) && ![...mats.values()].includes(o.material)) { o.material.map?.dispose(); o.material.dispose?.(); }
    });
    this.light.dispose?.();
    this.group = null;
    this.light = null;
    this.layout = null;
    this.colliders = [];
    this.tvScreen = null;
    this.tvPos = null;
    this.buildingId = null;
    this.pitch = null;
    this.footballers = [];
    this.ball = null;
    this.scoreboard = null;
    this.spinners = null;
    this.matchTeams = null;
  }
}

import { animateWalk } from '../entities/EntityManager.js';
function animateFootballer(g, speed, dt) { animateWalk(g, speed, dt, {}); }
