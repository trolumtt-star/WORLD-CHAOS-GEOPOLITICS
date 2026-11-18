import { el, tl, pad, clear } from '../core/dom.js';
import { Minimap } from './Minimap.js';

const CATEGORY_LABELS = { residential: '🏠 Konut', commercial: '🛍️ Ticaret', industrial: '🏭 Sanayi', military: '🪖 Askeri' };
const WEATHER = (h) => (h >= 6 && h < 19 ? (h < 8 || h >= 17 ? '🌅' : '☀️') : '🌙');

/**
 * Oyun içi arayüz (mobil öncelikli). Sunucudan gelen "action" tanımlarını butonlara çevirir;
 * aksiyonun ne yapacağını Game belirler (handlers.onAction).
 */
export class GameUI {
  constructor(root, { catalog, world, selfId, room, touch, audio, handlers }) {
    this.root = root;
    this.catalog = catalog;
    this.selfId = selfId;
    this.room = room;
    this.touch = touch;
    this.audio = audio;
    this.h = handlers;
    this.self = {};
    this.city = null;
    this.newsLog = [];
    this.balanceShown = 0;
    this.sheetKind = null;
    this.build(world);
  }

  sfx(n) { this.audio?.play(n); }

  build(world) {
    const btn = (label, cls, onClick, title) => el('button', { class: `btn ${cls ?? ''}`, title, onClick: (e) => { e.stopPropagation(); this.sfx('click'); onClick(); } }, label);

    this.elClock = el('div', { class: 'st-clock' }, '');
    this.elBalance = el('div', { class: 'st-balance' }, '₺0');
    this.elWanted = el('div', { class: 'st-wanted' });
    this.elTitle = el('div', { class: 'st-title' });
    const status = el('div', { class: 'glass status' }, this.elClock, this.elBalance, el('div', { class: 'st-row' }, this.elTitle, this.elWanted));

    const roomChip = btn(`🔗 ${this.room.code}`, 'chip room', () => this.share());
    this.canvasMini = el('canvas', { class: 'minimap' });
    this.canvasMini.addEventListener('click', () => this.canvasMini.classList.toggle('big'));
    const topRight = el('div', { class: 'top-right' },
      el('div', { class: 'icon-row' },
        btn('📰', 'icon', () => this.openNews(), 'Haberler'),
        btn('🏆', 'icon', () => this.openCity('rank'), 'Sıralama'),
        btn('⚙️', 'icon', () => this.h.onMenu(), 'Menü')),
      this.canvasMini);

    this.ticker = el('div', { class: 'ticker' });
    this.hint = el('div', { class: 'interact-hint hidden' });

    const actions = el('div', { class: 'actions' },
      btn(el('span', {}, '🔍', el('small', {}, 'İncele')), 'big primary', () => this.h.onInteract()),
      btn(el('span', {}, '🏠', el('small', {}, 'Mülklerim')), 'big', () => this.h.onProperties()),
      btn(el('span', {}, '⚔️', el('small', {}, 'Ordu')), 'big danger', () => this.openMilitary()),
      btn(el('span', {}, '🏛️', el('small', {}, 'Şehir')), 'big', () => this.openCity('city')));

    this.sprintBtn = this.touch ? btn('🏃', 'sprint', () => {
      const on = this.h.onSprintToggle();
      this.sprintBtn.classList.toggle('on', on);
    }) : null;

    // Alt sayfa (inceleme / yönetim / menüler)
    this.sheetIcon = el('div', { class: 'sh-icon' });
    this.sheetTitle = el('div', { class: 'sh-title' });
    this.sheetSub = el('div', { class: 'sh-sub' });
    this.sheetBody = el('div', { class: 'sh-body' });
    this.sheet = el('div', { class: 'sheet glass hidden' },
      el('div', { class: 'sh-head' }, this.sheetIcon, el('div', { class: 'sh-titles' }, this.sheetTitle, this.sheetSub),
        el('button', { class: 'sh-close', onClick: () => this.closeSheet() }, '✕')),
      this.sheetBody);

    this.modalLayer = el('div', { class: 'modal-layer hidden' });
    this.alertLayer = el('div', { class: 'alert-layer' });
    this.nukeOverlay = el('div', { class: 'nuke-overlay hidden' });
    this.targetBar = el('div', { class: 'target-bar glass hidden' });
    this.jail = el('div', { class: 'jail hidden' });
    this.reconnect = el('div', { class: 'reconnect hidden' }, el('div', { class: 'spinner' }), 'Bağlantı koptu, yeniden bağlanılıyor...');

    this.hud = el('div', { class: 'hud' },
      el('div', { class: 'hud-top' }, status, roomChip, topRight),
      this.ticker, this.hint, actions, this.sprintBtn,
      this.sheet, this.targetBar, this.jail, this.nukeOverlay, this.alertLayer, this.modalLayer, this.reconnect);
    this.root.append(this.hud);

    this.minimap = new Minimap(this.canvasMini, world, this.catalog);

    this.crosshair = el('div', { class: 'crosshair hidden' });
    this.lockHint = el('div', { class: 'lock-hint' }, '🖱️ Ekrana tıkla: fareyle etrafa bak · Esc: imleci serbest bırak');
    if (this.touch) this.lockHint.classList.add('hidden');
    this.hud.append(this.crosshair, this.lockHint);
  }

