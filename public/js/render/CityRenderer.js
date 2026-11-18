import * as THREE from 'three';
import { PartBuilder, textSprite } from './geometry.js';
import { createBuildingModel, MAT } from './BuildingFactory.js';

const NAMED = new Set(['town_hall', 'market', 'cafe', 'restaurant', 'tech_store', 'gun_shop', 'bar', 'factory', 'palace', 'police', 'bank', 'hospital', 'prison', 'apartment', 'barracks', 'missile_silo', 'air_defense', 'park', 'villa']);
const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

/**
 * Şehir: zemin, yollar (kaldırım, şerit çizgisi, yaya geçidi), sokak lambaları, ağaçlar, binalar.
 * Binalar sunucudan gelen BUILDING_UPDATE ile yeniden kurulur (inşaat ilerlemesi, yıkım, sahip bayrağı).
 */
export class CityRenderer {
  constructor(scene, info, buildings, { effects = null, tiles = null, playerColors = null } = {}) {
    this.scene = scene;
    this.info = info;
    this.effects = effects;
    this.lotSize = info.blockSize - info.roadWidth - 1;
    this.root = new THREE.Group();
    this.entries = new Map();
    this.colliders = [];
    this.pickables = [];
    this.playerColors = playerColors ?? new Map();
    this.playerEras = new Map();
    this.time = 0;
    this.smokeTimer = 0;
    this.labelTimer = 0;
    this.tiles = decodeTiles(info, tiles);
    this.terrainParts = null;

    this.buildGround();
    for (const b of buildings) this.upsert(b);
    this.terrainParts = [];
    this.rebuildTerritory();
    scene.add(this.root);
  }

  // ------------------------------------------------------------ arazi
  tile(i, j) {
    const g = this.info.gridSize;
    if (i < 0 || j < 0 || i >= g || j >= g) return null;
    return this.tiles[j * g + i];
  }

  setTiles(list) {
    for (const [i, j, owner, terrain] of list) {
      const t = this.tile(i, j);
      if (t) { t.owner = owner; if (terrain) t.terrain = terrain; }
    }
    this.scheduleRebuild();
  }

  scheduleRebuild() {
    if (this._rebuildQueued) return;
    this._rebuildQueued = true;
    setTimeout(() => { this._rebuildQueued = false; this.rebuildTerritory(); }, 30);
  }

  buildGround() {
    const size = this.info.size * 5;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x5f8a45, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    ground.userData = { kind: 'ground' };
    this.ground = ground;
    this.root.add(ground);
  }

  isAsphalt(owner) {
    if (!owner) return false;
    return owner === 'state' || (this.playerEras.get(owner) ?? 1) >= 4;
  }

