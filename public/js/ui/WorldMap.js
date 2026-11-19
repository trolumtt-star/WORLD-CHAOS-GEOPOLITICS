import { el, clear } from '../core/dom.js';

/**
 * Büyük, detaylı dünya haritası:
 *  - sürükle = kaydır, iki parmak / tekerlek / +- = yakınlaştır
 *  - her binanın ikonu, yakınlaşınca ismi; kategori filtreleri ve arama
 *  - binaya dokun = bilgi kartı (📍 İşaretle / İncele), boş yere dokun = buraya işaret koy
 *  - işaret (pin) haritada, mini haritada ve dünyada (ışık sütunu) görünür
 */
const FILTERS = [
  { id: 'all', label: 'Hepsi', icon: '🗺️' },
  { id: 'shop', label: 'Dükkan', icon: '🏪', cats: ['commercial'] },
  { id: 'civic', label: 'Kamu', icon: '🏛️', cats: ['civic'] },
  { id: 'home', label: 'Ev', icon: '🏠', cats: ['residential'] },
  { id: 'work', label: 'Sanayi', icon: '🏭', cats: ['industrial'] },
  { id: 'mil', label: 'Askeri', icon: '🎖️', cats: ['military'] },
];
const CAT_COLORS = { residential: '#c9a66b', commercial: '#3fa7e0', industrial: '#8a8f99', civic: '#f0f0f0', military: '#6b8a3a', nature: '#4caf50', land: '#7a5c3a' };
const TC = { p: '#6f9a58', f: '#3f6f32', m: '#8d877b', w: '#2f86c4' };

