const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptNote(plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      textEncoder.encode(plaintext)
    )
  );
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    payload: `${bytesToBase64url(iv)}.${bytesToBase64url(ciphertext)}`,
    key: bytesToBase64url(rawKey),
  };
}

export async function decryptNote(payload, keyB64) {
  const [ivB64, ctB64] = payload.split(".");
  if (!ivB64 || !ctB64) throw new Error("Malformed ciphertext");
  const iv = base64urlToBytes(ivB64);
  const ciphertext = base64urlToBytes(ctB64);
  const rawKey = base64urlToBytes(keyB64);
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return textDecoder.decode(plain);
}
