// Passphrase-based encryption for the cloud-folder sync snapshot. AES-256-GCM
// with a PBKDF2-derived key (Web Crypto — available in the Tauri webview). The
// snapshot is written to the user's own cloud-synced folder, so only the owner
// (who knows the passphrase) can read it. Pure and testable.

import { fromBase64, toBase64 } from "@/lib/sync/bytes";

// 600 000 — как у основного замка (lib/sync/vault-crypto) и как советует
// OWASP для PBKDF2-SHA256. Прежде здесь было 200 000: файл в облачной папке
// лежит у чужой компании, и перебирать пароль к нему можно было втрое дешевле,
// чем к самим данным на устройстве.
const KDF_ITERATIONS = 600_000;
// Чем были зашифрованы файлы до этого. Нужен, чтобы прочитать старый файл без
// поля iterations.
const LEGACY_ITERATIONS = 200_000;
// Сколько прогонов готовы принять из чужого файла. Число берётся из самого
// файла, а файл лежит в облаке: подсунутый с миллиардом прогонов повесил бы
// приложение, с единицей — ничего бы не открыл, но и проверять его незачем.
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;
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

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  // The envelope says how many rounds made it, and decryption has to believe it
  // rather than the current constant — otherwise raising this number would lock
  // every file written before the change.
  iterations: number = KDF_ITERATIONS
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
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
  const rounds = envelope.iterations === undefined ? LEGACY_ITERATIONS : envelope.iterations;
  if (
    typeof rounds !== "number" ||
    !Number.isInteger(rounds) ||
    rounds < MIN_ITERATIONS ||
    rounds > MAX_ITERATIONS
  ) {
    throw new Error("Неизвестный формат файла синхронизации.");
  }
  const key = await deriveKey(passphrase, fromBase64(envelope.salt), rounds);
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
