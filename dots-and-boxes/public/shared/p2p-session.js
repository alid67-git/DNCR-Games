/**
 * Arena shared — sunucusuz P2P oda (PeerJS).
 * window.ArenaP2P.P2PSession
 */
(function (root) {
  "use strict";

  function makeCode(len) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < (len || 4); i++) {
      s += chars[(Math.random() * chars.length) | 0];
    }
    return s;
  }

  function peerIdFromCode(prefix, code) {
    return String(prefix || "arena") + "-" + String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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
        existing.addEventListener("error", () => reject(new Error("PeerJS")));
        return;
      }
      const el = document.createElement("script");
      el.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
      el.dataset.peerjs = "1";
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("PeerJS — internet gerekli"));
      document.head.appendChild(el);
    });
  }

  class P2PSession {
    /**
     * @param {{ prefix?: string }} opts
     */
    constructor(opts) {
      this.prefix = (opts && opts.prefix) || "arena";
      this.peer = null;
      this.conn = null;
      this.code = null;
      this.isHost = false;
      this.handlers = {};
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
      await this._openPeer(peerIdFromCode(this.prefix, this.code));
      this.peer.on("connection", (conn) => {
        if (this.conn && this.conn.open) {
          try {
            conn.close();
          } catch (_) {}
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
      const guestId = peerIdFromCode(this.prefix, this.code + "G" + makeCode(2));
      await this._openPeer(guestId);
      const conn = this.peer.connect(peerIdFromCode(this.prefix, this.code), {
        reliable: true,
      });
      this._bindConn(conn);
      return this.code;
    }

    _openPeer(id) {
      return new Promise((resolve, reject) => {
        this.destroyPeerOnly();
        const peer = new Peer(id, { debug: 0 });
        this.peer = peer;
        const t = setTimeout(() => reject(new Error("timeout")), 15000);
        peer.on("open", () => {
          clearTimeout(t);
          resolve(id);
        });
        peer.on("error", (err) => {
          clearTimeout(t);
          this.emit("error", (err && (err.type || err.message)) || "p2p");
          reject(err);
        });
      });
    }

    _bindConn(conn) {
      this.conn = conn;
      conn.on("open", () =>
        this.emit("connected", { isHost: this.isHost, code: this.code })
      );
      conn.on("data", (data) => this.emit("message", data));
      conn.on("close", () => this.emit("disconnected"));
      conn.on("error", (err) =>
        this.emit("error", (err && err.message) || "conn")
      );
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
      try {
        if (this.conn) this.conn.close();
      } catch (_) {}
      this.destroyPeerOnly();
      this.handlers = {};
    }
  }

  root.ArenaP2P = { P2PSession, makeCode, peerIdFromCode, loadPeerScript };
})(typeof self !== "undefined" ? self : this);
