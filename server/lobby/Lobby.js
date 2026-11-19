import { EVENTS } from '../../shared/events.js';
import { CONFIG } from '../config.js';
import { Room, sanitizeName } from './Room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Lobi: oda kurma (şifreli/şifresiz, davet kodu), odaya katılma, yeniden bağlanma.
 * Her soket en fazla bir odada; oda içi tüm trafik buradan ilgili Room'a yönlenir.
 */
export class Lobby {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    io.on('connection', (socket) => this.onConnection(socket));
    setInterval(() => this.cleanup(), 30_000).unref();
  }

  newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  list() {
    return [...this.rooms.values()].map((r) => r.publicInfo()).sort((a, b) => b.players - a.players);
  }

  cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince && now - room.emptySince > CONFIG.roomIdleCloseMs) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
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

    socket.on(EVENTS.LOBBY_LIST, (_p, ack) => reply(ack)({ ok: true, rooms: this.list() }));

    socket.on(EVENTS.ROOM_CREATE, (p, ack) => {
      if (this.rooms.size >= CONFIG.maxRooms) return reply(ack)({ ok: false, error: 'Sunucu dolu, daha fazla oda açılamıyor.' });
      const code = this.newCode();
      const r = new Room(this.io, {
        code,
        name: sanitizeName(p?.roomName || `${sanitizeName(p?.name)} Dünyası`).slice(0, 24),
        password: String(p?.password ?? '').slice(0, 32),
        sandbox: !!p?.sandbox,
        npcCount: Number(p?.npcCount) || undefined,
      });
      this.rooms.set(code, r);
      enter(r, p?.name, null, ack);
    });

    socket.on(EVENTS.ROOM_JOIN, (p, ack) => {
      const r = this.rooms.get(String(p?.code ?? '').toUpperCase().trim());
      if (!r) return reply(ack)({ ok: false, error: 'Bu kodla bir oda bulunamadı.' });
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
