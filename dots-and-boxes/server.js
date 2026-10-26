const http = require("http");
const path = require("path");
const os = require("os");
const express = require("express");

const PORT = Number(process.env.PORT) || 3857;
const app = express();
const server = http.createServer(app);
const APP_VERSION = require("./package.json").version;
const PUBLIC = path.join(__dirname, "public");

// Safari / iOS: doğru MIME + cache; 0.0.0.0 ile LAN erişimi
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache");
  }
  next();
});

app.get("/manifest.webmanifest", (_req, res) => {
  res.type("application/manifest+json");
  res.sendFile(path.join(PUBLIC, "manifest.webmanifest"));
});

app.use(
  express.static(PUBLIC, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (filePath.endsWith(".webmanifest")) {
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      }
    },
  })
);

app.get("/api/meta", (_req, res) => {
  res.json({
    port: PORT,
    lanIps: getLanIps(),
    version: APP_VERSION,
    app: "Noktalar ve Kutular",
    safari: {
      tip: "iPhone Safari: aynı Wi‑Fi'de LAN adresini aç; Paylaş → Ana Ekrana Ekle",
      urls: getLanIps().map((ip) => `http://${ip}:${PORT}`),
    },
  });
});

app.get("/api/version", (_req, res) => {
  res.json({
    name: "Noktalar ve Kutular",
    version: APP_VERSION,
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

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLanIps();
  console.log("");
  console.log("  Noktalar ve Kutular — solo + local 2P");
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`  Safari:  http://${ip}:${PORT}   ← iPhone'da bu adresi aç`);
  }
  if (!ips.length) {
    console.log("  (LAN IP bulunamadı — Wi‑Fi bağlantısını kontrol et)");
  }
  console.log("  İpucu: Safari → Paylaş → Ana Ekrana Ekle");
  console.log("");
});
