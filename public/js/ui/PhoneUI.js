import { el, clear, tl, pad } from '../core/dom.js';
import { OUTFITS, CARS, CLUBS, priceOf } from '../../shared/catalogs.js';

/**
 * iPhone tarzı telefon: ana ekran + uygulamalar. Oyunun bütün menüleri burada toplanır,
 * böylece oyun ekranı sade kalır.
 */
const APPS = [
  ['messages', '💬', 'Mesajlar', 'g-green'], ['call', '📞', 'Telefon', 'g-green2'], ['camera', '📷', 'Kamera', 'g-grey'], ['social', '📸', 'ChaosGram', 'g-insta'],
  ['order', '🛵', 'Sipariş', 'g-orange'], ['ilan', '🏠', 'Sahibinden', 'g-yellow'], ['bank', '🏦', 'Banka', 'g-blue'], ['match', '⚽', 'Bahis', 'g-pitch'],
  ['news', '📰', 'Haberler', 'g-red'], ['econ', '📈', 'Ekonomi', 'g-teal'], ['map', '🗺️', 'Harita', 'g-map'], ['garage', '🚗', 'Garaj', 'g-dark'],
  ['wardrobe', '👕', 'Gardırop', 'g-pink'], ['court', '⚖️', 'Adalet', 'g-brown'], ['props', '🏘️', 'Mülklerim', 'g-indigo'], ['bag', '🎒', 'Çanta', 'g-amber'],
  ['tech', '🔬', 'Teknoloji', 'g-cyan'], ['army', '⚔️', 'Ordu', 'g-crimson'], ['city', '🏛️', 'Şehir', 'g-slate'], ['rank', '🏆', 'Sıralama', 'g-gold'],
  ['settings', '⚙️', 'Ayarlar', 'g-grey2'],
];
const DOCK = ['messages', 'call', 'camera', 'social'];

export class PhoneUI {
  constructor(root, h) {
    this.h = h;
    this.self = {};
    this.gallery = [];
    this.messages = [];
    this.unread = new Map();
    this.thread = null;
    this.view = null;
    this.match = null;
    this.feedCache = [];
    this.screen = el('div', { class: 'ph-screen' });
    this.statusTime = el('b');
    this.badge = el('span', { class: 'ph-badge hidden' });
    this.node = el('div', { class: 'phone hidden', onClick: (e) => e.stopPropagation() },
      el('div', { class: 'ph-frame' },
        el('div', { class: 'ph-island' }),
        el('div', { class: 'ph-status' }, this.statusTime, el('span', {}, '📶 5G 🔋')),
        this.screen,
        el('div', { class: 'ph-home', onClick: () => (this.view ? this.home() : this.close()) })));
    this.backdrop = el('div', { class: 'ph-backdrop hidden', onClick: () => this.close() });
    this.ring = el('div', { class: 'ph-ring hidden' });
    root.append(this.backdrop, this.node, this.ring);
    setInterval(() => { const d = new Date(); this.statusTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; }, 1000);
  }

