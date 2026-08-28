// Minimal static file server for local preview (no dependencies)
// plus a tiny JSON API for the texture library used by admin.html.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 4190;
const TEX_DIR = path.join(ROOT, "textures");
const MANIFEST = path.join(TEX_DIR, "manifest.json");
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".webp": "image/webp",
};
const EXT_BY_MIME = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const MAX_UPLOAD = 12 * 1024 * 1024; // base64 payload cap

if (!fs.existsSync(TEX_DIR)) fs.mkdirSync(TEX_DIR, { recursive: true });
if (!fs.existsSync(MANIFEST)) fs.writeFileSync(MANIFEST, "[]");

const readManifest = () => {
  try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch { return []; }
};
const writeManifest = (list) => fs.writeFileSync(MANIFEST, JSON.stringify(list, null, 2));

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req, cb) {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", () => cb(Buffer.concat(chunks).toString()));
}

const isLocal = (req) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

http.createServer((req, res) => {
  const [urlPath, query] = req.url.split("?");

  // dev/QA endpoints write files — allow only from this machine
  if (urlPath.startsWith("/__") && !isLocal(req)) {
    res.writeHead(403);
    return res.end("local only");
  }

  // dev-only: save a binary GLB export of a built-in room model
  if (req.method === "POST" && urlPath === "/__export") {
    const name = new URLSearchParams(query || "").get("name") || "";
    if (!/^[a-z0-9-]+\.glb$/.test(name)) { res.writeHead(400); return res.end("bad name"); }
    const dir = path.join(ROOT, "exports");
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 200 * 1024 * 1024) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  // dev-only: accept a binary MP4 upload from the in-page walkthrough recorder
  if (req.method === "POST" && urlPath === "/__video") {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 300 * 1024 * 1024) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      fs.writeFileSync(path.join(ROOT, "walkthrough.mp4"), Buffer.concat(chunks));
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  // dev-only: save a named base64 image into assets/inspiration/ (thumbnails)
  if (req.method === "POST" && urlPath === "/__asset") {
    const name = new URLSearchParams(query || "").get("name") || "";
    if (!/^[a-z0-9-]+\.(jpg|png)$/.test(name)) { res.writeHead(400); return res.end("bad name"); }
    const dir = path.join(ROOT, "assets", "inspiration");
    fs.mkdirSync(dir, { recursive: true });
    readBody(req, (body) => {
      fs.writeFileSync(path.join(dir, name), Buffer.from(body, "base64"));
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  // dev-only: accept base64 PNG posts for QA screenshots
  if (req.method === "POST" && urlPath === "/__shot") {
    readBody(req, (body) => {
      fs.writeFileSync(path.join(ROOT, "shot.png"), Buffer.from(body, "base64"));
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  // texture library API
  if (urlPath === "/api/textures") {
    if (req.method === "GET") return json(res, 200, readManifest());

    if (req.method === "POST") {
      readBody(req, (body) => {
        let data;
        try { data = JSON.parse(body); } catch { return json(res, 400, { error: "bad json" }); }
        const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(data.dataUrl || "");
        if (!m) return json(res, 400, { error: "dataUrl must be a png/jpeg/webp data URL" });
        const name = String(data.name || "Untitled").slice(0, 60);
        const scale = Math.min(3, Math.max(0.1, parseFloat(data.scale) || 0.5));
        const id = "tex-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        const file = id + EXT_BY_MIME[m[1]];
        fs.writeFileSync(path.join(TEX_DIR, file), Buffer.from(m[2], "base64"));
        const list = readManifest();
        list.push({ id, name, file, scale });
        writeManifest(list);
        return json(res, 200, { ok: true, id });
      });
      return;
    }

    if (req.method === "DELETE") {
      const id = new URLSearchParams(query || "").get("id");
      const list = readManifest();
      const entry = list.find((t) => t.id === id);
      if (!entry) return json(res, 404, { error: "not found" });
      try { fs.unlinkSync(path.join(TEX_DIR, path.basename(entry.file))); } catch { /* already gone */ }
      writeManifest(list.filter((t) => t.id !== id));
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "method not allowed" });
  }

  // static files
  let filePath = decodeURIComponent(urlPath);
  if (filePath === "/") filePath = "/index.html";
  const file = path.join(ROOT, filePath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`AcoustiConfig running at http://localhost:${PORT}`))
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`AcoustiConfig is already running at http://localhost:${PORT}`);
      process.exit(0);
    }
    throw err;
  });
