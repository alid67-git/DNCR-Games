const http = require("http");
const path = require("path");
const os = require("os");
const express = require("express");
const { Server } = require("socket.io");
const { RoomManager, AI_ID } = require("./game/rooms");
const {
  POSITIONS,
  BOARD_EDGES,
  NODES,
  PLAYERS,
} = require("./game/board");
const { chooseMove } = require("./game/ai");

const PORT = Number(process.env.PORT) || 3847;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
});

const rooms = new RoomManager();
/** @type {Map<string, NodeJS.Timeout>} */
const aiTimers = new Map();

app.use(express.static(path.join(__dirname, "public")));

const APP_VERSION = require("./package.json").version;

app.get("/api/meta", (_req, res) => {
  res.json({
    port: PORT,
    lanIps: getLanIps(),
    version: APP_VERSION,
    app: "Kati",
    board: { nodes: NODES, positions: POSITIONS, edges: BOARD_EDGES, players: PLAYERS },
  });
});

app.get("/api/version", (_req, res) => {
  res.json({
    name: "Kati",
    version: APP_VERSION,
    teams: { tomato: "red", gourd: "green" },
  });
});

function getLanIps() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === "IPv4" && !info.internal) ips.push(info.address);
    }
  }
  return ips;
}

function emitRoom(room) {
  const targets = [room.hostId];
  if (room.guestId && room.guestId !== AI_ID) targets.push(room.guestId);
  for (const sid of targets) {
    if (!sid) continue;
    io.to(sid).emit("room:state", rooms.publicState(room, sid));
  }
}

function clearAiTimer(code) {
  const t = aiTimers.get(code);
  if (t) {
    clearTimeout(t);
    aiTimers.delete(code);
  }
}

function scheduleAi(code, delayMs = 550) {
  clearAiTimer(code);
  const timer = setTimeout(() => runAiTurn(code), delayMs);
  aiTimers.set(code, timer);
}

function runAiTurn(code) {
  aiTimers.delete(code);
  const room = rooms.get(code);
  if (!room || !room.vsAi || room.status !== "playing") return;
  if (room.game.winner) return;
  if (room.game.turn !== PLAYERS.gourd) return;

  const pick = chooseMove(room.game, PLAYERS.gourd, { difficulty: "normal" });
  if (!pick) return;

  const result = rooms.moveAi(code, pick.from, pick.to);
  if (!result.ok) {
    console.warn("AI move failed", result.error, pick);
    return;
  }
  emitRoom(result.room);

  // Zincir yakalama devamı
  if (
    result.room.status === "playing" &&
    result.room.game.turn === PLAYERS.gourd &&
    !result.room.game.winner
  ) {
    scheduleAi(code, 420);
  }
}

function maybeScheduleAi(room) {
  if (
    room.vsAi &&
    room.status === "playing" &&
    !room.game.winner &&
    room.game.turn === PLAYERS.gourd
  ) {
    scheduleAi(room.code);
  }
}

io.on("connection", (socket) => {
  socket.emit("hello", {
    lanIps: getLanIps(),
    port: PORT,
  });

  socket.on("room:create", ({ name } = {}) => {
    const room = rooms.create(socket.id, (name || "").trim() || "Oyuncu 1");
    socket.join(room.code);
    socket.emit("room:created", rooms.publicState(room, socket.id));
  });

  socket.on("solo:start", ({ name, starter } = {}) => {
    rooms.leave(socket.id);
    const room = rooms.createSolo(
      socket.id,
      (name || "").trim() || "Oyuncu",
      starter
    );
    socket.join(room.code);
    socket.emit("room:state", rooms.publicState(room, socket.id));
    maybeScheduleAi(room);
  });

  socket.on("room:join", ({ code, name } = {}) => {
    const result = rooms.join(code, socket.id, (name || "").trim() || "Oyuncu 2");
    if (!result.ok) {
      socket.emit("error:msg", result.error);
      return;
    }
    socket.join(result.room.code);
    emitRoom(result.room);
  });

  socket.on("room:ready", ({ code, ready } = {}) => {
    const result = rooms.setReady(code, socket.id, ready !== false);
    if (!result.ok) {
      socket.emit("error:msg", result.error);
      return;
    }
    emitRoom(result.room);
  });

  socket.on("game:move", ({ code, from, to } = {}) => {
    const result = rooms.move(code, socket.id, from, to);
    if (!result.ok) {
      socket.emit("error:msg", result.error);
      return;
    }
    emitRoom(result.room);
    maybeScheduleAi(result.room);
  });

  socket.on("game:rematch", ({ code } = {}) => {
    const result = rooms.rematch(code, socket.id);
    if (!result.ok) {
      socket.emit("error:msg", result.error);
      return;
    }
    clearAiTimer(code);
    emitRoom(result.room);
    maybeScheduleAi(result.room);
  });

  socket.on("room:leave", () => {
    const affected = rooms.leave(socket.id);
    for (const a of affected) {
      clearAiTimer(a.code);
      if (a.closed) {
        socket.emit("room:closed", { reason: "Lobye dönüldü." });
      } else {
        emitRoom(a.room);
      }
    }
  });

  socket.on("disconnect", () => {
    const affected = rooms.leave(socket.id);
    for (const a of affected) {
      clearAiTimer(a.code);
      if (a.closed) {
        io.to(a.code).emit("room:closed", { reason: "Kurucu ayrıldı." });
      } else {
        emitRoom(a.room);
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLanIps();
  console.log("");
  console.log("  Kati — solo + online (Red vs Green)");
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`  LAN:     http://${ip}:${PORT}`);
  }
  console.log("  Publish this URL for cross-country play.");
  console.log("");
});
