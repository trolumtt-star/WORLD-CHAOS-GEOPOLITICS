import * as THREE from 'three';
import { textSprite, glowTexture } from '../render/geometry.js';

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
export function makeCharacter(shirt, { scale = 1, pants = 0x2c3e50, skin = 0xf1c27d } = {}) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.7, 4, 10), shirtMat);
  torso.position.y = 1.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), skinMat);
  head.position.y = 2.6;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b1d12 }));
  hair.position.y = 2.65;
  const mk = (geo, mat, x, y) => { const pivot = new THREE.Group(); pivot.position.set(x, y, 0); const m = new THREE.Mesh(geo, mat); m.position.y = -geo.parameters.height / 2; m.castShadow = true; pivot.add(m); return pivot; };
  const legL = mk(new THREE.BoxGeometry(0.32, 1.1, 0.34), pantsMat, -0.22, 1.15);
  const legR = mk(new THREE.BoxGeometry(0.32, 1.1, 0.34), pantsMat, 0.22, 1.15);
  const armL = mk(new THREE.BoxGeometry(0.24, 0.95, 0.26), shirtMat, -0.66, 2.05);
  const armR = mk(new THREE.BoxGeometry(0.24, 0.95, 0.26), shirtMat, 0.66, 2.05);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), skinMat);
  nose.position.set(0, 2.58, 0.42);
  for (const m of [torso, head]) m.castShadow = true;
  g.add(torso, head, hair, legL, legR, armL, armR, nose);
  g.scale.setScalar(scale);
  g.userData.limbs = { legL, legR, armL, armR };
  g.userData.phase = Math.random() * 10;
  return g;
}

function animateWalk(g, speed, dt) {
  const L = g.userData.limbs;
  if (!L) return;
  g.userData.phase += dt * (6 + speed * 0.6);
  const a = speed > 0.3 ? Math.sin(g.userData.phase) * Math.min(0.8, 0.25 + speed * 0.04) : 0;
  L.legL.rotation.x = a;
  L.legR.rotation.x = -a;
  L.armL.rotation.x = -a * 0.8;
  L.armR.rotation.x = a * 0.8;
}

