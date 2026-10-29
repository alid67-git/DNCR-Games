const http = require("http");
const path = require("path");
const os = require("os");
const express = require("express");

const PORT = Number(process.env.PORT) || 3872;
const app = express();
const server = http.createServer(app);
const APP_VERSION = require("./package.json").version;
const PUBLIC = path.join(__dirname, "public");

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
    app: "Dama",
    modes: ["solo", "local-2p", "p2p"],
  });
});

app.get("/api/version", (_req, res) => {
  res.json({ name: "Dama", version: APP_VERSION });
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
  console.log("  Dama — solo + aynı cihaz + sunucusuz P2P");
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`  LAN:     http://${ip}:${PORT}`);
  }
  if (!ips.length) {
    console.log("  (LAN IP bulunamadı — Wi‑Fi bağlantısını kontrol et)");
  }
  console.log("  P2P: Oyna → İki telefonda / uzaktan (oda kodu, oyun sunucusu yok)");
  console.log("");
});
