function apiBase() {
  return (window.TMPNOTE_CONFIG?.apiBase || "").replace(/\/$/, "");
}

export function hasApi() {
  return Boolean(apiBase());
}

export async function createRemoteNote({ payload, ttlSeconds }) {
  const base = apiBase();
  if (!base) throw new Error("API is not configured");
  const res = await fetch(`${base}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, ttlSeconds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Create failed (${res.status})`);
  }
  return data;
}

export async function burnRemoteNote(id) {
  const base = apiBase();
  if (!base) throw new Error("API is not configured");
  const res = await fetch(`${base}/notes/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) {
    throw new Error("This note was already read or has expired.");
  }
  if (!res.ok) {
    throw new Error(data.error || `Fetch failed (${res.status})`);
  }
  return data;
}
