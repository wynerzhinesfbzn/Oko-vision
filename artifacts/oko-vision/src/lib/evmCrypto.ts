/**
 * AES-256-GCM encryption for private key storage
 * Uses Web Crypto API (built-in in all modern browsers).
 */

const ENC = "UTF-8";
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt.buffer as ArrayBuffer), iterations: 210_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...u8));
}
function fromB64(s: string) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

export interface EncryptedPayload {
  salt: string;   // base64
  iv:   string;   // base64
  ct:   string;   // base64 ciphertext
}

export async function encryptPrivateKey(
  privateKey: string,
  password: string
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const ct   = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(privateKey)
  );
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptPrivateKey(
  payload: EncryptedPayload,
  password: string
): Promise<string> {
  const salt = fromB64(payload.salt);
  const iv   = fromB64(payload.iv);
  const ct   = fromB64(payload.ct);
  const key  = await deriveKey(password, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return dec.decode(pt);
  } catch {
    throw new Error("Неверный пароль");
  }
}
