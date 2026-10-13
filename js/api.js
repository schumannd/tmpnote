function apiBase() {
  return (window.TMPNOTE_CONFIG?.apiBase || "").replace(/\/$/, "");
}

export function hasApi() {
  return Boolean(apiBase());
}

async function requestApi(url, options, consuming = false) {
  try {
    return await fetch(url, { ...options, cache: "no-store" });
  } catch {
    const message = "Cannot connect to the note service. Open this page in your regular browser and check your connection or content blocker.";
    throw new Error(consuming
      ? `${message} If the request reached the service, the note may already have been consumed.`
      : message);
  }
}

export async function createRemoteNote({ payload, ttlSeconds }) {
  const base = apiBase();
  if (!base) throw new Error("API is not configured");
  const res = await requestApi(`${base}/notes`, {
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
  const res = await requestApi(`${base}/notes/${encodeURIComponent(id)}`, {
    method: "POST",
  }, true);
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) {
    throw new Error("This note was already read or has expired.");
  }
  if (!res.ok) {
    throw new Error(data.error || `Fetch failed (${res.status})`);
  }
  return data;
}
