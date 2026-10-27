const http = require("http");
const path = require("path");
const os = require("os");
const express = require("express");

const PORT = Number(process.env.PORT) || 3860;
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
    app: "Kuşatma",
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
  console.log("");
  console.log("  Kuşatma — solo + local 2P");
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of getLanIps()) {
    console.log(`  LAN:     http://${ip}:${PORT}`);
  }
  console.log("");
});
