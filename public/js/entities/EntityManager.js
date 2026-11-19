import * as THREE from 'three';
import { textSprite, glowTexture } from '../render/geometry.js';
import { POSES, WEAPON_CODES } from '../../shared/interiors.js';
import { OUTFITS, CARS, CAR_CODES } from '../../shared/catalogs.js';

const JOB_COLORS = {
  worker: 0xe67e22, clerk: 0x3498db, waiter: 0xf4f4f4, bartender: 0x8e44ad, civil_servant: 0x5d6d7e,
  police: 0x1f3a93, banker: 0x1e5631, doctor: 0xe8f4f8, guard: 0x7b5b3a, unemployed: 0x95a5a6,
};
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const PRODUCT_COLORS = { food: 0xe67e22, drink: 0x2e86de, electronics: 0x8395a7, steel: 0x40474f, weapons: 0x4b5a32 };

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const hash = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };

// ----------------------------------------------------------------------- karakter
const HAIR = [0x2b1d12, 0x1a1a1a, 0x5a3a1e, 0x8a5a2b, 0xc9a35c, 0x6b6b6b];
const PANTS = [0x2c3e50, 0x1f2a44, 0x3b3b3b, 0x4a3a2a, 0x6b6b5a, 0x223322];
const matCache = new Map();
const M = (c, r = 0.75, m = 0) => {
  const k = `${c}|${r}|${m}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
  return matCache.get(k);
};

/**
 * İnsan modeli (~3 birim boy): kafa + yüz + saç, boyun, gövde, kemer, eklemli kollar (dirsek) ve bacaklar, eller, ayakkabılar.
 * Pozlar: yürüme, koşma, oturma, uyuma, ölü, çalışma, yumruk/ateş.
 */
export function makeCharacter(shirt, { scale = 1, pants, skin = 0xf1c27d, hair, seed = Math.random() * 1e6, outfit } = {}) {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const h = Math.abs(Math.floor(seed));
  const O = { top: OUTFITS[outfit?.top], bottom: OUTFITS[outfit?.bottom], hat: OUTFITS[outfit?.hat], acc: OUTFITS[outfit?.acc] };
  const shirtMat = new THREE.MeshStandardMaterial({ color: O.top?.color ?? shirt, roughness: O.top?.style === 'suit' || O.top?.style === 'jacket' ? 0.45 : 0.7 });
  const pantsMat = M(O.bottom?.color ?? pants ?? PANTS[h % PANTS.length], 0.85);
  const skinMat = M(skin, 0.6);
  const hairMat = M(hair ?? HAIR[(h >> 3) % HAIR.length], 0.9);
  const dark = M(0x161616, 0.6);
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // Gövde
  add(rig, new THREE.CylinderGeometry(0.46, 0.38, 0.95, 10).scale(1, 1, 0.62), shirtMat, 0, 2.02, 0);
  add(rig, new THREE.SphereGeometry(0.46, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.62), shirtMat, 0, 2.48, 0);
  add(rig, new THREE.BoxGeometry(0.8, 0.28, 0.5), pantsMat, 0, 1.47, 0);
  add(rig, new THREE.BoxGeometry(0.82, 0.07, 0.52), dark, 0, 1.6, 0);
  add(rig, new THREE.CylinderGeometry(0.13, 0.15, 0.22, 8), skinMat, 0, 2.62, 0);
  // Kafa
  const head = new THREE.Group();
  head.position.set(0, 2.98, 0);
  rig.add(head);
  add(head, new THREE.SphereGeometry(0.36, 16, 12).scale(0.95, 1.08, 1), skinMat, 0, 0, 0);
  for (const sx of [-0.13, 0.13]) {
    add(head, new THREE.SphereGeometry(0.05, 6, 6), dark, sx, 0.05, 0.31);
    add(head, new THREE.BoxGeometry(0.12, 0.025, 0.03), hairMat, sx, 0.14, 0.32);
    add(head, new THREE.SphereGeometry(0.07, 6, 6).scale(0.5, 1, 0.6), skinMat, sx * 2.6, 0, 0);
  }
  add(head, new THREE.BoxGeometry(0.08, 0.12, 0.1), skinMat, 0, -0.03, 0.36);
  add(head, new THREE.BoxGeometry(0.14, 0.025, 0.03), M(0x8a3a3a), 0, -0.16, 0.32);
  const style = (h >> 5) % 4;
  add(head, new THREE.SphereGeometry(0.385, 14, 8, 0, Math.PI * 2, 0, Math.PI * (style === 3 ? 0.34 : 0.48)).scale(0.97, 1.08, 1.03), hairMat, 0, 0.02, -0.02);
  if (style === 1) add(head, new THREE.BoxGeometry(0.66, 0.55, 0.22), hairMat, 0, -0.2, -0.26); // uzun saç
  if (style === 2) add(head, new THREE.SphereGeometry(0.16, 8, 6), hairMat, 0, 0.18, -0.36);   // topuz

  // Kollar: omuz -> dirsek -> el
  const arm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.58, 2.42, 0);
    rig.add(sh);
    add(sh, new THREE.SphereGeometry(0.16, 8, 6), shirtMat, 0, 0, 0);
    add(sh, new THREE.CylinderGeometry(0.13, 0.11, 0.6, 8), shirtMat, 0, -0.3, 0);
    const el = new THREE.Group();
    el.position.set(0, -0.6, 0);
    sh.add(el);
    add(el, new THREE.CylinderGeometry(0.1, 0.085, 0.5, 8), skinMat, 0, -0.25, 0);
    const hand = add(el, new THREE.SphereGeometry(0.11, 8, 6).scale(0.9, 1.1, 0.8), skinMat, 0, -0.56, 0);
    return { sh, el, hand };
  };
  const leg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.21, 1.4, 0);
    rig.add(hip);
    add(hip, new THREE.CylinderGeometry(0.17, 0.14, 0.7, 8), pantsMat, 0, -0.35, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.7, 0);
    hip.add(knee);
    const bare = O.bottom?.style === 'shorts' || O.bottom?.style === 'skirt' || O.top?.style === 'dress';
    add(knee, new THREE.CylinderGeometry(0.135, 0.11, 0.6, 8), bare ? skinMat : pantsMat, 0, -0.3, 0);
    add(knee, new THREE.BoxGeometry(0.24, 0.14, 0.42), dark, 0, -0.63, 0.07);
    return { hip, knee };
  };
  const aL = arm(-1), aR = arm(1), lL = leg(-1), lR = leg(1);
  dressUp(rig, head, O, { shirtMat, pantsMat, add });
  const weapon = new THREE.Group();
  aR.hand.add(weapon);
  g.scale.setScalar(scale);
  g.userData.limbs = { aL, aR, lL, lR, rig, head, weapon };
  g.userData.phase = Math.random() * 10;
  g.userData.weaponKey = 'fist';
  return g;
}

/** Kıyafet aksesuarları: kapşon, ceket yakası, kravat, forma çizgisi, elbise/etek, şapkalar, gözlük, kolye, çanta */
function dressUp(rig, head, O, { shirtMat, add }) {
  const t = O.top, b = O.bottom, hat = O.hat, acc = O.acc;
  if (t?.style === 'hoodie') {
    add(rig, new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 0.9), shirtMat, 0, 2.6, -0.28).rotation.x = -0.6;
    add(rig, new THREE.BoxGeometry(0.5, 0.25, 0.05), M(new THREE.Color(t.color).offsetHSL(0, 0, -0.08).getHex()), 0, 1.85, 0.3);
  }
  if (t?.style === 'jacket' || t?.style === 'suit') {
    add(rig, new THREE.BoxGeometry(0.26, 0.9, 0.04), M(t.style === 'suit' ? 0xffffff : 0xdedede), 0, 2.08, 0.295);
    add(rig, new THREE.CylinderGeometry(0.47, 0.47, 0.35, 10, 1, true).scale(1, 1, 0.64), shirtMat, 0, 1.55, 0);
    if (t.style === 'suit') add(rig, new THREE.BoxGeometry(0.09, 0.62, 0.03), M(0xb71c1c), 0, 2.1, 0.32);
  }
  if (t?.style === 'jersey') for (const y of [1.85, 2.15]) add(rig, new THREE.CylinderGeometry(0.455, 0.42, 0.1, 10).scale(1, 1, 0.63), M(t.color2 ?? 0xffffff), 0, y, 0);
  if (t?.style === 'dress' || b?.style === 'skirt') add(rig, new THREE.CylinderGeometry(0.42, 0.72, 0.95, 12), t?.style === 'dress' ? shirtMat : M(b.color), 0, 1.15, 0);
  if (b?.color2) for (const x of [-0.37, 0.37]) add(rig, new THREE.BoxGeometry(0.03, 0.6, 0.05), M(b.color2), x, 1.1, 0.12);
  if (hat) {
    const hm = M(hat.color, hat.style === 'crown' ? 0.25 : 0.8, hat.style === 'crown' ? 0.9 : 0);
    if (hat.style === 'cap') { add(head, new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.06, 0); add(head, new THREE.BoxGeometry(0.42, 0.04, 0.32), hm, 0, 0.08, 0.42); }
    if (hat.style === 'beanie') add(head, new THREE.SphereGeometry(0.41, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8).scale(1, 1.15, 1), hm, 0, 0.04, 0);
    if (hat.style === 'fedora' || hat.style === 'cowboy') {
      add(head, new THREE.CylinderGeometry(hat.style === 'cowboy' ? 0.72 : 0.6, hat.style === 'cowboy' ? 0.72 : 0.6, 0.05, 16), hm, 0, 0.28, 0);
      add(head, new THREE.CylinderGeometry(0.3, 0.36, 0.36, 12), hm, 0, 0.46, 0);
      add(head, new THREE.CylinderGeometry(0.365, 0.365, 0.07, 12), M(0x111111), 0, 0.33, 0);
    }
    if (hat.style === 'crown') {
      add(head, new THREE.CylinderGeometry(0.36, 0.33, 0.24, 12, 1, true), hm, 0, 0.42, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(head, new THREE.ConeGeometry(0.07, 0.2, 4), hm, Math.sin(a) * 0.33, 0.62, Math.cos(a) * 0.33); }
      add(head, new THREE.SphereGeometry(0.05, 6, 6), M(0xd50000, 0.2, 0.3), 0, 0.42, 0.36);
    }
  }
  if (acc?.style === 'glasses' || acc?.style === 'sunglasses') {
    const gm = M(acc.color, 0.3, 0.4);
    for (const x of [-0.13, 0.13]) add(head, acc.style === 'sunglasses' ? new THREE.BoxGeometry(0.17, 0.1, 0.03) : new THREE.TorusGeometry(0.07, 0.015, 6, 12), gm, x, 0.05, 0.345);
    add(head, new THREE.BoxGeometry(0.1, 0.02, 0.02), gm, 0, 0.07, 0.35);
  }
  if (acc?.style === 'chain') add(rig, new THREE.TorusGeometry(0.2, 0.025, 6, 16), M(acc.color, 0.2, 0.9), 0, 2.45, 0.12).rotation.x = Math.PI / 2.4;
  if (acc?.style === 'backpack') add(rig, new THREE.BoxGeometry(0.62, 0.75, 0.3), M(acc.color), 0, 2.05, -0.42);
}

/** Arabalar: sedan, spor, SUV, pikap, minivan */
export function makeCar(modelId) {
  const c = CARS[modelId] ?? CARS.sahin;
  const g = new THREE.Group();
  const body = M(c.color, 0.3, 0.6);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.45 });
  const dark = M(0x111111, 0.7);
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const L = { sedan: [7.4, 3.3, 1.0], sport: [7.6, 3.6, 0.75], suv: [7.2, 3.5, 1.5], pickup: [8.2, 3.5, 1.3], van: [7.6, 3.4, 1.7] }[c.model] ?? [7.4, 3.3, 1];
  const [len, wid, hh] = L;
  box(wid, hh, len, body, 0, 0.55 + hh / 2, 0);
  if (c.model === 'pickup') { box(wid, 1.2, len * 0.42, body, 0, 0.55 + hh + 0.6, len * 0.1); box(wid - 0.4, 0.1, len * 0.4, dark, 0, 0.56 + hh, -len * 0.28); }
  else if (c.model === 'sport') { box(wid * 0.82, 0.85, len * 0.38, glass, 0, 0.55 + hh + 0.42, -len * 0.05); box(wid, 0.12, 0.6, dark, 0, 0.55 + hh + 0.5, -len / 2 + 0.3); for (const x of [-1, 1]) box(0.15, 0.5, 0.15, dark, x * (wid / 2 - 0.4), 0.55 + hh + 0.25, -len / 2 + 0.3); }
  else box(wid * 0.9, c.model === 'van' || c.model === 'suv' ? 1.4 : 1.15, len * (c.model === 'van' ? 0.7 : 0.5), glass, 0, 0.55 + hh + (c.model === 'van' || c.model === 'suv' ? 0.7 : 0.57), c.model === 'van' ? -len * 0.08 : -len * 0.04);
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14).rotateZ(Math.PI / 2), dark);
    w.position.set(x * (wid / 2), 0.62, z * (len / 2 - 1.3));
    g.add(w);
  }
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  for (const x of [-1, 1]) {
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), lamp); h1.position.set(x * (wid / 2 - 0.55), 0.55 + hh * 0.6, len / 2 + 0.02); g.add(h1);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), tail); t1.position.set(x * (wid / 2 - 0.55), 0.55 + hh * 0.6, -len / 2 - 0.02); g.add(t1);
  }
  g.userData.isCar = true;
  return g;
}

function makeMoped() {
  const g = new THREE.Group();
  const red = M(0xe53935, 0.4, 0.3);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 2.6), red); b.position.y = 1.1; g.add(b);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 1.2), M(0xff7043)); box.position.set(0, 2.1, -0.8); g.add(box);
  for (const z of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 12).rotateZ(Math.PI / 2), M(0x111111)); w.position.set(0, 0.45, z); g.add(w); }
  const rider = makeCharacter(0xff7043, { scale: 0.8, seed: 7 });
  rider.position.set(0, 0.6, 0.2);
  rider.userData.limbs.lL.hip.rotation.x = rider.userData.limbs.lR.hip.rotation.x = -1.2;
  g.add(rider);
  return g;
}

const SEATS = [[-0.6, -0.4], [0.6, -0.4], [-0.6, -2.2], [0.6, -2.2]];

const WEAPON_MESH = {
  knife: () => { const w = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.1), M(0xd0d4d8, 0.3, 0.8)); b.position.y = -0.3; w.add(b); return w; },
  pistol: () => { const w = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.42), M(0x1a1a1a, 0.4, 0.5)); b.position.set(0, -0.05, 0.16); const gr = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.1), M(0x2b1d12)); gr.position.set(0, -0.12, 0); w.add(b, gr); return w; },
  rifle: () => { const w = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 1.3), M(0x1f1f1f, 0.4, 0.5)); b.position.set(0, -0.05, 0.35); const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.4), M(0x5a3b22)); st.position.set(0, -0.08, -0.4); const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.12), M(0x2a2a2a)); mag.position.set(0, -0.22, 0.25); w.add(b, st, mag); return w; },
};

export function setWeapon(g, key) {
  const L = g.userData.limbs;
  if (!L || g.userData.weaponKey === key) return;
  g.userData.weaponKey = key;
  L.weapon.clear();
  if (WEAPON_MESH[key]) L.weapon.add(WEAPON_MESH[key]());
}

/**
 * Animasyon. st: { pose, attackT, gun }
 */
function animateWalk(g, speed, dt, st = {}) {
  const L = g.userData.limbs;
  if (!L) return;
  const pose = st.pose ?? '';
  const t = (g.userData.phase += dt * (5 + speed * 0.75));
  const rig = L.rig;
  // sıfırla
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  L.head.rotation.set(0, 0, 0);
  for (const a of [L.aL, L.aR]) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
  for (const l of [L.lL, L.lR]) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); }

  if (pose === 'sit' || pose === 'drive') {
    rig.position.y = pose === 'drive' ? 0.35 : -0.28;
    if (pose === 'drive') { const S = SEATS[st.seat ?? 0] ?? SEATS[0]; rig.position.x = S[0]; rig.position.z = S[1]; for (const l of [L.lL, L.lR]) { l.hip.rotation.x = -1.4; l.knee.rotation.x = 1.3; } L.aL.sh.rotation.x = L.aR.sh.rotation.x = -1.1; return; }
    for (const l of [L.lL, L.lR]) { l.hip.rotation.x = -1.5; l.knee.rotation.x = 1.5; }
    L.aL.sh.rotation.x = -0.35; L.aR.sh.rotation.x = -0.35; L.aL.el.rotation.x = -0.5; L.aR.el.rotation.x = -0.5;
    L.head.rotation.y = Math.sin(t * 0.3) * 0.25; // sohbet ederken etrafa bakar
    return;
  }
  if (pose === 'sleep' || pose === 'dead') {
    const dead = pose === 'dead';
    rig.rotation.x = dead ? Math.PI / 2 : -Math.PI / 2;
    rig.position.set(0, dead ? 0.42 : (st.bedY ?? 1.25) + 0.42, dead ? -1.5 : 1.5);
    L.aL.sh.rotation.z = dead ? -1.2 : 0.15; L.aR.sh.rotation.z = dead ? 1.0 : -0.15;
    if (!dead) rig.position.y += Math.sin(t * 0.25) * 0.02;
    return;
  }
  const moving = speed > 0.3;
  const run = speed > 11;
  const amp = moving ? Math.min(run ? 1.0 : 0.65, 0.2 + speed * 0.06) : 0;
  const s = Math.sin(t);
  L.lL.hip.rotation.x = s * amp;
  L.lR.hip.rotation.x = -s * amp;
  L.lL.knee.rotation.x = Math.max(0, -Math.cos(t)) * amp * 1.3;
  L.lR.knee.rotation.x = Math.max(0, Math.cos(t)) * amp * 1.3;
  L.aL.sh.rotation.x = -s * amp * 0.8;
  L.aR.sh.rotation.x = s * amp * 0.8;
  L.aL.el.rotation.x = L.aR.el.rotation.x = -0.2 - (run ? 0.9 : 0.2);
  rig.position.y = moving ? Math.abs(Math.cos(t)) * (run ? 0.14 : 0.06) : Math.sin(t * 0.4) * 0.01;
  if (run) rig.rotation.x = 0.12;

  if (pose === 'work') {
    const w = Math.sin(t * 2.2);
    L.aL.sh.rotation.x = L.aR.sh.rotation.x = -1.1 + w * 0.25;
    L.aL.el.rotation.x = L.aR.el.rotation.x = -0.6 - w * 0.3;
    L.head.rotation.x = 0.3;
  }
  // Silah tutma / saldırı
  const atk = st.attackT ?? 0;
  if (st.gun) {
    L.aR.sh.rotation.x = -1.45 + (atk > 0 ? Math.sin(atk * 30) * 0.08 : 0);
    L.aR.el.rotation.x = 0;
    if (st.gun === 'rifle') { L.aL.sh.rotation.x = -1.3; L.aL.sh.rotation.z = -0.5; L.aL.el.rotation.x = -0.3; }
  } else if (atk > 0) {
    const k = Math.sin(Math.min(1, atk / 0.3) * Math.PI);
    L.aR.sh.rotation.x = -1.55 * k;
    L.aR.el.rotation.x = -0.4 * (1 - k);
    rig.rotation.y = -0.25 * k;
  }
}

// ----------------------------------------------------------------------- at
function makeHorse(color = 0x6b4226) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b1d12 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 2.6), mat);
  body.position.y = 1.7;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.6), mat);
  neck.position.set(0, 2.5, 1.2);
  neck.rotation.x = 0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.0), mat);
  head.position.set(0, 3.0, 1.75);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.5), dark);
  mane.position.set(0, 2.7, 1.0);
  mane.rotation.x = 0.5;
  g.add(body, neck, head, mane);
  const legs = [];
  for (const [x, z] of [[-0.4, 1], [0.4, 1], [-0.4, -1], [0.4, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.2, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), mat);
    leg.position.y = -0.6;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.legs = legs;
  g.userData.phase = Math.random() * 10;
  return g;
}

function animateHorse(h, speed, dt) {
  const L = h?.userData.legs;
  if (!L) return;
  h.userData.phase += dt * (8 + speed * 0.5);
  const a = speed > 0.5 ? Math.sin(h.userData.phase) * 0.6 : 0;
  L[0].rotation.x = a; L[3].rotation.x = a; L[1].rotation.x = -a; L[2].rotation.x = -a;
}

// ----------------------------------------------------------------------- askeri modeller
const SOLDIER_LOOK = {
  swordsman: { shirt: 0x8a8f99, pants: 0x4a3a2a, helmet: 0x9aa0a6, weapon: 'sword' },
  archer:    { shirt: 0x3d6b2f, pants: 0x4a3a2a, helmet: 0x4a6b2f, weapon: 'bow' },
  musketeer: { shirt: 0x2a4a8a, pants: 0xe8e2d4, helmet: 0x1a1a1a, weapon: 'musket' },
  infantry:  { shirt: 0x556b2f, pants: 0x3d4a24, helmet: 0x556b2f, weapon: 'rifle' },
};

function makeSoldier(type, team) {
  const look = SOLDIER_LOOK[type] ?? SOLDIER_LOOK.infantry;
  const s = makeCharacter(look.shirt, { scale: 0.7, pants: look.pants, skin: 0xe0ac69 });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: look.helmet, metalness: type === 'swordsman' ? 0.6 : 0 }));
  helmet.position.y = 2.7;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.3), team);
  band.position.set(-0.66, 1.9, 0);
  s.add(helmet, band);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.8, roughness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e });
  if (look.weapon === 'sword') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.18), steel);
    blade.position.set(0.7, 2.2, 0.45);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 12).rotateZ(Math.PI / 2), team);
    shield.position.set(-0.85, 1.8, 0.2);
    s.add(blade, shield);
  } else if (look.weapon === 'bow') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 4, 12, Math.PI), wood);
    bow.position.set(-0.7, 2.0, 0.4);
    bow.rotation.y = Math.PI / 2;
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 6), wood);
    quiver.position.set(0.2, 2.1, -0.45);
    s.add(bow, quiver);
  } else {
    const len = look.weapon === 'musket' ? 1.9 : 1.3;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), new THREE.MeshStandardMaterial({ color: look.weapon === 'musket' ? 0x5a3b22 : 0x1a1a1a }));
    gun.position.set(0.4, 1.8, 0.5);
    s.add(gun);
  }
  return s;
}

// ----------------------------------------------------------------------- uçaklar
function makeAircraft(type, color) {
  const g = new THREE.Group();
  const team = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const M = (c, metal = 0.4) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: 0.45 });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  if (type === 'heli') {
    const body = M(0x4b5a32, 0.2);
    add(new THREE.SphereGeometry(1.6, 12, 10), body).scale.set(1, 0.9, 1.7);
    add(new THREE.CylinderGeometry(0.25, 0.4, 5, 8).rotateX(Math.PI / 2), body, 0, 0.4, -4);
    add(new THREE.BoxGeometry(0.2, 1.6, 1), body, 0, 1, -6.3);
    add(new THREE.BoxGeometry(1.5, 0.6, 1.2), M(0x1a2a3a, 0.8), 0, 0.5, 1.6);
    add(new THREE.BoxGeometry(3.6, 0.15, 0.4), team, 0, -0.2, 0);
    const rotor = new THREE.Group();
    rotor.position.y = 1.9;
    for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), M(0x222222)); b.rotation.y = r; rotor.add(b); }
    g.add(rotor);
    const tail = new THREE.Group();
    tail.position.set(0.25, 1, -6.3);
    tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.25), M(0x222222)));
    g.add(tail);
    g.userData.rotor = rotor;
    g.userData.tailRotor = tail;
  } else if (type === 'b2') {
    const skin = M(0x2c2f36, 0.3);
    for (const sgn of [-1, 1]) {
      add(new THREE.BoxGeometry(16, 0.6, 5), skin, sgn * 6.5, 0, -1.5, 0, sgn * 0.62, 0);
      add(new THREE.BoxGeometry(4, 0.5, 3), skin, sgn * 11.5, 0, -6, 0, -sgn * 0.62, 0);
    }
    add(new THREE.SphereGeometry(2.4, 12, 8), skin, 0, 0.3, 1).scale.set(1.2, 0.35, 2);
    add(new THREE.BoxGeometry(1.2, 0.2, 0.8), M(0x111827, 0.9), 0, 0.85, 2.2);
  } else if (type === 'drone') {
    const skin = M(0xd8dce0, 0.3);
    add(new THREE.CylinderGeometry(0.45, 0.35, 6, 10).rotateX(Math.PI / 2), skin);
    add(new THREE.SphereGeometry(0.55, 10, 8), skin, 0, 0.1, 2.9);
    add(new THREE.BoxGeometry(12, 0.12, 0.9), skin, 0, 0.2, 0.3);
    add(new THREE.BoxGeometry(2.4, 0.1, 0.5), skin, 0.8, 0.5, -2.8, 0, 0, 0.6);
    add(new THREE.BoxGeometry(2.4, 0.1, 0.5), skin, -0.8, 0.5, -2.8, 0, 0, -0.6);
    add(new THREE.BoxGeometry(1.2, 0.1, 0.3), team, 4, 0.27, 0.3);
    add(new THREE.BoxGeometry(1.2, 0.1, 0.3), team, -4, 0.27, 0.3);
  } else {
    const skin = M(0x8a949e, 0.5);
    add(new THREE.CylinderGeometry(0.7, 0.9, 9, 10).rotateX(Math.PI / 2), skin);
    add(new THREE.ConeGeometry(0.7, 2.4, 10).rotateX(Math.PI / 2), skin, 0, 0, 5.7);
    add(new THREE.SphereGeometry(0.6, 10, 8), M(0x1a2a3a, 0.9), 0, 0.6, 2.6).scale.set(1, 0.8, 1.8);
    for (const sgn of [-1, 1]) {
      add(new THREE.BoxGeometry(4.5, 0.15, 2.6), skin, sgn * 2.6, 0, -0.6, 0, sgn * 0.35, 0);
      add(new THREE.BoxGeometry(1.8, 0.12, 1.2), skin, sgn * 1.2, 0, -4, 0, sgn * 0.3, 0);
      add(new THREE.BoxGeometry(1.2, 0.17, 0.4), team, sgn * 4.2, 0.02, -0.9, 0, sgn * 0.35, 0);
    }
    add(new THREE.BoxGeometry(0.15, 2, 1.6), skin, 0, 1.1, -4);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.set(2.5, 2.5, 1);
    flame.position.z = -5;
    g.add(flame);
  }
  g.userData.air = true;
  return g;
}

function makeStreetUnit(type) {
  const g = new THREE.Group();
  const cop = type === 'cop';
  const ch = makeCharacter(cop ? 0x1f3a93 : 0x111111, { seed: Math.random() * 1e6, pants: cop ? 0x1b2440 : 0x0a0a0a, outfit: cop ? { hat: 'cap_black' } : { top: 'hoodie_grey', acc: 'sunglasses' } });
  if (!cop) ch.traverse((m) => { if (m.isMesh && m.material?.color?.getHex?.() === 0x7f8c8d) m.material = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 }); });
  g.add(ch);
  if (cop) {
    // Omuzda yanıp sönen mavi-kırmızı ışık
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2060ff }));
    r.position.set(-0.45, 2.75, 0); b.position.set(0.45, 2.75, 0);
    g.add(r, b);
    g.userData.siren = [r, b];
    const tag = textSprite('👮 POLİS', { color: '#5aa0ff', border: '#5aa0ff', scale: 0.55 });
    tag.position.y = 4.3; g.add(tag);
  } else {
    const tag = textSprite('🕶️', { color: '#ff4040', border: '#ff4040', scale: 0.5 });
    tag.position.y = 4.2; g.add(tag);
  }
  const hp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x3dff6a, depthTest: false, transparent: true, opacity: 0 }));
  hp.scale.set(0.01, 0.01, 1);
  g.add(hp);
  g.userData.hpBar = hp;
  g.userData.soldiers = [ch];
  return g;
}

function makeUnit(type, color) {
  if (type === 'cop' || type === 'gang') return makeStreetUnit(type);
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8 });
  const team = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  if (type === 'cavalry' || type === 'scout') {
    const horse = makeHorse(type === 'scout' ? 0xa0703a : 0x3a2a1a);
    const rider = makeSoldier(type === 'scout' ? 'archer' : 'swordsman', team);
    rider.position.set(0, 1.2, -0.1);
    rider.userData.limbs.legL.rotation.z = 0.9;
    rider.userData.limbs.legR.rotation.z = -0.9;
    g.add(horse, rider);
    if (type === 'scout') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3), new THREE.MeshStandardMaterial({ color: 0x5a3b22 }));
      pole.position.set(0.6, 3.6, -0.4);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      flag.position.set(1.2, 4.7, -0.4);
      g.add(pole, flag);
    }
    g.userData.horse = horse;
  } else if (type === 'cannon') {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 3), wood);
    carriage.position.y = 1;
    const turret = new THREE.Group();
    turret.position.y = 1.5;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 3.2, 10).rotateX(Math.PI / 2), iron);
    barrel.position.z = 0.8;
    barrel.rotation.x = -0.15;
    turret.add(barrel);
    for (const x of [-0.9, 0.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 14).rotateZ(Math.PI / 2), wood);
      wheel.position.set(x, 0.9, -0.2);
      g.add(wheel);
    }
    const crew = makeSoldier('musketeer', team);
    crew.position.set(-1.6, 0, -1.4);
    g.add(carriage, turret, crew);
    g.userData.turret = turret;
    g.userData.soldiers = [crew];
  } else if (type === 'tank') {
    const dark = new THREE.MeshStandardMaterial({ color: 0x22251f });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.3, 6), olive);
    hull.position.y = 1.2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.3, 6.05), team);
    stripe.position.y = 1.5;
    for (const x of [-1.9, 1.9]) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 6.4), dark);
      tr.position.set(x, 0.7, 0);
      g.add(tr);
    }
    const turret = new THREE.Group();
    turret.position.y = 2.2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 2.8), olive);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.2, 8).rotateX(Math.PI / 2), dark);
    barrel.position.set(0, 0.1, 3);
    turret.add(top, barrel);
    g.add(hull, stripe, turret);
    g.userData.turret = turret;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  } else {
    // Manga: 4 asker (kılıçlı / okçu / tüfekli / modern)
    const offsets = [[0, 1.2], [-1.2, 0], [1.2, 0], [0, -1.2]];
    g.userData.soldiers = [];
    for (const [x, z] of offsets) {
      const s = makeSoldier(type, team);
      s.position.set(x, 0, z);
      g.add(s);
      g.userData.soldiers.push(s);
    }
  }
  const hp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x3dff6a, depthTest: false }));
  hp.scale.set(3, 0.3, 1);
  hp.position.y = type === 'tank' ? 4.5 : type === 'cavalry' || type === 'scout' ? 5 : 3.4;
  hp.renderOrder = 20;
  g.add(hp);
  g.userData.hpBar = hp;
  return g;
}

function makeCart(product) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2e });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 3), wood);
  bed.position.set(0, 1.4, -1.2);
  const load = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.6), new THREE.MeshStandardMaterial({ color: PRODUCT_COLORS[product] ?? 0xc8b68a }));
  load.position.set(0, 2.2, -1.2);
  for (const x of [-1.1, 1.1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.15, 12).rotateZ(Math.PI / 2), wood);
    w.position.set(x, 0.85, -1.2);
    g.add(w);
  }
  const horse = makeHorse();
  horse.position.z = 1.6;
  g.add(bed, load, horse);
  g.userData.horse = horse;
  return g;
}

function makeTruck(product) {
  const g = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
  cab.position.set(0, 1.5, 2.2);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.6, roughness: 0.2 }));
  glass.position.set(0, 2, 3.22);
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, 4.4), new THREE.MeshStandardMaterial({ color: PRODUCT_COLORS[product] ?? 0xaaaaaa }));
  box.position.set(0, 1.9, -1);
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10).rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [x, z] of [[-1.25, 2.2], [1.25, 2.2], [-1.25, -2], [1.25, -2]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.5, z);
    g.add(w);
  }
  const lights = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  lights.position.set(0, 1, 3.22);
  g.add(cab, glass, box, lights);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// ----------------------------------------------------------------------- yönetici
export class EntityManager {
  constructor(scene, selfId) {
    this.scene = scene;
    this.selfId = selfId;
    this.players = new Map();
    this.units = new Map();
    this.vehicles = new Map();
    this.npcs = new Map();
    this.pickables = [];

    // NPC'ler: parça başına bir InstancedMesh (gövde, kafa, saç, kollar, bacaklar) -> yürürken kol/bacak sallanır
    this.npcCap = 400;
    const inst = (geo, cap, mat) => {
      const m = new THREE.InstancedMesh(geo, mat ?? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), cap);
      m.frustumCulled = false;
      m.castShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
      return m;
    };
    const cap = this.npcCap;
    this.npcParts = {
      torso: inst(new THREE.CylinderGeometry(0.44, 0.37, 1.05, 8).scale(1, 1, 0.62).translate(0, 2.05, 0), cap),
      hips: inst(new THREE.BoxGeometry(0.78, 0.3, 0.48).translate(0, 1.47, 0), cap),
      head: inst(new THREE.SphereGeometry(0.35, 10, 8).scale(0.95, 1.08, 1).translate(0, 2.96, 0), cap),
      hair: inst(new THREE.SphereGeometry(0.37, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48).scale(0.97, 1.08, 1.03).translate(0, 2.98, -0.02), cap),
      arm: inst(new THREE.CylinderGeometry(0.12, 0.09, 1.1, 6).translate(0, -0.55, 0), cap * 2),
      leg: inst(new THREE.CylinderGeometry(0.16, 0.12, 1.36, 6).translate(0, -0.68, 0), cap * 2),
    };
    this.npcBodies = this.npcParts.torso;
    this.npcBodies.userData = { kind: 'npcInstanced' };
    this.freeIdx = [];
    for (let i = cap - 1; i >= 0; i--) this.freeIdx.push(i);
    this.idxToNpc = new Map();
    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._rx = new THREE.Matrix4();
    for (const [k, m] of Object.entries(this.npcParts)) for (let i = 0; i < m.count; i++) m.setMatrixAt(i, this._zero);
    this.robberRings = new Map();

    // Kendi oyuncumuzun altındaki parlayan halka
    this.selfRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 32), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.selfRing.rotation.x = -Math.PI / 2;
    this.selfRing.position.y = 0.2;
    scene.add(this.selfRing);
    this.time = 0;
  }

  // ---------- Oyuncular ----------
  addPlayer(p) {
    if (this.players.has(p.id)) return this.players.get(p.id);
    const h = Math.abs(hash(p.id + p.name));
    const g = makeCharacter(new THREE.Color(p.color), { skin: SKIN[h % SKIN.length], seed: h, outfit: p.outfit });
    const label = textSprite(p.name + (p.countryName ? ` · 🏳️ ${p.countryName}` : ''), { color: p.color, border: p.color, scale: 0.75 });
    label.position.y = 4.0;
    const talk = textSprite('🔊', { color: '#3ddc84', border: '#3ddc84', scale: 0.6 });
    talk.position.y = 4.8;
    talk.visible = false;
    talk.material.depthTest = false;
    g.add(talk);
    label.renderOrder = 15;
    label.material.depthTest = false;
    g.add(label);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.rotY ?? 0;
    this.markPick(g, 'player', p.id);
    this.scene.add(g);
    const e = { id: p.id, data: p, g, label, talk, car: '', target: { x: p.x, z: p.z, rotY: p.rotY ?? 0 }, last: { x: p.x, z: p.z }, speed: 0, pose: '', weapon: 'fist', inside: 0, attackT: 0, talkUntil: 0 };
    this.players.set(p.id, e);
    return e;
  }

  /** Kıyafet değişince karakteri yeniden giydir (konum/etiket korunur) */
  setOutfit(id, outfit) {
    const e = this.players.get(id);
    if (!e) return;
    e.data = { ...e.data, outfit };
    const h = Math.abs(hash(e.data.id + e.data.name));
    const ng = makeCharacter(new THREE.Color(e.data.color), { skin: SKIN[h % SKIN.length], seed: h, outfit });
    ng.position.copy(e.g.position);
    ng.rotation.y = e.g.rotation.y;
    ng.visible = e.g.visible;
    ng.add(e.label, e.talk);
    if (e.carMesh) ng.add(e.carMesh);
    this.scene.remove(e.g);
    this.unpick(id);
    // e.g nesnesini yerinde değiştir: oyuncu kontrolcüsü aynı nesneyi tutar
    e.g.clear();
    for (const c of [...ng.children]) e.g.add(c);
    e.g.userData = ng.userData;
    this.markPick(e.g, 'player', id);
    this.scene.add(e.g);
  }

  setCar(e, model) {
    if ((e.car ?? '') === (model ?? '')) return;
    e.car = model ?? '';
    if (e.carMesh) { e.g.remove(e.carMesh); e.carMesh = null; }
    if (model) { e.carMesh = makeCar(model); e.carMesh.position.set(-0.6, 0, -0.4); e.g.add(e.carMesh); }
  }

  removePlayer(id) {
    const e = this.players.get(id);
    if (!e || id === this.selfId) return;
    this.scene.remove(e.g);
    this.unpick(id);
    this.players.delete(id);
  }

  getPlayer(id) { return this.players.get(id); }

  applyPlayers(list) {
    const seen = new Set();
    for (const [id, x, z, rotY, pose, weapon, inside, car, rideWith] of list) {
      seen.add(id);
      if (id === this.selfId) continue;
      const e = this.players.get(id);
      if (!e) continue;
      Object.assign(e.target, { x, z, rotY });
      e.pose = POSES[pose] ?? '';
      e.weapon = WEAPON_CODES[weapon] ?? 'fist';
      this.setCar(e, car > 0 ? CAR_CODES[car] ?? '' : '');
      e.seat = car < 0 ? -car : 0;
      e.rideWith = rideWith || null;
      if ((inside || 0) !== e.inside) { e.inside = inside || 0; e.g.position.set(x, 0, z); }
    }
  }

  // ---------- NPC ----------
  addNpc(n) {
    if (this.npcs.has(n.id) || !this.freeIdx.length) return;
    const idx = this.freeIdx.pop();
    const h = Math.abs(hash(n.id));
    const P = this.npcParts;
    const shirt = new THREE.Color(JOB_COLORS[n.job] ?? 0xaaaaaa).offsetHSL(((h >> 7) & 15) / 150, 0, ((h & 15) / 15 - 0.5) * 0.15);
    const pants = new THREE.Color(PANTS[h % PANTS.length]);
    const skin = new THREE.Color(SKIN[h % SKIN.length]);
    P.torso.setColorAt(idx, shirt);
    P.hips.setColorAt(idx, pants);
    P.head.setColorAt(idx, skin);
    P.hair.setColorAt(idx, new THREE.Color(HAIR[(h >> 3) % HAIR.length]));
    P.arm.setColorAt(idx * 2, shirt); P.arm.setColorAt(idx * 2 + 1, shirt);
    P.leg.setColorAt(idx * 2, pants); P.leg.setColorAt(idx * 2 + 1, pants);
    for (const m of Object.values(P)) m.instanceColor.needsUpdate = true;
    const off = { x: (((h >> 3) & 255) / 255 - 0.5) * 3.6, z: (((h >> 11) & 255) / 255 - 0.5) * 3.6 };
    this.npcs.set(n.id, { id: n.id, idx, x: n.x ?? 0, z: n.z ?? 0, tx: n.x ?? 0, tz: n.z ?? 0, rot: 0, visible: false, off, phase: h & 63, shirt, speed: 0 });
    this.idxToNpc.set(idx, n.id);
  }

  hideNpc(n) {
    const P = this.npcParts;
    for (const k of ['torso', 'hips', 'head', 'hair']) P[k].setMatrixAt(n.idx, this._zero);
    for (const k of ['arm', 'leg']) { P[k].setMatrixAt(n.idx * 2, this._zero); P[k].setMatrixAt(n.idx * 2 + 1, this._zero); }
    for (const m of Object.values(P)) m.instanceMatrix.needsUpdate = true;
  }

  removeNpc(id) {
    const n = this.npcs.get(id);
    if (!n) return;
    this.hideNpc(n);
    this.setRobber(id, false);
    this.freeIdx.push(n.idx);
    this.idxToNpc.delete(n.idx);
    this.npcs.delete(id);
  }

  setOutdoorVisible(on) {
    for (const m of Object.values(this.npcParts)) m.visible = on;
    for (const u of this.units.values()) u.g.visible = on;
    for (const v of this.vehicles.values()) v.g.visible = on;
    for (const r of this.robberRings.values()) r.visible = on;
    this.outdoor = on;
  }

  npcPos(id) { const n = this.npcs.get(id); return n?.visible ? { x: n.x, z: n.z } : null; }

  setRobber(id, on) {
    const n = this.npcs.get(id);
    const old = this.robberRings.get(id);
    if (old) { this.scene.remove(old); this.robberRings.delete(id); }
    if (!n) return;
    this.npcParts.torso.setColorAt(n.idx, on ? new THREE.Color(0x111111) : n.shirt);
    this.npcParts.torso.instanceColor.needsUpdate = true;
    if (on) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 24), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.3;
      const tag = textSprite('🚨 SOYGUNCU', { color: '#ff4040', border: '#ff4040', scale: 0.8 });
      tag.position.y = 4.4;
      tag.material.depthTest = false;
      g.add(ring, tag);
      g.renderOrder = 20;
      this.scene.add(g);
      this.robberRings.set(id, g);
    }
  }

  applyNpcs(list) {
    for (const [id, x, z, vis] of list) {
      const n = this.npcs.get(id);
      if (!n) continue;
      const tx = x + n.off.x;
      const tz = z + n.off.z;
      if (vis && !n.visible) { n.x = tx; n.z = tz; }
      n.tx = tx;
      n.tz = tz;
      if (!vis && n.visible) this.hideNpc(n);
      n.visible = !!vis;
    }
  }

  // ---------- Birlikler ----------
  addUnit(u) {
    if (this.units.has(u.id)) return;
    const g = u.air ? makeAircraft(u.type, new THREE.Color(u.color)) : makeUnit(u.type, new THREE.Color(u.color));
    g.position.set(u.x, u.alt ?? 0, u.z);
    g.rotation.y = u.rotY ?? 0;
    this.markPick(g, 'unit', u.id);
    g.visible = this.outdoor !== false;
    this.scene.add(g);
    this.units.set(u.id, { ...u, g, target: { x: u.x, z: u.z, rot: u.rotY ?? 0, aim: u.rotY ?? 0, hp: 1, alt: u.alt ?? 0 }, speed: 0 });
  }

  removeUnit(id) {
    const u = this.units.get(id);
    if (!u) return null;
    this.scene.remove(u.g);
    this.unpick(id);
    this.units.delete(id);
    return u;
  }

  applyUnits(list) {
    for (const [id, x, z, rot, hp, aim, alt] of list) {
      const u = this.units.get(id);
      if (u) Object.assign(u.target, { x, z, rot, hp, aim, alt: alt ?? 0 });
    }
  }

  // ---------- Araçlar ----------
  addVehicle(v) {
    if (this.vehicles.has(v.id)) return;
    const g = v.kind === 'courier' ? makeMoped() : (v.era ?? 4) < 3 ? makeCart(v.product) : makeTruck(v.product);
    g.position.set(v.x, 0, v.z);
    this.scene.add(g);
    this.vehicles.set(v.id, { ...v, g, target: { x: v.x, z: v.z, rot: 0 } });
  }

  removeVehicle(id) {
    const v = this.vehicles.get(id);
    if (!v) return null;
    this.scene.remove(v.g);
    this.vehicles.delete(id);
    return v;
  }

  applyVehicles(list) {
    for (const [id, x, z, rot] of list) {
      const v = this.vehicles.get(id);
      if (v) Object.assign(v.target, { x, z, rot });
    }
  }

  // ---------- Seçim ----------
  markPick(g, kind, id) {
    g.traverse((m) => { if (m.isMesh) { m.userData = { kind, id }; this.pickables.push(m); } });
  }
  unpick(id) { this.pickables = this.pickables.filter((m) => m.userData.id !== id); }

  pickNpc(raycaster) {
    this.npcBodies.boundingSphere = null;
    this.npcBodies.computeBoundingSphere();
    const hit = raycaster.intersectObject(this.npcBodies, false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    const id = this.idxToNpc.get(hit.instanceId);
    return id ? { kind: 'npc', id, distance: hit.distance } : null;
  }

  // ---------- Kare ----------
  update(dt, selfGroup) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 10);

    const now = performance.now();
    for (const e of this.players.values()) {
      e.attackT = Math.max(0, e.attackT - dt);
      e.talk.visible = now < e.talkUntil;
      if (e.talk.visible) e.talk.position.y = 4.8 + Math.sin(now / 120) * 0.08;
      if (e.id === this.selfId) continue;
      e.g.visible = e.inside === this.selfInside;
      const p = e.g.position;
      const ox = p.x, oz = p.z;
      p.x += (e.target.x - p.x) * k;
      p.z += (e.target.z - p.z) * k;
      e.g.rotation.y = lerpAngle(e.g.rotation.y, e.target.rotY, k);
      e.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 0.001);
      setWeapon(e.g, e.weapon);
      animateWalk(e.g, e.pose ? 0 : e.speed, dt, { pose: e.car || e.seat ? 'drive' : e.pose, seat: e.seat, attackT: e.attackT, gun: !e.car && (e.weapon === 'pistol' || e.weapon === 'rifle') ? e.weapon : null });
    }

    if (selfGroup) {
      this.selfRing.position.x = selfGroup.position.x;
      this.selfRing.position.z = selfGroup.position.z;
      this.selfRing.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.3;
    }

    // NPC instanced güncelleme (kol/bacak sallanır)
    const kn = 1 - Math.exp(-dt * 5);
    const P = this.npcParts;
    const cx = this.camX ?? 0, cz = this.camZ ?? 0;
    const UP = THREE.Object3D.DEFAULT_UP;
    let dirty = false;
    for (const n of this.npcs.values()) {
      if (!n.visible) continue;
      const dx = n.tx - n.x, dz = n.tz - n.z;
      const ox = n.x, oz = n.z;
      const moving = dx * dx + dz * dz > 0.02;
      if (moving) n.rot = lerpAngle(n.rot, Math.atan2(dx, dz), kn);
      n.x += dx * kn;
      n.z += dz * kn;
      n.speed += (Math.hypot(n.x - ox, n.z - oz) / Math.max(dt, 0.001) - n.speed) * 0.2;
      const rb = this.robberRings.get(n.id);
      if (rb) { rb.position.set(n.x, 0, n.z); rb.children[0].rotation.z += dt * 3; }
      if (Math.abs(n.x - cx) + Math.abs(n.z - cz) > 420) continue; // uzaktakileri güncelleme
      n.phase += dt * (4 + n.speed * 0.9);
      const amp = n.speed > 0.4 ? Math.min(0.75, 0.2 + n.speed * 0.08) : 0;
      const sw = Math.sin(n.phase) * amp;
      const bob = amp ? Math.abs(Math.cos(n.phase)) * 0.06 : 0;
      this._q.setFromAxisAngle(UP, n.rot);
      this._m.compose(this._v.set(n.x, bob, n.z), this._q, this._s);
      for (const k of ['torso', 'hips', 'head', 'hair']) P[k].setMatrixAt(n.idx, this._m);
      const limb = (mesh, i, lx, ly, ang) => {
        this._m2.copy(this._m).multiply(this._rx.makeTranslation(lx, ly, 0)).multiply(this._rx.makeRotationX(ang));
        mesh.setMatrixAt(i, this._m2);
      };
      limb(P.arm, n.idx * 2, -0.56, 2.42, -sw * 0.8);
      limb(P.arm, n.idx * 2 + 1, 0.56, 2.42, sw * 0.8);
      limb(P.leg, n.idx * 2, -0.2, 1.4, sw);
      limb(P.leg, n.idx * 2 + 1, 0.2, 1.4, -sw);
      dirty = true;
    }
    if (dirty) for (const m of Object.values(P)) m.instanceMatrix.needsUpdate = true;

    const ku = 1 - Math.exp(-dt * 8);
    for (const u of this.units.values()) {
      const p = u.g.position;
      const ox = p.x, oz = p.z;
      p.x += (u.target.x - p.x) * ku;
      p.z += (u.target.z - p.z) * ku;
      u.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 0.001);
      if (u.g.userData.air) {
        p.y += (u.target.alt - p.y) * ku;
        const prev = u.g.rotation.y;
        u.g.rotation.y = lerpAngle(u.g.rotation.y, u.target.rot, ku);
        u.g.rotation.z = THREE.MathUtils.clamp((u.g.rotation.y - prev) * -25, -0.6, 0.6);
        if (u.g.userData.rotor) { u.g.userData.rotor.rotation.y += dt * 25; u.g.userData.tailRotor.rotation.x += dt * 30; }
        continue;
      }
      if (u.speed > 0.5) u.g.rotation.y = lerpAngle(u.g.rotation.y, u.target.rot, ku);
      if (u.g.userData.turret) u.g.userData.turret.rotation.y = lerpAngle(u.g.userData.turret.rotation.y, u.target.aim - u.g.rotation.y, ku);
      if (u.g.userData.soldiers) for (const s of u.g.userData.soldiers) animateWalk(s, u.speed, dt);
      if (u.g.userData.siren) { const on = Math.floor(performance.now() / 180) % 2; u.g.userData.siren[0].visible = !!on; u.g.userData.siren[1].visible = !on; }
      if (u.g.userData.horse) animateHorse(u.g.userData.horse, u.speed, dt);
      const bar = u.g.userData.hpBar;
      bar.scale.x = 3 * Math.max(0.05, u.target.hp);
      bar.material.color.setHSL(0.33 * u.target.hp, 1, 0.5);
    }

    const kv = 1 - Math.exp(-dt * 5);
    for (const v of this.vehicles.values()) {
      const p = v.g.position;
      const ox = p.x, oz = p.z;
      p.x += (v.target.x - p.x) * kv;
      p.z += (v.target.z - p.z) * kv;
      v.g.rotation.y = lerpAngle(v.g.rotation.y, v.target.rot, kv);
      if (v.g.userData.horse) animateHorse(v.g.userData.horse, Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 0.001), dt);
    }
  }

  unitPositions() {
    return [...this.units.values()].map((u) => ({ id: u.id, ownerId: u.ownerId, x: u.g.position.x, z: u.g.position.z, color: u.color, air: !!u.g.userData.air }));
  }
}

export { animateWalk, glowTexture };
