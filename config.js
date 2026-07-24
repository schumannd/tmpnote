// Site configuration. For burn-after-read, set apiBase to your Worker URL.
// Leave empty ("") to use URL-embedded mode only (fully static, no server).
window.TMPNOTE_CONFIG = {
  // Example: "https://tmpnote-api.your-subdomain.workers.dev"
  apiBase: "",
  // Max plaintext length (chars)
  maxNoteLength: 10000,
  // Default TTL in seconds when using the API (KV expiration)
  defaultTtlSeconds: 60 * 60 * 24 * 7,
  siteName: "tmpnote",
};
