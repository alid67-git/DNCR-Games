/**
 * Sunucusuz eşler arası (PeerJS) — oda kodu ile bağlan.
 * Sinyal için PeerJS bulutu kullanılır; oyun durumu cihazlar arasında P2P gider.
 */
(function (root) {
  "use strict";

  const PREFIX = "sayibulma-";

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
      this.code = String(code || "").toUpperCase();
      const guestId = peerIdFromCode(this.code + "-g" + makeCode(3));
      await this._openPeer(guestId);
      const conn = this.peer.connect(peerIdFromCode(this.code), {
        reliable: true,
      });
      this._bindConn(conn);
      return this.code;
    }

    _openPeer(id) {
      return new Promise((resolve, reject) => {
        this.destroyPeerOnly();
        const peer = new Peer(id, {
          debug: 0,
        });
        this.peer = peer;
        const t = setTimeout(() => reject(new Error("Bağlantı zaman aşımı")), 15000);
        peer.on("open", () => {
          clearTimeout(t);
          resolve(id);
        });
        peer.on("error", (err) => {
          clearTimeout(t);
          const msg = (err && err.type) || (err && err.message) || "P2P hata";
          this.emit("error", String(msg));
          reject(err);
        });
      });
    }

    _bindConn(conn) {
      this.conn = conn;
      conn.on("open", () => this.emit("connected", { isHost: this.isHost, code: this.code }));
      conn.on("data", (data) => this.emit("message", data));
      conn.on("close", () => this.emit("disconnected"));
      conn.on("error", (err) => this.emit("error", (err && err.message) || "Bağlantı hatası"));
    }

    send(data) {
      if (this.conn && this.conn.open) {
        this.conn.send(data);
        return true;
      }
      return false;
    }

    destroyPeerOnly() {
      try {
        if (this.peer) this.peer.destroy();
      } catch (_) {}
      this.peer = null;
      this.conn = null;
    }

    destroy() {
      this.destroyed = true;
      try {
        if (this.conn) this.conn.close();
      } catch (_) {}
      this.destroyPeerOnly();
      this.handlers = {};
    }
  }

  root.SayibulmaP2P = { P2PSession, makeCode, peerIdFromCode, loadPeerScript };
})(typeof self !== "undefined" ? self : this);
