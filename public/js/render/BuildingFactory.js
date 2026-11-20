import * as THREE from 'three';
import { PartBuilder } from './geometry.js';
import { LUX_HOUSES, adTier } from '../../shared/catalogs.js';

/**
 * Prosedürel, düşük poligonlu ama karakterli binalar. Her tipin kendine has silueti var:
 * ev (kiremit çatı + bahçe), apartman (balkonlar + su deposu), villa (havuz), market (otopark),
 * kafe (çizgili tente + masalar), fabrika (alt türüne göre silo / tank / baca), saray (kubbe + sütun)...
 * Yerel koordinat: bina merkezi (0,0), kapı +Z yönünde (yola bakar).
 */
export const MAT = {
  city: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }),
  window: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  water: new THREE.MeshStandardMaterial({ color: 0x2aa7d6, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 }),
};

const C = {
  wallsHouse: [0xf0e2c8, 0xd98c6a, 0xa9c7d8, 0xb8c9a3, 0xe8d36d],
  roofs: [0x8b3a2f, 0x5b4636, 0x6c7a89, 0x9c4a2f],
  apt: [0xc9c3b8, 0xa7b1b9, 0xd8c7a8, 0x9aa59a, 0xe0d9cf],
  lawn: 0x5d9a4a, grass: 0x6aab52, dirt: 0x8a6a45, concrete: 0xb9b6ae, plaza: 0xcfc8b8, asphalt: 0x4a4d52,
  trunk: 0x6b4a2e, leaves: [0x3f8f3a, 0x4fa045, 0x2f7a35, 0x6aa84f],
};

const pick = (arr, v) => arr[Math.abs(v) % arr.length];

function addWindows(win, w, h, d, { floorH = 3.6, startY = 2.2, spacing = 3.4, faces = 'all', litChance = 0.55, ww = 1.4, wh = 1.6, skipFrontGround = true } = {}) {
  const floors = Math.max(1, Math.floor((h - startY) / floorH) + 1);
  const face = (len, place) => {
    const cols = Math.max(1, Math.floor((len - 2) / spacing));
    const step = len / (cols + 1);
    for (let f = 0; f < floors; f++) {
      const y = startY + f * floorH;
      if (y > h - 1) break;
      for (let c = 1; c <= cols; c++) {
        const lit = Math.random() < litChance;
        const k = lit ? 0.6 + Math.random() * 0.4 : 0.28;
        const col = lit ? new THREE.Color(1 * k, 0.82 * k, 0.5 * k) : new THREE.Color(0.32, 0.4, 0.52);
        place(-len / 2 + c * step, y, f, col);
      }
    }
  };
  if (faces === 'all' || faces.includes('f')) face(w, (x, y, f, col) => { if (!(skipFrontGround && f === 0 && Math.abs(x) < 2)) win.quad(ww, wh, x, y, d / 2 + 0.06, col, 0); });
  if (faces === 'all' || faces.includes('b')) face(w, (x, y, f, col) => win.quad(ww, wh, x, y, -d / 2 - 0.06, col, Math.PI));
  if (faces === 'all' || faces.includes('s')) {
    face(d, (z, y, f, col) => win.quad(ww, wh, w / 2 + 0.06, y, -z, col, Math.PI / 2));
    face(d, (z, y, f, col) => win.quad(ww, wh, -w / 2 - 0.06, y, z, col, -Math.PI / 2));
  }
}

function tree(pb, x, z, s = 1, v = 0) {
  pb.cyl(0.25 * s, 0.35 * s, 2.4 * s, 6, x, 1.2 * s, z, C.trunk);
  pb.add(new THREE.IcosahedronGeometry(1.7 * s, 0), pick(C.leaves, v + Math.round(x)), x, 3.4 * s, z, { jitter: 0.08 });
}

function door(pb, d, color = 0x3b2414, w = 2.4, h = 3.2) {
  pb.box(w, h, 0.3, 0, h / 2, d / 2 + 0.1, color);
}

function lotBase(pb, size, color) {
  pb.plane(size, size, 0, 0.05, 0, color);
}

// ------------------------------------------------------------------------

export function createBuildingModel(b, lotSize) {
  const g = new THREE.Group();
  const pb = new PartBuilder();
  const win = new PartBuilder();
  const glow = new PartBuilder();
  const extras = { chimneys: [], blinkers: [], radar: null, flagAnchor: null, signY: b.height + 2 };
  const w = b.width, d = b.depth, h = b.height, v = b.variant ?? 0;

  if (b.destroyed) {
    rubble(pb, w, d, lotSize);
  } else if (b.construction) {
    construction(pb, w, d, h, b.construction.progress, lotSize);
  } else {
    const fn = BUILDERS[b.type] ?? BUILDERS.house;
    fn({ pb, win, glow, extras, w, d, h, v, b, lotSize, g });
  }

  const main = pb.build(MAT.city);
  if (main) g.add(main);
  const wm = win.build(MAT.window, { shadows: false });
  if (wm) g.add(wm);
  const gm = glow.build(MAT.glow, { shadows: false });
  if (gm) g.add(gm);
  g.userData.extras = extras;
  g.userData.pickMeshes = [main, wm].filter(Boolean);
  return g;
}

function rubble(pb, w, d, lotSize) {
  lotBase(pb, lotSize, 0x2b2a28);
  for (let i = 0; i < 14; i++) {
    const s = 1.5 + Math.random() * 4;
    pb.box(s, s * 0.6, s * 0.8, (Math.random() - 0.5) * w, s * 0.25, (Math.random() - 0.5) * d, Math.random() < 0.5 ? 0x3d3a36 : 0x5a554e, { ry: Math.random() * 3, rx: Math.random() * 0.6, rz: Math.random() * 0.6 });
  }
  pb.box(w * 0.4, 3, 0.6, -w * 0.2, 1.5, d * 0.3, 0x4a4540, { rz: 0.3 });
  pb.box(0.6, 5, d * 0.5, w * 0.35, 2.5, 0, 0x403c37, { rx: 0.2 });
}

function construction(pb, w, d, h, p, lotSize) {
  lotBase(pb, lotSize, C.dirt);
  const built = Math.max(0.5, h * p);
  pb.box(w * 0.92, built, d * 0.92, 0, built / 2, 0, 0x9c9a94);
  const sh = built + 2.5;
  const pole = 0x2e2e2e;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pb.box(0.3, sh, 0.3, (x * w) / 2, sh / 2, (z * d) / 2, pole);
  for (let y = 3; y < sh; y += 3) {
    pb.box(w, 0.2, 0.2, 0, y, d / 2, 0xe0a32a);
    pb.box(w, 0.2, 0.2, 0, y, -d / 2, 0xe0a32a);
    pb.box(0.2, 0.2, d, w / 2, y, 0, 0xe0a32a);
    pb.box(0.2, 0.2, d, -w / 2, y, 0, 0xe0a32a);
  }
  // Vinç
  const ch = Math.max(h + 10, 18);
  pb.box(1, ch, 1, -w / 2 - 2, ch / 2, -d / 2 - 2, 0xf2c230);
  pb.box(w + 10, 0.8, 0.8, w / 4 - 2, ch, -d / 2 - 2, 0xf2c230);
  pb.box(0.15, 6, 0.15, w / 2, ch - 3, -d / 2 - 2, 0x222222);
  pb.box(2, 1.5, 2, -w / 2 - 2, ch + 1, -d / 2 - 2, 0xd0a020);
  // Malzeme yığınları
  pb.box(4, 1, 2, w / 2 + 2, 0.5, d / 2 - 2, 0xa86b3c);
  pb.box(3, 1.5, 3, -w / 2 + 2, 0.75, d / 2 + 2, 0x8a8a8a);
}

