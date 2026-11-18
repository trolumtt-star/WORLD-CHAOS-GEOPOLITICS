import * as THREE from 'three';

/**
 * PartBuilder: bir binanın onlarca parçasını (duvar, çatı, baca, tente...) vertex renkli
 * TEK bir geometriye birleştirir. Mobilde draw call sayısını bina başı ~2'ye indirir.
 */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class PartBuilder {
  constructor() {
    this.parts = [];
  }

  add(geo, color, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, jitter = 0 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    _c.set(color);
    if (jitter) _c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    this.parts.push(g);
    return this;
  }

  box(w, h, d, x, y, z, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, o); }
  cyl(rt, rb, h, seg, x, y, z, color, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, o); }
  cone(r, h, seg, x, y, z, color, o) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, o); }
  sphere(r, x, y, z, color, o, ws = 10, hs = 8, thetaLen = Math.PI) {
    return this.add(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, thetaLen), color, x, y, z, o);
  }
  plane(w, d, x, y, z, color, o = {}) {
    return this.add(new THREE.PlaneGeometry(w, d), color, x, y, z, { rx: -Math.PI / 2, ...o });
  }
  quad(w, h, x, y, z, color, ry = 0) {
    return this.add(new THREE.PlaneGeometry(w, h), color, x, y, z, { ry });
  }

  get empty() { return this.parts.length === 0; }

  build(material, { shadows = true } = {}) {
    if (this.empty) return null;
    const geo = mergeNonIndexed(this.parts);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    return mesh;
  }
}

export function mergeNonIndexed(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Canvas'tan metin dokusu (tabelalar, isim etiketleri)
export function textSprite(text, { color = '#ffffff', bg = 'rgba(10,12,20,0.7)', font = 'bold 34px system-ui, sans-serif', width = 512, height = 96, scale = 1, border = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const tw = Math.min(width - 16, ctx.measureText(text).width + 40);
  const x = (width - tw) / 2;
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, x, 8, tw, height - 16, 18);
    ctx.fill();
  }
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    roundRect(ctx, x, 8, tw, height - 16, 18);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 2, width - 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set((width / height) * 1.6 * scale, 1.6 * scale, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Yumuşak dairesel doku (parçacıklar, ışık haleleri)
let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
