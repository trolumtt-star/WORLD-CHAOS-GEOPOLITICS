import { el, clear } from '../core/dom.js';
import { Settings, Session, isNative, Tokens } from '../core/Settings.js';

const TIPS = [
  'NPC\'ler fiyat ve mesafeye bakar: rakibinden ucuz satarsan müşteri sana akar.',
  'Kira ödemeyen kiracı iki gün sonra icrayla evden çıkarılır.',
  'Mutsuz halk seçimde başkanı devirir. Vergileri fazla artırma!',
  'Hava Savunma Sistemi, menzildeki düşman füzelerini otomatik vurur.',
  'Soygun yaparsan aranma seviyen artar. Polis seni bulursa cezaevine gidersin.',
  'Fabrikaların bacası tütüyorsa işçiler çalışıyor demektir.',
  'Dükkanının stoğu biterse kamyonla toptan sipariş geçebilirsin.',
  'Nükleer füze tüm oyunculara alarm verir. Herkes ne yaptığını görür...',
  'Kendi işletmende çalışan NPC\'ler seçimde sana oy verme eğilimindedir.',
];

/** Ana menü, oda kur / katıl, ayarlar, nasıl oynanır, yükleme ekranı. */
export class Menu {
  constructor(app) {
    this.app = app;
    this.root = el('div', { class: 'menu hidden' });
    app.ui.append(this.root);
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  page(...children) {
    clear(this.root).append(el('div', { class: 'menu-inner' }, ...children));
    this.show();
  }

  back() { return el('button', { class: 'btn ghost back', onClick: () => { this.app.audio.play('close'); this.openMain(); } }, '‹ Geri'); }

  logo(small = false) {
    return el('div', { class: `menu-logo ${small ? 'small' : ''}` }, el('div', { class: 'ml-main' }, 'WORLD', el('span', {}, 'CHAOS')), el('div', { class: 'ml-sub' }, 'GEOPOLITICS · 3D · MULTIPLAYER'));
  }

  button(label, sub, onClick, cls = '') {
    return el('button', { class: `menu-btn ${cls}`, onClick: () => { this.app.audio.play('click'); onClick(); } }, el('b', {}, label), sub ? el('small', {}, sub) : null);
  }

  openMain() {
    const s = Session.get();
    this.page(
      this.logo(),
      el('div', { class: 'menu-buttons' },
        s?.code ? this.button(`▶ DEVAM ET`, `Oda ${s.code} · ${s.name}`, () => this.app.resume(), 'primary') : null,
        this.button('⚡ HIZLI OYNA', 'Sınırsız paralı Sandbox dünyası kur', () => this.quickPlay(), s?.code ? '' : 'primary'),
        this.button('🌍 ODA KUR', 'Arkadaşlarına davet kodu gönder', () => this.openCreate()),
        this.button('🌐 SUNUCUYA KATIL', 'Kayıtlı tüm dünyalar · arkadaşlarının dünyaları', () => this.openJoin()),
        el('div', { class: 'menu-row' },
          this.button('⚙️ Ayarlar', null, () => this.openSettings(), 'half'),
          this.button('❔ Nasıl Oynanır', null, () => this.openHelp(), 'half'))),
      el('div', { class: 'menu-foot' }, `v0.2 · ${Settings.get('serverUrl') || 'Sunucu ayarlanmadı'}`));
  }

  nameField() {
    const i = el('input', { maxlength: 16, placeholder: 'Takma adın', value: Settings.get('name') || '' });
    return { node: el('label', { class: 'field' }, el('span', {}, 'Takma ad'), i), get: () => { const v = i.value.trim(); Settings.set('name', v); return v; } };
  }

  error(text) {
    this.app.audio.play('error');
    this.app.toast(text, 'err');
  }

  async quickPlay() {
    const name = Settings.get('name') || `Oyuncu${Math.floor(Math.random() * 900 + 100)}`;
    Settings.set('name', name);
    await this.app.enter(() => this.app.net.createRoom({ name, roomName: `${name} Sandbox`, sandbox: true }));
  }

  openCreate() {
    const nm = this.nameField();
    const room = el('input', { maxlength: 24, placeholder: 'ör. Kaos Kardeşler' });
    const pw = el('input', { maxlength: 32, placeholder: 'Boş = herkese açık', type: 'password' });
    const npc = el('input', { type: 'range', min: 30, max: 120, step: 10, value: 50 });
    const npcLbl = el('b', {}, '50');
    npc.addEventListener('input', () => { npcLbl.textContent = npc.value; });
    let sandbox = false;
    const modeBtns = el('div', { class: 'seg' });
    const renderMode = () => {
      clear(modeBtns).append(
        el('button', { class: `seg-b ${!sandbox ? 'on' : ''}`, onClick: () => { sandbox = false; renderMode(); } }, '💼 Gerçekçi', el('small', {}, 'Az parayla başla')),
        el('button', { class: `seg-b ${sandbox ? 'on' : ''}`, onClick: () => { sandbox = true; renderMode(); } }, '💥 Sandbox', el('small', {}, '₺10 milyon, her şeyi dene')));
    };
    renderMode();
    this.page(this.back(), el('h2', {}, '🌍 Yeni Dünya Kur'),
      el('div', { class: 'form glass' },
        nm.node,
        el('label', { class: 'field' }, el('span', {}, 'Oda adı'), room),
        el('label', { class: 'field' }, el('span', {}, 'Şifre (isteğe bağlı)'), pw),
        el('label', { class: 'field' }, el('span', {}, 'NPC nüfusu: ', npcLbl), npc),
        el('div', { class: 'field' }, el('span', {}, 'Mod'), modeBtns),
        el('button', { class: 'btn primary wide big', onClick: async () => {
          const name = nm.get();
          if (!name) return this.error('Takma ad gerekli.');
          await this.app.enter(() => this.app.net.createRoom({ name, roomName: room.value.trim(), password: pw.value, sandbox, npcCount: Number(npc.value) }));
        } }, '🚀 DÜNYAYI YARAT')));
  }

  async openJoin(prefill = '') {
    const nm = this.nameField();
    const code = el('input', { maxlength: 5, placeholder: 'ABCDE', value: prefill, style: { textTransform: 'uppercase', letterSpacing: '6px', fontSize: '22px', textAlign: 'center' } });
    const pw = el('input', { maxlength: 32, placeholder: 'Varsa', type: 'password' });
    const list = el('div', { class: 'room-list' }, el('div', { class: 'muted' }, '🌐 Dünyalar yükleniyor...'));
    const status = el('div', { class: 'muted' });
    const go = async (c, password) => {
      const name = nm.get();
      if (!name) return this.error('Önce takma adını yaz.');
      await this.app.enter(() => this.app.net.joinRoom({ code: c, password, name, token: Tokens.get(c) }));
    };
    const join = () => {
      if (code.value.trim().length < 5) return this.error('Dünya kodu 5 karakter.');
      go(code.value.trim().toUpperCase(), pw.value);
    };
    this.page(this.back(), el('h2', {}, '🌐 Sunucu · Dünyalar'),
      el('div', { class: 'form glass' }, nm.node),
      status, list,
      el('details', { class: 'glass code-join' }, el('summary', {}, '🔑 Kodla katıl'),
        el('label', { class: 'field' }, el('span', {}, 'Dünya kodu'), code),
        el('label', { class: 'field' }, el('span', {}, 'Şifre'), pw),
        el('button', { class: 'btn primary wide', onClick: join }, 'KATIL')));
    if (!(await this.app.ensureConnected())) { clear(list).append(el('div', { class: 'muted' }, 'Sunucuya bağlanılamadı. (Sunucu uyuyorsa 30-60 sn bekleyip tekrar dene.)')); return; }
    const res = await this.app.net.listRooms();
    clear(list);
    status.textContent = res?.persistent ? '💾 Tüm dünyalar kayıtlı: kimse oynamasa da kaybolmaz, uyurken geçen zaman telafi edilir.' : '⚠️ Bu sunucuda kayıt kapalı: dünyalar sunucu yeniden başlayınca silinir.';
    if (!res?.ok || !res.rooms.length) list.append(el('div', { class: 'muted' }, 'Henüz dünya yok. Ana menüden bir tane kur!'));
    const ago = (iso) => {
      if (!iso) return '';
      const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      return m < 2 ? 'az önce' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} sa önce` : `${Math.round(m / 1440)} gün önce`;
    };
    for (const r of res?.rooms ?? []) {
      const mine = !!Tokens.get(r.code);
      const pwIn = el('input', { type: 'password', placeholder: '🔒 Şifre', maxlength: 32, class: 'row-pw', onClick: (e) => e.stopPropagation() });
      const needPw = r.locked && !mine;
      list.append(el('div', { class: `room-row ${r.live ? 'live' : ''}` },
        el('div', { class: 'rr-top' },
          el('b', {}, `${r.locked ? '🔒' : '🌍'} ${r.name}`),
          el('span', { class: `rr-state ${r.live ? 'on' : ''}` }, r.live ? (r.players ? `🟢 ${r.players} oyuncu` : '🟢 Açık') : '💤 Uyuyor')),
        el('small', {}, `${r.code}${r.owner ? ` · 👑 ${r.owner}` : ''} · Gün ${r.day} · 👥 ${r.population}${r.countries ? ` · 🏳️ ${r.countries} ülke` : ''}${r.sandbox ? ' · 💥 Sandbox' : ''}${!r.live && r.updatedAt ? ` · ${ago(r.updatedAt)}` : ''}`),
        r.playerNames?.length ? el('small', {}, `🎮 ${r.playerNames.slice(0, 6).join(', ')}${r.playerNames.length > 6 ? '…' : ''}`) : null,
        el('div', { class: 'rr-act' },
          needPw ? pwIn : null,
          el('button', { class: `btn mini ${mine ? 'primary' : ''}`, onClick: () => { this.app.audio.play('click'); go(r.code, pwIn.value); } }, mine ? '▶ Karakterinle Devam' : '➕ Katıl'))));
    }
  }

  openSettings(inGame = false) {
    const url = el('input', { value: Settings.get('serverUrl'), placeholder: 'http://192.168.1.20:3000', inputmode: 'url', autocapitalize: 'off' });
    const slider = (key, label) => {
      const i = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: Settings.get(key) });
      i.addEventListener('input', () => { Settings.set(key, Number(i.value)); this.app.audio.applyVolumes(); });
      return el('label', { class: 'field' }, el('span', {}, label), i);
    };
    const q = el('select', {}, ...['low', 'medium', 'high'].map((v) => el('option', { value: v, selected: Settings.get('quality') === v }, { low: 'Düşük (eski telefon)', medium: 'Orta', high: 'Yüksek' }[v])));
    q.addEventListener('change', () => { Settings.set('quality', q.value); this.app.toast('Grafik ayarı bir sonraki dünyada / yeniden başlatınca uygulanır.'); });
    const content = el('div', { class: 'form glass' },
      el('label', { class: 'field' }, el('span', {}, '🌐 Sunucu adresi'), url),
      el('p', { class: 'muted' }, isNative()
        ? 'APK sunucuyu barındırmaz. Arkadaşından birinin bilgisayarında "npm start" çalışmalı. Aynı Wi-Fi\'daysanız o bilgisayarın IP adresini yazın (ör. http://192.168.1.20:3000) ya da internetten bir sunucu/tünel adresi girin.'
        : 'Tarayıcıda oynarken genelde değiştirmen gerekmez.'),
      el('button', { class: 'btn wide', onClick: async () => {
        Settings.set('serverUrl', url.value.trim().replace(/\/$/, ''));
        const ok = await this.app.ensureConnected(true);
        this.app.toast(ok ? '✅ Sunucuya bağlanıldı!' : '❌ Bağlanılamadı. Adresi ve aynı ağda olduğunuzu kontrol et.', ok ? 'ok' : 'err');
      } }, '🔌 Kaydet & Bağlantıyı Test Et'),
      slider('master', '🔊 Ana ses'), slider('music', '🎵 Müzik'), slider('sfx', '💥 Efektler'),
      el('label', { class: 'field' }, el('span', {}, '🎨 Grafik kalitesi'), q));
    if (inGame) {
      const overlay = el('div', { class: 'menu-overlay' }, el('div', { class: 'menu-inner' }, el('button', { class: 'btn ghost back', onClick: () => overlay.remove() }, '‹ Oyuna dön'), el('h2', {}, '⚙️ Ayarlar'), content));
      this.app.ui.append(overlay);
      return;
    }
    this.page(this.back(), el('h2', {}, '⚙️ Ayarlar'), content);
  }

  openHelp() {
    const s = (t, b) => el('div', { class: 'help-sec glass' }, el('h4', {}, t), el('p', {}, b));
    this.page(this.back(), el('h2', {}, '❔ Nasıl Oynanır'),
      s('🎮 Kontroller', 'Mobil: sol alttaki joystick ile yürü, ekranı sürükleyerek kamerayı çevir, iki parmakla yakınlaş. Bir şeye dokun = incele. PC: WASD + Shift, fareyle sürükle, tekerlekle zoom, E = yakındaki binayı incele, M = ordu, B = mülkler.'),
      s('💼 Para kazan', 'Bir işyerine gidip "Burada Çalış" de, mesai saatlerinde kapısının yanında dur, saat başı maaş al. Ya da arsa al, market / kafe / fabrika kur. Fiyatını sen belirlersin, NPC\'ler ucuz ve yakın dükkanı seçer.'),
      s('🏠 Emlak', 'Kırmızı SATILIK tabelalı arsa ve binaları satın al. Ev ve apartmanlardan NPC kiracılar her gün kira öder. Ödemeyen icrayla çıkarılır. Mülkünü satışa çıkarırsan zengin NPC\'ler alabilir.'),
      s('🚚 Tedarik zinciri', 'Fabrikalar mal üretir, dükkanlar kamyonla sipariş verir. Demir-Çelik → Silah ve Elektronik fabrikaları → Mağazalar. Kamyonları haritada görebilirsin.'),
      s('🚨 Suç', 'Dükkan soyabilirsin ama aranma seviyen artar. Polis yakalarsa cezaevine ışınlanırsın. Kefalet ödeyerek çıkabilirsin. Çaresiz NPC\'ler de geceleri soygun yapar.'),
      s('🗳️ Siyaset', 'Belediye Sarayı\'nda aday ol, kampanyaya para bas. Seçimi kazanırsan vergi oranlarını belirlersin, hatta hazineden "örtülü ödenek" çekersin... ama skandal riski var!'),
      s('⚔️ Savaş', 'Kışla kurup piyade ve tank üret, haritada bir noktaya konuşlandır. Menzildeki düşman birliklerine ve binalarına kendiliğinden ateş açarlar. Füze Rampası ile taktik, balistik ve nükleer füze fırlat. Hava Savunma Sistemi gelen füzeleri havada vurur.'));
  }

  loading(text) {
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const l = el('div', { class: 'loading' }, el('div', { class: 'spinner big' }), el('div', { class: 'ld-text' }, text), el('div', { class: 'ld-tip' }, `💡 ${tip}`));
    this.app.ui.append(l);
    return () => { l.classList.add('out'); setTimeout(() => l.remove(), 400); };
  }
}
