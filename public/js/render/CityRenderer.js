import * as THREE from 'three';
import { PartBuilder, textSprite } from './geometry.js';
import { createBuildingModel, MAT } from './BuildingFactory.js';

const NAMED = new Set(['market', 'cafe', 'restaurant', 'tech_store', 'gun_shop', 'bar', 'factory', 'palace', 'police', 'bank', 'hospital', 'prison', 'apartment', 'barracks', 'missile_silo', 'air_defense', 'park', 'villa']);
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

/**
 * Şehir: zemin, yollar (kaldırım, şerit çizgisi, yaya geçidi), sokak lambaları, ağaçlar, binalar.
 * Binalar sunucudan gelen BUILDING_UPDATE ile yeniden kurulur (inşaat ilerlemesi, yıkım, sahip bayrağı).
 */
export class CityRenderer {
  constructor(scene, info, buildings, { effects = null } = {}) {
    this.scene = scene;
    this.info = info;
    this.effects = effects;
    this.lotSize = info.blockSize - info.roadWidth - 1;
    this.root = new THREE.Group();
    this.entries = new Map();
    this.colliders = [];
    this.pickables = [];
    this.playerColors = new Map();
    this.time = 0;
    this.smokeTimer = 0;
    this.labelTimer = 0;

    this.buildGround();
    this.buildRoads();
    this.buildLampsAndTrees();
    for (const b of buildings) this.upsert(b);
    scene.add(this.root);
  }

  buildGround() {
    const size = this.info.size * 6;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x5f8a45, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    ground.userData = { kind: 'ground' };
    this.ground = ground;
    this.root.add(ground);
  }

  buildRoads() {
    const { half, size, roadWidth: rw, blockSize: bs, gridSize } = this.info;
    const pb = new PartBuilder();
    const len = size + rw;
    const lines = [];
    for (let i = 0; i <= gridSize; i++) lines.push(-half + i * bs);
    for (const p of lines) {
      pb.plane(len, rw, 0, 0.02, p, 0x33353a);
      pb.plane(rw, len, p, 0.025, 0, 0x33353a);
      // Kaldırımlar
      for (const s of [-1, 1]) {
        pb.box(len, 0.25, 1.6, 0, 0.12, p + s * (rw / 2 + 0.8), 0x9c9a94);
        pb.box(1.6, 0.25, len, p + s * (rw / 2 + 0.8), 0.13, 0, 0x9c9a94);
      }
    }
    // Şerit çizgileri (kavşak içleri hariç)
    for (const p of lines) {
      for (let k = 0; k < gridSize; k++) {
        const a = lines[k] + rw / 2 + 2, b = lines[k + 1] - rw / 2 - 2;
        for (let t = a; t < b; t += 5) {
          pb.plane(2.4, 0.25, t + 1.2, 0.04, p, 0xf2e6a0);
          pb.plane(0.25, 2.4, p, 0.045, t + 1.2, 0xf2e6a0);
        }
      }
    }
    // Yaya geçitleri
    for (const x of lines) for (const z of lines) {
      for (let s = -3; s <= 3; s += 1.5) {
        pb.plane(0.8, 2.4, x + s, 0.05, z + rw / 2 + 1.6, 0xf4f4f4);
        pb.plane(2.4, 0.8, x + rw / 2 + 1.6, 0.05, z + s, 0xf4f4f4);
      }
    }
    const roads = pb.build(MAT.city, { shadows: false });
    roads.receiveShadow = true;
    this.root.add(roads);
  }

