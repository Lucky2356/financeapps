// Base64 для двоичных кусков, которые надо положить в JSON: соли, векторы
// инициализации, шифротекст. Отдельным файлом, потому что этим пользуются оба
// шифрования — и файл синхронизации через папку (lib/sync/crypto.ts), и книга с
// её ключом (lib/sync/vault-crypto.ts).
//
// Шифротекст — это вся книга, мегабайты, и кодируется он на КАЖДОЙ записи.
// Строка собиралась по символу на байт: на двадцати тысячах операций ~0,4 с на
// запись, в десятки раз дольше самого шифрования. Теперь — встроенным
// Uint8Array.prototype.toBase64, где он есть, и таблицей в байты там, где нет:
// кодирование линейное и без промежуточных строк.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGITS = Uint8Array.from(ALPHABET, (char) => char.charCodeAt(0));
const PAD = "=".charCodeAt(0);
const ascii = new TextDecoder();

type NativeEncode = { toBase64?: (this: Uint8Array) => string };
type NativeDecode = { fromBase64?: (value: string) => Uint8Array<ArrayBuffer> };

export function toBase64(bytes: Uint8Array): string {
  const native = (bytes as NativeEncode).toBase64;
  if (typeof native === "function") return native.call(bytes);

  const out = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  const whole = bytes.length - (bytes.length % 3);
  let o = 0;
  for (let i = 0; i < whole; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out[o++] = DIGITS[n >> 18];
    out[o++] = DIGITS[(n >> 12) & 63];
    out[o++] = DIGITS[(n >> 6) & 63];
    out[o++] = DIGITS[n & 63];
  }
  if (whole < bytes.length) {
    const second = whole + 1 < bytes.length;
    const n = (bytes[whole] << 16) | (second ? bytes[whole + 1] << 8 : 0);
    out[o++] = DIGITS[n >> 18];
    out[o++] = DIGITS[(n >> 12) & 63];
    out[o++] = second ? DIGITS[(n >> 6) & 63] : PAD;
    out[o++] = PAD;
  }
  // Символы алфавита — ASCII, а в ASCII UTF-8 совпадает с байтами один в один.
  return ascii.decode(out);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const native = (Uint8Array as NativeDecode).fromBase64;
  if (typeof native === "function") return native(value);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
