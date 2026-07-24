/** Encode ciphertext into a compact URL fragment token (no server). */
export function encodeUrlNote(payload) {
  return `u.${payload}`;
}

export function isUrlNoteToken(token) {
  return typeof token === "string" && token.startsWith("u.");
}

export function decodeUrlNote(token) {
  if (!isUrlNoteToken(token)) throw new Error("Not a URL-mode note");
  return token.slice(2);
}
