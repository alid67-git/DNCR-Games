/**
 * Cross-country online play without a user-hosted server.
 * Uses PeerJS (WebRTC data channels + free cloud signaling).
 * Host is authoritative for game rules/state; guest mirrors via sync messages.
 */
window.KatiP2P = (function () {
  const E = window.ToprakEngine;
  const PREFIX = "ka"; // peer id = ka + 4-char room code
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function makeCode(len) {
    let s = "";
    for (let i = 0; i < (len || 4); i++) {
      s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    }
    return s;
  }

  function peerIdFor(code) {
    return PREFIX + String(code || "").toUpperCase();
  }

  function loadPeerJs(done) {
    if (typeof Peer === "function") {
      done(null);
      return;
    }
    const existing = document.querySelector("script[data-peerjs]");
    if (existing) {
      existing.addEventListener("load", () => done(null));
      existing.addEventListener("error", () => done(new Error("peerjs")));
      return;
    }
    const el = document.createElement("script");
    el.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
    el.dataset.peerjs = "1";
    el.onload = () => done(null);
    el.onerror = () => done(new Error("peerjs"));
    document.body.appendChild(el);
  }

  function createSession(handlers) {
    const H = handlers || {};
    let peer = null;
    let conn = null;
    let role = null; // "host" | "guest"
    let code = null;
    let myName = "Oyuncu";
    let closed = false;

    // Host-only room state
    let room = null;

    function emitState() {
      if (!room || !H.onState) return;
      const forYou = role === "host" ? "tomato" : "gourd";
      const st = publicState(room, forYou);
      H.onState(st);
      if (role === "host" && conn && conn.open) {
        send({ type: "state", state: publicState(room, "gourd") });
      }
    }

    function publicState(r, you) {
      return {
        code: r.code,
        status: r.status,
        vsAi: false,
        local: false,
        p2p: true,
        you,
        names: {
          tomato: r.hostName || "—",
          gourd: r.guestName || null,
        },
        ready: {
          tomato: !!r.readyHost,
          gourd: !!r.readyGuest,
        },
        guestJoined: !!r.guestName,
        game: r.game,
      };
    }

    function nextStarter(prev) {
      return E.opponent(prev || E.PLAYERS.tomato);
    }

    function makeRoom(c, hostName) {
      return {
        code: c,
        hostName: hostName || "Oyuncu 1",
        guestName: null,
        readyHost: false,
        readyGuest: false,
        status: "waiting",
        nextStarter: E.PLAYERS.tomato,
        game: E.createGameState(E.PLAYERS.tomato),
      };
    }

    function send(msg) {
      if (conn && conn.open) {
        try {
          conn.send(msg);
        } catch (_) {}
      }
    }

    function onMessage(msg) {
      if (!msg || !msg.type || closed) return;

      if (role === "host") {
        if (msg.type === "join") {
          if (room.guestName) {
            send({ type: "error", message: "room_full" });
            return;
          }
          room.guestName = (msg.name || "").trim() || "Oyuncu 2";
          room.readyGuest = false;
          send({ type: "welcome", hostName: room.hostName });
          emitState();
          return;
        }
        if (msg.type === "ready") {
          room.readyGuest = !!msg.ready;
          maybeStart();
          emitState();
          return;
        }
        if (msg.type === "move") {
          if (room.status !== "playing") return;
          const result = E.tryMove(room.game, E.PLAYERS.gourd, msg.from, msg.to);
          if (!result.ok) {
            send({ type: "error", message: result.error || "bad_move" });
            return;
          }
          room.game = result.state;
          if (room.game.winner) room.status = "finished";
          emitState();
          return;
        }
        if (msg.type === "rematch") {
          doRematch("guest");
          return;
        }
        if (msg.type === "leave") {
          room.guestName = null;
          room.readyGuest = false;
          room.status = "waiting";
          room.game = E.createGameState(room.nextStarter || E.PLAYERS.tomato);
          emitState();
        }
        return;
      }

      // guest
      if (msg.type === "welcome") {
        // host acknowledged
        return;
      }
      if (msg.type === "state" && msg.state) {
        if (H.onState) H.onState(msg.state);
        return;
      }
      if (msg.type === "error") {
        if (H.onError) H.onError(msg.message || "error");
      }
    }

    function maybeStart() {
      if (!room.guestName) return;
      if (room.readyHost && room.readyGuest) {
        room.status = "playing";
        const start = room.nextStarter || E.PLAYERS.tomato;
        room.game = E.createGameState(start);
        room.nextStarter = nextStarter(start);
      }
    }

    function doRematch(who) {
      const start = room.nextStarter || E.PLAYERS.tomato;
      room.nextStarter = nextStarter(start);
      room.readyHost = who === "host";
      room.readyGuest = who === "guest";
      room.status = "waiting";
      room.game = E.createGameState(start);
      if (room.readyHost && room.readyGuest) {
        room.status = "playing";
      }
      emitState();
    }

    function bindConn(c) {
      conn = c;
      c.on("data", onMessage);
      c.on("close", () => {
        if (closed) return;
        if (role === "host" && room) {
          room.guestName = null;
          room.readyGuest = false;
          room.status = "waiting";
          emitState();
        } else if (H.onClosed) {
          H.onClosed("peer_left");
        }
      });
      c.on("error", () => {
        if (H.onError) H.onError("conn_error");
      });
    }

    function destroy() {
      closed = true;
      try {
        if (conn) conn.close();
      } catch (_) {}
      try {
        if (peer) peer.destroy();
      } catch (_) {}
      conn = null;
      peer = null;
      room = null;
    }

    function host(name) {
      return new Promise((resolve, reject) => {
        loadPeerJs((err) => {
          if (err) return reject(err);
          myName = (name || "").trim() || "Oyuncu 1";
          role = "host";
          let attempts = 0;

          function tryOpen() {
            attempts += 1;
            code = makeCode(4);
            const id = peerIdFor(code);
            if (peer) {
              try {
                peer.destroy();
              } catch (_) {}
            }
            const peerOpts = {
              debug: 0,
              config: {
                iceServers: [
                  { urls: "stun:stun.l.google.com:19302" },
                  { urls: "stun:stun1.l.google.com:19302" },
                ],
              },
            };
            peer = new Peer(id, peerOpts);
            let settled = false;
            peer.on("open", () => {
              if (settled) return;
              settled = true;
              room = makeRoom(code, myName);
              emitState();
              resolve({ code });
            });
            peer.on("connection", (c) => {
              if (conn && conn.open) {
                try {
                  c.close();
                } catch (_) {}
                return;
              }
              c.on("open", () => {
                bindConn(c);
              });
            });
            peer.on("error", (e) => {
              const msg = (e && e.type) || "";
              if (msg === "unavailable-id" && attempts < 8) {
                tryOpen();
                return;
              }
              if (!settled) {
                settled = true;
                reject(e || new Error("peer_error"));
              }
            });
          }

          tryOpen();
        });
      });
    }

    function join(roomCode, name) {
      return new Promise((resolve, reject) => {
        loadPeerJs((err) => {
          if (err) return reject(err);
          myName = (name || "").trim() || "Oyuncu 2";
          role = "guest";
          code = String(roomCode || "").trim().toUpperCase();
          if (!code) return reject(new Error("need_code"));

          const peerOpts = {
            debug: 0,
            config: {
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
              ],
            },
          };
          peer = new Peer(peerOpts);
          let settled = false;
          peer.on("open", () => {
            const c = peer.connect(peerIdFor(code), { reliable: true });
            const timer = setTimeout(() => {
              if (settled) return;
              settled = true;
              reject(new Error("timeout"));
              try {
                destroy();
              } catch (_) {}
            }, 15000);
            c.on("open", () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              bindConn(c);
              send({ type: "join", name: myName });
              resolve({ code });
            });
            c.on("error", () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              reject(new Error("join_fail"));
            });
          });
          peer.on("error", (e) => {
            if (settled) return;
            settled = true;
            reject(e || new Error("peer_error"));
          });
        });
      });
    }

    function setReady(ready) {
      if (role === "host" && room) {
        room.readyHost = ready !== false;
        maybeStart();
        emitState();
      } else {
        send({ type: "ready", ready: ready !== false });
      }
    }

    function move(from, to) {
      if (role === "host" && room) {
        if (room.status !== "playing") return;
        const result = E.tryMove(room.game, E.PLAYERS.tomato, from, to);
        if (!result.ok) {
          if (H.onError) H.onError(result.error || "bad_move");
          return;
        }
        room.game = result.state;
        if (room.game.winner) room.status = "finished";
        emitState();
      } else {
        send({ type: "move", from, to });
      }
    }

    function rematch() {
      if (role === "host" && room) doRematch("host");
      else send({ type: "rematch" });
    }

    function leave() {
      send({ type: "leave" });
      destroy();
    }

    return {
      host,
      join,
      setReady,
      move,
      rematch,
      leave,
      destroy,
      getCode: () => code,
      getRole: () => role,
    };
  }

  return { createSession, peerIdFor, makeCode };
})();