  setPointerLock(on) {
    this.crosshair.classList.toggle('hidden', !on);
    this.lockHint.textContent = on ? '🎯 Tıkla: nişangahtakini incele · Esc: imleç' : '🖱️ Ekrana tıkla: fareyle etrafa bak · Esc: imleci serbest bırak';
  }

  destroy() { this.hud.remove(); }

  // ------------------------------------------------------------------ durum
  setClock(day, hour, minute) {
    const t = `${WEATHER(hour)} Gün ${day} · ${pad(hour)}:${pad(minute)}`;
    if (t !== this._clock) { this.elClock.textContent = t; this._clock = t; }
  }

  setSelf(s) {
    const prev = this.self;
    this.self = { ...this.self, ...s };
    if (prev.balance !== undefined && s.balance !== prev.balance) {
      const up = s.balance > prev.balance;
      this.elBalance.classList.remove('up', 'down');
      void this.elBalance.offsetWidth;
      this.elBalance.classList.add(up ? 'up' : 'down');
    }
    this.elWanted.textContent = s.wanted ? '⭐'.repeat(s.wanted) : '';
    this.elWanted.classList.toggle('flash', s.wanted > 0);
    this.elTitle.textContent = s.title ?? 'Vatandaş';
    this.setJail(s.jailed);
  }

  tickBalance(dt) {
    const target = this.self.balance ?? 0;
    if (Math.abs(target - this.balanceShown) < 1) this.balanceShown = target;
    else this.balanceShown += (target - this.balanceShown) * Math.min(1, dt * 6);
    const t = tl(this.balanceShown);
    if (t !== this._bal) { this.elBalance.textContent = t; this._bal = t; }
  }

  setCity(payload) {
    this.city = payload;
    if (this.sheetKind === 'city' || this.sheetKind === 'rank') this.openCity(this.sheetKind, true);
  }

  setJail(on) {
    if (!on) { this.jail.classList.add('hidden'); return; }
    if (!this.jail.classList.contains('hidden')) return;
    clear(this.jail).append(
      el('div', { class: 'bars' }),
      el('div', { class: 'jail-card glass' },
        el('h2', {}, '⛓️ CEZAEVİNDESİN'),
        el('p', {}, 'Polis seni yakaladı. Süren dolana kadar bekle ya da kefalet öde.'),
        el('button', { class: 'btn primary wide', onClick: () => this.h.onAction({ type: 'crime:bail', params: {} }) }, '🔓 Kefalet Öde')));
    this.jail.classList.remove('hidden');
  }

  setReconnecting(on) { this.reconnect.classList.toggle('hidden', !on); }

