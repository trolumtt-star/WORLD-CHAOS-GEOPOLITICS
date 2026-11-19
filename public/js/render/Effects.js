import * as THREE from 'three';
import { glowTexture } from './geometry.js';
import { qualityPreset } from './SceneSetup.js';

/**
 * GPU parçacık sistemi: binlerce parçacık TEK draw call (THREE.Points + shader).
 */
class Particles {
  constructor(scene, cap, blending) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.c0 = new Float32Array(cap * 4);
    this.c1 = new Float32Array(cap * 4);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('size', this.aSize);
    this.uniforms = { uScale: { value: 500 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: `attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float uScale;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, drag = 0, grav = 0) {
    const i = this.next;
    this.next = (i + 1) % this.cap;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.c0.set(c0, i * 4);
    this.c1.set(c1, i * 4);
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt) {
    const { pos, vel, life, max, size, col, c0, c1, s0, s1 } = this;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) {
        if (size[i] !== 0) { size[i] = 0; col[i * 4 + 3] = 0; }
        continue;
      }
      life[i] -= dt;
      const t = 1 - Math.max(0, life[i]) / max[i];
      const k = Math.max(0, 1 - this.drag[i] * dt);
      const j = i * 3;
      vel[j] *= k; vel[j + 1] = vel[j + 1] * k + this.grav[i] * dt; vel[j + 2] *= k;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < 0.2) { pos[j + 1] = 0.2; vel[j + 1] *= -0.3; }
      size[i] = s0[i] + (s1[i] - s0[i]) * t;
      const c = i * 4;
      for (let q = 0; q < 4; q++) col[c + q] = c0[c + q] + (c1[c + q] - c0[c + q]) * t;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

const R = () => Math.random() * 2 - 1;
const MISSILE_LOOK = {
  tactical: { len: 4, r: 0.45, color: 0xf2f2f2, nose: 0xd62828, scale: 1 },
  ballistic: { len: 7, r: 0.7, color: 0xe8e8e8, nose: 0x333333, scale: 1.5 },
  nuclear: { len: 10, r: 1.1, color: 0xf2c230, nose: 0x111111, scale: 2.2 },
};

export function missilePosAt(m, now) {
  const s = Math.min(1, Math.max(0, (now - m.start) / m.flightMs));
  return { s, x: m.from.x + (m.to.x - m.from.x) * s, z: m.from.z + (m.to.z - m.from.z) * s, y: 4 * m.apex * s * (1 - s) + 3 };
}

export class Effects {
  constructor(scene, camera, renderer, audio) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.audio = audio;
    const q = qualityPreset().particles;
    this.q = q;
    this.fireP = new Particles(scene, Math.round(2600 * q), THREE.AdditiveBlending);
    this.smokeP = new Particles(scene, Math.round(2200 * q), THREE.NormalBlending);
    this.shake = 0;
    this.flashes = [];
    this.rings = [];
    this.missiles = new Map();
    this.interceptors = [];
    this.alarms = [];
    this.mushrooms = [];
    this.hazardMeshes = [];

    // Önceden eklenmiş patlama ışığı (sonradan eklemek shader derlemesine ve takılmaya yol açar)
    this.light = new THREE.PointLight(0xffaa55, 0, 160, 1.6);
    scene.add(this.light);

    // Mermi izleri
    this.tracerCap = 200;
    this.tracerPos = new Float32Array(this.tracerCap * 6);
    this.tracerCol = new Float32Array(this.tracerCap * 6);
    this.tracerLife = new Float32Array(this.tracerCap);
    this.tracerBase = new Float32Array(this.tracerCap * 3);
    this.tracerNext = 0;
    const tg = new THREE.BufferGeometry();
    this.aTP = new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aTC = new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage);
    tg.setAttribute('position', this.aTP);
    tg.setAttribute('color', this.aTC);
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);

    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffaa44, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }

  // ---------------------------------------------------------------- temel
  addShake(amount, x, z) {
    const d = x === undefined ? 0 : Math.hypot(this.camera.position.x - x, this.camera.position.z - z);
    this.shake = Math.max(this.shake, amount * Math.max(0, 1 - d / 500));
  }

  smoke(x, y, z, s = 1, dark = false) {
    const c = dark ? [0.12, 0.11, 0.1, 0.55] : [0.55, 0.55, 0.55, 0.4];
    this.smokeP.spawn(x, y, z, R() * 0.8, 2.5 + Math.random() * 1.5, R() * 0.8, 3 + Math.random() * 2, 3 * s, 10 * s, c, [c[0] + 0.15, c[1] + 0.15, c[2] + 0.15, 0], 0.3, 0.4);
  }

  fire(x, y, z, s = 1) {
    this.fireP.spawn(x, y, z, R() * 0.6, 3 + Math.random() * 3, R() * 0.6, 0.6 + Math.random() * 0.5, 3 * s, 1 * s, [1, 0.7, 0.2, 0.9], [0.9, 0.15, 0.02, 0], 0.5, 2);
    if (Math.random() < 0.3) this.smoke(x, y + 2, z, 0.8, true);
  }

  explosion(x, y, z, scale = 1, { sound = true } = {}) {
    const n = Math.round(36 * Math.sqrt(scale) * this.q);
    for (let i = 0; i < n; i++) {
      const sp = (8 + Math.random() * 14) * Math.sqrt(scale);
      this.fireP.spawn(x, y, z, R() * sp, Math.random() * sp, R() * sp, 0.5 + Math.random() * 0.6, 4 * scale, 9 * scale, [1, 0.85, 0.4, 1], [0.8, 0.12, 0.02, 0], 2.6, 5);
    }
    for (let i = 0; i < n * 0.8; i++) {
      const sp = (3 + Math.random() * 6) * Math.sqrt(scale);
      this.smokeP.spawn(x, y + 1, z, R() * sp, Math.random() * sp * 0.8 + 1, R() * sp, 2.5 + Math.random() * 2.5, 5 * scale, 16 * scale, [0.2, 0.18, 0.16, 0.75], [0.45, 0.43, 0.42, 0], 1, 1.5);
    }
    for (let i = 0; i < n * 0.6; i++) {
      const sp = 18 + Math.random() * 18;
      this.fireP.spawn(x, y, z, R() * sp, 8 + Math.random() * sp, R() * sp, 0.5 + Math.random() * 0.5, 1.2, 0.3, [1, 0.95, 0.6, 1], [1, 0.4, 0.1, 0], 0.4, -28);
    }
    this.ring(x, Math.max(0.4, y - 0.5), z, 10 * scale, 0.7, 0xffd8a0);
    this.flash(x, y + 4, z, 40 * scale, 0.5);
    if (sound) this.audio?.playAt('explosion', x, z, { size: Math.min(3, scale), minGap: 0 });
    this.addShake(0.8 * Math.min(3, scale), x, z);
  }

  ring(x, y, z, maxR, dur, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur, maxR });
  }

  flash(x, y, z, intensity, dur) {
    this.flashes.push({ x, y, z, intensity, t: 0, dur });
  }

  screenFlash(color = '#fff', ms = 1800) {
    const f = document.getElementById('flash');
    if (!f) return;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = '1';
    requestAnimationFrame(() => {
      f.style.transition = `opacity ${ms}ms ease-out`;
      f.style.opacity = '0';
    });
  }

  melee(a, b) {
    for (let k = 0; k < 6; k++) this.fireP.spawn(b[0] + R(), 1.6, b[1] + R(), R() * 5, 3 + Math.random() * 4, R() * 5, 0.25, 0.8, 0.2, [1, 0.95, 0.7, 1], [1, 0.6, 0.2, 0], 0.5, -20);
    this.audio?.playAt('clang', a[0], a[1], { minGap: 70, vol: 0.8 });
  }

  // Uçaktan yere füze çizgisi + patlama
  airstrike(f) {
    const [fx, fy, fz] = f.from ?? [f.x, 60, f.z];
    const i = this.tracerNext;
    this.tracerNext = (i + 1) % this.tracerCap;
    this.tracerPos.set([fx, fy, fz, f.x, 1, f.z], i * 6);
    this.tracerBase.set([1, 0.7, 0.3], i * 3);
    this.tracerLife[i] = 0.3;
    for (let k = 0; k < 10; k++) {
      const t = k / 10;
      this.smoke(fx + (f.x - fx) * t, fy + (1 - fy) * t, fz + (f.z - fz) * t, 0.6);
    }
    setTimeout(() => this.explosion(f.x, 2, f.z, f.r / 8), 220);
  }

  // B-2'den düşen nükleer bomba (patlamayı 'impact' olayı yapar)
  dropBomb(m) {
    const k = m.small ? 0.45 : 1;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.8 * k, 2.6 * k, 4, 10), new THREE.MeshStandardMaterial({ color: 0x3a3f44, metalness: 0.6 }));
    mesh.position.set(m.x, m.alt, m.z);
    this.scene.add(mesh);
    this.bombs ??= [];
    this.bombs.push({ mesh, start: performance.now(), dur: m.fallMs, x: m.x, z: m.z, alt: m.alt });
    this.audio?.play('whoosh', { vol: m.small ? 0.6 : 1.5, minGap: m.small ? 120 : 0 });
  }

  tracer(a, b, kind, ay) {
    if (kind === 'archer') {
      const i = this.tracerNext;
      this.tracerNext = (i + 1) % this.tracerCap;
      this.tracerPos.set([a[0], 2.2, a[1], b[0] + R(), 1.5, b[1] + R()], i * 6);
      this.tracerBase.set([0.75, 0.55, 0.3], i * 3);
      this.tracerLife[i] = 0.2;
      this.audio?.playAt('whoosh', a[0], a[1], { minGap: 90, vol: 0.4 });
      return;
    }
    if (kind === 'cannon') kind = 'tank';
    if (kind === 'heli') {
      const i = this.tracerNext;
      this.tracerNext = (i + 1) % this.tracerCap;
      this.tracerPos.set([a[0], (ay ?? 22) - 1, a[1], b[0] + R(), 1, b[1] + R()], i * 6);
      this.tracerBase.set([1, 0.85, 0.4], i * 3);
      this.tracerLife[i] = 0.08;
      this.fireP.spawn(b[0], 1, b[1], R() * 3, 3, R() * 3, 0.2, 1.2, 0.2, [1, 0.8, 0.4, 1], [1, 0.3, 0, 0]);
      this.audio?.playAt('rifle', a[0], a[1], { minGap: 60, vol: 0.9 });
      return;
    }
    if (kind === 'musketeer') for (let k = 0; k < 3; k++) this.smoke(a[0] + R(), 1.8, a[1] + R(), 0.5);
    const i = this.tracerNext;
    this.tracerNext = (i + 1) % this.tracerCap;
    const cannon = kind === 'tank';
    const ya = cannon ? 2.6 : 1.4;
    const jitter = cannon ? 0 : 1.2;
    this.tracerPos.set([a[0], ya, a[1], b[0] + R() * jitter, 1 + Math.random() * 2, b[1] + R() * jitter], i * 6);
    const c = cannon ? [1, 0.55, 0.15] : [1, 0.9, 0.45];
    this.tracerBase.set(c, i * 3);
    this.tracerLife[i] = cannon ? 0.18 : 0.08;
    this.fireP.spawn(a[0], ya, a[1], 0, 0.5, 0, 0.08, cannon ? 4 : 1.6, 0.5, [1, 0.9, 0.5, 1], [1, 0.4, 0, 0]);
    if (cannon) {
      this.explosion(b[0], 1.5, b[1], 0.35, { sound: false });
      this.audio?.playAt('cannon', a[0], a[1], { minGap: 60 });
    } else {
      this.fireP.spawn(b[0], 1.2, b[1], R() * 3, 3, R() * 3, 0.15, 1, 0.2, [1, 0.8, 0.4, 1], [1, 0.3, 0, 0]);
      this.audio?.playAt('rifle', a[0], a[1], { minGap: 45, vol: 0.8 });
    }
  }

  built(x, z) {
    for (let i = 0; i < 60 * this.q; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fireP.spawn(x, 2, z, Math.cos(a) * 6, 10 + Math.random() * 10, Math.sin(a) * 6, 1.2 + Math.random(), 1.6, 0.4, [1, 0.85, 0.3, 1], [0.3, 1, 0.5, 0], 0.4, -9);
    }
    this.ring(x, 0.4, z, 22, 1, 0x7dffb0);
    this.audio?.playAt('built', x, z);
  }

  alarm(x, z) {
    const s = new THREE.Sprite(this.glowMat.clone());
    s.material.color.set(0xff2020);
    s.scale.set(10, 10, 1);
    s.position.set(x, 16, z);
    this.scene.add(s);
    this.alarms.push({ s, t: 0 });
    this.audio?.playAt('alarm', x, z, { range: 300 });
  }

  // ---------------------------------------------------------------- füzeler
  addMissile(m) {
    const look = MISSILE_LOOK[m.type] ?? MISSILE_LOOK.tactical;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(look.r, look.r, look.len, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: look.color, metalness: 0.4, roughness: 0.4 }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(look.r, look.r * 3, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: look.nose }));
    nose.position.z = look.len / 2 + look.r * 1.5;
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, look.r * 2.4, look.r * 2), body.material);
      fin.position.z = -look.len / 2 + look.r;
      fin.rotation.z = (i * Math.PI) / 2;
      g.add(fin);
    }
    const flame = new THREE.Sprite(this.glowMat.clone());
    flame.scale.set(4 * look.scale, 4 * look.scale, 1);
    flame.position.z = -look.len / 2 - 0.8;
    g.add(body, nose, flame);
    this.scene.add(g);
    const start = performance.now() - (m.elapsed ?? 0);
    this.missiles.set(m.id, { ...m, start, g, look });
    if ((m.elapsed ?? 0) < 500) {
      this.audio?.playAt('launch', m.from.x, m.from.z, { range: 700 });
      this.explosion(m.from.x, 2, m.from.z, 0.5, { sound: false });
      for (let i = 0; i < 25; i++) this.smoke(m.from.x + R() * 4, 1, m.from.z + R() * 4, 1.5);
    }
  }

  intercept(d) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    const flame = new THREE.Sprite(this.glowMat.clone());
    flame.material.color.set(0x88ccff);
    flame.scale.set(3, 3, 1);
    flame.position.z = -1.6;
    g.add(body, flame);
    g.position.set(d.from.x, d.from.y, d.from.z);
    this.scene.add(g);
    this.interceptors.push({ ...d, g, start: performance.now() });
    this.audio?.playAt('intercept', d.from.x, d.from.z, { range: 600 });
  }

  missileDestroyed(id, x, y, z) {
    const m = this.missiles.get(id);
    if (m) { this.scene.remove(m.g); this.missiles.delete(id); }
    this.explosion(x, y, z, m?.type === 'nuclear' ? 2.5 : 1.4);
  }

  impact(d) {
    const m = this.missiles.get(d.id);
    if (m) { this.scene.remove(m.g); this.missiles.delete(d.id); }
    if (d.type === 'nuclear') this.nuke(d.x, d.z, d.radius);
    else this.explosion(d.x, 2, d.z, d.radius / 9);
  }

  nuke(x, z, radius) {
    this.screenFlash('#ffffff', 2600);
    this.audio?.play('nuke', { minGap: 0, important: true });
    this.explosion(x, 6, z, 6, { sound: false });
    this.ring(x, 0.6, z, radius * 3.2, 3.5, 0xffe0b0);
    this.ring(x, 0.6, z, radius * 1.6, 2, 0xff9a40);
    this.flash(x, 60, z, 400, 4);
    this.shake = 4;

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xff7a30, emissive: 0xff5a10, emissiveIntensity: 2, roughness: 1, transparent: true, opacity: 1, flatShading: true });
    const stemMat = capMat.clone();
    const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), capMat);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 1, 12, 1, true), stemMat);
    const skirt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 24), capMat);
    skirt.rotation.x = Math.PI / 2;
    const base = new THREE.Mesh(new THREE.TorusGeometry(1, 0.4, 8, 32), stemMat);
    base.rotation.x = Math.PI / 2;
    g.add(cap, stem, skirt, base);
    this.scene.add(g);
    this.mushrooms.push({ g, cap, stem, skirt, base, capMat, stemMat, t: 0, x, z, radius });
  }

  setHazards(list) {
    for (const m of this.hazardMeshes) this.scene.remove(m);
    this.hazardMeshes = [];
    for (const h of list ?? []) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(h.radius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6bff3a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      dome.position.set(h.x, 0, h.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(h.radius - 1.5, h.radius, 64), new THREE.MeshBasicMaterial({ color: 0x8bff3a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(h.x, 0.3, h.z);
      this.scene.add(dome, ring);
      this.hazardMeshes.push(dome, ring);
    }
  }

  // ---------------------------------------------------------------- kare
  update(dt) {
    const now = performance.now();
    const h = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.fireP.uniforms.uScale.value = scale;
    this.smokeP.uniforms.uScale.value = scale;

    // Füzeler
    for (const m of this.missiles.values()) {
      const p = missilePosAt(m, now);
      const n = missilePosAt(m, now + 50);
      m.g.position.set(p.x, p.y, p.z);
      if (p.s < 1) m.g.lookAt(n.x, n.y, n.z);
      const back = new THREE.Vector3(0, 0, -m.look.len / 2 - 1).applyQuaternion(m.g.quaternion).add(m.g.position);
      this.fireP.spawn(back.x, back.y, back.z, R(), R(), R(), 0.25, 2.5 * m.look.scale, 0.5, [1, 0.8, 0.3, 1], [1, 0.3, 0, 0]);
      this.smokeP.spawn(back.x, back.y, back.z, R() * 0.5, R() * 0.5, R() * 0.5, 2.5 + Math.random() * 1.5, 1.5 * m.look.scale, 6 * m.look.scale, [0.85, 0.85, 0.85, 0.6], [0.7, 0.7, 0.7, 0], 0.6, 0.3);
    }
    // Önleyiciler
    this.interceptors = this.interceptors.filter((i) => {
      const s = Math.min(1, (now - i.start) / i.flightMs);
      const x = i.from.x + (i.at.x - i.from.x) * s;
      const z = i.from.z + (i.at.z - i.from.z) * s;
      const y = i.from.y + (i.at.y - i.from.y) * s + Math.sin(s * Math.PI) * 15;
      i.g.lookAt(x, y, z);
      i.g.position.set(x, y, z);
      this.smokeP.spawn(x, y, z, 0, 0, 0, 1.5, 1, 4, [0.9, 0.9, 0.95, 0.5], [0.8, 0.8, 0.85, 0], 0, 0.2);
      if (s >= 1) {
        this.scene.remove(i.g);
        if (!i.success) this.explosion(i.at.x + 8, i.at.y, i.at.z, 0.4, { sound: false });
        return false;
      }
      return true;
    });
    // Mantar bulutları
    this.mushrooms = this.mushrooms.filter((m) => {
      m.t += dt;
      const t = m.t;
      const rise = Math.min(1, t / 8);
      const H = 30 + rise * m.radius * 1.4;
      const capR = 8 + rise * m.radius * 0.55;
      m.cap.position.y = H;
      m.cap.scale.set(capR, capR * 0.55, capR);
      m.skirt.position.y = H - capR * 0.3;
      m.skirt.scale.set(capR * 0.9, capR * 0.9, capR * 0.9);
      m.stem.scale.set(capR * 0.25, H, capR * 0.25);
      m.stem.position.y = H / 2;
      const b = Math.min(1, t / 3);
      m.base.scale.set(10 + b * m.radius * 0.9, 10 + b * m.radius * 0.9, 6);
      m.base.position.y = 3;
      const cool = Math.min(1, t / 10);
      m.capMat.emissiveIntensity = 2 * (1 - cool) + 0.05;
      m.capMat.color.setRGB(1 - cool * 0.55, 0.48 - cool * 0.08, 0.19 + cool * 0.2);
      m.stemMat.emissiveIntensity = m.capMat.emissiveIntensity * 0.7;
      m.stemMat.color.copy(m.capMat.color);
      const fade = t > 20 ? Math.max(0, 1 - (t - 20) / 10) : 1;
      m.capMat.opacity = m.stemMat.opacity = fade;
      if (Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        this.smokeP.spawn(m.x + Math.cos(a) * capR, H + R() * capR * 0.3, m.z + Math.sin(a) * capR, Math.cos(a) * 3, 1, Math.sin(a) * 3, 5, capR * 0.5, capR, [0.5, 0.4, 0.35, 0.6 * fade], [0.6, 0.55, 0.5, 0], 0.2, 0.2);
      }
      if (t > 30) { this.scene.remove(m.g); return false; }
      return true;
    });
    // Düşen bombalar
    if (this.bombs) this.bombs = this.bombs.filter((b) => {
      const t = Math.min(1, (now - b.start) / b.dur);
      b.mesh.position.y = b.alt * (1 - t * t);
      if (t >= 1) { this.scene.remove(b.mesh); return false; }
      return true;
    });
    // Halkalar
    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const s = r.t / r.dur;
      r.m.scale.setScalar(1 + s * r.maxR);
      r.m.material.opacity = 0.8 * (1 - s);
      if (s >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); return false; }
      return true;
    });
    // Işık
    let best = null;
    this.flashes = this.flashes.filter((f) => {
      f.t += dt;
      if (f.t >= f.dur) return false;
      const k = f.intensity * (1 - f.t / f.dur);
      if (!best || k > best.k) best = { f, k };
      return true;
    });
    // r155+ fiziksel ışık birimleri: nokta ışık daha yüksek şiddet ister
    this.light.intensity = best ? best.k * 12 : 0;
    if (best) this.light.position.set(best.f.x, best.f.y, best.f.z);
    // Alarmlar
    this.alarms = this.alarms.filter((a) => {
      a.t += dt;
      a.s.material.opacity = 0.5 + 0.5 * Math.sin(a.t * 12);
      if (a.t > 8) { this.scene.remove(a.s); return false; }
      return true;
    });
    // Radyasyon nabzı
    for (const m of this.hazardMeshes) if (m.geometry.type === 'SphereGeometry') m.material.opacity = 0.08 + Math.sin(now / 400) * 0.04;
    // Mermi izleri
    for (let i = 0; i < this.tracerCap; i++) {
      const l = this.tracerLife[i];
      if (l <= 0) continue;
      this.tracerLife[i] = l - dt;
      const k = Math.max(0, this.tracerLife[i]) * 8;
      for (let v = 0; v < 2; v++) for (let c = 0; c < 3; c++) this.tracerCol[i * 6 + v * 3 + c] = this.tracerBase[i * 3 + c] * Math.min(1, k);
    }
    this.aTP.needsUpdate = this.aTC.needsUpdate = true;

    this.fireP.update(dt);
    this.smokeP.update(dt);

    // Kamera sarsıntısı
    this.shake = Math.max(0, this.shake - dt * 2.2);
    return this.shake > 0.01 ? new THREE.Vector3(R() * this.shake, R() * this.shake * 0.6, R() * this.shake) : null;
  }
}
