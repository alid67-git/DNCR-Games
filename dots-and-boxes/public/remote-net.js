/**
 * Uzaktan 2P — WebRTC (PeerJS bulut sinyal).
 * Kendi sunucun yok; cihazlar birbirine doğrudan bağlanır.
 */
window.DotsRemote = (function () {
  const PEER_CDN = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
  const PREFIX = "nk";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let peer = null;
  let conn = null;
  let role = null; // "host" | "guest"
  let onMessage = null;
  let onStatus = null;
  let peerJsLoading = null;

  function emitStatus(status, detail) {
    if (typeof onStatus === "function") onStatus(status, detail || {});
  }

  function makeRoomCode() {
    let s = "";
    for (let i = 0; i < 6; i++) {
      s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return s;
  }

  function peerIdFromCode(code) {
    return `${PREFIX}-${String(code || "").trim().toUpperCase()}`;
  }

  function normalizeCode(raw) {
    return String(raw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
  }

  function loadPeerJs() {
    if (window.Peer) return Promise.resolve();
    if (peerJsLoading) return peerJsLoading;
    peerJsLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PEER_CDN;
      s.async = true;
      s.onload = () => (window.Peer ? resolve() : reject(new Error("PeerJS yüklenemedi")));
      s.onerror = () => reject(new Error("PeerJS indirilemedi (internet gerekir)"));
      document.head.appendChild(s);
    });
    return peerJsLoading;
  }

  function wireConn(c) {
    conn = c;
    c.on("data", (data) => {
      try {
        const msg = typeof data === "string" ? JSON.parse(data) : data;
        if (msg && typeof onMessage === "function") onMessage(msg);
      } catch (_) {}
    });
    c.on("open", () => emitStatus("connected"));
    c.on("close", () => {
      conn = null;
      emitStatus("disconnected");
    });
    c.on("error", (err) => emitStatus("error", { error: String(err && err.message ? err.message : err) }));
  }

  function send(msg) {
    if (!conn || !conn.open) return false;
    try {
      conn.send(msg);
      return true;
    } catch (_) {
      return false;
    }
  }

  function destroy() {
    try {
      if (conn) conn.close();
    } catch (_) {}
    try {
      if (peer) peer.destroy();
    } catch (_) {}
    conn = null;
    peer = null;
    role = null;
  }

  async function hostRoom(handlers) {
    destroy();
    onMessage = handlers && handlers.onMessage;
    onStatus = handlers && handlers.onStatus;
    role = "host";
    await loadPeerJs();
    const code = makeRoomCode();
    const id = peerIdFromCode(code);
    emitStatus("creating", { code });

    return new Promise((resolve, reject) => {
      peer = new window.Peer(id, { debug: 0 });
      peer.on("open", () => {
        emitStatus("waiting", { code });
        resolve({ code, id });
      });
      peer.on("connection", (c) => {
        if (conn && conn.open) {
          try {
            c.close();
          } catch (_) {}
          return;
        }
        wireConn(c);
      });
      peer.on("error", (err) => {
        emitStatus("error", { error: String(err && err.type ? err.type : err) });
        reject(err);
      });
      peer.on("disconnected", () => emitStatus("disconnected"));
    });
  }

  async function joinRoom(code, handlers) {
    destroy();
    onMessage = handlers && handlers.onMessage;
    onStatus = handlers && handlers.onStatus;
    role = "guest";
    const normalized = normalizeCode(code);
    if (normalized.length < 4) throw new Error("invalid_code");
    await loadPeerJs();
    emitStatus("joining", { code: normalized });

    return new Promise((resolve, reject) => {
      peer = new window.Peer(undefined, { debug: 0 });
      peer.on("open", () => {
        const c = peer.connect(peerIdFromCode(normalized), { reliable: true });
        wireConn(c);
        c.on("open", () => {
          emitStatus("connected", { code: normalized });
          resolve({ code: normalized });
        });
      });
      peer.on("error", (err) => {
        emitStatus("error", { error: String(err && err.type ? err.type : err) });
        reject(err);
      });
    });
  }

  function getRole() {
    return role;
  }

  function isConnected() {
    return !!(conn && conn.open);
  }

  return {
    hostRoom,
    joinRoom,
    send,
    destroy,
    getRole,
    isConnected,
    normalizeCode,
    makeRoomCode,
  };
})();