  setInteractHint(b) {
    if (!b) { this.hint.classList.add('hidden'); return; }
    this.hint.textContent = `${this.touch ? '🔍' : '[E]'} ${b.name}`;
    this.hint.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ bildirimler
  news(item) {
    this.newsLog.unshift(item);
    this.newsLog.length = Math.min(this.newsLog.length, 60);
    const n = el('div', { class: `news-item cat-${item.category}` }, el('span', { class: 't' }, item.time?.split(' ')[2] ?? ''), item.text);
    this.ticker.prepend(n);
    while (this.ticker.children.length > 3) this.ticker.lastChild.remove();
    setTimeout(() => n.classList.add('fade'), 6500);
    setTimeout(() => n.remove(), 7300);
    if (this.sheetKind === 'news') this.openNews(true);
  }

  toast(text, kind = 'info') {
    const t = el('div', { class: `toast ${kind}` }, text);
    this.alertLayer.append(t);
    setTimeout(() => t.classList.add('fade'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  alert(a) {
    if (a.level === 'nuclear') {
      clear(this.nukeOverlay).append(el('div', { class: 'nuke-text' }, el('div', { class: 'nuke-icon' }, '☢️'), el('div', {}, a.text), el('div', { class: 'nuke-eta' })));
      this.nukeOverlay.classList.remove('hidden');
      const eta = this.nukeOverlay.querySelector('.nuke-eta');
      const end = performance.now() + (a.etaMs ?? 15000);
      const iv = setInterval(() => {
        const left = Math.max(0, end - performance.now());
        eta.textContent = `ÇARPMAYA: ${(left / 1000).toFixed(1)} sn`;
        if (left <= 0) { clearInterval(iv); this.nukeOverlay.classList.add('hidden'); }
      }, 100);
      return;
    }
    const b = el('div', { class: `banner ${a.level}` }, a.text);
    this.alertLayer.append(b);
    setTimeout(() => b.classList.add('fade'), 4500);
    setTimeout(() => b.remove(), 5200);
  }

  share() {
    const text = `WORLD CHAOS'a gel! Oda kodu: ${this.room.code}`;
    if (navigator.share) navigator.share({ title: 'WORLD CHAOS', text }).catch(() => {});
    else navigator.clipboard?.writeText(this.room.code).then(() => this.toast('Oda kodu kopyalandı: ' + this.room.code));
  }

  // ------------------------------------------------------------------ modal
  confirm(text) {
    return new Promise((resolve) => {
      const close = (v) => { this.modalLayer.classList.add('hidden'); clear(this.modalLayer); resolve(v); };
      clear(this.modalLayer).append(el('div', { class: 'modal glass' },
        el('p', {}, text),
        el('div', { class: 'row' },
          el('button', { class: 'btn ghost', onClick: () => close(false) }, 'Vazgeç'),
          el('button', { class: 'btn primary', onClick: () => close(true) }, 'Onayla'))));
      this.modalLayer.classList.remove('hidden');
    });
  }

  form(input) {
    return new Promise((resolve) => {
      const inputs = {};
      const close = (v) => { this.modalLayer.classList.add('hidden'); clear(this.modalLayer); resolve(v); };
      const fields = input.fields.map((f) => {
        const i = el('input', { type: f.kind === 'number' ? 'number' : 'text', inputmode: f.kind === 'number' ? 'decimal' : 'text', value: f.value ?? '', min: f.min, max: f.max, step: f.step ?? 'any', placeholder: f.placeholder ?? '' });
        inputs[f.key] = { i, f };
        return el('label', { class: 'field' }, el('span', {}, f.label), i);
      });
      const submit = () => {
        const out = {};
        for (const [k, { i, f }] of Object.entries(inputs)) out[k] = f.kind === 'number' ? Number(i.value) : i.value;
        close(out);
      };
      clear(this.modalLayer).append(el('form', { class: 'modal glass', onSubmit: (e) => { e.preventDefault(); submit(); } },
        el('h3', {}, input.title ?? ''), ...fields,
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn ghost', onClick: () => close(null) }, 'Vazgeç'),
          el('button', { type: 'submit', class: 'btn primary' }, 'Tamam'))));
      this.modalLayer.classList.remove('hidden');
      setTimeout(() => fields[0]?.querySelector('input')?.focus(), 50);
    });
  }

  // ------------------------------------------------------------------ sayfa
  openSheet(kind, { icon, title, subtitle }, ...content) {
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.sheetKind !== kind) this.sfx('open');
    this.sheetKind = kind;
    this.sheetIcon.textContent = icon ?? '';
    this.sheetTitle.textContent = title ?? '';
    this.sheetSub.textContent = subtitle ?? '';
    const scroll = this.sheetBody.scrollTop;
    clear(this.sheetBody).append(...content);
    this.sheetBody.scrollTop = scroll;
    this.sheet.classList.remove('hidden');
    this.hud.classList.add('sheet-open');
  }

  closeSheet() {
    if (this.sheetKind) this.sfx('close');
    this.sheet.classList.add('hidden');
    this.hud.classList.remove('sheet-open');
    this.sheetKind = null;
    this.h.onSheetClosed?.();
  }

  actionButton(a) {
    return el('button', { class: `btn ${a.style ?? ''} wide`, onClick: () => { this.sfx('click'); this.h.onAction(a); } }, a.label);
  }

  showInspect(data) {
    if (!data) return;
    const rows = el('table', { class: 'rows' }, ...data.rows.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, v))));
    const parts = [rows];
    if (data.manage) parts.push(this.manageSection(data.manage));
    if (data.actions?.length) parts.push(el('div', { class: 'action-list' }, ...data.actions.map((a) => this.actionButton(a))));
    this.openSheet(`inspect:${data.kind}:${data.id}`, { icon: data.icon, title: data.title, subtitle: data.subtitle }, ...parts);
  }

  manageSection(m) {
    const A = (type, params, extra = {}) => this.h.onAction({ type, params: { buildingId: m.buildingId, ...params }, ...extra });
    const items = m.stock.map((s) => {
      const margin = s.wholesale ? Math.round(((s.price - s.wholesale) / s.wholesale) * 100) : null;
      const priceCtl = s.sell ? el('div', { class: 'price-ctl' },
        el('button', { class: 'btn mini', onClick: () => A('shop:setPrice', { product: s.product, price: +(s.price * 0.95).toFixed(2) }) }, '−'),
        el('button', { class: 'price', onClick: () => A('shop:setPrice', { product: s.product }, { input: { title: `${s.label} satış fiyatı`, fields: [{ key: 'price', label: 'Fiyat (₺)', kind: 'number', min: 0.1, value: s.price }] } }) }, `₺${s.price.toFixed(2).replace('.', ',')}`),
        el('button', { class: 'btn mini', onClick: () => A('shop:setPrice', { product: s.product, price: +(s.price * 1.05).toFixed(2) }) }, '+')) : el('div', { class: 'muted' }, 'Hammadde');
      return el('div', { class: 'stock-item' },
        el('div', { class: 'si-head' }, el('span', { class: 'si-name' }, `${s.icon} ${s.label}`), priceCtl),
        el('div', { class: 'si-info' },
          el('span', {}, `Stok: ${s.qty}${s.incoming ? ` (+${s.incoming} 🚚)` : ''}`),
          s.sell ? el('span', {}, `Dün: ${s.soldYesterday} satış`) : null,
          s.wholesale ? el('span', {}, `Toptan ${tl(s.wholesale)}${margin !== null ? ` · kâr %${margin}` : ''}`) : el('span', { class: 'warn' }, 'Tedarikçi yok')),
        el('div', { class: 'si-actions' },
          s.restockTo ? el('button', { class: `toggle ${s.autoRestock ? 'on' : ''}`, onClick: () => A('shop:setRestock', { product: s.product, autoRestock: !s.autoRestock }) }, s.autoRestock ? `🔄 Oto-tedarik (${s.restockTo})` : '⏸️ Oto-tedarik kapalı') : el('span'),
          s.wholesale ? el('button', { class: 'btn mini primary', onClick: () => A('shop:order', { product: s.product }, { input: { title: `${s.label} siparişi · ${tl(s.wholesale)}/adet`, fields: [{ key: 'qty', label: 'Adet', kind: 'number', min: 1, max: 500, value: Math.max(10, (s.restockTo || 40) - s.qty) }] } }) }, '🚚 Sipariş') : null));
    });
    return el('div', { class: 'manage' },
      el('div', { class: 'manage-head' },
        el('div', {}, el('small', {}, 'KASA'), el('b', {}, tl(m.till))),
        el('div', {}, el('small', {}, 'BUGÜN CİRO'), el('b', {}, tl(m.revenueToday))),
        el('div', {}, el('small', {}, 'DÜN'), el('b', {}, tl(m.revenueYesterday)))),
      ...items);
  }

  openBuild(buildingId) {
    const groups = {};
    for (const o of this.catalog.buildOptions) (groups[o.category] ??= []).push(o);
    const content = Object.entries(groups).map(([cat, opts]) => el('div', { class: 'build-group' },
      el('h4', {}, CATEGORY_LABELS[cat] ?? cat),
      el('div', { class: 'card-grid' }, ...opts.map((o) => el('button', {
        class: `build-card ${(this.self.balance ?? 0) < o.cost ? 'poor' : ''}`,
        onClick: () => this.h.onAction({
          type: 'property:build',
          params: { buildingId, type: o.type, subtype: o.subtype },
          input: { title: `${o.icon} ${o.label} · ${tl(o.cost)} · ${o.hours} saat`, fields: [{ key: 'name', label: 'İşletme adı (boş bırakabilirsin)', kind: 'text', value: '' }] },
        }),
      }, el('div', { class: 'bc-icon' }, o.icon), el('div', { class: 'bc-name' }, o.label), el('div', { class: 'bc-cost' }, tl(o.cost)), el('div', { class: 'bc-time' }, `⏱ ${o.hours} sa`))))));
    this.openSheet('build', { icon: '🏗️', title: 'İnşaat', subtitle: 'Arsana ne dikmek istersin?' }, ...content);
  }

  openMilitary(myUnits = this.h.myUnitCount?.() ?? 0) {
    const { units, missiles } = this.catalog;
    const unitCards = Object.entries(units).map(([k, u]) => el('button', { class: 'build-card mil', onClick: () => this.h.onAction({ type: 'military:train', params: { unitType: k } }) },
      el('div', { class: 'bc-icon' }, u.icon), el('div', { class: 'bc-name' }, u.label), el('div', { class: 'bc-cost' }, tl(u.cost)),
      el('div', { class: 'bc-time' }, `❤️ ${u.hp} · 🎯 ${u.range}m`)));
    const missileCards = Object.entries(missiles).map(([k, m]) => el('button', { class: `build-card mil ${k === 'nuclear' ? 'nuke' : ''}`, onClick: () => this.h.onTargetMissile(k, m) },
      el('div', { class: 'bc-icon' }, m.icon), el('div', { class: 'bc-name' }, m.label), el('div', { class: 'bc-cost' }, tl(m.cost)),
      el('div', { class: 'bc-time' }, `💥 ${m.radius}m yarıçap`)));
    this.openSheet('military', { icon: '⚔️', title: 'Genelkurmay', subtitle: `${myUnits} birliğin var` },
      el('p', { class: 'muted' }, 'Birlik üretmek için bir Kışla, füze için Füze Rampası gerekir. Düşman füzelerine karşı Hava Savunma Sistemi kur. (Boş arsa satın al → İnşa Et → Askeri)'),
      el('h4', {}, '🪖 Kara Kuvvetleri'), el('div', { class: 'card-grid' }, ...unitCards),
      el('button', { class: 'btn primary wide', onClick: () => this.h.onTargetMove() }, `🎯 Tüm Birliklerimi Konuşlandır (${myUnits})`),
      el('h4', {}, '🚀 Füze Kuvvetleri'), el('div', { class: 'card-grid' }, ...missileCards));
  }

  openCity(tab = 'city', refresh = false) {
    const c = this.city;
    if (!c) return;
    const s = c.stats;
    const p = c.politics;
    const pct = (v) => `%${Math.round(v * 100)}`;
    const tabs = el('div', { class: 'tabs' },
      el('button', { class: `tab ${tab === 'city' ? 'on' : ''}`, onClick: () => this.openCity('city') }, '🏛️ Şehir'),
      el('button', { class: `tab ${tab === 'rank' ? 'on' : ''}`, onClick: () => this.openCity('rank') }, '🏆 Sıralama'));
    let body;
    if (tab === 'city') {
      const meter = (label, v, bad = false) => el('div', { class: 'meter' }, el('span', {}, label), el('div', { class: 'bar' }, el('i', { style: { width: `${Math.max(0, Math.min(100, v))}%`, background: bad ? (v > 50 ? '#ff4d4d' : '#ffb84d') : (v > 50 ? '#3ddc84' : '#ffb84d') } })), el('b', {}, `${Math.round(v)}`));
      body = el('div', {},
        el('div', { class: 'stat-grid' },
          el('div', {}, el('small', {}, 'HAZİNE'), el('b', {}, tl(c.treasury))),
          el('div', {}, el('small', {}, 'NÜFUS'), el('b', {}, s.population)),
          el('div', {}, el('small', {}, 'İŞSİZLİK'), el('b', {}, `%${s.unemploymentRate}`)),
          el('div', {}, el('small', {}, 'EVSİZ'), el('b', {}, s.homeless)),
          el('div', {}, el('small', {}, 'HAPİSTE'), el('b', {}, s.jailed)),
          el('div', {}, el('small', {}, 'ORT. SERVET'), el('b', {}, tl(s.avgNpcBalance)))),
        meter('😊 Mutluluk', s.happiness), meter('🍞 Açlık', s.hunger, true), meter('🚨 Suç', Math.min(100, s.crimeIndex * 5), true),
        el('h4', {}, '🗳️ Siyaset'),
        el('table', { class: 'rows' },
          el('tr', {}, el('td', {}, 'Başkan'), el('td', {}, `${p.mayor?.name ?? '-'} (${p.mayor?.party ?? ''})`)),
          el('tr', {}, el('td', {}, 'Muhalefet'), el('td', {}, `${p.opposition?.name ?? '-'} (${p.opposition?.party ?? ''})`)),
          el('tr', {}, el('td', {}, 'Adaylar'), el('td', {}, p.candidates.map((x) => x.name).join(', ') || '—')),
          el('tr', {}, el('td', {}, 'Sonraki seçim'), el('td', {}, `Gün ${p.nextElectionDay}`)),
          el('tr', {}, el('td', {}, 'Son sonuç'), el('td', {}, p.lastResult?.map((r) => `${r.name} %${r.pct}`).join(' · ') ?? '—')),
          el('tr', {}, el('td', {}, 'Vergiler'), el('td', {}, `Gelir ${pct(c.policy.incomeTax)} · KDV ${pct(c.policy.salesTax)} · Emlak ‰${(c.policy.propertyTax * 1000).toFixed(1)}`)),
          el('tr', {}, el('td', {}, 'İşsizlik maaşı'), el('td', {}, `${tl(c.policy.welfare)}/gün`))),
        el('p', { class: 'muted' }, 'Aday olmak, kampanya yürütmek ve başkansan vergileri değiştirmek için Belediye Sarayı\'na git ve incele.'));
    } else {
      body = el('div', { class: 'rank' }, ...c.leaderboard.map((r, i) => el('div', { class: `rank-row ${r.id === this.selfId ? 'me' : ''}` },
        el('span', { class: 'pos' }, ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`),
        el('span', { class: 'dot', style: { background: r.color } }),
        el('span', { class: 'nm' }, r.name, el('small', {}, ` ${r.title}${r.online ? '' : ' · 💤'}`)),
        el('b', {}, tl(r.netWorth)))));
    }
    this.openSheet(tab, { icon: tab === 'city' ? '🏛️' : '🏆', title: tab === 'city' ? 'Şehir Durumu' : 'Servet Sıralaması', subtitle: `Oda ${this.room.code} · ${this.room.name}` }, tabs, body);
  }

  openNews(refresh = false) {
    this.openSheet('news', { icon: '📰', title: 'Şehir Gazetesi', subtitle: 'Son gelişmeler' },
      el('div', { class: 'news-list' }, ...this.newsLog.map((n) => el('div', { class: `news-row cat-${n.category}` }, el('small', {}, n.time), el('div', {}, n.text)))));
  }

  openProperties(list) {
    const content = list.length
      ? list.map((b) => el('button', { class: 'prop-row', onClick: () => this.h.onInspect('building', b.id) },
        el('span', { class: 'pi' }, this.catalog.buildings[b.type]?.icon ?? '🏠'),
        el('span', { class: 'pn' }, b.name, el('small', {}, b.construction ? ` · 🏗️ %${Math.round(b.construction.progress * 100)}` : b.destroyed ? ' · 🔥 yıkık' : b.forSale ? ' · 📢 satılıkta' : '')),
        el('span', { class: 'go' }, '›')))
      : [el('p', { class: 'muted' }, 'Henüz mülkün yok. Haritada kırmızı "SATILIK" tabelalı bir arsa ya da bina bul, incele ve tapusunu al!')];
    this.openSheet('props', { icon: '🏠', title: 'Mülklerim', subtitle: `${list.length} tapu` }, ...content);
  }

  menu(items) {
    this.openSheet('menu', { icon: '⚙️', title: 'Menü', subtitle: '' }, ...items.map((i) => el('button', { class: `btn wide ${i.style ?? ''}`, onClick: i.onClick }, i.label)));
  }

  // ------------------------------------------------------------------ hedefleme
  setTargeting(text, { onConfirm, onCancel, canConfirm = false } = {}) {
    if (!text) { this.targetBar.classList.add('hidden'); this.hud.classList.remove('targeting'); return; }
    clear(this.targetBar).append(
      el('div', { class: 'tb-text' }, text),
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost', onClick: onCancel }, '✖ İptal'),
        canConfirm ? el('button', { class: 'btn danger', onClick: onConfirm }, '✔ ONAYLA') : null));
    this.targetBar.classList.remove('hidden');
    this.hud.classList.add('targeting');
  }
}