  rebuildTerritory() {
    for (const o of this.terrainParts) {
      this.root.remove(o);
      o.geometry?.dispose();
    }
    this.terrainParts = [];
    const add = (o) => { if (o) { this.root.add(o); this.terrainParts.push(o); } };
    const { half, blockSize: bs, roadWidth: rw, gridSize: g } = this.info;
    const tileCenter = (t) => ({ x: -half + t.i * bs + bs / 2, z: -half + t.j * bs + bs / 2 });
    const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

    // 1) Zemin: parsel parsel renk (oyuncu toprakları hafif kendi renginde)
    const ground = new PartBuilder();
    const water = new PartBuilder();
    const COL = { p: 0x7fb069, f: 0x4f8a3c, m: 0x8d877b };
    const tint = new THREE.Color();
    for (const t of this.tiles) {
      const c = tileCenter(t);
      if (t.terrain === 'w') {
        water.plane(bs, bs, c.x, 0.04, c.z, 0x2f86c4);
        ground.plane(bs + 2, bs + 2, c.x, 0.0, c.z, 0xc9b98a);
        continue;
      }
      tint.set(COL[t.terrain] ?? COL.p);
      if (t.owner && t.owner !== 'state') tint.lerp(new THREE.Color(this.playerColors.get(t.owner) ?? '#ffffff'), 0.12);
      if (t.owner === 'state') tint.set(0x8fa87a);
      ground.plane(bs, bs, c.x, 0.01, c.z, tint.getHex());
    }
    const gm = ground.build(MAT.city, { shadows: false });
    gm.receiveShadow = true;
    gm.userData = { kind: 'ground' };
    add(gm);
    const wm = water.build(MAT.water, { shadows: false });
    if (wm) { wm.userData = { kind: 'ground' }; add(wm); }

    // 2) Yollar: yerleşik parsellerin kenarında (kasaba / ileri çağ = asfalt, köy = toprak yol)
    const roads = new PartBuilder();
    const lamps = [];
    const seg = (x, z, horiz, asphalt) => {
      const w = asphalt ? rw : 6;
      const col = asphalt ? 0x33353a : 0x9a7b55;
      if (horiz) roads.plane(bs + w, w, x, asphalt ? 0.03 : 0.025, z, col);
      else roads.plane(w, bs + w, x, asphalt ? 0.032 : 0.027, z, col);
      if (asphalt) {
        for (const k of [-0.25, 0.25]) {
          if (horiz) roads.plane(bs * 0.3, 0.25, x + k * bs, 0.04, z, 0xf2e6a0);
          else roads.plane(0.25, bs * 0.3, x, 0.042, z + k * bs, 0xf2e6a0);
        }
      }
    };
    const ownerOf = (t) => t?.owner ?? null;
    for (let j = 0; j <= g; j++) for (let i = 0; i < g; i++) {
      const a = ownerOf(this.tile(i, j - 1)), b = ownerOf(this.tile(i, j));
      if (!a && !b) continue;
      seg(-half + i * bs + bs / 2, -half + j * bs, true, this.isAsphalt(a) || this.isAsphalt(b));
    }
    for (let i = 0; i <= g; i++) for (let j = 0; j < g; j++) {
      const a = ownerOf(this.tile(i - 1, j)), b = ownerOf(this.tile(i, j));
      if (!a && !b) continue;
      seg(-half + i * bs, -half + j * bs + bs / 2, false, this.isAsphalt(a) || this.isAsphalt(b));
    }
    for (let j = 0; j <= g; j++) for (let i = 0; i <= g; i++) {
      const around = [this.tile(i - 1, j - 1), this.tile(i, j - 1), this.tile(i - 1, j), this.tile(i, j)];
      if (around.some((t) => t && this.isAsphalt(t.owner))) lamps.push([-half + i * bs + rw / 2 + 1.2, -half + j * bs + rw / 2 + 1.2]);
    }
    const rm = roads.build(MAT.city, { shadows: false });
    if (rm) { rm.receiveShadow = true; rm.userData = { kind: 'ground' }; add(rm); }

    // 3) Sınır çitleri (oyuncu renginde)
    const fence = new PartBuilder();
    for (const t of this.tiles) {
      if (!t.owner || t.owner === 'state') continue;
      const color = this.playerColors.get(t.owner) ?? '#ffffff';
      const c = tileCenter(t);
      const sides = [
        [this.tile(t.i, t.j - 1), c.x, c.z - bs / 2 + 1.2, true],
        [this.tile(t.i, t.j + 1), c.x, c.z + bs / 2 - 1.2, true],
        [this.tile(t.i - 1, t.j), c.x - bs / 2 + 1.2, c.z, false],
        [this.tile(t.i + 1, t.j), c.x + bs / 2 - 1.2, c.z, false],
      ];
      for (const [n, x, z, horiz] of sides) {
        if (n?.owner === t.owner) continue;
        for (let k = -bs / 2 + 1; k <= bs / 2 - 1; k += 5) fence.box(0.45, 2.4, 0.45, horiz ? x + k : x, 1.2, horiz ? z : z + k, 0x6b4a2e);
        for (const y of [0.9, 1.9]) fence.box(horiz ? bs - 2 : 0.18, 0.22, horiz ? 0.18 : bs - 2, x, y, z, color);
      }
    }
    add(fence.build(MAT.city, { shadows: false }));

    // 4) Orman ağaçları + ovaya serpiştirilmiş ağaçlar (bina olan parselde ağaç yok)
    const buildingTiles = new Map();
    for (const { data: b } of this.entries.values()) {
      const i = Math.floor((b.x + half) / bs), j = Math.floor((b.z + half) / bs);
      buildingTiles.set(j * g + i, b);
    }
    const trees = [];
    for (const t of this.tiles) {
      const b = buildingTiles.get(t.j * g + t.i);
      if (b && b.type !== 'land') continue;
      if (t.owner === 'state') continue;
      const c = tileCenter(t);
      const n = t.terrain === 'f' ? 7 : t.terrain === 'p' && !t.owner && hash(t.i, t.j) < 0.35 ? 2 : 0;
      for (let k = 0; k < n; k++) {
        trees.push([c.x + (hash(t.i * 7 + k, t.j) - 0.5) * bs * 0.8, c.z + (hash(t.i, t.j * 5 + k) - 0.5) * bs * 0.8, 0.8 + hash(k, t.i + t.j) * 0.7, hash(t.j + k, t.i)]);
      }
    }
    if (trees.length) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2.8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e }), trees.length);
      const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 5.5, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), trees.length);
      trees.forEach(([x, z, sc, h], k) => {
        trunks.setMatrixAt(k, m.compose(pv.set(x, 1.4 * sc, z), q.identity(), sv.set(sc, sc, sc)));
        crowns.setMatrixAt(k, m.compose(pv.set(x, 5 * sc, z), q.identity(), sv.set(sc, sc * (0.9 + h * 0.5), sc)));
        crowns.setColorAt(k, col.setHSL(0.28 + h * 0.06, 0.5, 0.25 + h * 0.12));
      });
      trunks.castShadow = crowns.castShadow = true;
      add(trunks);
      add(crowns);
    }

    // 5) Dağlar (karlı zirveler)
    const peaks = [];
    for (const t of this.tiles) {
      if (t.terrain !== 'm') continue;
      const c = tileCenter(t);
      peaks.push([c.x, c.z, 20 + hash(t.i, t.j) * 10, 34 + hash(t.j, t.i) * 34]);
      peaks.push([c.x + (hash(t.i + 3, t.j) - 0.5) * bs * 0.6, c.z + (hash(t.i, t.j + 3) - 0.5) * bs * 0.6, 12 + hash(t.i + 9, t.j) * 6, 18 + hash(t.j + 9, t.i) * 16]);
    }
    if (peaks.length) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
      const rock = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x7d776c, roughness: 1, flatShading: true }), peaks.length);
      const snow = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.8, flatShading: true }), peaks.length);
      peaks.forEach(([x, z, r, h], k) => {
        rock.setMatrixAt(k, m.compose(pv.set(x, h / 2, z), q.identity(), sv.set(r, h, r)));
        snow.setMatrixAt(k, m.compose(pv.set(x, h * 0.86, z), q.identity(), sv.set(r * 0.3, h * 0.3, r * 0.3)));
      });
      rock.castShadow = true;
      add(rock);
      add(snow);
    }

    // 6) Sokak lambaları (sadece asfalt yollarda)
    this.lampHeads = null;
    if (lamps.length) {
      const m = new THREE.Matrix4();
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), new THREE.MeshStandardMaterial({ color: 0x2b2e33 }), lamps.length);
      this.lampHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), lamps.length);
      lamps.forEach(([x, z], k) => {
        pole.setMatrixAt(k, m.makeTranslation(x, 3, z));
        this.lampHeads.setMatrixAt(k, m.makeTranslation(x, 6.2, z));
      });
      add(pole);
      add(this.lampHeads);
    }
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
    if (this.terrainParts) this.scheduleRebuild();
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
    if (this.lampHeads) this.lampHeads.material.color.setRGB(0.35 + night * 0.65, 0.33 + night * 0.55, 0.3 + night * 0.35);

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

// Sunucudan gelen sıkıştırılmış parsel listesi; yoksa (menü arka planı) her yer yerleşik kasaba
function decodeTiles(info, tiles) {
  const g = info.gridSize;
  const out = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const k = j * g + i;
    out.push({ i, j, terrain: tiles ? tiles.terrain[k] : 'p', owner: tiles ? tiles.owners[k] : 'state' });
  }
  return out;
}