  buildLampsAndTrees() {
    const { half, roadWidth: rw, blockSize: bs, gridSize } = this.info;
    const lines = [];
    for (let i = 0; i <= gridSize; i++) lines.push(-half + i * bs);

    const lampPos = [];
    for (const x of lines) for (const z of lines) lampPos.push([x + rw / 2 + 1.2, z + rw / 2 + 1.2]);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), new THREE.MeshStandardMaterial({ color: 0x2b2e33 }), lampPos.length);
    this.lampHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), lampPos.length);
    const m = new THREE.Matrix4();
    lampPos.forEach(([x, z], i) => {
      pole.setMatrixAt(i, m.makeTranslation(x, 3, z));
      this.lampHeads.setMatrixAt(i, m.makeTranslation(x, 6.2, z));
    });
    pole.castShadow = true;
    this.root.add(pole, this.lampHeads);

    // Bulvar ağaçları (dikey yollar boyunca; kapılar yatay yollarda olduğu için engel olmaz)
    const treePos = [];
    for (const x of lines) {
      for (let k = 0; k < gridSize; k++) {
        const a = lines[k] + rw / 2 + 4, b = lines[k + 1] - rw / 2 - 4;
        for (let t = a; t <= b; t += 9) treePos.push([x - rw / 2 - 1.2, t], [x + rw / 2 + 1.2, t + 4]);
      }
    }
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e }), treePos.length);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), treePos.length);
    const col = new THREE.Color();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    treePos.forEach(([x, z], i) => {
      const sc = 0.8 + Math.random() * 0.5;
      trunks.setMatrixAt(i, m.compose(new THREE.Vector3(x, 1.3 * sc, z), q, s.set(sc, sc, sc)));
      crowns.setMatrixAt(i, m.compose(new THREE.Vector3(x, 3.4 * sc, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 3), s.set(sc, sc * 1.1, sc)));
      crowns.setColorAt(i, col.setHSL(0.27 + Math.random() * 0.06, 0.45, 0.32 + Math.random() * 0.1));
      q.identity();
    });
    trunks.castShadow = crowns.castShadow = true;
    this.root.add(trunks, crowns);
  }

  setPlayerColors(map) {
    this.playerColors = map;
  }

  // Bina ekle / güncelle
  upsert(b) {
    const prev = this.entries.get(b.id);
    if (prev) {
      const same = prev.data.type === b.type && prev.data.destroyed === b.destroyed && prev.data.subtype === b.subtype
        && (prev.data.construction?.progress ?? -1) === (b.construction?.progress ?? -1)
        && prev.data.ownerId === b.ownerId && prev.data.forSale === b.forSale && prev.data.price === b.price
        && prev.data.width === b.width;
      const hpChange = prev.data.hp !== b.hp;
      prev.data = { ...prev.data, ...b };
      if (same) {
        if (hpChange) prev.group.userData.hp = b.hp;
        return;
      }
      this.remove(b.id);
    }
    const group = createBuildingModel(b, this.lotSize);
    group.position.set(b.x, 0, b.z);
    group.userData.hp = b.hp;
    for (const m of group.userData.pickMeshes) {
      m.userData = { kind: 'building', id: b.id };
      this.pickables.push(m);
    }

    // Tabelalar
    if (b.forSale && !b.destroyed) {
      const s = textSprite(`SATILIK · ${tl(b.price)}`, { bg: 'rgba(200,30,30,0.92)', font: 'bold 38px system-ui, sans-serif', scale: 1.2 });
      s.position.set(0, (b.type === 'land' ? 6 : b.height + 4), b.depth / 2);
      group.add(s);
    } else if (NAMED.has(b.type) && !b.destroyed && !b.construction) {
      const s = textSprite(b.name, { scale: b.type === 'palace' ? 1.6 : 1 });
      s.position.set(0, group.userData.extras.signY, 0);
      s.userData.isLabel = true;
      group.add(s);
    }
    if (b.construction) {
      const s = textSprite(`🏗️ İNŞAAT %${Math.round(b.construction.progress * 100)}`, { bg: 'rgba(230,160,20,0.92)', color: '#1a1a1a' });
      s.position.set(0, Math.max(b.height * b.construction.progress, 4) + 6, 0);
      group.add(s);
    }
    // Oyuncu mülkü bayrağı
    if (b.ownerId && !b.destroyed) {
      const color = this.playerColors.get(b.ownerId) ?? '#ffffff';
      const fx = this.lotSize / 2 - 1.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      pole.position.set(-fx, 3.5, fx);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      flag.position.set(-fx + 1.3, 6.2, fx);
      group.add(pole, flag);
      group.userData.flag = flag;
    }

    this.root.add(group);
    const collider = (b.type !== 'land' && b.type !== 'park' && !b.destroyed)
      ? { id: b.id, x: b.x, z: b.z, hw: b.width / 2, hd: (b.type === 'palace' ? b.depth : b.depth) / 2 }
      : null;
    if (collider) this.colliders.push(collider);
    this.entries.set(b.id, { data: { ...b }, group, collider });
  }

  remove(id) {
    const e = this.entries.get(id);
    if (!e) return;
    this.root.remove(e.group);
    e.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Object.values(MAT).includes(o.material)) { o.material.map?.dispose(); o.material.dispose(); }
    });
    this.pickables = this.pickables.filter((m) => m.userData.id !== id);
    if (e.collider) this.colliders = this.colliders.filter((c) => c !== e.collider);
    this.entries.delete(id);
  }

  get(id) { return this.entries.get(id)?.data; }

  nearestBuilding(x, z, maxDist = 30) {
    let best = null;
    let bd = maxDist;
    for (const { data: b } of this.entries.values()) {
      const d = Math.hypot(b.door.x - x, b.door.z - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  update(dt, camera, night) {
    this.time += dt;
    this.lampHeads.material.color.setRGB(0.35 + night * 0.65, 0.33 + night * 0.55, 0.3 + night * 0.35);

    this.smokeTimer -= dt;
    const emit = this.smokeTimer <= 0;
    if (emit) this.smokeTimer = 0.25;

    this.labelTimer -= dt;
    const doLabels = this.labelTimer <= 0;
    if (doLabels) this.labelTimer = 0.4;

    for (const { data: b, group } of this.entries.values()) {
      const ex = group.userData.extras;
      if (ex.radar) ex.radar.rotation.y += dt * 1.6;
      if (ex.blinkers.length) {
        const on = Math.floor(this.time * 3) % 2;
        ex.blinkers[0].visible = !!on;
        ex.blinkers[1].visible = !on;
      }
      if (group.userData.flag) group.userData.flag.rotation.y = Math.sin(this.time * 2 + b.x) * 0.25;

      if (doLabels) {
        const d = camera.position.distanceTo(group.position);
        for (const c of group.children) if (c.userData.isLabel) c.visible = d < 170;
      }

      if (emit && this.effects) {
        if (b.active && ex.chimneys.length && Math.random() < 0.8) {
          const c = ex.chimneys[Math.floor(Math.random() * ex.chimneys.length)];
          this.effects.smoke(b.x + c.x, c.y, b.z + c.z, 1);
        }
        if (b.destroyed && Math.random() < 0.35) this.effects.smoke(b.x + (Math.random() - 0.5) * 8, 2, b.z + (Math.random() - 0.5) * 8, 1.6, true);
        else if (!b.destroyed && b.hp < 0.6 && b.type !== 'land' && Math.random() < 0.5) {
          this.effects.fire(b.x + (Math.random() - 0.5) * b.width * 0.6, b.height * 0.6, b.z + (Math.random() - 0.5) * b.depth * 0.6);
        }
      }
    }
  }
}

// Menü arka planı için sahte şehir
export function fakeCity(gridSize = 8, blockSize = 44, roadWidth = 9) {
  const half = (gridSize * blockSize) / 2;
  const types = [['apartment', 4], ['house', 5], ['villa', 1], ['market', 1.2], ['cafe', 1], ['restaurant', 1], ['bar', 0.8], ['tech_store', 0.5], ['factory', 1.2], ['park', 0.8], ['bank', 0.3], ['police', 0.3], ['hospital', 0.3]];
  const total = types.reduce((s, [, w]) => s + w, 0);
  const pick = () => { let r = Math.random() * total; for (const [t, w] of types) if ((r -= w) <= 0) return t; return 'house'; };
  const maxFoot = blockSize - roadWidth - 4;
  const buildings = [];
  let id = 0;
  const c = (gridSize - 1) / 2;
  for (let i = 0; i < gridSize; i++) for (let j = 0; j < gridSize; j++) {
    const center = i === Math.floor(c) && j === Math.floor(c);
    const r = Math.max(Math.abs(i - c), Math.abs(j - c)) / (gridSize / 2);
    let type = center ? 'palace' : pick();
    if (r < 0.4 && type === 'house') type = 'apartment';
    if (r > 0.75 && Math.random() < 0.3) type = 'factory';
    const x = -half + i * blockSize + blockSize / 2;
    const z = -half + j * blockSize + blockSize / 2;
    const tall = type === 'apartment' ? 14 + Math.random() * (r < 0.4 ? 30 : 12) : type === 'palace' ? 22 : type === 'factory' ? 12 : 5 + Math.random() * 4;
    buildings.push({
      id: `f${id++}`, type, subtype: type === 'factory' ? ['food', 'drink', 'steel', 'electronics', 'arms'][Math.floor(Math.random() * 5)] : null,
      variant: Math.floor(Math.random() * 4), name: '', x, z,
      width: Math.round(type === 'palace' || type === 'factory' || type === 'park' ? maxFoot : 14 + Math.random() * (maxFoot - 14)),
      depth: Math.round(type === 'palace' || type === 'factory' || type === 'park' ? maxFoot : 14 + Math.random() * (maxFoot - 14)),
      height: Math.round(tall), door: { x, z: z + blockSize / 2 },
      ownerKind: 'state', ownerId: null, forSale: false, price: 0, construction: null, hp: 1, destroyed: false, active: type === 'factory',
    });
  }
  return { info: { gridSize, blockSize, roadWidth, size: gridSize * blockSize, half }, buildings };
}
