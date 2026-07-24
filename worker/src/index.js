const MAX_PAYLOAD_BYTES = 64_000;
const MAX_TTL = 60 * 60 * 24 * 30;
const MIN_TTL = 60;
const DEFAULT_TTL = 60 * 60 * 24 * 7;
const ID_BYTES = 16;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ok =
    allowed.includes("*") ||
    allowed.includes(origin) ||
    (!origin && allowed.length > 0);
  const headers = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
  if (ok && origin) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  } else if (allowed.includes("*")) {
    headers["access-control-allow-origin"] = "*";
  }
  return headers;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request, env))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_BYTES));
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return withCors(json({ ok: true }), request, env);
      }

      if (request.method === "POST" && url.pathname === "/notes") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.payload !== "string") {
          return withCors(json({ error: "payload required" }, 400), request, env);
        }
        if (body.payload.length > MAX_PAYLOAD_BYTES) {
          return withCors(json({ error: "payload too large" }, 413), request, env);
        }
        let ttl = Number(body.ttlSeconds ?? DEFAULT_TTL);
        if (!Number.isFinite(ttl)) ttl = DEFAULT_TTL;
        ttl = Math.min(MAX_TTL, Math.max(MIN_TTL, Math.floor(ttl)));

        const id = randomId();
        const record = {
          payload: body.payload,
          createdAt: Date.now(),
        };
        await env.NOTES.put(id, JSON.stringify(record), {
          expirationTtl: ttl,
        });
        return withCors(json({ id, ttlSeconds: ttl }, 201), request, env);
      }

      const readMatch = url.pathname.match(/^\/notes\/([a-f0-9]+)$/i);
      if (request.method === "GET" && readMatch) {
        const id = readMatch[1].toLowerCase();
        const raw = await env.NOTES.get(id);
        if (!raw) {
          return withCors(
            json({ error: "Note not found or already destroyed" }, 404),
            request,
            env
          );
        }
        // Burn immediately — race-friendly enough for a personal tool
        await env.NOTES.delete(id);
        let record;
        try {
          record = JSON.parse(raw);
        } catch {
          return withCors(json({ error: "Corrupt note" }, 500), request, env);
        }
        return withCors(
          json({ payload: record.payload, createdAt: record.createdAt }),
          request,
          env
        );
      }

      return withCors(json({ error: "Not found" }, 404), request, env);
    } catch (err) {
      return withCors(
        json({ error: err.message || "Server error" }, 500),
        request,
        env
      );
    }
  },
};