// ----------------------------------------------------------------------- askeri modeller
function makeUnit(type, color) {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8 });
  const team = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  if (type === 'tank') {
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
    // Piyade mangası: 4 asker
    const offsets = [[0, 1.2], [-1.2, 0], [1.2, 0], [0, -1.2]];
    g.userData.soldiers = [];
    for (const [x, z] of offsets) {
      const s = makeCharacter(0x556b2f, { scale: 0.7, pants: 0x3d4a24, skin: 0xe0ac69 });
      s.position.set(x, 0, z);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), olive);
      helmet.position.y = 2.7;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.3), team);
      band.position.set(-0.66, 1.9, 0);
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.3), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      rifle.position.set(0.4, 1.8, 0.5);
      s.add(helmet, band, rifle);
      g.add(s);
      g.userData.soldiers.push(s);
    }
  }
  const hp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x3dff6a, depthTest: false }));
  hp.scale.set(3, 0.3, 1);
  hp.position.y = type === 'tank' ? 4.5 : 3.4;
  hp.renderOrder = 20;
  g.add(hp);
  g.userData.hpBar = hp;
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

    // NPC'ler: 2 InstancedMesh ile yüzlerce kişi = 2 draw call
    this.npcCap = 400;
    this.npcBodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.42, 1.0, 3, 8).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), this.npcCap);
    this.npcHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.36, 10, 8).translate(0, 2.35, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), this.npcCap);
    for (const m of [this.npcBodies, this.npcHeads]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
    }
    this.npcBodies.userData = { kind: 'npcInstanced' };
    this.freeIdx = [];
    for (let i = this.npcCap - 1; i >= 0; i--) this.freeIdx.push(i);
    this.idxToNpc = new Map();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.npcCap; i++) {
      this.npcBodies.setMatrixAt(i, this._zero);
      this.npcHeads.setMatrixAt(i, this._zero);
    }

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
    const g = makeCharacter(new THREE.Color(p.color), { skin: SKIN[Math.abs(hash(p.id)) % SKIN.length] });
    const label = textSprite(p.name + (p.title && p.title !== 'Vatandaş' ? ` · ${p.title}` : ''), { color: p.color, border: p.color, scale: 0.75 });
    label.position.y = 3.8;
    label.renderOrder = 15;
    label.material.depthTest = false;
    g.add(label);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.rotY ?? 0;
    this.markPick(g, 'player', p.id);
    this.scene.add(g);
    const e = { id: p.id, g, label, target: { x: p.x, z: p.z, rotY: p.rotY ?? 0 }, last: { x: p.x, z: p.z }, speed: 0 };
    this.players.set(p.id, e);
    return e;
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
    for (const [id, x, z, rotY] of list) {
      seen.add(id);
      if (id === this.selfId) continue;
      const e = this.players.get(id);
      if (e) Object.assign(e.target, { x, z, rotY });
    }
  }

  // ---------- NPC ----------
  addNpc(n) {
    if (this.npcs.has(n.id) || !this.freeIdx.length) return;
    const idx = this.freeIdx.pop();
    const h = hash(n.id);
    this.npcBodies.setColorAt(idx, new THREE.Color(JOB_COLORS[n.job] ?? 0xaaaaaa).offsetHSL(0, 0, ((h & 15) / 15 - 0.5) * 0.1));
    this.npcHeads.setColorAt(idx, new THREE.Color(SKIN[Math.abs(h) % SKIN.length]));
    this.npcBodies.instanceColor.needsUpdate = this.npcHeads.instanceColor.needsUpdate = true;
    const off = { x: (((h >> 3) & 255) / 255 - 0.5) * 3.6, z: (((h >> 11) & 255) / 255 - 0.5) * 3.6 };
    this.npcs.set(n.id, { id: n.id, idx, x: n.x ?? 0, z: n.z ?? 0, tx: n.x ?? 0, tz: n.z ?? 0, rot: 0, visible: false, off, phase: h & 63 });
    this.idxToNpc.set(idx, n.id);
  }

  removeNpc(id) {
    const n = this.npcs.get(id);
    if (!n) return;
    this.npcBodies.setMatrixAt(n.idx, this._zero);
    this.npcHeads.setMatrixAt(n.idx, this._zero);
    this.freeIdx.push(n.idx);
    this.idxToNpc.delete(n.idx);
    this.npcs.delete(id);
    this.npcBodies.instanceMatrix.needsUpdate = this.npcHeads.instanceMatrix.needsUpdate = true;
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
      if (!vis && n.visible) {
        this.npcBodies.setMatrixAt(n.idx, this._zero);
        this.npcHeads.setMatrixAt(n.idx, this._zero);
      }
      n.visible = !!vis;
    }
  }

  // ---------- Birlikler ----------
  addUnit(u) {
    if (this.units.has(u.id)) return;
    const g = makeUnit(u.type, new THREE.Color(u.color));
    g.position.set(u.x, 0, u.z);
    g.rotation.y = u.rotY ?? 0;
    this.markPick(g, 'unit', u.id);
    this.scene.add(g);
    this.units.set(u.id, { ...u, g, target: { x: u.x, z: u.z, rot: u.rotY ?? 0, aim: u.rotY ?? 0, hp: 1 }, speed: 0 });
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
    for (const [id, x, z, rot, hp, aim] of list) {
      const u = this.units.get(id);
      if (u) Object.assign(u.target, { x, z, rot, hp, aim });
    }
  }

  // ---------- Araçlar ----------
  addVehicle(v) {
    if (this.vehicles.has(v.id)) return;
    const g = makeTruck(v.product);
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

    for (const e of this.players.values()) {
      if (e.id === this.selfId) continue;
      const p = e.g.position;
      const ox = p.x, oz = p.z;
      p.x += (e.target.x - p.x) * k;
      p.z += (e.target.z - p.z) * k;
      e.g.rotation.y = lerpAngle(e.g.rotation.y, e.target.rotY, k);
      e.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 0.001);
      animateWalk(e.g, e.speed, dt);
    }

    if (selfGroup) {
      this.selfRing.position.x = selfGroup.position.x;
      this.selfRing.position.z = selfGroup.position.z;
      this.selfRing.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.3;
    }

    // NPC instanced güncelleme
    const kn = 1 - Math.exp(-dt * 5);
    let dirty = false;
    for (const n of this.npcs.values()) {
      if (!n.visible) continue;
      const dx = n.tx - n.x, dz = n.tz - n.z;
      const moving = dx * dx + dz * dz > 0.02;
      if (moving) n.rot = lerpAngle(n.rot, Math.atan2(dx, dz), kn);
      n.x += dx * kn;
      n.z += dz * kn;
      const bob = moving ? Math.abs(Math.sin(this.time * 9 + n.phase)) * 0.18 : 0;
      this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, n.rot);
      this._m.compose(this._v.set(n.x, bob, n.z), this._q, this._s);
      this.npcBodies.setMatrixAt(n.idx, this._m);
      this.npcHeads.setMatrixAt(n.idx, this._m);
      dirty = true;
    }
    if (dirty || this.npcs.size) this.npcBodies.instanceMatrix.needsUpdate = this.npcHeads.instanceMatrix.needsUpdate = true;

    const ku = 1 - Math.exp(-dt * 8);
    for (const u of this.units.values()) {
      const p = u.g.position;
      const ox = p.x, oz = p.z;
      p.x += (u.target.x - p.x) * ku;
      p.z += (u.target.z - p.z) * ku;
      u.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 0.001);
      if (u.speed > 0.5) u.g.rotation.y = lerpAngle(u.g.rotation.y, u.target.rot, ku);
      if (u.g.userData.turret) u.g.userData.turret.rotation.y = lerpAngle(u.g.userData.turret.rotation.y, u.target.aim - u.g.rotation.y, ku);
      if (u.g.userData.soldiers) for (const s of u.g.userData.soldiers) animateWalk(s, u.speed, dt);
      const bar = u.g.userData.hpBar;
      bar.scale.x = 3 * Math.max(0.05, u.target.hp);
      bar.material.color.setHSL(0.33 * u.target.hp, 1, 0.5);
    }

    const kv = 1 - Math.exp(-dt * 5);
    for (const v of this.vehicles.values()) {
      const p = v.g.position;
      p.x += (v.target.x - p.x) * kv;
      p.z += (v.target.z - p.z) * kv;
      v.g.rotation.y = lerpAngle(v.g.rotation.y, v.target.rot, kv);
    }
  }

  unitPositions() {
    return [...this.units.values()].map((u) => ({ id: u.id, ownerId: u.ownerId, x: u.g.position.x, z: u.g.position.z, color: u.color }));
  }
}

export { animateWalk, glowTexture };