const BUILDERS = {
  house({ pb, win, w, d, h, v, lotSize }) {
    lotBase(pb, lotSize, C.lawn);
    pb.plane(3, lotSize / 2 - d / 2, 0, 0.08, d / 2 + (lotSize / 2 - d / 2) / 2, C.plaza);
    const wall = pick(C.wallsHouse, v);
    pb.box(w, h, d, 0, h / 2, 0, wall);
    pb.add(new THREE.ConeGeometry(0.7072, 1, 4), pick(C.roofs, v), 0, h + 2, 0, { ry: Math.PI / 4, sx: w * 1.12, sy: 4, sz: d * 1.12 });
    pb.box(1.2, 3, 1.2, w * 0.25, h + 2.5, -d * 0.2, 0x7a4a3a);
    door(pb, d);
    addWindows(win, w, h, d, { floorH: 3.2, spacing: 3.6 });
    // Çit ve ağaçlar
    const fz = lotSize / 2 - 1;
    pb.box(lotSize * 0.42, 1, 0.2, -lotSize * 0.29, 0.5, fz, 0xf5f5f0);
    pb.box(lotSize * 0.42, 1, 0.2, lotSize * 0.29, 0.5, fz, 0xf5f5f0);
    tree(pb, -w / 2 - 3, d / 2 + 3, 1, v);
    if (v % 2) tree(pb, w / 2 + 3, -d / 2 - 2, 0.9, v + 1);
  },

  apartment({ pb, win, glow, w, d, h, v, lotSize, extras }) {
    lotBase(pb, lotSize, C.concrete);
    const col = pick(C.apt, v);
    pb.box(w, h, d, 0, h / 2, 0, col);
    pb.box(w + 0.6, 0.6, d + 0.6, 0, h + 0.3, 0, 0x6c6c6c);
    for (let y = 4; y < h - 2; y += 3.6) {
      pb.box(w * 0.7, 0.25, 1.4, 0, y - 1.1, d / 2 + 0.7, 0xdedad2);
      pb.box(w * 0.7, 0.9, 0.08, 0, y - 0.6, d / 2 + 1.4, 0x555555);
    }
    pb.cyl(1.4, 1.4, 2.5, 10, w * 0.25, h + 1.8, -d * 0.2, 0x8899aa);
    pb.box(0.15, 4, 0.15, -w * 0.3, h + 2.6, 0, 0x333333);
    door(pb, d, 0x2a3440, 3, 3.4);
    glow.box(3.2, 0.4, 0.2, 0, 3.8, d / 2 + 0.25, 0xfff0c0);
    addWindows(win, w, h, d, { floorH: 3.6, spacing: 3.2, litChance: 0.5 });
    tree(pb, -lotSize / 2 + 3, lotSize / 2 - 3, 1.1, v);
    tree(pb, lotSize / 2 - 3, lotSize / 2 - 3, 1, v + 2);
    extras.signY = h + 3;
  },

  villa({ pb, win, w, d, h, v, lotSize }) {
    lotBase(pb, lotSize, C.grass);
    const bw = w * 0.62, bd = d * 0.5;
    pb.box(bw, h * 0.55, bd, -w * 0.12, h * 0.275, -d * 0.18, 0xf7f4ee);
    pb.box(bw * 0.7, h * 0.45, bd * 0.8, -w * 0.2, h * 0.55 + h * 0.225, -d * 0.22, 0xf7f4ee);
    pb.box(bw + 1, 0.4, bd + 1, -w * 0.12, h * 0.55 + 0.2, -d * 0.18, 0x444444);
    pb.box(bw * 0.7 + 1, 0.4, bd * 0.8 + 1, -w * 0.2, h + 0.2, -d * 0.22, 0x444444);
    win.quad(bw * 0.8, h * 0.35, -w * 0.12, h * 0.25, -d * 0.18 + bd / 2 + 0.06, new THREE.Color(0.9, 0.75, 0.5), 0);
    // Havuz
    pb.box(w * 0.42, 0.3, d * 0.3, w * 0.22, 0.15, d * 0.22, 0xe8e2d4);
    pb.box(w * 0.36, 0.1, d * 0.24, w * 0.22, 0.32, d * 0.22, 0x2fb5e8);
    for (const x of [-1, 1]) for (const z of [-1, 1]) pb.box(1.4, 1.6, 1.4, x * (lotSize / 2 - 2), 0.8, z * (lotSize / 2 - 2), 0x2f6a2a);
    pb.box(lotSize - 4, 1.2, 0.8, 0, 0.6, -lotSize / 2 + 1.5, 0x2f6a2a);
    pb.cyl(0.25, 0.35, 6, 6, w * 0.4, 3, -d * 0.35, C.trunk);
    pb.cone(2.4, 1.2, 6, w * 0.4, 6.2, -d * 0.35, 0x3d9440);
    door(pb, d * 0.2, 0x5a3b22);
  },

  market({ pb, win, glow, w, d, h, v, lotSize, extras }) {
    lotBase(pb, lotSize, C.asphalt);
    const md = d * 0.75;
    pb.box(w, h, md, 0, h / 2, -d * 0.12, 0xf2efe6);
    pb.box(w + 0.4, 1.4, md + 0.4, 0, h + 0.2, -d * 0.12, v % 2 ? 0xd93636 : 0x2a8c4a);
    win.quad(w * 0.85, h * 0.55, 0, h * 0.35, -d * 0.12 + md / 2 + 0.06, new THREE.Color(0.95, 0.95, 0.85), 0);
    glow.box(w * 0.5, 1.2, 0.2, 0, h - 0.4, -d * 0.12 + md / 2 + 0.15, v % 2 ? 0xff5a5a : 0x5cff8a);
    for (let x = -w / 2 + 3; x < w / 2 - 1; x += 3) pb.plane(0.2, 4, x, 0.1, d / 2 + 1, 0xffffff);
    pb.box(1.2, 1, 3, w / 2 - 2, 0.5, d / 2 - 1, 0x8899aa);
    door(pb, md - d * 0.24, 0x99c9e0, 3.4, 3);
    extras.signY = h + 2.5;
  },

  cafe({ pb, win, glow, w, d, h, v, lotSize }) {
    lotBase(pb, lotSize, C.plaza);
    pb.box(w, h, d * 0.7, 0, h / 2, -d * 0.15, pick([0x6b4f3a, 0x2f4f4f, 0x8c5a3c], v));
    win.quad(w * 0.7, h * 0.5, 0, h * 0.4, -d * 0.15 + d * 0.35 + 0.06, new THREE.Color(1, 0.85, 0.6), 0);
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      pb.box(w / stripes, 0.25, 3, -w / 2 + (i + 0.5) * (w / stripes), h * 0.7, d * 0.2 + 1.2, i % 2 ? 0xffffff : pick([0x2a8c6a, 0xc0392b, 0x2a5c8c], v), { rx: 0.25 });
    }
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + 3 + i * (w - 6) / 2;
      pb.cyl(0.8, 0.8, 0.1, 10, x, 1, d / 2 + 2, 0xeeeeee);
      pb.cyl(0.08, 0.08, 1, 6, x, 0.5, d / 2 + 2, 0x333333);
      pb.cyl(0.06, 0.06, 2.6, 6, x, 1.3, d / 2 + 2, 0x333333);
      pb.cone(1.6, 0.8, 8, x, 2.8, d / 2 + 2, i % 2 ? 0xf5e6c8 : 0xc0392b);
    }
    glow.box(2.5, 0.8, 0.2, 0, h - 0.6, -d * 0.15 + d * 0.35 + 0.2, 0xffd27a);
    door(pb, d * 0.7 - d * 0.3);
  },

  restaurant({ pb, win, glow, w, d, h, v, lotSize }) {
    lotBase(pb, lotSize, C.plaza);
    pb.box(w, h, d * 0.8, 0, h / 2, -d * 0.1, pick([0xb5651d, 0x8b4513, 0xa0522d], v));
    pb.box(w + 0.6, 0.8, d * 0.8 + 0.6, 0, h + 0.4, -d * 0.1, 0x3a2a20);
    pb.box(1.6, 4, 1.6, -w * 0.3, h + 2, -d * 0.3, 0x5a5a5a);
    pb.box(w * 0.9, 0.3, 3, 0, h * 0.62, d * 0.3 + 1.4, 0x7a1f1f, { rx: 0.2 });
    addWindows(win, w, h, d * 0.8, { faces: 'f', floorH: 4, spacing: 3.5, litChance: 0.9, wh: 2 });
    for (let i = -1; i <= 1; i += 2) glow.sphere(0.4, i * w * 0.35, 3.2, d * 0.3 + 0.6, 0xffb347);
    door(pb, d * 0.8 - d * 0.2, 0x3b2414);
  },

  tech_store({ pb, win, glow, w, d, h, lotSize }) {
    lotBase(pb, lotSize, 0x9aa3ad);
    pb.box(w, h, d * 0.8, 0, h / 2, -d * 0.1, 0x1d2733);
    win.quad(w * 0.9, h * 0.7, 0, h * 0.45, -d * 0.1 + d * 0.4 + 0.06, new THREE.Color(0.55, 0.85, 1), 0);
    glow.box(w + 0.2, 0.3, 0.2, 0, h - 0.2, -d * 0.1 + d * 0.4 + 0.1, 0x33e0ff);
    glow.box(w + 0.2, 0.3, 0.2, 0, 0.3, -d * 0.1 + d * 0.4 + 0.1, 0x33e0ff);
    pb.box(3, 3, 3, 0, h + 1.5, -d * 0.1, 0x33e0ff, { ry: Math.PI / 4 });
    door(pb, d * 0.8 - d * 0.2, 0x0e141b);
  },

  gun_shop({ pb, win, glow, w, d, h, lotSize }) {
    lotBase(pb, lotSize, 0x6e6a60);
    pb.box(w, h, d * 0.8, 0, h / 2, -d * 0.1, 0x4a4f3a);
    win.quad(w * 0.6, h * 0.35, 0, h * 0.45, -d * 0.1 + d * 0.4 + 0.06, new THREE.Color(0.9, 0.7, 0.4), 0);
    for (let x = -w * 0.3; x <= w * 0.3; x += 0.9) pb.box(0.12, h * 0.4, 0.12, x, h * 0.45, -d * 0.1 + d * 0.4 + 0.2, 0x222222);
    glow.box(w * 0.6, 1, 0.2, 0, h - 0.5, -d * 0.1 + d * 0.4 + 0.15, 0xff3b3b);
    pb.box(4, 2.5, 0.4, 0, h + 1.2, -d * 0.1, 0x2a2a2a);
    door(pb, d * 0.8 - d * 0.2, 0x1a1a1a);
  },

  bar({ pb, win, glow, w, d, h, v, lotSize }) {
    lotBase(pb, lotSize, 0x3a3640);
    pb.box(w, h, d * 0.75, 0, h / 2, -d * 0.12, pick([0x5a1f3a, 0x3a1f5a, 0x6a2a2a], v));
    win.quad(w * 0.4, h * 0.3, -w * 0.2, h * 0.4, -d * 0.12 + d * 0.375 + 0.06, new THREE.Color(1, 0.35, 0.6), 0);
    glow.box(w * 0.55, 1.4, 0.25, w * 0.05, h - 1, -d * 0.12 + d * 0.375 + 0.2, pick([0xff3fa6, 0x9b5cff, 0x3fffd2], v));
    glow.sphere(0.35, 1.8, 3.2, -d * 0.12 + d * 0.375 + 0.4, 0xffaa33);
    door(pb, d * 0.75 - d * 0.24, 0x120a10);
  },

  factory({ pb, win, glow, w, d, h, b, lotSize, extras }) {
    lotBase(pb, lotSize, C.asphalt);
    const sub = b.subtype;
    const hallCol = { food: 0xd8d2c2, drink: 0x9fb8c8, steel: 0x5b5f66, electronics: 0xeef1f4, arms: 0x5b6b45 }[sub] ?? 0x8a8f99;
    const hw = w * 0.75;
    pb.box(hw, h, d * 0.8, -w * 0.12, h / 2, -d * 0.05, hallCol);
    // Testere dişi çatı
    for (let i = 0; i < 4; i++) {
      const x = -w * 0.12 - hw / 2 + (i + 0.5) * (hw / 4);
      pb.box(hw / 4, 2.2, d * 0.8, x, h + 0.9, -d * 0.05, 0x707780, { rz: 0.35 });
    }
    addWindows(win, hw, h, d * 0.8, { faces: 'f', floorH: 5, spacing: 5, ww: 3, wh: 1.4, litChance: 0.7, startY: h - 3 });
    pb.box(5, 4.5, 0.3, -w * 0.12, 2.25, -d * 0.05 + d * 0.4 + 0.1, 0x9a6a2a);
    const chim = (x, z, ht, r, col) => {
      pb.cyl(r * 0.8, r, ht, 10, x, ht / 2, z, col);
      pb.cyl(r * 0.85, r * 0.85, 0.8, 10, x, ht - 1.5, z, 0xc23b3b);
      extras.chimneys.push(new THREE.Vector3(x, ht + 0.5, z));
    };
    if (sub === 'steel') {
      chim(w * 0.32, -d * 0.25, h + 14, 1.6, 0x4a4040);
      chim(w * 0.32, d * 0.05, h + 11, 1.4, 0x4a4040);
      chim(w * 0.32, d * 0.3, h + 8, 1.2, 0x4a4040);
      glow.box(2, 2, 0.2, -w * 0.12, 2, -d * 0.05 + d * 0.4 + 0.3, 0xff6a1a);
    } else if (sub === 'food') {
      for (let i = 0; i < 3; i++) {
        pb.cyl(2, 2, h + 4, 12, w * 0.36, (h + 4) / 2, -d * 0.3 + i * 5, 0xe0dccc);
        pb.cone(2.1, 2, 12, w * 0.36, h + 5, -d * 0.3 + i * 5, 0xb0aa98);
      }
      chim(-w * 0.35, -d * 0.3, h + 6, 1, 0x7a7a7a);
    } else if (sub === 'drink') {
      for (let i = 0; i < 2; i++) {
        pb.sphere(3, w * 0.34, 5.5, -d * 0.2 + i * 7, 0xc9d6de);
        pb.cyl(0.3, 0.3, 3, 6, w * 0.34, 1.5, -d * 0.2 + i * 7, 0x555555);
      }
      chim(-w * 0.35, -d * 0.3, h + 5, 0.9, 0x7a7a7a);
    } else if (sub === 'electronics') {
      for (let i = 0; i < 6; i++) pb.box(3, 0.2, 2, -w * 0.12 - hw / 2 + 3 + (i % 3) * 5, h + 2.3, -d * 0.25 + Math.floor(i / 3) * 5, 0x1c2a4a, { rx: -0.4 });
      pb.box(2, 1.5, 2, w * 0.33, 0.75, -d * 0.3, 0xd0d6dc);
      glow.box(hw * 0.6, 0.4, 0.2, -w * 0.12, h - 0.8, -d * 0.05 + d * 0.4 + 0.2, 0x33e0ff);
      chim(-w * 0.35, d * 0.2, h + 4, 0.7, 0xb0b0b0);
    } else if (sub === 'arms') {
      pb.sphere(5, w * 0.3, 0, -d * 0.15, 0x4a5a38, {}, 10, 6, Math.PI / 2);
      for (let x = -lotSize / 2 + 1; x < lotSize / 2; x += 2) pb.box(0.12, 2.5, 0.12, x, 1.25, lotSize / 2 - 1, 0x888888);
      pb.box(lotSize - 2, 0.1, 0.1, 0, 2.4, lotSize / 2 - 1, 0x888888);
      chim(-w * 0.35, -d * 0.3, h + 5, 0.9, 0x555555);
    }
    // Yükleme rampası + palet
    pb.box(3, 1.2, 2, -w * 0.4, 0.6, d * 0.42, 0xa0703a);
    extras.signY = h + 4;
  },

  palace({ pb, win, glow, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, C.plaza);
    pb.box(w, h * 0.6, d * 0.7, 0, h * 0.3, -d * 0.1, 0xf4f1ea);
    pb.box(w * 0.35, h * 0.45, d * 0.6, -w * 0.62, h * 0.225, -d * 0.1, 0xefebe2);
    pb.box(w * 0.35, h * 0.45, d * 0.6, w * 0.62, h * 0.225, -d * 0.1, 0xefebe2);
    for (let i = 0; i < 8; i++) pb.cyl(0.6, 0.7, h * 0.5, 10, -w * 0.4 + i * (w * 0.8 / 7), h * 0.25, -d * 0.1 + d * 0.35 + 1.5, 0xffffff);
    pb.box(w * 0.9, 1, 3.5, 0, h * 0.52, -d * 0.1 + d * 0.35 + 1.5, 0xe8e2d4);
    pb.add(new THREE.CylinderGeometry(0.01, 1, 1, 3), 0xe8e2d4, 0, h * 0.52 + 2, -d * 0.1 + d * 0.35 + 1.5, { rz: Math.PI / 2, ry: Math.PI / 2, sx: 3.5, sy: w * 0.9, sz: 2.5 });
    for (let i = 0; i < 4; i++) pb.box(w * 0.7, 0.4, 1.2, 0, 0.2 + i * 0.4, d * 0.35 + 3 - i * 1.1, 0xdedad0);
    pb.cyl(6, 6, 4, 20, 0, h * 0.6 + 2, -d * 0.1, 0xf4f1ea);
    pb.sphere(6.2, 0, h * 0.6 + 4, -d * 0.1, 0xd4a93a, {}, 20, 10, Math.PI / 2);
    pb.box(0.2, 8, 0.2, 0, h * 0.6 + 14, -d * 0.1, 0xcccccc);
    pb.box(4, 2.4, 0.1, 2, h * 0.6 + 16.5, -d * 0.1, 0xd62828);
    addWindows(win, w, h * 0.6, d * 0.7, { faces: 'bs', floorH: 4.5, spacing: 3.5, litChance: 0.7 });
    glow.box(w * 0.8, 0.3, 0.3, 0, 0.2, -d * 0.1 + d * 0.35 + 4.5, 0xffe9b0);
    extras.signY = h + 12;
  },

  town_hall({ pb, win, glow, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, 0xb9a57e);
    // Taş zemin kat + ahşap üst kat + dik çatı + kule
    pb.box(w, h * 0.5, d * 0.7, 0, h * 0.25, -d * 0.1, 0x9c958a);
    pb.box(w * 0.96, h * 0.4, d * 0.66, 0, h * 0.7, -d * 0.1, 0xd9c7a1);
    for (let x = -w / 2 + 2; x <= w / 2 - 2; x += 3) pb.box(0.4, h * 0.4, 0.3, x, h * 0.7, -d * 0.1 + d * 0.33 + 0.1, 0x5a3b22);
    pb.add(new THREE.CylinderGeometry(0.01, 1, 1, 4), 0x7a2e22, 0, h + 3, -d * 0.1, { ry: Math.PI / 4, sx: w * 0.78, sy: 6, sz: d * 0.5 });
    pb.box(5, h + 8, 5, w * 0.36, (h + 8) / 2, -d * 0.3, 0x8f887d);
    for (let k = -1; k <= 1; k += 2) for (let m = -1; m <= 1; m += 2) pb.box(1.2, 1.4, 1.2, w * 0.36 + k * 2, h + 8.7, -d * 0.3 + m * 2, 0x8f887d);
    pb.cone(3.6, 5, 4, w * 0.36, h + 12, -d * 0.3, 0x5a2e22, { ry: Math.PI / 4 });
    door(pb, d * 0.7 - d * 0.2, 0x4a2c16, 3.4, 4.2);
    addWindows(win, w, h * 0.9, d * 0.7, { faces: 'f', floorH: 4.5, spacing: 4, litChance: 0.8 });
    // Meydan: kuyu ve meşaleler
    pb.cyl(1.6, 1.8, 1.2, 12, -w * 0.3, 0.6, d * 0.42, 0x8f887d);
    pb.box(0.2, 2.6, 0.2, -w * 0.3 - 1.4, 1.9, d * 0.42, 0x5a3b22);
    pb.box(0.2, 2.6, 0.2, -w * 0.3 + 1.4, 1.9, d * 0.42, 0x5a3b22);
    pb.box(3.2, 0.3, 0.3, -w * 0.3, 3.2, d * 0.42, 0x5a3b22);
    for (const x of [-2.8, 2.8]) { pb.box(0.2, 2.4, 0.2, x, 1.2, d * 0.35 + 1.5, 0x3a2a1a); glow.sphere(0.35, x, 2.6, d * 0.35 + 1.5, 0xffa040); }
    extras.signY = h + 16;
  },

  police({ pb, win, w, d, h, lotSize, extras, g }) {
    lotBase(pb, lotSize, C.concrete);
    pb.box(w, h, d * 0.75, 0, h / 2, -d * 0.12, 0xf0f2f5);
    pb.box(w + 0.2, 1.2, d * 0.75 + 0.2, 0, h * 0.5, -d * 0.12, 0x1f4fa8);
    pb.box(w + 0.2, 1.2, d * 0.75 + 0.2, 0, h - 0.6, -d * 0.12, 0x1f4fa8);
    addWindows(win, w, h, d * 0.75, { floorH: 3.6, spacing: 3.4 });
    door(pb, d * 0.75 - d * 0.24, 0x1f3f78, 3.2, 3.4);
    for (let i = 0; i < 2; i++) {
      pb.box(4, 1.4, 2.2, -w * 0.3 + i * 5, 0.9, d * 0.38, 0xffffff);
      pb.box(4, 0.4, 2.25, -w * 0.3 + i * 5, 0.9, d * 0.38, 0x1f4fa8);
    }
    const red = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0x2060ff }));
    red.position.set(-0.8, h + 0.6, -d * 0.12);
    blue.position.set(0.8, h + 0.6, -d * 0.12);
    g.add(red, blue);
    extras.blinkers.push(red, blue);
  },

  bank({ pb, win, glow, w, d, h, lotSize }) {
    lotBase(pb, lotSize, C.plaza);
    pb.box(w, h, d * 0.7, 0, h / 2, -d * 0.12, 0xe6dcc6);
    for (let i = 0; i < 6; i++) pb.cyl(0.7, 0.8, h * 0.75, 12, -w * 0.38 + i * (w * 0.76 / 5), h * 0.375, -d * 0.12 + d * 0.35 + 1.2, 0xf8f4ea);
    pb.box(w * 0.9, 1.2, 3, 0, h * 0.75 + 0.6, -d * 0.12 + d * 0.35 + 1.2, 0xe0d6c0);
    pb.add(new THREE.CylinderGeometry(0.01, 1, 1, 3), 0xe0d6c0, 0, h * 0.75 + 2.4, -d * 0.12 + d * 0.35 + 1.2, { rz: Math.PI / 2, ry: Math.PI / 2, sx: 3, sy: w * 0.9, sz: 2.4 });
    glow.box(w * 0.4, 0.9, 0.2, 0, h * 0.75 + 0.6, -d * 0.12 + d * 0.35 + 2.75, 0xffd34d);
    addWindows(win, w, h, d * 0.7, { faces: 'bs', floorH: 4, spacing: 3.6 });
    for (let i = 0; i < 3; i++) pb.box(w * 0.6, 0.4, 1, 0, 0.2 + i * 0.4, d * 0.35 + 2.6 - i * 0.9, 0xd8d0bc);
  },

  /** Lüks evler: modern, cam, klasik sütunlu, Toskana, kule, saray — havuz, palmiye, şezlong, çit, bahçe ışıkları */
  mansion({ pb, win, glow, w, d, h, lotSize, extras, b }) {
    const L = LUX_HOUSES[b?.subtype] ?? LUX_HOUSES.aqua;
    const col = L.color, acc = L.accent;
    const gold = L.gold ? 0xd4af37 : L.diamond ? 0xcff4ff : acc;
    const warm = new THREE.Color(1, 0.86, 0.62), cool = new THREE.Color(0.75, 0.88, 1);
    lotBase(pb, lotSize, 0x5f9e4a);
    // çevre: alçak duvar + çit, giriş kapısı, araba yolu
    const lw = lotSize - 1.2;
    for (const [x, z, sx, sz] of [[0, -lw / 2, lw, 0.5], [-lw / 2, 0, 0.5, lw], [lw / 2, 0, 0.5, lw], [-lw / 4 - 2, lw / 2, lw / 2 - 4, 0.5], [lw / 4 + 2, lw / 2, lw / 2 - 4, 0.5]]) {
      pb.box(sx, 1.1, sz, x, 0.55, z, 0xe8e4dc);
      pb.box(sx, 0.9, sz, x, 1.55, z, 0x2f6a2a);
    }
    for (const x of [-3.2, 3.2]) { pb.box(0.8, 2.6, 0.8, x, 1.3, lw / 2, 0xe8e4dc); glow.box(0.4, 0.4, 0.4, x, 2.8, lw / 2, 0xffe2a0); }
    pb.plane(5, lw / 2, 0, 0.07, lw / 4, 0xbdb6a8);
    // bahçe lambaları
    for (let i = -2; i <= 2; i++) { pb.cyl(0.08, 0.1, 1.4, 6, -2.8, 0.7, i * 2.6 + lw / 4, 0x222222); glow.sphere(0.18, -2.8, 1.5, i * 2.6 + lw / 4, 0xfff1c4); }
    const palm = (x, z, hh = 7) => {
      for (let k = 0; k < 5; k++) pb.cyl(0.22 - k * 0.02, 0.26 - k * 0.02, hh / 5, 6, x + k * 0.08, hh / 10 + (k * hh) / 5, z, 0x8a6a45);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; pb.box(0.5, 0.08, 2.8, x + Math.sin(a) * 1.3, hh + 0.1, z + Math.cos(a) * 1.3, 0x2f8f3a, { ry: a, rx: 0.35 }); }
    };
    const pool = (cx, cz, pw, pd) => {
      pb.box(pw + 2.4, 0.35, pd + 2.4, cx, 0.18, cz, 0xf1ece2);
      glow.box(pw, 0.08, pd, cx, 0.38, cz, 0x29b6f6);
      for (let i = 0; i < 3; i++) pb.box(0.9, 0.35, 2.2, cx - pw / 2 + 1.4 + i * 1.6, 0.55, cz + pd / 2 + 1.8, 0xffffff, { rx: -0.15 });
      pb.cyl(0.06, 0.06, 2.4, 6, cx + pw / 2 + 0.5, 1.2, cz + pd / 2 + 1.3, 0x888888);
      pb.cone(1.6, 0.6, 10, cx + pw / 2 + 0.5, 2.6, cz + pd / 2 + 1.3, acc);
      glow.box(pw * 0.9, 0.05, 0.12, cx, 0.42, cz - pd / 2 + 0.2, 0x81d4fa);
    };
    const bz = -d * 0.16; // ev arkada, havuz önde
    if (L.style === 'tower') {
      const tw = w * 0.42, tz = -d * 0.12;
      for (let f = 0; f < L.floors; f++) {
        const y = f * 3.6;
        pb.box(tw, 3.0, tw, 0, y + 1.5, tz, f % 2 ? col : acc);
        win.box(tw + 0.05, 2.0, tw + 0.05, 0, y + 1.6, tz, f % 3 ? warm : cool);
        pb.box(tw + 0.9, 0.25, tw + 0.9, 0, y + 3.1, tz, gold);
      }
      const top = L.floors * 3.6;
      glow.box(tw * 0.7, 0.1, tw * 0.45, 0, top + 0.35, tz - tw * 0.15, 0x29b6f6); // çatı havuzu
      pb.box(tw * 0.75, 0.3, tw * 0.5, 0, top + 0.15, tz - tw * 0.15, 0xe6e6e6);
      pb.cyl(tw * 0.22, tw * 0.22, 0.12, 20, 0, top + 0.06, tz + tw * 0.28, 0x333333);
      glow.box(0.25, 0.05, tw * 0.25, -tw * 0.08, top + 0.16, tz + tw * 0.28, 0xffffff);
      glow.box(0.25, 0.05, tw * 0.25, tw * 0.08, top + 0.16, tz + tw * 0.28, 0xffffff);
      glow.box(tw * 0.16, 0.05, 0.25, 0, top + 0.16, tz + tw * 0.28, 0xffffff);
      pool(w * 0.18, d * 0.26, 8, 4.5);
      palm(-w * 0.32, d * 0.3); palm(w * 0.38, -d * 0.35, 8);
      extras.signY = top + 3;
      return;
    }
    const fl = L.floors, fh = 4.2;
    const hw = w * (L.style === 'palace' ? 0.84 : 0.66), hd = d * 0.4;
    if (L.style === 'modern' || L.style === 'glass') {
      for (let f = 0; f < fl; f++) {
        const off = (f % 2 ? 1 : -1) * w * 0.06, sw = hw * (1 - f * 0.08);
        const y = f * fh;
        if (L.bunker && f === 0) { pb.box(sw, fh, hd, off, y + fh / 2, bz, 0x6d7275); win.box(sw * 0.8, 1, 0.1, off, y + 2.6, bz + hd / 2 + 0.05, warm); continue; }
        if (L.style === 'glass') { win.box(sw - 0.3, fh - 0.5, hd - 0.3, off, y + fh / 2, bz, f % 2 ? cool : warm); for (const x of [-1, 1]) for (const z of [-1, 1]) pb.box(0.35, fh, 0.35, off + x * sw / 2, y + fh / 2, bz + z * hd / 2, acc); }
        else {
          pb.box(sw, fh - 0.3, hd, off, y + fh / 2 - 0.15, bz, L.wood && f > 0 ? 0x8d6e63 : col);
          win.quad(sw * 0.75, fh * 0.62, off, y + fh * 0.5, bz + hd / 2 + 0.06, f % 2 ? cool : warm, 0);
          win.quad(hd * 0.6, fh * 0.5, off + sw / 2 + 0.06, y + fh * 0.5, bz, warm, Math.PI / 2);
          if (L.wood) for (let i = 0; i < 8; i++) pb.box(0.12, fh - 0.4, 0.12, off - sw / 2 + 0.5 + i * (sw / 8), y + fh / 2, bz + hd / 2 + 0.08, 0x5d4037);
        }
        pb.box(sw + 1.4, 0.3, hd + 1.4, off, y + fh, bz, acc);
        // cam korkuluklu balkon
        if (f > 0) { pb.box(sw * 0.5, 0.2, 2.2, off, y + 0.1, bz + hd / 2 + 1.1, acc); win.box(sw * 0.5, 1.1, 0.06, off, y + 0.75, bz + hd / 2 + 2.15, cool); }
      }
      pool(w * 0.16, d * 0.24, 10, 5);
    } else if (L.style === 'classic' || L.style === 'tuscan') {
      for (let f = 0; f < fl; f++) {
        const y = f * fh;
        pb.box(hw, fh, hd, 0, y + fh / 2, bz, col);
        pb.box(hw + 0.4, 0.3, hd + 0.4, 0, y + fh - 0.1, bz, 0xffffff);
        const n = Math.floor(hw / 3.2);
        for (let i = 0; i < n; i++) {
          const x = -hw / 2 + 1.6 + i * (hw - 3.2) / Math.max(1, n - 1);
          win.quad(1.3, 2.0, x, y + 2.1, bz + hd / 2 + 0.06, i % 3 ? warm : cool, 0);
          pb.box(1.6, 0.18, 0.2, x, y + 3.2, bz + hd / 2 + 0.1, 0xffffff);
          if (L.style === 'tuscan') pb.box(1.5, 0.12, 0.6, x, y + 1.0, bz + hd / 2 + 0.3, 0x3b2a1a);
        }
      }
      const top = fl * fh;
      // kırma çatı (4 kenarlı koni)
      const roof = pb.cone(Math.hypot(hw, hd) * 0.58, L.style === 'tuscan' ? 2.6 : 3.4, 4, 0, top + (L.style === 'tuscan' ? 1.3 : 1.7), bz, L.style === 'tuscan' ? 0xb5532f : 0x3d4450, { ry: Math.PI / 4 });
      void roof;
      if (L.style === 'classic') {
        // sütunlu giriş + alınlık
        for (let i = 0; i < 6; i++) pb.cyl(0.38, 0.45, fh * 2 - 0.4, 12, -5 + i * 2, fh - 0.2, bz + hd / 2 + 2, 0xffffff);
        pb.box(12.6, 0.6, 4.4, 0, fh * 2 - 0.1, bz + hd / 2 + 1.8, 0xffffff);
        pb.cone(6.6, 1.6, 3, 0, fh * 2 + 0.9, bz + hd / 2 + 1.8, 0xf4f4f4, { ry: Math.PI / 2, sz: 0.35 });
        pb.box(6, 0.4, 2.5, 0, 0.2, bz + hd / 2 + 4.2, 0xdedede);
        glow.box(1.6, 2.6, 0.1, 0, 1.4, bz + hd / 2 + 0.07, 0xffd28a);
        // fıskiye
        pb.cyl(2.2, 2.4, 0.6, 18, -w * 0.28, 0.3, d * 0.28, 0xe8e4dc); glow.cyl(1.9, 1.9, 0.1, 18, -w * 0.28, 0.62, d * 0.28, 0x4fc3f7);
        pb.cyl(0.25, 0.35, 1.6, 8, -w * 0.28, 1.2, d * 0.28, 0xe8e4dc);
      } else {
        // kemerli sundurma + selvi ağaçları
        for (let i = 0; i < 4; i++) pb.box(0.5, fh - 0.6, 0.5, -4.5 + i * 3, (fh - 0.6) / 2, bz + hd / 2 + 2.4, 0xe9d8bd);
        pb.box(10.5, 0.5, 3, 0, fh - 0.4, bz + hd / 2 + 1.3, 0xb5532f, { rx: 0.18 });
        for (let i = 0; i < (L.palms ?? 4); i++) pb.cone(0.9, 7, 8, -w / 2 + 2.5 + i * 2.6, 3.6, -d / 2 + 2.2, 0x2e5d2a);
      }
      if (L.pool) pool(w * 0.18, d * 0.25, 9, 4.6);
    } else {
      // SARAY: orta kubbe, iki kanat, köşe kuleleri (sultan: minare)
      const cw = hw * 0.42;
      for (const [x, ww, hh2] of [[0, cw, fl * fh + 1], [-hw * 0.34, hw * 0.3, fl * fh - 1], [hw * 0.34, hw * 0.3, fl * fh - 1]]) {
        pb.box(ww, hh2, hd, x, hh2 / 2, bz, col);
        for (let f = 0; f < fl; f++) for (let i = 0; i < 4; i++) win.quad(1.2, 2.0, x - ww / 2 + ww * (i + 0.5) / 4, f * fh + 2.2, bz + hd / 2 + 0.06, warm, 0);
        pb.box(ww + 0.6, 0.5, hd + 0.6, x, hh2, bz, gold);
      }
      const top = fl * fh + 1;
      pb.cyl(cw * 0.38, cw * 0.42, 2.2, 16, 0, top + 1.1, bz, col);
      pb.sphere(cw * 0.4, 0, top + 2.2, bz, L.diamond ? 0xdff6ff : gold, {}, 20, 12, Math.PI / 2);
      glow.cone(0.3, 1.6, 8, 0, top + 2.2 + cw * 0.4 + 0.7, bz, 0xffd34d);
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        const tx = x * (hw / 2 + 0.5), tzz = bz + z * (hd / 2 + 0.5);
        pb.cyl(0.9, 1.1, top + 4, 12, tx, (top + 4) / 2, tzz, col);
        pb.box(2.6, 0.4, 2.6, tx, top + 4, tzz, gold);
        pb.cone(1.1, 3.2, 12, tx, top + 5.8, tzz, gold);
        glow.sphere(0.25, tx, top + 7.5, tzz, 0xfff1b0);
      }
      for (let i = 0; i < 8; i++) pb.cyl(0.35, 0.4, fh * 1.6, 12, -7 + i * 2, fh * 0.8, bz + hd / 2 + 2, 0xffffff);
      pb.box(16.5, 0.6, 4, 0, fh * 1.6, bz + hd / 2 + 1.8, gold);
      glow.box(2.4, 3.2, 0.1, 0, 1.6, bz + hd / 2 + 0.07, 0xffd28a);
      pool(w * 0.2, d * 0.28, 11, 4.2);
      pb.cyl(2.4, 2.6, 0.7, 20, -w * 0.25, 0.35, d * 0.28, 0xf5f0e6); glow.cyl(2.1, 2.1, 0.1, 20, -w * 0.25, 0.72, d * 0.28, 0x4fc3f7);
      if (L.diamond) for (let i = 0; i < 24; i++) glow.box(0.18, 0.18, 0.18, (Math.random() - 0.5) * hw, top * Math.random(), bz + hd / 2 + 0.15, 0xe6fbff);
    }
    // kapı, garaj, palmiyeler
    door(pb, bz * 2 + hd, 0x3b2414, 2.4, 3.2);
    pb.box(6, 3.4, 0.25, -w * 0.3, 1.7, bz + hd / 2 + 0.15, 0xdcdcdc);
    for (let i = 0; i < 5; i++) pb.box(5.8, 0.06, 0.3, -w * 0.3, 0.5 + i * 0.6, bz + hd / 2 + 0.3, 0xbcbcbc);
    palm(w * 0.42, d * 0.42); palm(-w * 0.42, d * 0.42); if (L.pool) palm(w * 0.42, d * 0.05, 8);
    if (L.gold || L.diamond) glow.box(hw * 0.8, 0.25, 0.1, 0, fl * fh - 0.4, bz + hd / 2 + 0.12, L.diamond ? 0xcff4ff : 0xffd34d);
    extras.signY = fl * fh + 6;
  },

  /** Örgüt karargahı olabilecek duvarlı depo: çevre duvarı, dikenli tel, nöbet kuleleri, büyük ambar */
  compound({ pb, win, glow, w, d, h, lotSize, extras, b }) {
    lotBase(pb, lotSize, 0x3a3833);
    const wall = 0x6e6a62, wh = 3.6;
    // çevre duvarı (önde kapı boşluğu)
    pb.box(w, wh, 0.6, 0, wh / 2, -d / 2, wall);
    pb.box(0.6, wh, d, -w / 2, wh / 2, 0, wall);
    pb.box(0.6, wh, d, w / 2, wh / 2, 0, wall);
    pb.box(w / 2 - 3, wh, 0.6, -w / 4 - 1.5, wh / 2, d / 2, wall);
    pb.box(w / 2 - 3, wh, 0.6, w / 4 + 1.5, wh / 2, d / 2, wall);
    // dikenli tel
    for (const [x, z, sx, sz] of [[0, -d / 2, w, 0.1], [-w / 2, 0, 0.1, d], [w / 2, 0, 0.1, d]]) pb.box(sx || 0.1, 0.35, sz || 0.1, x, wh + 0.4, z, 0x9a9a9a);
    // demir kapı
    pb.box(5.6, 3.2, 0.25, 0, 1.6, d / 2 + 0.25, 0x2b2b2b);
    for (let i = -2; i <= 2; i++) pb.box(0.12, 3.2, 0.3, i * 1.1, 1.6, d / 2 + 0.3, 0x111111);
    // ambar
    const aw = w * 0.62, ad = d * 0.5;
    pb.box(aw, h, ad, 0, h / 2, -d * 0.15, 0x5b4d3f);
    pb.box(aw + 0.6, 0.5, ad + 0.6, 0, h + 0.25, -d * 0.15, 0x3a2f25);
    pb.box(aw * 0.5, h * 0.6, 0.2, 0, h * 0.3, -d * 0.15 + ad / 2 + 0.1, 0x7a3b22);
    win.box(aw * 0.8, 0.6, 0.12, 0, h - 1.2, -d * 0.15 + ad / 2 + 0.12, 0xffd18a);
    // nöbet kuleleri
    for (const sx of [-1, 1]) {
      const tx = sx * (w / 2 - 1.2), tz = d / 2 - 1.2;
      for (const ox of [-0.8, 0.8]) for (const oz of [-0.8, 0.8]) pb.box(0.25, 7, 0.25, tx + ox, 3.5, tz + oz, 0x3b2f22);
      pb.box(2.6, 0.3, 2.6, tx, 7, tz, 0x4a3b2a);
      pb.box(2.6, 1, 0.15, tx, 7.6, tz + 1.25, 0x4a3b2a);
      glow.box(0.5, 0.4, 0.5, tx, 8.4, tz, 0xfff2b0);
    }
    // kasalar, variller
    for (let i = 0; i < 5; i++) pb.box(1.3, 1.3, 1.3, -w / 2 + 2.2 + (i % 3) * 1.4, 0.65 + Math.floor(i / 3) * 1.3, d / 2 - 4, 0x7a5a32);
    for (let i = 0; i < 4; i++) pb.cyl(0.55, 0.55, 1.4, 10, w / 2 - 2.5, 0.7, d / 2 - 4 - i * 1.3, 0x2f4f6f);
    // örgüt rengi bayrak
    if (b?.org) glow.box(3, 1.8, 0.1, 0, h + 3.2, -d * 0.15, parseInt(String(b.org.color).slice(1), 16) || 0xff0000);
    extras.signY = h + 5;
  },

  hideout({ pb, glow, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, 0x2a2a2a);
    pb.box(w, h, d, 0, h / 2, 0, 0x2b2622);
    pb.box(w + 0.4, 0.4, d + 0.4, 0, h + 0.2, 0, 0x151515);
    for (let i = 0; i < 4; i++) pb.box(1.4, 1.4, 1.4, -w / 2 - 1.6, 0.7 + (i % 2) * 1.4, -d / 2 + 1 + i * 1.4, 0x6b4a2e);
    glow.box(w * 0.6, 0.7, 0.15, 0, h - 0.9, d / 2 + 0.1, 0xff1e3c);
    glow.box(0.25, 2.6, 0.15, -1.9, 1.4, d / 2 + 0.1, 0xff1e3c);
    door(pb, d, 0x111111, 2.4, 3);
    extras.signY = h + 2;
  },

  court({ pb, win, glow, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, C.plaza);
    pb.box(w, h, d * 0.7, 0, h / 2, -d * 0.12, 0xd9cfbd);
    for (let i = 0; i < 6; i++) pb.cyl(0.7, 0.8, h * 0.7, 12, -w * 0.38 + i * (w * 0.76 / 5), h * 0.35, -d * 0.12 + d * 0.35 + 1.4, 0xf4efe4);
    pb.box(w * 0.92, 1.2, 3.2, 0, h * 0.7 + 0.6, -d * 0.12 + d * 0.35 + 1.4, 0xe6dcc8);
    pb.add(new THREE.CylinderGeometry(0.01, 1, 1, 3), 0xe6dcc8, 0, h * 0.7 + 2.6, -d * 0.12 + d * 0.35 + 1.4, { rz: Math.PI / 2, ry: Math.PI / 2, sx: 3.2, sy: w * 0.92, sz: 2.8 });
    // Adalet terazisi
    pb.box(0.3, 3, 0.3, 0, h + 1.5, -d * 0.12, 0xc9a227);
    pb.box(4, 0.2, 0.2, 0, h + 3, -d * 0.12, 0xc9a227);
    for (const x of [-1.8, 1.8]) pb.cyl(0.7, 0.4, 0.3, 10, x, h + 2.1, -d * 0.12, 0xc9a227);
    glow.box(w * 0.4, 0.8, 0.2, 0, h * 0.7 + 0.6, -d * 0.12 + d * 0.35 + 3.05, 0xffe9b0);
    addWindows(win, w, h * 0.7, d * 0.7, { faces: 'bs', floorH: 4, spacing: 3.4 });
    for (let i = 0; i < 4; i++) pb.box(w * 0.7, 0.4, 1, 0, 0.2 + i * 0.4, d * 0.35 + 2.8 - i * 0.9, 0xd8d0bc);
    extras.signY = h + 5;
  },

  clothing({ pb, win, glow, w, d, h, v, lotSize, extras }) {
    lotBase(pb, lotSize, C.plaza);
    const md = d * 0.75;
    pb.box(w, h, md, 0, h / 2, -d * 0.12, v % 2 ? 0xf3e5f5 : 0xfff3e0);
    pb.box(w + 0.6, 0.8, 2.4, 0, h * 0.55, -d * 0.12 + md / 2 + 1, v % 2 ? 0xb03a7a : 0x111111);
    win.quad(w * 0.85, h * 0.5, 0, h * 0.27, -d * 0.12 + md / 2 + 0.06, new THREE.Color(1, 0.95, 0.9), 0);
    glow.box(w * 0.6, 1.1, 0.2, 0, h - 0.8, -d * 0.12 + md / 2 + 0.15, v % 2 ? 0xff6ec7 : 0xffd34d);
    for (let i = 0; i < 3; i++) { const x = -w * 0.3 + i * w * 0.3; pb.cyl(0.35, 0.35, 2.6, 8, x, 1.3, -d * 0.12 + md / 2 - 1.2, [0xd62828, 0x1e88e5, 0xffd23f][i]); pb.sphere(0.3, x, 2.9, -d * 0.12 + md / 2 - 1.2, 0xf1c27d); }
    door(pb, md - d * 0.24, 0xe0c0d8, 3.2, 3);
    extras.signY = h + 2;
  },

  car_dealer({ pb, win, glow, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, C.asphalt);
    pb.box(w, h, d * 0.55, 0, h / 2, -d * 0.2, 0xeef2f5);
    win.quad(w * 0.92, h * 0.75, 0, h * 0.42, -d * 0.2 + d * 0.275 + 0.06, new THREE.Color(0.85, 0.95, 1), 0);
    pb.box(w + 0.4, 0.8, d * 0.55 + 0.4, 0, h + 0.4, -d * 0.2, 0xc0392b);
    glow.box(w * 0.55, 1.2, 0.2, 0, h + 0.4, -d * 0.2 + d * 0.275 + 0.35, 0xff5a5a);
    // Dış sergi: renkli arabalar
    const cols = [0xd10000, 0xf5c400, 0x111111, 0x1f3a93];
    for (let i = 0; i < 4; i++) {
      const x = -w * 0.36 + i * (w * 0.24);
      pb.box(3, 1.4, 6, x, 1.2, d * 0.28, cols[i]);
      pb.box(2.6, 1, 3, x, 2.4, d * 0.27, 0x1b2a3a);
      for (const [dx, dz] of [[-1.5, -2], [1.5, -2], [-1.5, 2], [1.5, 2]]) pb.cyl(0.55, 0.55, 0.4, 10, x + dx, 0.55, d * 0.28 + dz, 0x111111, { rz: Math.PI / 2 });
    }
    for (let i = 0; i < 6; i++) pb.box(0.2, 6, 0.2, -w / 2 + 1 + i * (w - 2) / 5, 3, d / 2 - 1, 0xdddddd);
    extras.signY = h + 3;
  },

  stadium({ pb, win, glow, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, C.concrete);
    const R = Math.min(w, d) / 2;
    // Tribün halkası
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.cos(a) * R * 0.85, z = Math.sin(a) * R * 0.85;
      pb.box(R * 0.27, h, 4, x, h / 2, z, i % 2 ? 0xe0e0e0 : 0xcfcfcf, { ry: -a + Math.PI / 2 });
      pb.box(R * 0.27, 0.6, 4.4, x, h + 0.3, z, i % 3 ? 0x1e88e5 : 0xd62828, { ry: -a + Math.PI / 2 });
    }
    pb.plane(R * 1.2, R * 0.8, 0, 0.12, 0, 0x2e8b3a);
    pb.plane(0.3, R * 0.8, 0, 0.14, 0, 0xffffff);
    // Projektörler
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      pb.box(0.6, h + 8, 0.6, x * R * 0.95, (h + 8) / 2, z * R * 0.95, 0x777777);
      glow.box(3, 1.6, 0.6, x * R * 0.95, h + 8, z * R * 0.95, 0xffffee);
    }
    extras.signY = h + 10;
  },

  hospital({ pb, win, glow, w, d, h, lotSize }) {
    lotBase(pb, lotSize, C.concrete);
    pb.box(w, h, d * 0.75, 0, h / 2, -d * 0.12, 0xf7f9fb);
    pb.box(w * 0.4, h * 0.4, 6, 0, h * 0.2, d * 0.32, 0xe8eef2);
    addWindows(win, w, h, d * 0.75, { floorH: 3.6, spacing: 3, litChance: 0.8 });
    glow.box(3.5, 1, 0.3, 0, h - 3, -d * 0.12 + d * 0.375 + 0.2, 0xff2a2a);
    glow.box(1, 3.5, 0.3, 0, h - 3, -d * 0.12 + d * 0.375 + 0.2, 0xff2a2a);
    pb.cyl(5, 5, 0.3, 20, 0, h + 0.15, -d * 0.12, 0x3a3f44);
    pb.box(0.6, 0.1, 4, -1.2, h + 0.35, -d * 0.12, 0xffffff);
    pb.box(0.6, 0.1, 4, 1.2, h + 0.35, -d * 0.12, 0xffffff);
    pb.box(2.4, 0.1, 0.6, 0, h + 0.35, -d * 0.12, 0xffffff);
    pb.box(4.5, 2, 2.4, w * 0.35, 1.2, d * 0.4, 0xffffff);
    pb.box(4.5, 0.5, 2.45, w * 0.35, 1.2, d * 0.4, 0xd62828);
  },

  prison({ pb, win, glow, w, d, h, lotSize }) {
    lotBase(pb, lotSize, 0x7a7670);
    const ws = lotSize - 3;
    pb.box(ws, 6, 1, 0, 3, ws / 2, 0x8f8b84);
    pb.box(ws, 6, 1, 0, 3, -ws / 2, 0x8f8b84);
    pb.box(1, 6, ws, ws / 2, 3, 0, 0x8f8b84);
    pb.box(1, 6, ws, -ws / 2, 3, 0, 0x8f8b84);
    pb.box(ws, 0.5, 0.5, 0, 6.6, ws / 2, 0x555555);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      pb.cyl(1.2, 1.4, 11, 8, (x * ws) / 2, 5.5, (z * ws) / 2, 0x6f6b64);
      pb.box(3.4, 2.2, 3.4, (x * ws) / 2, 12, (z * ws) / 2, 0x4a4640);
      glow.sphere(0.5, (x * ws) / 2, 11.5, (z * ws) / 2 + z * 1.8, 0xfff6c0);
    }
    pb.box(w * 0.6, h, d * 0.5, 0, h / 2, -2, 0x9a9590);
    addWindows(win, w * 0.6, h, d * 0.5, { floorH: 3, spacing: 2, ww: 0.6, wh: 1, litChance: 0.3 });
    pb.box(5, 5, 1.4, 0, 2.5, ws / 2 + 0.1, 0x3a3a3a);
  },

  park({ pb, glow, lotSize, v }) {
    lotBase(pb, lotSize, C.grass);
    pb.plane(3, lotSize, 0, 0.08, 0, 0xd8c79a);
    pb.plane(lotSize, 3, 0, 0.09, 0, 0xd8c79a);
    pb.cyl(4, 4.4, 0.8, 18, 0, 0.4, 0, 0xcfc8b8);
    pb.cyl(3.4, 3.4, 0.2, 18, 0, 0.85, 0, 0x3fb6e8);
    pb.cyl(0.5, 0.7, 2.5, 8, 0, 1.6, 0, 0xcfc8b8);
    glow.sphere(0.5, 0, 3.1, 0, 0xbff4ff);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + v;
      const r = lotSize * (0.3 + (i % 3) * 0.05);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 2.5 || Math.abs(z) < 2.5) continue;
      tree(pb, x, z, 0.9 + (i % 3) * 0.2, i);
    }
    for (const [x, z, ry] of [[6, 2.6, 0], [-6, -2.6, 0], [2.6, -6, Math.PI / 2]]) {
      pb.box(2.6, 0.2, 0.8, x, 0.7, z, 0x8b5a2b, { ry });
      pb.box(2.6, 0.8, 0.15, x, 1.1, z - 0.35, 0x8b5a2b, { ry });
    }
  },

  land({ pb, lotSize, v }) {
    lotBase(pb, lotSize, C.dirt);
    for (let i = 0; i < 5; i++) {
      pb.add(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.6, 0), 0x7a7268, (Math.random() - 0.5) * lotSize * 0.7, 0.3, (Math.random() - 0.5) * lotSize * 0.7);
    }
    for (let i = 0; i < 6; i++) pb.cone(0.4, 0.9, 5, (Math.random() - 0.5) * lotSize * 0.8, 0.45, (Math.random() - 0.5) * lotSize * 0.8, 0x6f8a3a);
    pb.box(0.2, 3, 0.2, lotSize / 2 - 5, 1.5, lotSize / 2 - 3, 0x5a4030);
    pb.box(3.4, 2, 0.15, lotSize / 2 - 5, 3, lotSize / 2 - 3, 0xc0392b);
    pb.box(3, 0.4, 0.17, lotSize / 2 - 5, 3, lotSize / 2 - 2.98, 0xffffff);
  },

  barracks({ pb, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, 0x6b6a4a);
    for (let i = 0; i < 2; i++) {
      const z = -d * 0.25 + i * d * 0.45;
      pb.add(new THREE.CylinderGeometry(3, 3, w * 0.8, 12, 1, false, 0, Math.PI), 0x4b5a32, 0, 0, z, { rz: Math.PI / 2, rx: 0 });
      pb.box(0.3, 2.6, 6, w * 0.4, 1.3, z, 0x3a4528);
    }
    for (let i = 0; i < 8; i++) pb.box(1.6, 0.7, 0.9, -w * 0.4 + i * 1.7, 0.35, d * 0.45, 0xb8a77a);
    pb.box(0.2, 10, 0.2, w * 0.42, 5, -d * 0.42, 0xbbbbbb);
    pb.box(3.4, 2.2, 0.1, w * 0.42 + 1.7, 8.8, -d * 0.42, 0xd62828);
    pb.box(1.5, 6, 1.5, -w * 0.42, 3, -d * 0.42, 0x5a4a32);
    pb.box(3, 1.6, 3, -w * 0.42, 6.8, -d * 0.42, 0x4b5a32);
    extras.signY = 9;
  },

  missile_silo({ pb, glow, w, d, lotSize, extras }) {
    lotBase(pb, lotSize, 0x8a8a84);
    pb.box(w * 0.8, 0.6, d * 0.8, 0, 0.3, 0, 0x6e6e68);
    for (let i = 0; i < 8; i++) pb.box(w * 0.1, 0.62, 0.8, -w * 0.35 + i * w * 0.1, 0.31, d * 0.4, i % 2 ? 0x111111 : 0xf2c230);
    pb.cyl(3.2, 3.2, 0.8, 18, -w * 0.15, 0.6, 0, 0x4a4a46);
    pb.cyl(2.6, 2.6, 0.1, 18, -w * 0.15, 1.05, 0, 0x111111);
    // Fırlatıcı rampa
    pb.box(1, 1, 10, w * 0.22, 3, 0, 0x5b6b45, { rx: -0.9 });
    pb.cyl(0.9, 0.9, 9, 12, w * 0.22, 4.6, -0.6, 0xe8e8e8, { rx: 0.68 });
    pb.cone(0.9, 2, 12, w * 0.22, 8.4, -3.4, 0xd62828, { rx: 0.68 });
    pb.box(4, 1.2, 3, w * 0.22, 0.6, 3.5, 0x4b5a32);
    glow.sphere(0.3, -w * 0.38, 1.2, -d * 0.38, 0xff2020);
    glow.sphere(0.3, w * 0.38, 1.2, -d * 0.38, 0xff2020);
    extras.signY = 10;
  },

  airbase({ pb, glow, w, d, lotSize, extras }) {
    lotBase(pb, lotSize, 0x7d7c70);
    pb.plane(lotSize - 2, 7, 0, 0.08, -d * 0.2, 0x2c2e33);
    for (let x = -lotSize / 2 + 3; x < lotSize / 2 - 2; x += 4) pb.plane(2, 0.4, x, 0.1, -d * 0.2, 0xf2f2f2);
    for (const x of [-lotSize / 2 + 1.5, lotSize / 2 - 1.5]) glow.sphere(0.3, x, 0.4, -d * 0.2 + 3, 0x3dff8a), glow.sphere(0.3, x, 0.4, -d * 0.2 - 3, 0x3dff8a);
    pb.add(new THREE.CylinderGeometry(5, 5, w * 0.45, 14, 1, false, 0, Math.PI), 0x8a8f99, -w * 0.15, 0, d * 0.25, { rz: Math.PI / 2 });
    pb.box(1, 4.6, 9.6, -w * 0.15 + w * 0.225, 2.3, d * 0.25, 0x2a2a2a);
    pb.box(2.4, 9, 2.4, w * 0.35, 4.5, d * 0.25, 0xd8d4cc);
    pb.box(4, 2.2, 4, w * 0.35, 10, d * 0.25, 0x3a5a7a);
    glow.box(4.1, 0.6, 4.1, w * 0.35, 10, d * 0.25, 0x9fe8ff);
    pb.box(0.15, 4, 0.15, w * 0.35, 13, d * 0.25, 0x333333);
    extras.signY = 15;
  },

  air_defense({ pb, glow, w, d, lotSize, extras, g, b }) {
    const T = adTier(b);
    lotBase(pb, lotSize, 0x7d7c70);
    pb.box(w * 0.5, 2, d * 0.5, 0, 1, 0, T.color);
    // Kademe büyüdükçe daha çok rampa, daha yüksek radar
    const n = T.tier >= 8 ? 4 : T.tier >= 4 ? 3 : 2;
    if (T.laser) {
      // Lazer kulesi: yüksek direk + parlak lens
      pb.cyl(1.2, 2, 10 + T.tier, 10, w * 0.25, (10 + T.tier) / 2, d * 0.25, 0x2a2a3a);
      glow.sphere(1.1, w * 0.25, 10.5 + T.tier, d * 0.25, T.tier >= 11 ? 0x66ccff : 0xff3344);
      pb.cyl(1.2, 2, 8, 10, -w * 0.25, 4, d * 0.25, 0x2a2a3a);
      glow.sphere(0.9, -w * 0.25, 8.5, d * 0.25, 0xff3344);
    }
    if (T.nuke) {
      // Anti-balistik: büyük radar kubbesi
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
      dome.position.set(-w * 0.28, 2, -d * 0.28); dome.castShadow = true; g.add(dome);
    }
    for (let i = 0; i < (T.laser ? 0 : n); i++) {
      const x = -w * 0.3 + i * (w * 0.6 / Math.max(1, n - 1));
      pb.box(3, 1, 4, x, 0.5, d * 0.3, 0x4b5a32);
      pb.box(2.6, 2.4, 3, x, 2, d * 0.3, 0x5b6b45, { rx: -0.5 });
      for (let k = 0; k < 4; k++) pb.cyl(0.32, 0.32, 3.2, 8, x - 0.65 + (k % 2) * 1.3, 2.5 + Math.floor(k / 2) * 0.8, d * 0.3 - 0.5, 0x222222, { rx: 1.07 });
    }
    const ry = 7.4 + Math.min(8, T.tier * 0.7);
    pb.cyl(0.4, 0.6, ry - 2.4, 8, 0, (ry - 2.4) / 2 + 2, -d * 0.1, 0x666666);
    const radar = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.6 + T.tier * 0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0xdedede, side: THREE.DoubleSide, roughness: 0.4 }));
    dish.rotation.x = -Math.PI / 2 - 0.4;
    dish.castShadow = true;
    radar.add(dish);
    radar.position.set(0, ry, -d * 0.1);
    g.add(radar);
    extras.radar = radar;
    glow.sphere(0.35, 0, ry, -d * 0.1, 0x3dff8a);
    extras.signY = ry + 4;
  },

  cyber_center({ pb, win, glow, w, d, h, lotSize, extras }) {
    lotBase(pb, lotSize, 0x3a3f48);
    pb.box(w * 0.8, h, d * 0.7, 0, h / 2, 0, 0x1e2530);
    for (let f = 1; f < h / 3; f++) win.box(w * 0.82, 0.5, d * 0.72, 0, f * 3, 0, 0x2ee6ff);
    pb.cyl(0.25, 0.25, 6, 6, w * 0.3, h + 3, 0, 0x888888);
    glow.sphere(0.4, w * 0.3, h + 6, 0, 0x2ee6ff);
    for (let i = 0; i < 3; i++) pb.box(1.2, 2, 1.2, -w * 0.3 + i * 1.6, h + 1, -d * 0.2, 0x444b55);
    extras.signY = h + 4;
  },
};
