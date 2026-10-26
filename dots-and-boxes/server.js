const http = require("http");
const path = require("path");
const os = require("os");
const express = require("express");

const PORT = Number(process.env.PORT) || 3857;
const app = express();
const server = http.createServer(app);
const APP_VERSION = require("./package.json").version;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/meta", (_req, res) => {
  res.json({
    port: PORT,
    lanIps: getLanIps(),
    version: APP_VERSION,
    app: "Noktalar ve Kutular",
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
    console.log(`  LAN:     http://${ip}:${PORT}`);
  }
  console.log("  Safari (iPhone): aynı Wi‑Fi'de LAN adresini aç.");
  console.log("");
});
