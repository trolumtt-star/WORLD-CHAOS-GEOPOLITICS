import { el, clear, tl } from '../core/dom.js';

/**
 * Gizli yönetici paneli: sadece oda sahibi açabilir (telefonu hızlıca 4 kez aç-kapa).
 * Yapılanlar haber akışına düşmez; kimse fark etmez.
 */
export class AdminUI {
  constructor(root, { action, toast, sfx }) {
    this.action = action;
    this.toast = toast;
    this.sfx = sfx;
    this.sel = null;
    this.node = el('div', { class: 'admin hidden', onClick: (e) => e.stopPropagation() });
    root.append(this.node);
  }

  close() { this.node.classList.add('hidden'); }

  async open() {
    this.sfx?.('open');
    const st = await this.action('admin:state', {});
    if (!st?.ok) return;
    this.state = st;
    this.render();
    this.node.classList.remove('hidden');
  }

  async run(type, params) {
    const r = await this.action(type, params);
    if (r?.message) this.toast(r.message, r.ok ? 'ok' : 'err');
    else if (r?.error) this.toast(r.error, 'err');
    const st = await this.action('admin:state', {});
    if (st?.ok) { this.state = st; this.render(); }
  }

  render() {
    const st = this.state;
    const B = (label, fn, cls = '') => el('button', { class: `ad-btn ${cls}`, onClick: (e) => { e.stopPropagation(); this.sfx?.('click'); fn(); } }, label);
    const amount = el('input', { class: 'ad-in', type: 'number', value: 100000, onKeydown: (e) => e.stopPropagation() });
    const link = el('input', { class: 'ad-in', placeholder: 'https://chat.whatsapp.com/...', value: st.whatsapp ?? '', onKeydown: (e) => e.stopPropagation() });
    const players = st.players.filter((p) => !p.self);
    const sel = players.find((p) => p.id === this.sel) ?? null;
    const me = st.self ?? {};
    const tog = (flag, label) => B(`${label}: ${me[flag] ? 'AÇIK' : 'kapalı'}`, () => this.run('admin:self', { flag, on: !me[flag] }), me[flag] ? 'on' : '');
    clear(this.node).append(
      el('div', { class: 'ad-head' }, el('b', {}, '👑 YÖNETİCİ PANELİ'), el('small', {}, 'Sadece sen görüyorsun'), B('✕', () => this.close(), 'x')),
      el('div', { class: 'ad-body' },
        el('section', {},
          el('h4', {}, '🧍 Kendim'),
          el('div', { class: 'ad-grid' },
            tog('god', '🛡️ Ölümsüzlük'), tog('fly', '🕊️ Uçuş'), tog('noNeeds', '🍔 Açlıksızlık'),
            B('🔓 Hapisten kurtul / iyileş', () => this.run('admin:free', {})),
            B('🏙️ Son teknolojili şehir kur', () => this.run('admin:megacity', {}), 'gold'),
            B('⏩ 6 saat ileri sar', () => this.run('admin:time', { hours: 6 })),
            B('💰 Kendime para', () => this.run('admin:money', { amount: Number(amount.value) })))),
        el('section', {},
          el('h4', {}, '👥 Oyuncular'),
          el('div', { class: 'ad-list' }, ...(players.length ? players.map((p) => el('button', { class: `ad-p ${this.sel === p.id ? 'on' : ''}`, onClick: () => { this.sel = p.id; this.render(); } },
            el('b', {}, `${p.online ? '🟢' : '⚪'} ${p.name}`), el('small', {}, `${tl(p.balance)}${p.country ? ` · 🏳️ ${p.country}` : ''}${p.jailed ? ' · ⛓️' : ''}${p.dead ? ' · 💀' : ''}${p.frozen ? ' · 🧊' : ''}`))) : [el('small', {}, 'Başka oyuncu yok.')])),
          sel ? el('div', { class: 'ad-grid' },
            B(`💰 ${sel.name}'e para ver`, () => this.run('admin:money', { id: sel.id, amount: Number(amount.value) })),
            B('💸 Parasını al', () => this.run('admin:money', { id: sel.id, amount: -Number(amount.value) })),
            B('🌀 Yanına git', () => this.run('admin:goto', { id: sel.id })),
            B('🧲 Yanıma getir', () => this.run('admin:troll', { id: sel.id, kind: 'bring' })),
            B('🔓 Serbest bırak', () => this.run('admin:free', { id: sel.id })),
            B('⛓️ Hapse at', () => this.run('admin:troll', { id: sel.id, kind: 'jail' }), 'red'),
            B('🧊 Dondur (1 dk)', () => this.run('admin:troll', { id: sel.id, kind: 'freeze' }), 'red'),
            B('🎲 Rastgele ışınla', () => this.run('admin:troll', { id: sel.id, kind: 'teleport' }), 'red'),
            B('🥵 Aç bırak', () => this.run('admin:troll', { id: sel.id, kind: 'starve' }), 'red'),
            B('⭐ 5 yıldız aranan', () => this.run('admin:troll', { id: sel.id, kind: 'wanted' }), 'red'),
            B('📉 İflas ettir', () => this.run('admin:troll', { id: sel.id, kind: 'broke' }), 'red'),
            B('💀 Öldür', () => this.run('admin:troll', { id: sel.id, kind: 'kill' }), 'red'),
            B('⛔ BANLA', () => this.run('admin:ban', { id: sel.id }), 'red strong')) : el('small', { class: 'ad-hint' }, 'Bir oyuncu seç.'),
          el('label', { class: 'ad-amount' }, 'Tutar ₺', amount)),
        st.banned?.length ? el('section', {}, el('h4', {}, '⛔ Yasaklılar'), ...st.banned.map((n) => el('div', { class: 'ad-ban' }, n, B('Kaldır', () => this.run('admin:unban', { name: n }))))) : null,
        el('section', {},
          el('h4', {}, '🔗 Güncelleme linki (WhatsApp grubu)'),
          el('small', { class: 'ad-hint' }, 'Güncelleme gelince eski APK\'lılara "WhatsApp\'ı Aç" butonu bu linki açar. Grubun davet linkini yapıştır.'),
          link, B('Kaydet', () => this.run('admin:updateLink', { url: link.value })))));
  }
}
