import { EVENTS } from '../../shared/events.js';
import { CONFIG } from '../config.js';
import { Room, sanitizeName } from './Room.js';
import { store } from '../persistence/Store.js';
import { serializeRoom, parseSnapshot, gzip, gunzip } from '../persistence/Snapshot.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Lobi: oda kurma (şifreli/şifresiz, davet kodu), odaya katılma, yeniden bağlanma.
 * Her soket en fazla bir odada; oda içi tüm trafik buradan ilgili Room'a yönlenir.
 */
export class Lobby {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.loading = new Map();
    this.saved = [];      // veritabanındaki dünyaların özeti (önbellek)
    this.savedAt = 0;
    io.on('connection', (socket) => this.onConnection(socket));
    setInterval(() => this.cleanup(), 30_000).unref();
    if (store.enabled) {
      console.log('[kayıt] Supabase kaydı AÇIK — dünyalar kalıcı');
      setInterval(() => this.saveAll().catch((e) => console.error('[kayıt]', e.message)), CONFIG.persistence.saveEveryMs).unref();
      store.prune().catch(() => {});
      this.refreshSaved();
    } else {
      console.log('[kayıt] SUPABASE_URL / SUPABASE_SECRET_KEY yok — dünyalar sadece bellekte');
    }
  }

  newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code) || this.saved.some((w) => w.code === code));
    return code;
  }

  async refreshSaved(force = false) {
    if (!store.enabled || (!force && Date.now() - this.savedAt < 8000)) return this.saved;
    try {
      this.saved = await store.list();
      this.savedAt = Date.now();
    } catch (e) { console.error('[kayıt] liste', e.message); }
    return this.saved;
  }

  /** Açık odalar + kayıtlı (uyuyan) dünyalar */
  async listAll() {
    const live = [...this.rooms.values()].map((r) => ({ ...r.publicInfo(), live: true, owner: r.ownerName }));
    const saved = (await this.refreshSaved())
      .filter((w) => !this.rooms.has(w.code))
      .map((w) => ({ code: w.code, name: w.name, locked: w.locked, sandbox: w.sandbox, players: 0, max: CONFIG.maxPlayersPerRoom, day: w.day, population: w.population, live: false, owner: w.owner_name, playerNames: w.player_names, countries: w.countries, updatedAt: w.updated_at }));
    return [...live.sort((a, b) => b.players - a.players), ...saved];
  }

  list() {
    return [...this.rooms.values()].map((r) => r.publicInfo()).sort((a, b) => b.players - a.players);
  }

  async saveRoom(room) {
    if (!store.enabled) return;
    const t0 = Date.now();
    const json = serializeRoom(room);
    const state_gz = gzip(json);
    await store.save({ ...room.summary(), state_gz, bytes: json.length });
    room.lastSavedAt = Date.now();
    if (Date.now() - t0 > 400) console.log(`[kayıt] ${room.code} ${Math.round(json.length / 1024)}KB (${Date.now() - t0} ms)`);
  }

  async saveAll() {
    for (const room of this.rooms.values()) {
      try { await this.saveRoom(room); } catch (e) { console.error(`[kayıt] ${room.code}`, e.message); }
    }
  }

  /** Bellekte yoksa veritabanından uyandır (uyurken geçen zaman telafi edilir) */
  async getRoom(code) {
    if (this.rooms.has(code)) return this.rooms.get(code);
    if (!store.enabled) return null;
    if (!this.loading.has(code)) {
      this.loading.set(code, (async () => {
        try {
          const gz = await store.load(code);
          if (!gz) return null;
          const room = new Room(this.io, { save: parseSnapshot(gunzip(gz)) });
          this.rooms.set(code, room);
          return room;
        } catch (e) {
          console.error(`[kayıt] ${code} yüklenemedi`, e);
          this.loadErrors = this.loadErrors ?? new Map();
          this.loadErrors.set(code, Date.now());
          return null;
        } finally {
          this.loading.delete(code);
        }
      })());
    }
    return this.loading.get(code);
  }

  cleanup() {
    const now = Date.now();
    const idle = store.enabled ? CONFIG.persistence.unloadIdleMs : CONFIG.roomIdleCloseMs;
    for (const [code, room] of this.rooms) {
      if (room.emptySince && now - room.emptySince > idle) {
        // Kaydet, sonra bellekten çıkar (dünya silinmez, listede "uyuyor" görünür)
        this.saveRoom(room).catch((e) => console.error('[kayıt]', e.message)).finally(() => {
          if (room.emptySince) { room.destroy(); this.rooms.delete(code); this.savedAt = 0; }
        });
      }
    }
  }

  /** Render kapatırken (deploy / uyku) her şeyi kaydet */
  async shutdown() {
    if (!store.enabled) return;
    console.log('[kayıt] kapanış: tüm dünyalar kaydediliyor...');
    await this.saveAll();
  }

  onConnection(socket) {
    let room = null;
    let player = null;
    let actionBudget = 20;
    const refill = setInterval(() => { actionBudget = 20; }, 1000);

    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

    const enter = (r, name, token, ack) => {
      if (room) this.leave(socket, room, player);
      const p = r.addPlayer(socket, name, token);
      if (!p) return reply(ack)({ ok: false, error: 'Oda dolu.' });
      room = r;
      player = p;
      socket.join(r.code);
      reply(ack)({ ok: true, code: r.code, token: p.token });
      socket.emit(EVENTS.INIT, r.buildInit(p));
      socket.to(r.code).emit(EVENTS.PLAYER_JOINED, p.toPublic());
    };

    socket.on(EVENTS.LOBBY_LIST, async (_p, ack) => reply(ack)({ ok: true, rooms: await this.listAll(), persistent: store.enabled }));

    socket.on(EVENTS.ROOM_CREATE, (p, ack) => {
      if (this.rooms.size >= CONFIG.maxRooms) return reply(ack)({ ok: false, error: 'Sunucu dolu, daha fazla oda açılamıyor.' });
      const code = this.newCode();
      const r = new Room(this.io, {
        code,
        name: sanitizeName(p?.roomName || `${sanitizeName(p?.name)} Dünyası`).slice(0, 24),
        password: String(p?.password ?? '').slice(0, 32),
        sandbox: !!p?.sandbox,
        npcCount: Number(p?.npcCount) || undefined,
        ownerName: sanitizeName(p?.name),
      });
      this.rooms.set(code, r);
      enter(r, p?.name, null, ack);
      this.saveRoom(r).then(() => { this.savedAt = 0; }).catch((e) => console.error('[kayıt]', e.message));
    });

    socket.on(EVENTS.ROOM_JOIN, async (p, ack) => {
      const r = await this.getRoom(String(p?.code ?? '').toUpperCase().trim());
      if (!r) {
        const code = String(p?.code ?? '').toUpperCase().trim();
        const broke = this.loadErrors?.has(code);
        return reply(ack)({ ok: false, error: broke ? 'Dünya kayıtlı ama yüklenirken hata oldu. Biraz sonra tekrar dene.' : 'Bu kodla bir dünya bulunamadı.' });
      }
      const returning = r.findByToken(p?.token);
      if (!returning && !r.checkPassword(p?.password)) return reply(ack)({ ok: false, error: 'Şifre yanlış.' });
      enter(r, p?.name, p?.token, ack);
    });

    socket.on(EVENTS.ROOM_LEAVE, (_p, ack) => {
      if (room) this.leave(socket, room, player);
      room = null;
      player = null;
      reply(ack)({ ok: true });
    });

    socket.on(EVENTS.PLAYER_MOVE, (d) => {
      if (room && player) room.handleMove(socket, player, d);
    });

    socket.on('voice', (d) => {
      if (room && player) room.handleVoice(socket, player, d);
    });

    socket.on(EVENTS.ACTION, (msg, ack) => {
      if (!room || !player) return reply(ack)({ ok: false, error: 'Odada değilsin.' });
      if (--actionBudget < 0) return reply(ack)({ ok: false, error: 'Çok hızlı! Biraz yavaşla.' });
      reply(ack)(room.handleAction(player, msg?.action, msg?.params ?? {}));
    });

    socket.on(EVENTS.INSPECT, (req, ack) => {
      if (!room || !player) return reply(ack)(null);
      reply(ack)(room.inspect(player, req?.kind, req?.id));
    });

    socket.on('disconnect', () => {
      clearInterval(refill);
      if (room) this.leave(socket, room, player);
    });
  }

  leave(socket, room, player) {
    socket.leave(room.code);
    room.removeSocket(socket, player);
  }
}
