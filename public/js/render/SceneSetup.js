import * as THREE from 'three';
import { Settings } from '../core/Settings.js';
import { MAT } from './BuildingFactory.js';

const QUALITY = {
  low:    { pixelRatio: 1,   shadows: false, shadowSize: 512,  particles: 0.5 },
  medium: { pixelRatio: 1.5, shadows: true,  shadowSize: 1024, particles: 0.8 },
  high:   { pixelRatio: 2,   shadows: true,  shadowSize: 2048, particles: 1 },
};

export function qualityPreset() {
  return QUALITY[Settings.get('quality')] ?? QUALITY.medium;
}

/** Tek renderer, sahne başına SceneKit (ışıklar, gökyüzü, yıldızlar, gün-gece döngüsü). */
export function createRenderer(canvas) {
  const q = qualityPreset();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.pixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function applyQuality(renderer) {
  const q = qualityPreset();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.shadowMap.enabled = q.shadows;
}

// Gün içi renk anahtarları: [saat, gökyüzü üst, ufuk, güneş rengi, güneş şiddeti, ortam şiddeti, pencere parlaklığı]
const KEYS = [
  [0,  0x050816, 0x0d1430, 0x6070a0, 0.15, 0.25, 1.0],
  [5,  0x0a0f26, 0x2a2440, 0x8070a0, 0.2,  0.28, 1.0],
  [6.5, 0x3a5a9a, 0xf2a072, 0xffb27a, 0.8, 0.45, 0.6],
  [9,  0x3d7fd6, 0xa9d3f2, 0xfff2dd, 1.5,  0.6,  0.0],
  [16, 0x3d7fd6, 0xb6dcf5, 0xfff2dd, 1.4,  0.6,  0.0],
  [18.5, 0x2d3f80, 0xff8a5c, 0xff9a5c, 0.9, 0.45, 0.5],
  [20, 0x0c1230, 0x3a2a50, 0x8070a0, 0.25, 0.3,  1.0],
  [24, 0x050816, 0x0d1430, 0x6070a0, 0.15, 0.25, 1.0],
];

const _a = new THREE.Color();
const _b = new THREE.Color();

export class SceneKit {
  constructor(renderer, { worldSize = 400 } = {}) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, Math.max(4000, worldSize * 5.5));
    this.worldSize = worldSize;

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3d4a2a, 0.6);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
    const q = qualityPreset();
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const s = Math.min(worldSize * 0.65, 230);
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: worldSize * 3 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.4;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.scene.fog = new THREE.Fog(0xa9d3f2, worldSize * 0.6, worldSize * 2.6);
    this.buildSky();
    this.buildStars();
    this.buildMountains();

    this.dayFactor = 1;
    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);
  }

  buildSky() {
    this.skyUniforms = { top: { value: new THREE.Color(0x3d7fd6) }, bottom: { value: new THREE.Color(0xa9d3f2) } };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(this.worldSize * 4, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyUniforms,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0); }',
      }),
    );
    sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);

    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(this.worldSize * 0.08, 16, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c0, fog: false }));
    this.sunDisc = sunDisc;
    this.scene.add(sunDisc);
  }

  buildStars() {
    const n = 900;
    const pos = new Float32Array(n * 3);
    const R = this.worldSize * 3.5;
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.9);
      pos[i * 3] = R * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = R * Math.cos(ph);
      pos[i * 3 + 2] = R * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
  }

  /** Bina içi: gökyüzü, dağlar, sis kapalı; sabit iç mekân ışığı */
  setInterior(on) {
    this.interior = on;
    for (const o of [this.sky, this.sunDisc, this.stars, this.mountains]) if (o) o.visible = !on;
    if (on) {
      this._fog = this.scene.fog;
      this.scene.fog = null;
      this.scene.background = new THREE.Color(0x0d0d12);
    } else {
      if (this._fog) this.scene.fog = this._fog;
      this.scene.background = null;
    }
  }

  buildMountains() {
    const g = new THREE.Group();
    this.mountains = g;
    const mat = new THREE.MeshStandardMaterial({ color: 0x55665a, roughness: 1, flatShading: true });
    const R = this.worldSize * 1.6;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const h = this.worldSize * (0.15 + Math.random() * 0.3);
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 1.4, h, 5 + (i % 3)), mat);
      m.position.set(Math.cos(a) * R * (1 + Math.random() * 0.3), h / 2 - 2, Math.sin(a) * R * (1 + Math.random() * 0.3));
      m.rotation.y = Math.random() * 3;
      g.add(m);
    }
    this.scene.add(g);
  }

  // hourFloat 0..24 -> tüm atmosfer
  setTime(hourFloat) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hourFloat) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((hourFloat - k0[0]) / (k1[0] - k0[0]), 0, 1);
    const mix = (a, b, out) => out.copy(_a.set(a)).lerp(_b.set(b), t);

    mix(k0[1], k1[1], this.skyUniforms.top.value);
    mix(k0[2], k1[2], this.skyUniforms.bottom.value);
    this.scene.fog?.color.copy(this.skyUniforms.bottom.value);
    mix(k0[3], k1[3], this.sun.color);
    this.sun.intensity = k0[4] + (k1[4] - k0[4]) * t;
    this.hemi.intensity = k0[5] + (k1[5] - k0[5]) * t;
    const night = k0[6] + (k1[6] - k0[6]) * t;
    this.night = night;
    this.dayFactor = 1 - night;

    // Güneş (gündüz) / ay (gece) konumu
    const ang = ((hourFloat - 6) / 24) * Math.PI * 2;
    const isDay = hourFloat > 5.5 && hourFloat < 19.5;
    const a2 = isDay ? ang : ang + Math.PI;
    const R = this.worldSize * 1.2;
    this.sun.position.set(Math.cos(a2) * R, Math.max(0.15, Math.sin(a2)) * R, R * 0.35);
    this.sunDisc.position.copy(this.sun.position).multiplyScalar(2.6);
    this.sunDisc.material.color.set(isDay ? 0xfff1c0 : 0xdfe6ff);
    this.stars.material.opacity = night * 0.9;
    if (this.interior) {
      this.hemi.intensity = 0.75;
      this.sun.intensity = 0.55;
      this.sun.color.set(0xfff4e0);
    }

    // Pencereler ve neonlar
    MAT.window.color.setRGB(0.32 + night * 0.68, 0.36 + night * 0.64, 0.44 + night * 0.56);
    const g = 0.55 + night * 0.45;
    MAT.glow.color.setRGB(g, g, g);
  }

  // Gölge kamerası oyuncuyu takip etsin (mobilde küçük gölge haritası yeter)
  followShadow(x, z) {
    const s = qualityPreset().shadows ? 1 : 0;
    if (!s) return;
    const off = this.sun.position.clone().normalize().multiplyScalar(this.worldSize);
    this.sun.position.set(x + off.x, off.y, z + off.z);
    this.sun.target.position.set(x, 0, z);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material && !Object.values(MAT).includes(o.material)) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
      }
    });
  }
}
