// Passphrase-based encryption for the cloud-folder sync snapshot. AES-256-GCM
// with a PBKDF2-derived key (Web Crypto — available in the Tauri webview). The
// snapshot is written to the user's own cloud-synced folder, so only the owner
// (who knows the passphrase) can read it. Pure and testable.

const KDF_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type EncryptedEnvelope = {
  v: 1;
  alg: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypts a UTF-8 string, returning a self-describing JSON envelope (base64).
export async function encryptString(plaintext: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error("Задайте пароль для синхронизации.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  );
  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ciphertext)
  };
  return JSON.stringify(envelope);
}

// Decrypts an envelope produced by encryptString. Throws on a wrong passphrase
// or corrupt payload.
export async function decryptString(payload: string, passphrase: string): Promise<string> {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(payload) as EncryptedEnvelope;
  } catch {
    throw new Error("Файл синхронизации повреждён.");
  }
  if (envelope.alg !== "AES-GCM" || !envelope.salt || !envelope.iv || !envelope.ct) {
    throw new Error("Неизвестный формат файла синхронизации.");
  }
  const key = await deriveKey(passphrase, fromBase64(envelope.salt));
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      key,
      fromBase64(envelope.ct)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Неверный пароль или файл повреждён.");
  }
}
