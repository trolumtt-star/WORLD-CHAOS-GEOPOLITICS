import { EVENTS } from '../../shared/events.js';
import { GAME_VERSION } from '../../shared/version.js';
import { showUpdateGate } from '../ui/UpdateGate.js';

/** Socket.io sarmalayıcı: lobi + oyun içi eylemler. Oyun kodu socket'e doğrudan dokunmaz. */
export class Network {
  constructor() {
    this.socket = null;
    this.url = null;
    this.persistent = [];
  }

  // Her yeni sokete otomatik bağlanan kalıcı dinleyiciler
  persist(event, handler) {
    this.persistent.push([event, handler]);
    this.socket?.on(event, handler);
  }

  connect(url) {
    if (this.socket?.connected && this.url === url) return Promise.resolve();
    this.socket?.disconnect();
    this.url = url;
    this.socket = window.io(url || undefined, { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    for (const [e, h] of this.persistent) this.socket.on(e, h);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Sunucuya ulaşılamadı.')), 7000);
      this.socket.once('connect', () => { clearTimeout(t); resolve(); });
      this.socket.once('connect_error', (e) => { clearTimeout(t); reject(new Error(`Bağlantı hatası: ${e.message}`)); });
    });
  }

  get connected() { return !!this.socket?.connected; }

  on(event, handler) { this.socket.on(event, handler); return this; }
  off(event, handler) { this.socket?.off(event, handler); return this; }

  request(event, payload, timeout = 6000) {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false, error: 'Bağlantı yok.' });
      this.socket.timeout(timeout).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'Sunucu yanıt vermedi.' } : res));
    });
  }

  listRooms() { return this.gate(this.request(EVENTS.LOBBY_LIST, { v: GAME_VERSION })); }
  createRoom(opts) { return this.gate(this.request(EVENTS.ROOM_CREATE, { ...opts, v: GAME_VERSION }, 15000)); }
  joinRoom(opts) { return this.gate(this.request(EVENTS.ROOM_JOIN, { ...opts, v: GAME_VERSION }, 35000)); }
  async gate(p) { const r = await p; if (r?.update) showUpdateGate(r); return r; }
  leaveRoom() { return this.request(EVENTS.ROOM_LEAVE, {}); }

  action(type, params = {}) { return this.request(EVENTS.ACTION, { action: type, params }); }
  inspect(kind, id) { return this.request(EVENTS.INSPECT, { kind, id }, 4000); }

  sendVoice(b64) { this.socket?.volatile.emit('voice', b64); }

  sendMove(x, z, rotY) { this.socket?.volatile.emit(EVENTS.PLAYER_MOVE, { x, z, rotY }); }
}
