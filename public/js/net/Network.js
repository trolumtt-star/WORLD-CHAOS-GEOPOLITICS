import { EVENTS } from '../../shared/events.js';

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

  listRooms() { return this.request(EVENTS.LOBBY_LIST, {}); }
  createRoom(opts) { return this.request(EVENTS.ROOM_CREATE, opts, 15000); }
  joinRoom(opts) { return this.request(EVENTS.ROOM_JOIN, opts, 35000); }
  leaveRoom() { return this.request(EVENTS.ROOM_LEAVE, {}); }

  action(type, params = {}) { return this.request(EVENTS.ACTION, { action: type, params }); }
  inspect(kind, id) { return this.request(EVENTS.INSPECT, { kind, id }, 4000); }

  sendVoice(b64) { this.socket?.volatile.emit('voice', b64); }

  sendMove(x, z, rotY) { this.socket?.volatile.emit(EVENTS.PLAYER_MOVE, { x, z, rotY }); }
}
