/**
 * Arena shared — Android Nearby (Bluetooth / Wi‑Fi Direct) oda.
 * window.ArenaNearby.NearbySession — ArenaP2P.P2PSession ile aynı arayüz.
 * Yalnızca Capacitor Android hub APK’da çalışır; internet gerekmez.
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

  function serviceIdFor(prefix) {
    const p = String(prefix || "arena")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    return "com.dncr.games." + (p || "arena");
  }

  function getPlugin() {
    try {
      const C = root.Capacitor;
      if (!C || typeof C.isNativePlatform !== "function" || !C.isNativePlatform()) {
        return null;
      }
      if (C.Plugins && C.Plugins.NearbyLink) return C.Plugins.NearbyLink;
      if (typeof C.registerPlugin === "function") {
        return C.registerPlugin("NearbyLink");
      }
    } catch (_) {}
    return null;
  }

  function nearbyAvailableSync() {
    try {
      const C = root.Capacitor;
      if (!C || typeof C.isNativePlatform !== "function" || !C.isNativePlatform()) {
        return false;
      }
      return !!(C.Plugins && C.Plugins.NearbyLink) || typeof C.registerPlugin === "function";
    } catch (_) {
      return false;
    }
  }

  async function nearbyAvailable() {
    const plugin = getPlugin();
    if (!plugin) return false;
    try {
      if (typeof plugin.isAvailable === "function") {
        const r = await plugin.isAvailable();
        return !!(r && r.available);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  class NearbySession {
    /**
     * @param {{ prefix?: string }} opts
     */
    constructor(opts) {
      this.prefix = (opts && opts.prefix) || "arena";
      this.code = null;
      this.isHost = false;
      this.handlers = {};
      this._plugin = getPlugin();
      this._unsubs = [];
      this._connected = false;
      this._joinWait = null;
    }

    on(event, fn) {
      this.handlers[event] = fn;
    }

    emit(event, data) {
      const fn = this.handlers[event];
      if (fn) fn(data);
    }

    async host(preferredCode) {
      if (!this._plugin) throw new Error("nearby_unavailable");
      this.isHost = true;
      this.code = preferredCode || makeCode(4);
      await this._bindPluginEvents();
      await this._plugin.startHost({
        serviceId: serviceIdFor(this.prefix),
        name: this.code,
      });
      return this.code;
    }

    async join(code) {
      if (!this._plugin) throw new Error("nearby_unavailable");
      this.isHost = false;
      this.code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!this.code) throw new Error("need_code");
      await this._bindPluginEvents();
      const wait = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 25000);
        this._joinWait = {
          resolve: () => {
            clearTimeout(t);
            resolve();
          },
          reject: (err) => {
            clearTimeout(t);
            reject(err);
          },
        };
      });
      await this._plugin.startJoin({
        serviceId: serviceIdFor(this.prefix),
        name: this.code,
      });
      await wait;
      return this.code;
    }

    async _bindPluginEvents() {
      this._teardownListeners();
      const p = this._plugin;
      if (!p || typeof p.addListener !== "function") return;

      const u1 = await p.addListener("connected", () => {
        this._connected = true;
        const ev = { isHost: this.isHost, code: this.code };
        if (this._joinWait) {
          // join() await'i önce bitsin; oyun lobisi kurulduktan sonra connected
          const w = this._joinWait;
          this._joinWait = null;
          w.resolve();
          queueMicrotask(() => this.emit("connected", ev));
        } else {
          this.emit("connected", ev);
        }
      });
      const u2 = await p.addListener("payload", (ev) => {
        let data = ev && ev.data;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (_) {}
        }
        this.emit("message", data);
      });
      const u3 = await p.addListener("disconnected", () => {
        this._connected = false;
        this.emit("disconnected");
      });
      const u4 = await p.addListener("error", (ev) => {
        const msg = (ev && ev.message) || "nearby";
        if (this._joinWait) {
          this._joinWait.reject(new Error(msg));
          this._joinWait = null;
        }
        this.emit("error", msg);
      });
      this._unsubs = [u1, u2, u3, u4];
    }

    _teardownListeners() {
      for (const u of this._unsubs) {
        try {
          if (u && typeof u.remove === "function") u.remove();
        } catch (_) {}
      }
      this._unsubs = [];
    }

    send(data) {
      if (!this._plugin || !this._connected) return false;
      const raw = typeof data === "string" ? data : JSON.stringify(data);
      try {
        this._plugin.send({ data: raw });
        return true;
      } catch (_) {
        return false;
      }
    }

    destroy() {
      if (this._joinWait) {
        try {
          this._joinWait.reject(new Error("destroyed"));
        } catch (_) {}
        this._joinWait = null;
      }
      this._teardownListeners();
      this._connected = false;
      try {
        if (this._plugin && typeof this._plugin.stop === "function") {
          this._plugin.stop();
        }
      } catch (_) {}
      this.handlers = {};
    }
  }

  root.ArenaNearby = {
    NearbySession,
    makeCode,
    serviceIdFor,
    nearbyAvailable,
    nearbyAvailableSync,
    getPlugin,
  };
})(typeof self !== "undefined" ? self : this);
