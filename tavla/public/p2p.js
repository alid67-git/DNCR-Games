/**
 * Sunucusuz P2P yedek (PeerJS) — ArenaP2P yoksa kullanılır.
 */
(function (root) {
  "use strict";

  const PREFIX = "tavla-";

  function peerIdFromCode(code) {
    return PREFIX + String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function makeCode(len) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < (len || 4); i++) {
      s += chars[(Math.random() * chars.length) | 0];
    }
    return s;
  }

  function loadPeerScript() {
    return new Promise((resolve, reject) => {
      if (typeof Peer === "function") {
        resolve();
        return;
      }
      const existing = document.querySelector("script[data-peerjs]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("PeerJS yüklenemedi")));
        return;
      }
      const el = document.createElement("script");
      el.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
      el.dataset.peerjs = "1";
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("PeerJS yüklenemedi — internet gerekli"));
      document.head.appendChild(el);
    });
  }

  class P2PSession {
    constructor() {
      this.peer = null;
      this.conn = null;
      this.code = null;
      this.isHost = false;
      this.handlers = {};
      this.destroyed = false;
    }

    on(event, fn) {
      this.handlers[event] = fn;
    }

    emit(event, data) {
      const fn = this.handlers[event];
      if (fn) fn(data);
    }

    async host(preferredCode) {
      await loadPeerScript();
      this.isHost = true;
      this.code = preferredCode || makeCode(4);
      const id = peerIdFromCode(this.code);
      await this._openPeer(id);
      this.peer.on("connection", (conn) => {
        if (this.conn && this.conn.open) {
          conn.close();
          return;
        }
        this._bindConn(conn);
      });
      return this.code;
    }

    async join(code) {
      await loadPeerScript();
      this.isHost = false;
      this.code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      await this._openPeer();
      const conn = this.peer.connect(peerIdFromCode(this.code), { reliable: true });
      this._bindConn(conn);
      return this.code;
    }

    _openPeer(id) {
      return new Promise((resolve, reject) => {
        const peer = id ? new Peer(id) : new Peer();
        this.peer = peer;
        const t = setTimeout(() => reject(new Error("timeout")), 15000);
        peer.on("open", () => {
          clearTimeout(t);
          resolve();
        });
        peer.on("error", (err) => {
          clearTimeout(t);
          this.emit("error", err);
          reject(err);
        });
      });
    }

    _bindConn(conn) {
      this.conn = conn;
      conn.on("open", () => this.emit("connected"));
      conn.on("data", (data) => this.emit("message", data));
      conn.on("close", () => this.emit("disconnected"));
      conn.on("error", (err) => this.emit("error", err));
    }

    send(data) {
      if (this.conn && this.conn.open) this.conn.send(data);
    }

    destroy() {
      this.destroyed = true;
      try {
        if (this.conn) this.conn.close();
      } catch (_) {}
      try {
        if (this.peer) this.peer.destroy();
      } catch (_) {}
      this.conn = null;
      this.peer = null;
    }
  }

  root.TavlaP2P = { P2PSession, makeCode, peerIdFromCode };
})(typeof self !== "undefined" ? self : this);