  get isOpen() { return !this.node.classList.contains('hidden'); }
  open(app) {
    this.node.classList.remove('hidden');
    this.backdrop.classList.remove('hidden');
    this.h.sfx?.('open');
    if (app) this.openApp(app); else if (!this.view) this.home(); else this.openApp(this.view);
  }
  close() { this.node.classList.add('hidden'); this.backdrop.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  setSelf(s) { this.self = { ...this.self, ...s }; if (this.isOpen && ['bank', 'garage', 'wardrobe', 'court', 'order'].includes(this.view) && !this._typing) this.openApp(this.view, true); }
  setMatch(m) { this.match = m; if (this.isOpen && this.view === 'match') this.openApp('match', true); }

  // ------------------------------------------------------------------ ana ekran
  home() {
    this.node.classList.remove('app');
    this.view = null;
    this.thread = null;
    const icon = ([id, ic, label, g]) => el('button', { class: 'ph-app', onClick: () => { this.h.sfx?.('click'); this.openApp(id); } },
      el('span', { class: `ph-ico ${g}` }, ic, id === 'messages' && this.totalUnread() ? el('i', { class: 'ph-dot' }, String(this.totalUnread())) : null,
        id === 'order' && this.self.courierJobs ? el('i', { class: 'ph-dot' }, String(this.self.courierJobs)) : null,
        id === 'court' && this.self.cases?.length ? el('i', { class: 'ph-dot' }, String(this.self.cases.length)) : null),
      el('small', {}, label));
    const d = new Date();
    clear(this.screen).append(
      el('div', { class: 'ph-wall' },
        el('div', { class: 'ph-clock' }, `${pad(d.getHours())}:${pad(d.getMinutes())}`),
        el('div', { class: 'ph-date' }, `${tl(this.self.balance ?? 0)} · ${this.self.countryName ? `🏳️ ${this.self.countryName}` : `🧳 ${this.self.citizenName ?? 'Vatandaş'}`}`),
        el('div', { class: 'ph-grid' }, ...APPS.filter(([id]) => !DOCK.includes(id)).map(icon)),
        el('div', { class: 'ph-dock' }, ...APPS.filter(([id]) => DOCK.includes(id)).map(icon))));
  }

  totalUnread() { let n = 0; for (const v of this.unread.values()) n += v; return n; }

  page(title, ...content) {
    this.node.classList.add('app');
    clear(this.screen).append(
      el('div', { class: 'ph-page' },
        el('div', { class: 'ph-nav' }, el('button', { class: 'ph-back', onClick: () => (this.thread ? (this.thread = null, this.openApp('messages')) : this.home()) }, '‹'), el('b', {}, title), el('span')),
        el('div', { class: 'ph-body' }, ...content)));
    return this.screen.querySelector('.ph-body');
  }

  btn(label, cls, fn) { return el('button', { class: `ph-btn ${cls ?? ''}`, onClick: async (e) => { e.stopPropagation(); this.h.sfx?.('click'); await fn(); } }, label); }
  slider(min, max, step, value, fmt) {
    const out = el('b', {}, fmt(value));
    const i = el('input', { type: 'range', min, max, step, value, class: 'ph-range' });
    i.addEventListener('input', () => { out.textContent = fmt(Number(i.value)); });
    return { node: el('div', { class: 'ph-slider' }, i, out), get value() { return Number(i.value); } };
  }
  act(type, params) { return this.h.action(type, params); }

  async openApp(id, refresh) {
    this.view = id;
    const H = this.h;
    switch (id) {
      case 'map': this.close(); return H.ui.openMap();
      case 'news': this.close(); return H.ui.openNews();
      case 'props': this.close(); return H.onProperties();
      case 'tech': this.close(); return H.ui.openTech();
      case 'army': this.close(); return H.ui.openMilitary();
      case 'city': this.close(); return H.ui.openCity('city');
      case 'rank': this.close(); return H.ui.openCity('rank');
      case 'bag': this.close(); return H.onBag();
      case 'settings': this.close(); return H.onMenu();
      case 'messages': return this.appMessages(refresh);
      case 'call': return this.appCall();
      case 'camera': return this.appCamera();
      case 'social': return this.appSocial(refresh);
      case 'order': return this.appOrder();
      case 'ilan': return this.appIlan();
      case 'bank': return this.appBank();
      case 'match': return this.appMatch();
      case 'econ': return this.appEcon();
      case 'garage': return this.appGarage();
      case 'wardrobe': return this.appWardrobe();
      case 'court': return this.appCourt();
      default: return this.home();
    }
  }

  contacts() { return this.h.roster().filter((r) => !r.isAI && r.id !== this.h.selfId()); }

  // ------------------------------------------------------------------ mesajlar
  async appMessages(refresh) {
    if (!refresh || !this.messages.length) {
      const r = await this.act('phone:inbox', {});
      if (r?.messages) this.messages = r.messages;
    }
    if (this.thread) return this.openThread(this.thread);
    const me = this.h.selfId();
    const body = this.page('Mesajlar');
    const people = this.contacts();
    if (!people.length) body.append(el('p', { class: 'ph-muted' }, 'Bu dünyada henüz başka oyuncu yok. Arkadaşlarını davet et! 🔗'));
    for (const r of people) {
      const last = [...this.messages].reverse().find((m) => (m.from === r.id && m.to === me) || (m.to === r.id && m.from === me));
      const n = this.unread.get(r.id) ?? 0;
      body.append(el('button', { class: 'ph-row', onClick: () => this.openThread(r.id) },
        el('span', { class: 'ph-avatar', style: { background: r.color } }, r.name[0]?.toUpperCase() ?? '?'),
        el('div', { class: 'ph-rt' }, el('b', {}, r.name, r.online ? el('i', { class: 'ph-online' }) : null), el('small', {}, last ? (last.loc ? '📍 Konum' : last.text) : 'Mesaj yaz...')),
        n ? el('span', { class: 'ph-count' }, String(n)) : null));
    }
  }

  openThread(id) {
    this.thread = id;
    this.unread.delete(id);
    const me = this.h.selfId();
    const r = this.h.roster().find((x) => x.id === id);
    const body = this.page(r?.name ?? 'Sohbet');
    const list = el('div', { class: 'ph-chat' });
    for (const m of this.messages.filter((m) => (m.from === id && m.to === me) || (m.to === id && m.from === me))) {
      list.append(el('div', { class: `ph-bubble ${m.from === me ? 'me' : ''}` },
        m.loc ? el('button', { class: 'ph-loc', onClick: () => { this.close(); this.h.showOnMap(m.loc); } }, `📍 Konum · haritada göster`) : m.text,
        el('small', {}, new Date(m.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))));
    }
    const input = el('input', { class: 'ph-input', placeholder: 'Mesaj', maxlength: 300, onFocus: () => (this._typing = true), onBlur: () => (this._typing = false) });
    const send = async (loc) => {
      const text = input.value.trim();
      if (!text && !loc) return;
      const res = await this.act('phone:msg', { to: id, text, loc: !!loc });
      if (res?.msg) { this.messages.push(res.msg); input.value = ''; this.openThread(id); this.h.sfx?.('soft'); }
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); });
    body.append(list, el('div', { class: 'ph-compose' }, this.btn('📍', 'icon', () => send(true)), input, this.btn('➤', 'icon send', () => send())),
      el('div', { class: 'ph-row-actions' }, this.btn('📞 Ara', '', () => this.startCall(id))));
    setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);
  }

  onMessage(m) {
    this.messages.push(m);
    if (this.isOpen && this.view === 'messages' && this.thread === m.from) this.openThread(m.from);
    else this.unread.set(m.from, (this.unread.get(m.from) ?? 0) + 1);
    this.h.toast(`💬 ${m.fromName}: ${m.loc ? '📍 Konum gönderdi' : m.text}`, 'info');
    this.h.sfx?.('notify');
    this.h.setBadge(this.totalUnread());
  }

  // ------------------------------------------------------------------ arama
  appCall() {
    const body = this.page('Telefon');
    if (this.self.callWith) {
      const r = this.h.roster().find((x) => x.id === this.self.callWith);
      body.append(el('div', { class: 'ph-callscreen' }, el('div', { class: 'ph-avatar big' }, (r?.name ?? '?')[0]), el('h3', {}, r?.name ?? ''), el('p', { class: 'ph-muted' }, '🔊 Görüşme sürüyor · mikrofonun açık olmalı'),
        this.btn('📵 Kapat', 'danger round', () => this.act('phone:hangup', {}).then(() => this.appCall()))));
      return;
    }
    const people = this.contacts();
    if (!people.length) body.append(el('p', { class: 'ph-muted' }, 'Rehberde kimse yok.'));
    for (const r of people) body.append(el('div', { class: 'ph-row' }, el('span', { class: 'ph-avatar', style: { background: r.color } }, r.name[0]), el('div', { class: 'ph-rt' }, el('b', {}, r.name), el('small', {}, r.online ? '🟢 Çevrimiçi' : '⚪ Çevrimdışı')),
      r.online ? this.btn('📞', 'icon green', () => this.startCall(r.id)) : null));
  }

  async startCall(id) {
    const res = await this.act('phone:call', { to: id });
    if (res?.ok) { this.h.toast(res.message ?? '📞 Aranıyor...', 'info'); this.h.ensureMic(); }
  }

  incoming({ from, name }) {
    this.h.sfx?.('notify');
    clear(this.ring).append(el('div', { class: 'ph-ring-card' }, el('div', { class: 'ph-avatar big' }, name[0]), el('b', {}, name), el('small', {}, '📞 Seni arıyor...'),
      el('div', { class: 'ph-ring-btns' },
        this.btn('📵', 'danger round', async () => { await this.act('phone:answer', { from, accept: false }); this.ring.classList.add('hidden'); }),
        this.btn('📞', 'green round', async () => { const r = await this.act('phone:answer', { from, accept: true }); this.ring.classList.add('hidden'); if (r?.ok) { this.h.ensureMic(); this.h.toast(`📞 ${name} ile görüşüyorsun`, 'ok'); } }))));
    this.ring.classList.remove('hidden');
    clearTimeout(this._ringT);
    this._ringT = setTimeout(() => this.ring.classList.add('hidden'), 25000);
  }

  // ------------------------------------------------------------------ kamera
  appCamera() {
    const body = this.page('Kamera');
    const shoot = async () => {
      this.close();
      await new Promise((r) => setTimeout(r, 80));
      const img = this.h.takePhoto();
      this.h.flash();
      if (img) { this.gallery.unshift(img); this.gallery = this.gallery.slice(0, 9); this.h.sfx?.('click'); }
      this.open('camera');
    };
    body.append(el('div', { class: 'ph-viewfinder' }, el('span', {}, '📷'), el('small', {}, 'Çekim anında telefon kapanır, ekrandaki görüntü fotoğraflanır. Önce kamerayı istediğin açıya getir.')),
      el('div', { class: 'ph-shutter-row' }, el('button', { class: 'ph-shutter', onClick: shoot })),
      el('h4', {}, `Galeri (${this.gallery.length})`),
      el('div', { class: 'ph-gallery' }, ...this.gallery.map((src, i) => el('button', { class: 'ph-thumb', onClick: () => this.composer(i) }, el('img', { src })))));
  }

  // ------------------------------------------------------------------ sosyal medya
  async appSocial(refresh) {
    const res = await this.act('social:feed', {});
    if (res?.posts) this.feedCache = res.posts;
    const body = this.page('ChaosGram');
    body.append(this.btn('➕ Yeni Paylaşım', 'primary wide', () => (this.gallery.length ? this.composer(0) : this.appCamera())));
    if (!this.feedCache.length) body.append(el('p', { class: 'ph-muted' }, 'Henüz paylaşım yok. İlk sen paylaş! 📸'));
    for (const p of this.feedCache) {
      body.append(el('div', { class: 'ph-post' },
        el('div', { class: 'ph-post-h' }, el('span', { class: 'ph-avatar sm' }, p.author[0]), el('b', {}, p.author), p.boost ? el('span', { class: 'ph-spons' }, 'Sponsorlu') : null),
        p.img ? el('img', { class: 'ph-post-img', src: p.img }) : null,
        el('div', { class: 'ph-post-a' },
          this.btn(`❤️ ${p.likes}`, 'ghost', async () => { await this.act('social:like', { postId: p.id }); this.appSocial(true); }),
          el('small', {}, `👁️ ${p.views.toLocaleString('tr-TR')}`)),
        el('p', {}, el('b', {}, p.author), ' ', p.caption, ' ', el('span', { class: 'ph-tags' }, p.tags)),
        p.building ? el('small', { class: 'ph-muted' }, `📍 ${p.building}`) : null));
    }
    void refresh;
  }

  composer(i) {
    const img = this.gallery[i];
    const body = this.page('Paylaş');
    const cap = el('textarea', { class: 'ph-input', placeholder: 'Açıklama yaz...', maxlength: 200, rows: 2, onFocus: () => (this._typing = true), onBlur: () => (this._typing = false), onKeydown: (e) => e.stopPropagation() });
    const tags = el('input', { class: 'ph-input', placeholder: '#etiketler', maxlength: 80, onKeydown: (e) => e.stopPropagation() });
    const shops = this.h.myShops();
    const sel = el('select', { class: 'ph-input' }, el('option', { value: '' }, 'İşletme etiketleme (isteğe bağlı)'), ...shops.map((b) => el('option', { value: b.id }, `🏪 ${b.name}`)));
    const est = el('small', { class: 'ph-muted' });
    const boost = this.slider(0, Math.max(0, Math.min(50000, Math.floor((this.self.balance ?? 0) / 100) * 100)), 100, 0, (v) => {
      est.textContent = v ? `≈ ${Math.round(60 + v * 0.24).toLocaleString('tr-TR')} kişiye ulaşır · ${Math.min(45, Math.round(v / 200))} müşteri dükkâna gelir` : 'Reklamsız: sadece takipçilerin görür';
      return `📣 ${tl(v)}`;
    });
    body.append(el('img', { class: 'ph-post-img', src: img }), cap, tags, sel, el('h4', {}, 'Reklam bütçesi (çubuğu kaydır)'), boost.node, est,
      this.btn('📤 Paylaş', 'primary wide', async () => {
        const r = await this.act('social:post', { img, caption: cap.value, tags: tags.value, buildingId: sel.value || null, boost: boost.value });
        if (r?.ok) this.appSocial(true);
      }));
  }

  // ------------------------------------------------------------------ sipariş + kurye
  async appOrder() {
    const L = await this.act('market:listings', {});
    const body = this.page('Sipariş · Kurye');
    const my = this.self.orders ?? [];
    const mine = my.filter((o) => o.buyerId === this.h.selfId());
    const job = my.find((o) => o.courierId === this.h.selfId());
    if (job) {
      body.append(el('div', { class: 'ph-card hl' }, el('b', {}, `🛵 Kurye işin: ${job.label}`),
        el('small', {}, job.status === 'pickup' ? `1) ${job.shopName} kapısına git, paketi al` : `2) ${job.buyerName}'in evine götür`),
        el('div', { class: 'ph-row-actions' },
          this.btn('📍 Haritada', '', () => { this.close(); this.h.showOnMap(job.status === 'pickup' ? job.shopDoor : job.homeDoor); }),
          this.btn(job.status === 'pickup' ? '📦 Paketi Al' : '✅ Teslim Et', 'primary', () => this.act('order:step', {}).then(() => this.appOrder())))));
    }
    if (mine.length) body.append(el('h4', {}, 'Siparişlerim'), ...mine.map((o) => el('div', { class: 'ph-card' }, el('b', {}, o.label), el('small', {}, `${o.shopName} · ${{ waiting: '⏳ Kurye bekleniyor', pickup: '🛵 Kurye dükkâna gidiyor', deliver: '🛵 Yolda', npc: '🛵 NPC kurye yolda', done: '✅ Teslim edildi' }[o.status]}`))));
    const jobs = await this.act('order:list', {});
    if (jobs?.jobs?.length && !job) body.append(el('h4', {}, `Kurye İşleri (${jobs.jobs.length})`), ...jobs.jobs.map((o) => el('div', { class: 'ph-card' }, el('b', {}, `${o.shopName} → ${o.buyerName}`), el('small', {}, `${o.label} · ${tl(o.fee)} + bahşiş`), this.btn('🛵 İşi Al', 'primary', () => this.act('order:accept', { orderId: o.id }).then(() => this.appOrder())))));
    body.append(el('h4', {}, 'Restoran & Market'));
    for (const s of (L?.shops ?? []).filter((x) => x.type !== 'clothing')) {
      const items = Object.entries(s.stock).filter(([k]) => k === 'food' || k === 'drink');
      if (!items.length) continue;
      body.append(el('div', { class: 'ph-card' }, el('b', {}, `${{ market: '🛒', cafe: '☕', restaurant: '🍽️' }[s.type] ?? '🏪'} ${s.name}`),
        el('div', { class: 'ph-row-actions' }, ...items.map(([k, v]) => this.btn(`${k === 'food' ? '🍞' : '🥤'} ×3 · ${tl(v.price * 3)}`, '', () => this.act('order:create', { shopId: s.id, product: k, qty: 3 }).then(() => this.appOrder()))))));
    }
    const cl = (L?.shops ?? []).find((x) => x.type === 'clothing');
    if (cl) {
      body.append(el('h4', {}, `👕 ${cl.name} · online mağaza`));
      const owned = new Set(this.self.wardrobe ?? []);
      for (const [id, o] of Object.entries(OUTFITS)) {
        if (owned.has(id)) continue;
        body.append(el('div', { class: 'ph-row' }, el('span', { class: 'ph-swatch', style: { background: `#${o.color.toString(16).padStart(6, '0')}` } }), el('div', { class: 'ph-rt' }, el('b', {}, o.label), el('small', {}, tl(priceOf(o.price, L.mul)))),
          this.btn('🛵 Sipariş', '', () => this.act('order:create', { shopId: cl.id, product: 'outfit', outfitId: id }).then(() => this.appOrder()))));
      }
    }
  }

  // ------------------------------------------------------------------ sahibinden
  async appIlan(tab = 'sale') {
    const L = await this.act('market:listings', {});
    const body = this.page('Sahibinden');
    body.append(el('div', { class: 'ph-tabs' }, ...[['sale', 'Satılık'], ['rent', 'Kiralık'], ['car', 'Vasıta']].map(([k, l]) => el('button', { class: `ph-tab ${tab === k ? 'on' : ''}`, onClick: () => this.appIlan(k) }, l))));
    if (tab === 'sale') {
      const items = (L?.items ?? []).sort((a, b) => a.price - b.price);
      if (!items.length) body.append(el('p', { class: 'ph-muted' }, 'Satılık ilan yok.'));
      for (const b of items) body.append(el('div', { class: 'ph-card' }, el('b', {}, `${this.h.icon(b.type)} ${b.name}`), el('small', {}, `💰 ${tl(b.price)}`),
        el('div', { class: 'ph-row-actions' }, this.btn('📍 Haritada', '', () => { this.close(); this.h.showOnMap(b); }), this.btn('🔑 Satın Al', 'primary', () => this.h.runAction({ type: 'property:buy', params: { buildingId: b.id }, confirm: `${b.name} · ${tl(b.price)} ödensin mi?` })))));
    } else if (tab === 'rent') {
      for (const r of L?.rentals ?? []) body.append(el('div', { class: 'ph-card' }, el('b', {}, `🏠 ${r.name}`), el('small', {}, `Kira ${tl(r.rent)}/gün · ${r.free} boş oda`)));
      if (!L?.rentals?.length) body.append(el('p', { class: 'ph-muted' }, 'Kiralık ilan yok.'));
    } else {
      for (const [id, c] of Object.entries(CARS)) body.append(el('div', { class: 'ph-card' }, el('b', {}, `🚗 ${c.label}`), el('small', {}, `Satış ${tl(priceOf(c.price, L?.mul))} · Kira ${tl(priceOf(c.rent, L?.mul))}/gün · ${c.speed * 4} km/s`),
        this.btn('📍 Bayiye Git', '', () => { this.close(); this.h.showBuildingType('car_dealer'); })));
    }
  }

  // ------------------------------------------------------------------ banka
  appBank() {
    const s = this.self;
    const body = this.page('Banka');
    body.append(el('div', { class: 'ph-bankcard' }, el('small', {}, 'KAOS BANK · Vadesiz'), el('div', { class: 'ph-big' }, tl(s.balance ?? 0)), el('small', {}, `Kredi limiti ${tl(s.loanLimit ?? 0)}`)));
    if (s.loan) {
      body.append(el('div', { class: 'ph-card hl' }, el('b', {}, `💳 Kredi borcu: ${tl(s.loan.owed)}`), el('small', {}, `Vade: ${s.loan.dueDay}. gün · gecikirse +%10 faiz${s.loan.late ? ` · ⚠️ ${s.loan.late} gecikme` : ''}`),
        this.btn('Borcu Kapat', 'primary', () => this.act('bank:repay', {}))));
    } else {
      const amt = this.slider(100, Math.max(100, s.loanLimit ?? 100), 100, Math.min(5000, s.loanLimit ?? 100), (v) => `${tl(v)} → geri ödeme ${tl(v * 1.15)}`);
      body.append(el('h4', {}, '💳 Kredi çek (%15 faiz, 3 gün vade)'), amt.node, this.btn('Krediyi Onayla', 'primary wide', () => this.act('bank:loan', { amount: amt.value })));
    }
    const people = this.contacts();
    if (people.length) {
      const to = el('select', { class: 'ph-input' }, ...people.map((r) => el('option', { value: r.id }, r.name)));
      const amt = this.slider(10, Math.max(10, Math.floor(s.balance ?? 10)), 10, Math.min(500, Math.floor(s.balance ?? 10)), (v) => tl(v));
      body.append(el('h4', {}, '💸 Para gönder'), to, amt.node, this.btn('Gönder', 'wide', () => this.act('bank:transfer', { to: to.value, amount: amt.value })));
    }
  }

  // ------------------------------------------------------------------ ekonomi
  async appEcon() {
    const L = await this.act('market:listings', {});
    const e = this.self.econ ?? { mul: 1, history: [] };
    const body = this.page('Ekonomi');
    const avg = (k) => { const v = (L?.shops ?? []).map((s) => s.stock[k]?.price).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    body.append(el('div', { class: 'ph-bankcard teal' }, el('small', {}, 'Fiyat & maaş endeksi'), el('div', { class: 'ph-big' }, `${(e.mul * 100).toFixed(1)}`), el('small', {}, 'Her 3 günde bir maaşlar ve fiyatlar birlikte artar')),
      el('div', { class: 'ph-card' }, el('b', {}, '🛒 Ortalama fiyatlar'), el('small', {}, `🍞 Gıda ${tl(avg('food'))} · 🥤 İçecek ${tl(avg('drink'))} · 📱 Elektronik ${tl(avg('electronics'))}`)),
      el('h4', {}, 'Zam geçmişi'),
      ...(e.history.length ? e.history.slice().reverse().map((x) => el('div', { class: 'ph-row' }, el('span', {}, '📈'), el('div', { class: 'ph-rt' }, el('b', {}, `+%${(x.rate * 100).toFixed(1)}`), el('small', {}, `${x.day}. gün · endeks ${(x.mul * 100).toFixed(1)}`)))) : [el('p', { class: 'ph-muted' }, 'Henüz zam olmadı. (3. günde ilk zam gelir)')]));
  }

  // ------------------------------------------------------------------ bahis
  appMatch() {
    const M = this.match;
    const body = this.page('Bahis · Kaos Arena');
    if (!M) { body.append(el('p', { class: 'ph-muted' }, 'Bugün maç yok. Her gün 00:00\'da yeni maç açıklanır, 14:00\'te başlar.')); return; }
    const H = CLUBS[M.home], A = CLUBS[M.away];
    const min = M.status === 'live' && M.startedAt ? Math.min(90, Math.floor((Date.now() - M.startedAt) / 1000)) : 0;
    body.append(el('div', { class: 'ph-match' },
      el('div', { class: 'ph-team' }, el('i', { style: { background: hex(H.color) } }), H.name),
      el('div', { class: 'ph-score' }, M.status === 'upcoming' ? '14:00' : `${M.score[0]} - ${M.score[1]}`, el('small', {}, M.status === 'live' ? `🔴 ${min}'` : M.status === 'done' ? 'MS' : 'Bugün')),
      el('div', { class: 'ph-team' }, el('i', { style: { background: hex(A.color) } }), A.name)));
    if (M.goals.length) body.append(el('div', { class: 'ph-card' }, ...M.goals.map((g) => el('small', {}, `⚽ ${g.min}' ${g.who}`))));
    if (M.status === 'upcoming') {
      const amt = this.slider(10, Math.max(10, Math.min(100000, Math.floor(this.self.balance ?? 10))), 10, Math.min(500, Math.floor(this.self.balance ?? 10)), (v) => tl(v));
      body.append(el('h4', {}, `🎟️ Bahis (havuz ${tl(M.pool)})`), amt.node,
        el('div', { class: 'ph-odds' }, ...[['h', `1 · ${H.name}`, M.odds.h], ['d', 'X · Beraberlik', M.odds.d], ['a', `2 · ${A.name}`, M.odds.a]].map(([k, l, o]) =>
          this.btn(el('span', {}, l, el('b', {}, `${o}`)), '', () => this.act('match:bet', { pick: k, amount: amt.value })))),
        el('h4', {}, '⚽ Oyuncu olarak katıl'),
        el('div', { class: 'ph-row-actions' }, this.btn(`${H.name} (${M.roster.h.length}/5)`, '', () => this.act('match:join', { side: 'h' })), this.btn(`${A.name} (${M.roster.a.length}/5)`, '', () => this.act('match:join', { side: 'a' }))),
        el('p', { class: 'ph-muted' }, 'Kadroya girersen maç saatinde stadyumda ol: sahada ⚽ Şut butonuyla gol atabilirsin. Kazanan takıma prim!'));
    }
    const mine = this.self.bets ?? [];
    if (mine.length) body.append(el('h4', {}, 'Kuponlarım'), ...mine.map((b) => el('div', { class: 'ph-row' }, el('span', {}, '🎟️'), el('div', { class: 'ph-rt' }, el('b', {}, `${b.pick === 'h' ? H.name : b.pick === 'a' ? A.name : 'Beraberlik'} · ${tl(b.amount)}`), el('small', {}, `Oran ${b.odds} → ${tl(b.amount * b.odds)}`)))));
    if (M.results?.length) body.append(el('h4', {}, 'Son maçlar'), ...M.results.map((r) => el('small', { class: 'ph-res' }, `${CLUBS[r.home].name} ${r.score[0]}-${r.score[1]} ${CLUBS[r.away].name}`)));
    body.append(this.btn('🏟️ Stadyuma Git', 'wide', () => { this.close(); this.h.showBuildingType('stadium'); }));
  }

  // ------------------------------------------------------------------ garaj / gardırop
  appGarage() {
    const s = this.self;
    const body = this.page('Garaj');
    if (!s.cars?.length) body.append(el('p', { class: 'ph-muted' }, 'Araban yok. Araba bayisinden satın al ya da kirala.'), this.btn('📍 Bayiye Git', 'primary wide', () => { this.close(); this.h.showBuildingType('car_dealer'); }));
    for (const c of s.cars ?? []) {
      const def = CARS[c.model];
      const driving = s.driving === c.model;
      body.append(el('div', { class: 'ph-card' }, el('b', {}, `🚗 ${def.label}`), el('small', {}, c.until ? `⏳ Kiralık (${Math.max(0, c.until - (this.h.hourNow() ?? 0))} sa kaldı)` : '✅ Senin'),
        this.btn(driving ? '🅿️ Park Et' : '🔑 Bin', driving ? '' : 'primary', () => this.act(driving ? 'car:park' : 'car:drive', { model: c.model }).then(() => this.close()))));
    }
  }

  appWardrobe() {
    const s = this.self;
    const body = this.page('Gardırop');
    const owned = s.wardrobe ?? [];
    if (!owned.length) body.append(el('p', { class: 'ph-muted' }, 'Henüz kıyafetin yok. Giyim mağazasından al ya da Sipariş uygulamasından eve getirt.'));
    for (const slot of ['top', 'bottom', 'hat', 'acc']) {
      const items = owned.filter((id) => OUTFITS[id]?.slot === slot);
      if (!items.length) continue;
      body.append(el('h4', {}, { top: 'Üst', bottom: 'Alt', hat: 'Şapka', acc: 'Aksesuar' }[slot]));
      for (const id of items) {
        const o = OUTFITS[id];
        const on = s.outfit?.[slot] === id;
        body.append(el('div', { class: 'ph-row' }, el('span', { class: 'ph-swatch', style: { background: hex(o.color) } }), el('div', { class: 'ph-rt' }, el('b', {}, o.label)),
          this.btn(on ? 'Çıkar' : 'Giy', on ? '' : 'primary', () => this.act('outfit:wear', on ? { slot } : { id }).then(() => setTimeout(() => this.appWardrobe(), 250)))));
      }
    }
  }

  // ------------------------------------------------------------------ adalet
  appCourt() {
    const s = this.self;
    const body = this.page('Adalet');
    if (s.myCase) body.append(el('div', { class: 'ph-card hl' }, el('b', {}, '⚖️ Davan görülüyor'), el('small', {}, `Suçlar: ${s.myCase.crimes.join(' · ') || '—'}`), el('small', {}, 'Hakim kararını verene kadar tutukevindesin.')));
    if (!s.cases) {
      body.append(el('p', { class: 'ph-muted' }, 'Hakim değilsin. Adliye\'ye gidip "Burada Çalış" dersen hakim olursun: tutuklanan oyuncuların cezasına sen karar verirsin.'), this.btn('📍 Adliye\'ye Git', 'wide', () => { this.close(); this.h.showBuildingType('court'); }));
      return;
    }
    if (!s.cases.length) body.append(el('p', { class: 'ph-muted' }, 'Bekleyen dava yok. Biri tutuklanınca burada görünür.'));
    for (const c of s.cases) {
      const mins = this.slider(0, 30, 1, Math.min(30, Math.max(1, c.wanted * 3)), (v) => (v ? `⛓️ ${v} dk hapis` : 'Hapis yok'));
      const fine = this.slider(0, Math.max(0, c.balance), Math.max(1, Math.round(c.balance / 100)), Math.round(c.balance * 0.1), (v) => `💰 ${tl(v)} para cezası`);
      const left = Math.max(0, Math.round((c.autoAt - Date.now()) / 1000));
      body.append(el('div', { class: 'ph-card' }, el('b', {}, `🧑‍⚖️ ${c.name} · ${'⭐'.repeat(Math.max(1, c.wanted))}`), el('small', {}, `Suçlar: ${c.crimes.join(' · ') || 'kayıt yok'}`), el('small', {}, `Cüzdan ${tl(c.balance)} · ${left} sn içinde karar verilmezse kanun uygulanır`),
        mins.node, fine.node,
        el('div', { class: 'ph-row-actions' },
          this.btn('🕊️ Beraat', '', () => this.act('court:verdict', { caseId: c.id, free: true })),
          this.btn('⚖️ Hükmü Ver', 'primary', () => this.act('court:verdict', { caseId: c.id, minutes: mins.value, fine: fine.value })),
          this.btn('💀 İdam', 'danger', () => this.h.confirm(`${c.name} idam edilsin mi? Ölür ve yeniden doğar, cezası biter.`).then((ok) => ok && this.act('court:verdict', { caseId: c.id, death: true, fine: fine.value }))))));
    }
  }
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
