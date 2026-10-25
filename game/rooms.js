const { createGameState, tryMove, PLAYERS } = require("./board");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const AI_ID = "__AI__";

function makeCode(len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  }
  return s;
}

class RoomManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.rooms = new Map();
  }

  create(hostSocketId, hostName) {
    let code;
    do {
      code = makeCode();
    } while (this.rooms.has(code));

    const room = {
      code,
      hostId: hostSocketId,
      guestId: null,
      vsAi: false,
      names: { [hostSocketId]: hostName || "Oyuncu 1" },
      roles: { [hostSocketId]: PLAYERS.tomato },
      ready: { [hostSocketId]: false },
      status: "waiting", // waiting | playing | finished
      game: createGameState(),
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  /** Tek oyuncu: insan domates, AI acur — hemen başlar */
  createSolo(hostSocketId, hostName) {
    const room = this.create(hostSocketId, hostName || "Oyuncu");
    room.vsAi = true;
    room.guestId = AI_ID;
    room.names[AI_ID] = "Bilgisayar";
    room.roles[AI_ID] = PLAYERS.gourd;
    room.ready[hostSocketId] = true;
    room.ready[AI_ID] = true;
    room.status = "playing";
    room.game = createGameState();
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || "").toUpperCase()) || null;
  }

  join(code, guestSocketId, guestName) {
    const room = this.get(code);
    if (!room) return { ok: false, error: "Oda bulunamadı." };
    if (room.vsAi) return { ok: false, error: "Bu oda bilgisayara karşı; katılınamaz." };
    if (room.guestId && room.guestId !== guestSocketId) {
      return { ok: false, error: "Oda dolu." };
    }
    if (guestSocketId === room.hostId) {
      return { ok: false, error: "Zaten odadasınız." };
    }
    room.guestId = guestSocketId;
    room.names[guestSocketId] = guestName || "Oyuncu 2";
    room.roles[guestSocketId] = PLAYERS.gourd;
    room.ready[guestSocketId] = false;
    return { ok: true, room };
  }

  setReady(code, socketId, ready) {
    const room = this.get(code);
    if (!room) return { ok: false, error: "Oda yok." };
    if (room.vsAi) return { ok: false, error: "Tek oyuncu modunda hazırlık yok." };
    if (!room.roles[socketId]) return { ok: false, error: "Oyuncu değilsiniz." };
    room.ready[socketId] = !!ready;
    if (
      room.hostId &&
      room.guestId &&
      room.ready[room.hostId] &&
      room.ready[room.guestId]
    ) {
      room.status = "playing";
      room.game = createGameState();
    }
    return { ok: true, room };
  }

  move(code, socketId, from, to) {
    const room = this.get(code);
    if (!room) return { ok: false, error: "Oda yok." };
    if (room.status !== "playing") return { ok: false, error: "Oyun başlamadı." };
    const role = room.roles[socketId];
    if (!role) return { ok: false, error: "Oyuncu değilsiniz." };
    const result = tryMove(room.game, role, from, to);
    if (!result.ok) return result;
    room.game = result.state;
    if (room.game.winner) room.status = "finished";
    return { ok: true, room };
  }

  /** AI hamlesi (socketId yok) */
  moveAi(code, from, to) {
    const room = this.get(code);
    if (!room || !room.vsAi) return { ok: false, error: "AI odası değil." };
    if (room.status !== "playing") return { ok: false, error: "Oyun yok." };
    const result = tryMove(room.game, PLAYERS.gourd, from, to);
    if (!result.ok) return result;
    room.game = result.state;
    if (room.game.winner) room.status = "finished";
    return { ok: true, room };
  }

  rematch(code, socketId) {
    const room = this.get(code);
    if (!room) return { ok: false, error: "Oda yok." };
    if (!room.roles[socketId]) return { ok: false, error: "Oyuncu değilsiniz." };

    if (room.vsAi) {
      room.game = createGameState();
      room.status = "playing";
      room.ready[room.hostId] = true;
      room.ready[AI_ID] = true;
      return { ok: true, room };
    }

    room.ready[room.hostId] = false;
    if (room.guestId) room.ready[room.guestId] = false;
    room.ready[socketId] = true;
    room.status = "waiting";
    room.game = createGameState();
    if (
      room.hostId &&
      room.guestId &&
      room.ready[room.hostId] &&
      room.ready[room.guestId]
    ) {
      room.status = "playing";
    }
    return { ok: true, room };
  }

  leave(socketId) {
    const affected = [];
    for (const [code, room] of this.rooms) {
      if (room.hostId === socketId) {
        this.rooms.delete(code);
        affected.push({ code, closed: true, room });
      } else if (room.guestId === socketId) {
        room.guestId = null;
        delete room.names[socketId];
        delete room.roles[socketId];
        delete room.ready[socketId];
        room.status = "waiting";
        room.game = createGameState();
        affected.push({ code, closed: false, room });
      }
    }
    return affected;
  }

  publicState(room, forSocketId) {
    const you = room.roles[forSocketId] || null;
    const gourdName = room.vsAi
      ? "Bilgisayar"
      : room.guestId
        ? room.names[room.guestId] || "Acur"
        : null;
    return {
      code: room.code,
      status: room.status,
      vsAi: !!room.vsAi,
      you,
      names: {
        tomato: room.names[room.hostId] || "Domates",
        gourd: gourdName,
      },
      ready: {
        tomato: !!room.ready[room.hostId],
        gourd: room.vsAi
          ? true
          : room.guestId
            ? !!room.ready[room.guestId]
            : false,
      },
      guestJoined: !!room.guestId,
      game: room.game,
    };
  }
}

module.exports = { RoomManager, PLAYERS, AI_ID };
