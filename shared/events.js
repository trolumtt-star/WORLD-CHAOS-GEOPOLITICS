// Sunucu ve istemcinin ortak kullandığı Socket.io olay isimleri.
export const EVENTS = Object.freeze({
  // Lobi / oda
  LOBBY_LIST: 'lobby:list',
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  INIT: 'world:init',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',

  // Hareket ve senkron
  PLAYER_MOVE: 'player:move',
  PLAYER_CORRECTION: 'player:correction',
  PLAYER_STATE: 'player:state',       // sadece ilgili oyuncuya: cüzdan, aranma, hapis...
  SNAPSHOT: 'snapshot',               // { p, n?, u?, v? }

  // Dünya değişiklikleri
  ENTITY_SPAWN: 'entity:spawn',       // { kind: 'npc'|'unit'|'vehicle', data }
  ENTITY_REMOVE: 'entity:remove',     // { kind, id, reason }
  BUILDING_UPDATE: 'building:update', // [building public, ...]
  TERRITORY: 'territory:update',      // [[i, j, owner, terrain], ...]
  FX: 'fx',                           // [{ t: 'shot', ... }] görsel efektler
  MISSILE: 'missile',                 // { t: 'launch'|'intercept'|'destroyed'|'impact', ... }
  ALERT: 'alert',                     // { level, text }

  // Zaman / ekonomi / haber
  CLOCK: 'clock:hour',
  NEWS: 'world:news',

  // Oyuncu eylemleri: tek kapı, { action, params } -> ack({ ok, error, message, sfx })
  ACTION: 'action',
  INSPECT: 'entity:inspect',
});
