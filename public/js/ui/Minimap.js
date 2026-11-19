import { drawPin } from './WorldMap.js';

const CAT_COLORS = {
  residential: '#c9a66b', commercial: '#3fa7e0', industrial: '#8a8f99', civic: '#f0f0f0',
  military: '#6b8a3a', nature: '#4caf50', land: '#7a5c3a',
};

/** 2D mini harita: binalar (kategori renkli), oyuncular, birlikler, füzeler, radyasyon. Dokun = büyüt. */
export class Minimap {
  constructor(canvas, info, catalog) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.info = info;
    this.catalog = catalog;
    this.bg = document.createElement('canvas');
    this.size = 0;
    this.buildings = new Map();
    this.tiles = null;
    this.colors = new Map();
  }

  setTiles(tiles, colors) {
    this.tiles = tiles;
    if (colors) this.colors = colors;
    this.dirtyBg = true;
  }

  // Ekran koordinatından parsel (büyük harita dokunuşu)
  tileFromEvent(e) {
    const r = this.c.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fz = (e.clientY - r.top) / r.height;
    const extent = this.info.half + 12;
    const x = fx * extent * 2 - extent;
    const z = fz * extent * 2 - extent;
    const i = Math.floor((x + this.info.half) / this.info.blockSize);
    const j = Math.floor((z + this.info.half) / this.info.blockSize);
    if (i < 0 || j < 0 || i >= this.info.gridSize || j >= this.info.gridSize) return null;
    return { i, j };
  }

  setBuildings(map) {
    this.buildings = map;
    this.dirtyBg = true;
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const s = Math.round(Math.max(60, r.width) * Math.min(2, window.devicePixelRatio));
    if (s !== this.size) {
      this.size = s;
      this.c.width = this.c.height = s;
      this.bg.width = this.bg.height = s;
      this.dirtyBg = true;
    }
  }

  toMap(x, z) {
    const extent = this.info.half + 12;
    return [((x + extent) / (extent * 2)) * this.size, ((z + extent) / (extent * 2)) * this.size];
  }

  drawBg(selfId) {
    const g = this.bg.getContext('2d');
    const s = this.size;
    g.fillStyle = '#25331f';
    g.fillRect(0, 0, s, s);
    const { half, blockSize, gridSize } = this.info;
    const k = s / ((this.info.half + 12) * 2);
    if (this.tiles) {
      const TC = { p: '#6f9a58', f: '#3f6f32', m: '#8d877b', w: '#2f86c4' };
      for (const t of this.tiles) {
        const [x, y] = this.toMap(-half + t.i * blockSize, -half + t.j * blockSize);
        const sz = blockSize * k + 0.5;
        g.fillStyle = TC[t.terrain] ?? TC.p;
        g.fillRect(x, y, sz, sz);
        if (t.owner) {
          g.fillStyle = t.owner === 'state' ? 'rgba(220,220,220,0.35)' : hexA(this.colors.get(t.owner) ?? '#ffffff', 0.45);
          g.fillRect(x, y, sz, sz);
        }
      }
      // sınır çizgileri
      g.lineWidth = Math.max(1, s / 160);
      for (const t of this.tiles) {
        if (!t.owner || t.owner === 'state') continue;
        const [x, y] = this.toMap(-half + t.i * blockSize, -half + t.j * blockSize);
        const sz = blockSize * k;
        g.strokeStyle = this.colors.get(t.owner) ?? '#fff';
        const n = (di, dj) => this.tiles[(t.j + dj) * gridSize + (t.i + di)];
        const edge = (di, dj) => { const o = (t.i + di < 0 || t.j + dj < 0 || t.i + di >= gridSize || t.j + dj >= gridSize) ? null : n(di, dj); return o?.owner !== t.owner; };
        g.beginPath();
        if (edge(0, -1)) { g.moveTo(x, y); g.lineTo(x + sz, y); }
        if (edge(0, 1)) { g.moveTo(x, y + sz); g.lineTo(x + sz, y + sz); }
        if (edge(-1, 0)) { g.moveTo(x, y); g.lineTo(x, y + sz); }
        if (edge(1, 0)) { g.moveTo(x + sz, y); g.lineTo(x + sz, y + sz); }
        g.stroke();
      }
    }
    for (const b of this.buildings.values()) {
      const cat = this.catalog.buildings[b.type]?.category ?? 'residential';
      const [x, y] = this.toMap(b.x, b.z);
      if (b.type === 'land') continue;
      g.fillStyle = b.destroyed ? '#2a2a2a' : CAT_COLORS[cat];
      g.fillRect(x - (b.width * k) / 2, y - (b.depth * k) / 2, b.width * k, b.depth * k);
      if (b.type === 'town_hall') {
        g.fillStyle = this.colors.get(b.ownerId) ?? '#fff';
        g.beginPath(); g.arc(x, y, s / 45, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
      }
      if (b.ownerId && b.type !== 'town_hall') {
        g.strokeStyle = b.ownerId === selfId ? '#ffd34d' : '#ff4d4d';
        g.lineWidth = Math.max(1.5, s / 70);
        g.strokeRect(x - (b.width * k) / 2, y - (b.depth * k) / 2, b.width * k, b.depth * k);
      }
    }
    this.dirtyBg = false;
  }

  draw(args) {
    this.last = args;
    const { selfId, self, yaw, players, units, missiles, hazards } = args;
    this.resize();
    if (this.dirtyBg) this.drawBg(selfId);
    const g = this.ctx;
    const s = this.size;
    g.drawImage(this.bg, 0, 0);
    const k = s / ((this.info.half + 12) * 2);
    for (const h of hazards ?? []) {
      const [x, y] = this.toMap(h.x, h.z);
      g.fillStyle = 'rgba(120,255,60,0.25)';
      g.beginPath(); g.arc(x, y, h.radius * k, 0, Math.PI * 2); g.fill();
    }
    for (const u of units) {
      const [x, y] = this.toMap(u.x, u.z);
      g.fillStyle = u.color;
      g.fillRect(x - s / 80, y - s / 80, s / 40, s / 40);
    }
    for (const p of players) {
      if (p.id === selfId) continue;
      const [x, y] = this.toMap(p.x, p.z);
      g.fillStyle = p.color;
      g.beginPath(); g.arc(x, y, s / 45, 0, Math.PI * 2); g.fill();
    }
    for (const m of missiles) {
      const [x, y] = this.toMap(m.x, m.z);
      g.fillStyle = '#ff2a2a';
      g.beginPath(); g.arc(x, y, s / 50, 0, Math.PI * 2); g.fill();
      const [tx, ty] = this.toMap(m.to.x, m.to.z);
      g.strokeStyle = 'rgba(255,60,60,0.6)';
      g.setLineDash([s / 60, s / 60]);
      g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
      g.setLineDash([]);
    }
    if (this.pin) {
      const [x, y] = this.toMap(this.pin.x, this.pin.z);
      drawPin(g, Math.max(10, Math.min(s - 10, x)), Math.max(22, Math.min(s - 2, y)), s / 160);
    }
    if (self) {
      const [x, y] = this.toMap(self.x, self.z);
      g.save();
      g.translate(x, y);
      g.rotate(-yaw);
      g.fillStyle = '#ffd34d';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -s / 22); g.lineTo(s / 34, s / 34); g.lineTo(-s / 34, s / 34); g.closePath();
      g.fill(); g.stroke();
      g.restore();
    }
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
