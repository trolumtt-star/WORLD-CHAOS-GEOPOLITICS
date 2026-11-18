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
    g.strokeStyle = '#4a4d55';
    g.lineWidth = Math.max(1, s / 90);
    for (let i = 0; i <= gridSize; i++) {
      const p = -half + i * blockSize;
      const [a] = this.toMap(p, 0);
      const [, b] = this.toMap(0, p);
      g.beginPath(); g.moveTo(a, 0); g.lineTo(a, s); g.stroke();
      g.beginPath(); g.moveTo(0, b); g.lineTo(s, b); g.stroke();
    }
    const k = s / ((this.info.half + 12) * 2);
    for (const b of this.buildings.values()) {
      const cat = this.catalog.buildings[b.type]?.category ?? 'residential';
      const [x, y] = this.toMap(b.x, b.z);
      g.fillStyle = b.destroyed ? '#2a2a2a' : CAT_COLORS[cat];
      g.fillRect(x - (b.width * k) / 2, y - (b.depth * k) / 2, b.width * k, b.depth * k);
      if (b.ownerId) {
        g.strokeStyle = b.ownerId === selfId ? '#ffd34d' : '#ff4d4d';
        g.lineWidth = Math.max(1.5, s / 70);
        g.strokeRect(x - (b.width * k) / 2, y - (b.depth * k) / 2, b.width * k, b.depth * k);
      }
    }
    this.dirtyBg = false;
  }

  draw({ selfId, self, yaw, players, units, missiles, hazards }) {
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
