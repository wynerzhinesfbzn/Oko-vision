import { Keypair } from "@solana/web3.js";

async function decryptData(encryptedBase64: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf  = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const salt = buf.slice(0, 16);
  const iv   = buf.slice(16, 28);
  const ct   = buf.slice(28);
  const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Неверный пароль");
  }
}

/** Get keypair instantly without a password (rawPrivKey stored in plain text). */
export function getKeypairDirect(address: string): Keypair | null {
  try {
    const raw = localStorage.getItem(`oko-wallet-${address}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.type !== "generated" || !data.rawPrivKey) return null;
    const bytes = Uint8Array.from(Buffer.from(data.rawPrivKey, "hex"));
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}

/** Unlock with password once, save rawPrivKey for future passwordless use. */
export async function unlockAndSaveKeypair(address: string, password: string): Promise<Keypair> {
  const raw = localStorage.getItem(`oko-wallet-${address}`);
  if (!raw) throw new Error("Данные кошелька не найдены");
  const data = JSON.parse(raw);
  if (data.type !== "generated") throw new Error("Этот кошелёк подключён через Phantom");
  const privKeyHex = await decryptData(data.encPrivKey, password);
  // Save raw so future calls work without password
  data.rawPrivKey = privKeyHex;
  localStorage.setItem(`oko-wallet-${address}`, JSON.stringify(data));
  const bytes = Uint8Array.from(Buffer.from(privKeyHex, "hex"));
  return Keypair.fromSecretKey(bytes);
}

/** Returns a Keypair using password (legacy). */
export async function getDecryptedKeypair(address: string, password: string): Promise<Keypair> {
  return unlockAndSaveKeypair(address, password);
}

/** Returns the decrypted mnemonic for a locally-generated OKO wallet. */
export async function getDecryptedMnemonic(address: string, password: string): Promise<string> {
  const raw = localStorage.getItem(`oko-wallet-${address}`);
  if (!raw) throw new Error("Данные кошелька не найдены");
  const data = JSON.parse(raw);
  if (data.type !== "generated") throw new Error("Этот кошелёк подключён через Phantom");
  if (!data.encMnemonic) throw new Error("Мнемоник не найден");
  const mn = await decryptData(data.encMnemonic, password);
  // Save raw mnemonic too while we're at it
  if (!data.rawMnemonic) {
    data.rawMnemonic = mn;
    localStorage.setItem(`oko-wallet-${address}`, JSON.stringify(data));
  }
  return mn;
}

/** True if wallet has rawPrivKey (passwordless signing available). */
export function hasRawPrivKey(address: string): boolean {
  try {
    const raw = localStorage.getItem(`oko-wallet-${address}`);
    if (!raw) return false;
    const d = JSON.parse(raw);
    return d.type === "generated" && !!d.rawPrivKey;
  } catch { return false; }
}

/** Check whether a locally-stored wallet exists. */
export function hasStoredKeypair(address: string): boolean {
  try {
    const raw = localStorage.getItem(`oko-wallet-${address}`);
    if (!raw) return false;
    const d = JSON.parse(raw);
    return d.type === "generated" && (!!d.rawPrivKey || !!d.encPrivKey);
  } catch { return false; }
}
