/**
 * Local static file server + in-memory burn-after-read API.
 * Mirrors the Cloudflare Worker so you can develop without Wrangler.
 *
 *   npm run dev
 *   open http://127.0.0.1:8787
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

const notes = new Map(); // id -> { payload, createdAt, expiresAt }

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extraHeaders,
  });
  res.end(body);
}

function purgeExpired() {
  const now = Date.now();
  for (const [id, note] of notes) {
    if (note.expiresAt <= now) notes.delete(id);
  }
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split("?")[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

function serveStatic(req, res) {
  let reqPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  // Ignore hash-only client routes if someone hits them as paths
  if (reqPath.startsWith("/n/") || reqPath.startsWith("/share/")) {
    reqPath = "/index.html";
  }
  const file = safeJoin(ROOT, reqPath);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  purgeExpired();

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, notes: notes.size });
  }

  if (req.method === "POST" && url.pathname === "/notes") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: "invalid JSON" });
    }
    if (!parsed?.payload || typeof parsed.payload !== "string") {
      return sendJson(res, 400, { error: "payload required" });
    }
    if (parsed.payload.length > 64_000) {
      return sendJson(res, 413, { error: "payload too large" });
    }
    let ttl = Number(parsed.ttlSeconds ?? 604800);
    ttl = Math.min(60 * 60 * 24 * 30, Math.max(60, Math.floor(ttl)));
    const id = randomBytes(16).toString("hex");
    notes.set(id, {
      payload: parsed.payload,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl * 1000,
    });
    return sendJson(res, 201, { id, ttlSeconds: ttl });
  }

  const readMatch = url.pathname.match(/^\/notes\/([a-f0-9]+)$/i);
  if (req.method === "GET" && readMatch) {
    const id = readMatch[1].toLowerCase();
    const note = notes.get(id);
    if (!note || note.expiresAt <= Date.now()) {
      notes.delete(id);
      return sendJson(res, 404, { error: "Note not found or already destroyed" });
    }
    notes.delete(id);
    return sendJson(res, 200, {
      payload: note.payload,
      createdAt: note.createdAt,
    });
  }

  // For local API mode, rewrite config on the fly so the UI talks to this server
  if (req.method === "GET" && url.pathname === "/config.js") {
    const configPath = path.join(ROOT, "config.js");
    let source = fs.readFileSync(configPath, "utf8");
    // Force apiBase to this origin when serving locally
    source = source.replace(
      /apiBase:\s*["'][^"']*["']/,
      `apiBase: "http://${HOST}:${PORT}"`
    );
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(source);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`tmpnote local server at http://${HOST}:${PORT}`);
  console.log("API mode enabled automatically for this session.");
});
