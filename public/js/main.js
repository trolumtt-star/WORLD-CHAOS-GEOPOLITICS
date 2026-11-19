import { EVENTS } from '../shared/events.js';
import { el } from './core/dom.js';
import { Settings, Session, isNative, Tokens } from './core/Settings.js';
import { Network } from './net/Network.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { createRenderer } from './render/SceneSetup.js';
import { MenuBackdrop } from './render/MenuBackdrop.js';
import { Menu } from './ui/Menu.js';
import { bootScreen, playIntro } from './ui/Intro.js';
import { Game } from './game/Game.js';

/** Uygulama durum makinesi: boot → intro → menü ⇄ oyun */
class App {
  constructor() {
    if (isNative()) document.documentElement.classList.add('native');
    this.ui = document.getElementById('ui');
    this.renderer = createRenderer(document.getElementById('gl'));
    this.audio = new AudioEngine();
    this.net = new Network();
    this.menu = new Menu(this);
    this.backdrop = null;
    this.game = null;
    this.net.persist(EVENTS.INIT, (init) => this.onInit(init));
    this.toastLayer = el('div', { class: 'app-toasts' });
    this.ui.append(this.toastLayer);
    window.addEventListener('error', (e) => console.error(e.error ?? e.message));
  }

  async start() {
    this.backdrop = new MenuBackdrop(this.renderer, this.audio);
    await bootScreen(this.ui);
    this.audio.init();
    this.audio.setMusic('menu');
    if (!Settings.get('introSeen') || !Session.get()) {
      await playIntro(this.ui, this.audio, this.backdrop);
      Settings.set('introSeen', true);
    }
    this.menu.openMain();
    if (isNative() && !Settings.get('serverUrl')) {
      this.menu.openSettings();
      this.toast('Önce oyun sunucusunun adresini gir.', 'info');
    }
  }

  toast(text, kind = 'info') {
    const t = el('div', { class: `toast ${kind}` }, text);
    this.toastLayer.append(t);
    setTimeout(() => t.classList.add('fade'), 2800);
    setTimeout(() => t.remove(), 3400);
  }

  async ensureConnected(force = false) {
    const url = Settings.get('serverUrl');
    if (!url && isNative()) return false;
    if (this.net.connected && !force && this.net.url === url) return true;
    try {
      await this.net.connect(url);
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  // Oda oluştur / katıl
  async enter(request) {
    const done = this.menu.loading('Dünya hazırlanıyor... (uyuyan dünyalar uyanıyor)');
    if (!(await this.ensureConnected())) {
      done();
      this.toast('Sunucuya bağlanılamadı. Ayarlar > Sunucu adresi\'ni kontrol et.', 'err');
      this.audio.play('error');
      return;
    }
    const res = await request();
    if (!res?.ok) {
      done();
      this.toast(res?.error ?? 'Odaya girilemedi.', 'err');
      this.audio.play('error');
      return;
    }
    Session.set({ code: res.code, token: res.token, name: Settings.get('name') });
    Tokens.set(res.code, res.token);
    this.pendingDone = done;
  }

  onInit(init) {
    Session.set({ code: init.room.code, token: init.token, name: Settings.get('name') });
    Tokens.set(init.room.code, init.token);
    this.menu.hide();
    if (this.backdrop) { this.backdrop.dispose(); this.backdrop = null; }
    if (this.game) this.game.destroy();
    this.game = new Game(this, init);
    this.pendingDone?.();
    this.pendingDone = null;
    this.audio.play('boom', { vol: 0.5 });
  }

  async resume() {
    const s = Session.get();
    if (!s) return this.menu.openMain();
    await this.enter(() => this.net.joinRoom({ code: s.code, token: s.token, name: s.name }));
  }

  // Bağlantı koptu ve geri geldi -> aynı karakterle devam
  async rejoin() {
    const s = Session.get();
    if (!s) return;
    const res = await this.net.joinRoom({ code: s.code, token: s.token, name: s.name });
    if (!res?.ok) {
      this.toast('Oda kapanmış. Ana menüye dönülüyor.', 'err');
      this.leaveGame(false);
    }
  }

  async leaveGame(notify = true) {
    if (notify) await this.net.leaveRoom();
    Session.clear();
    this.game?.destroy();
    this.game = null;
    this.backdrop = new MenuBackdrop(this.renderer, this.audio);
    this.audio.setMusic('menu');
    this.menu.openMain();
  }
}

const app = new App();
window.__app = app;
app.start();