export class WorldMap {
  constructor(ui, { info, catalog, minimap, onPin, onInspectTile, onInspectBuilding, selfId, nameOf }) {
    this.nameOf = nameOf ?? (() => null);
    this.ui = ui;
    this.info = info;
    this.catalog = catalog;
    this.mm = minimap;
    this.h = { onPin, onInspectTile, onInspectBuilding };
    this.selfId = selfId;
    this.filter = 'all';
    this.zoom = 1;
    this.cx = 0; this.cz = 0;
    this.pointers = new Map();

    this.canvas = el('canvas', { class: 'wm-canvas' });
    this.g = this.canvas.getContext('2d');
    this.search = el('input', { class: 'wm-search', placeholder: '🔎 Yer ara: market, banka, Kasap...', onInput: () => this.renderResults() });
    this.results = el('div', { class: 'wm-results hidden' });
    this.chips = el('div', { class: 'wm-chips' }, ...FILTERS.map((f) => el('button', { class: `wm-chip ${f.id === 'all' ? 'on' : ''}`, 'data-f': f.id, onClick: () => this.setFilter(f.id) }, `${f.icon} ${f.label}`)));
    this.card = el('div', { class: 'wm-card hidden' });
    const zb = (t, d) => el('button', { class: 'wm-zbtn', onClick: () => this.zoomBy(d) }, t);
    this.root = el('div', { class: 'wm hidden' },
      this.canvas,
      el('div', { class: 'wm-top' },
        el('div', { class: 'wm-row' }, this.search, el('button', { class: 'wm-close', onClick: () => this.close() }, '✕')),
        this.chips, this.results),
      el('div', { class: 'wm-zoom' }, zb('＋', 1.5), zb('－', 1 / 1.5), el('button', { class: 'wm-zbtn', title: 'Bana dön', onClick: () => this.centerSelf() }, '🎯')),
      el('div', { class: 'wm-legend' }, '🟡 Sen · 📍 İşaret · Dokun: bilgi / işaret koy'),
      this.card);
    ui.root.append(this.root);

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); this.pinchD = null; });
    c.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (p && this.pointers.size === 0 && !this.wasPinch && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) this.tap(e.clientX, e.clientY);
      if (this.pointers.size === 0) this.wasPinch = false;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
    window.addEventListener('resize', () => this.isOpen && this.draw());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) { e.stopPropagation(); this.close(); } }, true);
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }

  open() {
    this.root.classList.remove('hidden');
    this.card.classList.add('hidden');
    if (!this.opened) { this.opened = true; this.zoom = 4; this.centerSelf(false); }
    this.fit();
    this.loop();
  }

  close() {
    this.root.classList.add('hidden');
    cancelAnimationFrame(this.raf);
    this.search.blur();
  }

  fit() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.hh = r.height; this.dpr = dpr;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
  }

  loop() {
    this.draw();
    this.raf = requestAnimationFrame(() => this.isOpen && this.loop());
  }

  // ------------------------------------------------------------ koordinat
  /** px/birim: zoom 1 = tüm dünya ekrana sığar */
  get scale() { return (Math.min(this.w, this.hh) / (this.info.half * 2 + 24)) * this.zoom; }
  toScreen(x, z) { const s = this.scale; return [this.w / 2 + (x - this.cx) * s, this.hh / 2 + (z - this.cz) * s]; }
  toWorld(sx, sy) { const s = this.scale; const r = this.canvas.getBoundingClientRect(); return [this.cx + (sx - r.left - this.w / 2) / s, this.cz + (sy - r.top - this.hh / 2) / s]; }

  centerSelf(draw = true) {
    const me = this.mm.last?.self;
    if (me) { this.cx = me.x; this.cz = me.z; }
    if (this.zoom < 3.5) this.zoom = 4;
    if (draw) this.draw();
  }

  zoomBy(f, sx, sy) {
    const before = sx != null ? this.toWorld(sx, sy) : null;
    this.zoom = Math.max(0.8, Math.min(16, this.zoom * f));
    if (before) { const after = this.toWorld(sx, sy); this.cx += before[0] - after[0]; this.cz += before[1] - after[1]; }
    this.clamp();
  }

  clamp() { const h = this.info.half; this.cx = Math.max(-h, Math.min(h, this.cx)); this.cz = Math.max(-h, Math.min(h, this.cz)); }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      p.x = e.clientX; p.y = e.clientY;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchD) this.zoomBy(d / this.pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinchD = d;
      this.wasPinch = true;
      return;
    }
    const s = this.scale;
    this.cx -= (e.clientX - p.x) / s;
    this.cz -= (e.clientY - p.y) / s;
    p.x = e.clientX; p.y = e.clientY;
    this.clamp();
  }

  // ------------------------------------------------------------ filtre / arama
  setFilter(id) {
    this.filter = id;
    for (const b of this.chips.children) b.classList.toggle('on', b.dataset.f === id);
  }

  visible(b) {
    if (b.type === 'land' || b.type === 'park') return false;
    if (this.filter === 'all') return true;
    const cat = this.catalog.buildings[b.type]?.category;
    return FILTERS.find((f) => f.id === this.filter)?.cats?.includes(cat);
  }

  renderResults() {
    const q = this.search.value.trim().toLocaleLowerCase('tr');
    clear(this.results);
    if (q.length < 2) { this.results.classList.add('hidden'); return; }
    const me = this.mm.last?.self ?? { x: 0, z: 0 };
    const hits = [...this.mm.buildings.values()].filter((b) => {
      const def = this.catalog.buildings[b.type];
      return b.type !== 'land' && `${b.name ?? ''} ${def?.label ?? ''}`.toLocaleLowerCase('tr').includes(q);
    }).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, 8);
    this.results.classList.remove('hidden');
    if (!hits.length) { this.results.append(el('div', { class: 'wm-res muted' }, 'Bulunamadı')); return; }
    for (const b of hits) {
      const def = this.catalog.buildings[b.type];
      const d = Math.round(Math.hypot(b.x - me.x, b.z - me.z));
      this.results.append(el('button', { class: 'wm-res', onClick: () => { this.cx = b.x; this.cz = b.z; this.zoom = Math.max(this.zoom, 7); this.results.classList.add('hidden'); this.search.blur(); this.showBuilding(b); } },
        el('span', {}, def?.icon ?? '🏢'), el('b', {}, b.name ?? def?.label), el('small', {}, `${def?.label ?? ''} · ${d} m`)));
    }
  }

  // ------------------------------------------------------------ dokunma
  tap(sx, sy) {
    this.results.classList.add('hidden');
    const [x, z] = this.toWorld(sx, sy);
    const s = this.scale;
    let best = null, bd = Infinity;
    for (const b of this.mm.buildings.values()) {
      if (!this.visible(b)) continue;
      const inside = Math.abs(x - b.x) < b.width / 2 + 2 && Math.abs(z - b.z) < b.depth / 2 + 2;
      const d = Math.hypot(x - b.x, z - b.z);
      const iconHit = d * s < 16;
      if ((inside || iconHit) && d < bd) { bd = d; best = b; }
    }
    if (best) return this.showBuilding(best);
    this.showSpot(x, z);
  }

  showBuilding(b) {
    const def = this.catalog.buildings[b.type] ?? {};
    const me = this.mm.last?.self ?? { x: 0, z: 0 };
    const d = Math.round(Math.hypot(b.x - me.x, b.z - me.z));
    const owner = b.ownerId === this.selfId ? 'Senin' : b.ownerId ? `Sahibi: ${this.nameOf(b.ownerId) ?? 'oyuncu'}` : 'Devlet';
    this.selected = b;
    clear(this.card).append(
      el('div', { class: 'wm-card-h' }, el('span', { class: 'wm-card-i' }, def.icon ?? '🏢'), el('div', {}, el('b', {}, b.name ?? def.label), el('small', {}, `${def.label ?? b.type} · ${owner} · ${d} m`)),
        el('button', { class: 'wm-x', onClick: () => { this.card.classList.add('hidden'); this.selected = null; } }, '✕')),
      el('div', { class: 'wm-card-a' },
        el('button', { class: 'btn primary', onClick: () => { this.h.onPin({ x: b.door?.x ?? b.x, z: b.door?.z ?? b.z, label: `${def.icon ?? ''} ${b.name ?? def.label}` }); this.close(); } }, '📍 İşaretle & Git'),
        el('button', { class: 'btn', onClick: () => { this.close(); this.h.onInspectBuilding(b.id); } }, 'ℹ️ Detay')));
    this.card.classList.remove('hidden');
  }

  showSpot(x, z) {
    const { half, blockSize } = this.info;
    const i = Math.floor((x + half) / blockSize), j = Math.floor((z + half) / blockSize);
    this.selected = null;
    clear(this.card).append(
      el('div', { class: 'wm-card-h' }, el('span', { class: 'wm-card-i' }, '📍'), el('div', {}, el('b', {}, 'Boş alan'), el('small', {}, `Parsel ${i},${j}`)),
        el('button', { class: 'wm-x', onClick: () => this.card.classList.add('hidden') }, '✕')),
      el('div', { class: 'wm-card-a' },
        el('button', { class: 'btn primary', onClick: () => { this.h.onPin({ x, z, label: '📍 İşaret' }); this.close(); } }, '📍 Buraya İşaret Koy'),
        el('button', { class: 'btn', onClick: () => { this.close(); this.h.onInspectTile(`${i},${j}`); } }, '🚩 Parsel')));
    this.card.classList.remove('hidden');
  }

  // ------------------------------------------------------------ çizim
  draw() {
    if (!this.w) this.fit();
    const g = this.g, s = this.scale, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#1b2617';
    g.fillRect(0, 0, this.w, this.hh);
    const { half, blockSize } = this.info;
    const tiles = this.mm.tiles, colors = this.mm.colors;
    if (tiles) {
      for (const t of tiles) {
        const [x, y] = this.toScreen(-half + t.i * blockSize, -half + t.j * blockSize);
        const sz = blockSize * s + 0.6;
        if (x > this.w || y > this.hh || x + sz < 0 || y + sz < 0) continue;
        g.fillStyle = TC[t.terrain] ?? TC.p;
        g.fillRect(x, y, sz, sz);
        if (t.owner) { g.fillStyle = t.owner === 'state' ? 'rgba(230,230,230,0.22)' : hexA(colors.get(t.owner) ?? '#ffffff', 0.35); g.fillRect(x, y, sz, sz); }
      }
      // yollar (parsel kenarları)
      if (s > 0.9) {
        g.strokeStyle = 'rgba(60,60,60,0.55)';
        g.lineWidth = Math.max(1, 5 * s);
        g.beginPath();
        for (let k = 0; k <= this.info.gridSize; k++) {
          const v = -half + k * blockSize;
          let [x1, y1] = this.toScreen(v, -half); let [x2, y2] = this.toScreen(v, half);
          g.moveTo(x1, y1); g.lineTo(x2, y2);
          [x1, y1] = this.toScreen(-half, v); [x2, y2] = this.toScreen(half, v);
          g.moveTo(x1, y1); g.lineTo(x2, y2);
        }
        g.stroke();
      }
    }
    // binalar
    const showIcons = s > 0.4, showNames = s > 0.75;
    const labels = [];
    for (const b of this.mm.buildings.values()) {
      if (b.type === 'land') continue;
      const def = this.catalog.buildings[b.type] ?? {};
      const [x, y] = this.toScreen(b.x, b.z);
      const w = b.width * s, d = b.depth * s;
      if (x + w < -40 || y + d < -40 || x - w > this.w + 40 || y - d > this.hh + 40) continue;
      const on = this.visible(b);
      g.globalAlpha = on ? 1 : 0.25;
      g.fillStyle = b.destroyed ? '#2a2a2a' : CAT_COLORS[def.category] ?? '#999';
      g.fillRect(x - w / 2, y - d / 2, w, d);
      if (b.ownerId) { g.strokeStyle = b.ownerId === this.selfId ? '#ffd34d' : 'rgba(255,80,80,0.9)'; g.lineWidth = 2; g.strokeRect(x - w / 2, y - d / 2, w, d); }
      if (this.selected === b) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(x - w / 2 - 3, y - d / 2 - 3, w + 6, d + 6); }
      g.globalAlpha = 1;
      if (on && showIcons && b.type !== 'park') labels.push({ x, y, b, def, pri: this.selected === b ? 2 : def.category === 'commercial' || def.category === 'civic' ? 1 : 0 });
    }
    // ikon + isim (çakışmayı önle)
    labels.sort((a, b) => b.pri - a.pri);
    const taken = [];
    const fs = Math.max(10, Math.min(14, 6 + s * 2.2));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const L of labels) {
      const name = (showNames && (L.pri || s > 2.5)) || L.pri === 2 ? (L.b.name ?? L.def.label ?? '') : '';
      g.font = `700 ${fs}px system-ui, sans-serif`;
      const tw = name ? g.measureText(name).width + 26 : 22;
      const box = [L.x - tw / 2, L.y - 11, tw, 22];
      if (taken.some((t) => box[0] < t[0] + t[2] && box[0] + box[2] > t[0] && box[1] < t[1] + t[3] && box[1] + box[3] > t[1])) continue;
      taken.push(box);
      g.fillStyle = 'rgba(10,12,18,0.78)';
      roundRect(g, box[0], box[1], box[2], box[3], 11);
      g.fill();
      g.font = `${fs + 1}px system-ui, sans-serif`;
      g.fillText(L.def.icon ?? '🏢', name ? box[0] + 11 : L.x, L.y + 1);
      if (name) { g.font = `700 ${fs}px system-ui, sans-serif`; g.fillStyle = L.b.ownerId === this.selfId ? '#ffd34d' : '#fff'; g.textAlign = 'left'; g.fillText(name, box[0] + 21, L.y + 1); g.textAlign = 'center'; }
    }
    // canlı: oyuncular, birlikler
    const live = this.mm.last;
    if (live) {
      for (const u of live.units ?? []) { const [x, y] = this.toScreen(u.x, u.z); g.fillStyle = u.color; g.fillRect(x - 3, y - 3, 6, 6); }
      g.font = '700 11px system-ui, sans-serif';
      for (const p of live.players ?? []) {
        if (p.id === this.selfId) continue;
        const [x, y] = this.toScreen(p.x, p.z);
        g.fillStyle = p.color; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
        if (p.name) { g.fillStyle = '#fff'; g.fillText(p.name, x, y - 13); }
      }
    }
    // işaret
    const pin = this.mm.pin;
    if (pin) {
      const [x, y] = this.toScreen(pin.x, pin.z);
      drawPin(g, x, y, 1.3);
      if (live?.self) {
        const [mx, my] = this.toScreen(live.self.x, live.self.z);
        g.strokeStyle = 'rgba(255,60,60,0.8)'; g.setLineDash([8, 6]); g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(mx, my); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      }
    }
    if (live?.self) {
      const [x, y] = this.toScreen(live.self.x, live.self.z);
      g.save(); g.translate(x, y); g.rotate(-live.yaw);
      g.fillStyle = '#ffd34d'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -14); g.lineTo(9, 9); g.lineTo(0, 4); g.lineTo(-9, 9); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }
}

export function drawPin(g, x, y, k = 1) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.fillStyle = '#ff2d3c';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-4, -8, -10, -12, -10, -19);
  g.arc(0, -19, 10, Math.PI, 0);
  g.bezierCurveTo(10, -12, 4, -8, 0, 0);
  g.fill(); g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(0, -19, 4, 0, Math.PI * 2); g.fill();
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hexA(hex, a) {
  const n = parseInt(String(hex).slice(1), 16) || 0xffffff;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
