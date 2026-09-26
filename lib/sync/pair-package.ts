// Пакет связки: что первое устройство передаёт второму через картинку QR.
//
// ЗАЧЕМ ОН. Данные на службе зашифрованы ключом, который служба не видит. Второе
// устройство должно получить этот ключ — иначе ему нечем открыть то, что
// приедет. Раньше ключ ехал завёрнутым в пароль, и человек вводил на новом
// устройстве имя и пароль. Теперь ключ едет в пакете, а пакет запечатан
// одноразовым ключом, который есть ТОЛЬКО в картинке QR.
//
// ЧТО ВИДИТ СЛУЖБА. Запечатанный пакет — пять минут, до первого предъявления
// кода, после чего стирает его. Открыть его ей нечем: одноразовый ключ живёт в
// картинке на экране первого устройства и на службу не приезжает никогда.
//
// ЧЕМ ЗА ЭТО ПЛАТЯТ, прямо. Картинка на экране — это доступ к данным на пять
// минут. Снявший её из-за плеча и успевший раньше хозяина получит данные.
// Поэтому код одноразовый и короткоживущий, первое устройство показывает, кто
// подключился, а лишнее устройство выкидывается из списка одним нажатием.

import { fromBase64, toBase64 } from "@/lib/sync/bytes";
import type { Vault } from "@/lib/sync/vault-crypto";

/** Что едет внутри. Всё, чтобы второе устройство стало таким же, как первое. */
export type PairPackage = {
  v: 1;
  /** Ключ данных, сырой, base64. */
  bookKey: string;
  /** Шкатулка первого устройства: тот же пароль откроет данные и здесь. */
  vault: Vault;
  /** Код восстановления — только у данных без пароля (см. AccountService). */
  recoveryCode?: string;
};

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const plain = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(plain + "=".repeat((4 - (plain.length % 4)) % 4));
}

/** Одноразовый ключ: сам ключ и он же строкой для картинки. */
export async function newTransferKey(): Promise<{ key: CryptoKey; text: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
  return { key, text: toBase64Url(raw) };
}

/**
 * Одноразовый ключ из чужой картинки — при обратной связке его придумало
 * НОВОЕ устройство, а запечатывает им пакет то, где данные уже есть.
 */
export async function importTransferKey(text: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey("raw", fromBase64Url(text), { name: "AES-GCM" }, false, [
      "encrypt"
    ]);
  } catch {
    throw new Error("Код с нового устройства не читается. Покажите на нём новый.");
  }
}

/** Запечатать пакет. Выходит строка: вектор и шифротекст одним куском. */
export async function sealPackage(key: CryptoKey, pack: PairPackage): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(JSON.stringify(pack));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, body));
  const joined = new Uint8Array(iv.length + sealed.length);
  joined.set(iv);
  joined.set(sealed, iv.length);
  return toBase64Url(joined);
}

/**
 * Открыть пакет ключом из картинки.
 *
 * Не открылся — значит картинка не та или пакет подменён: GCM проверяет
 * целостность сам, и подделанный пакет не расшифруется в «что-то похожее».
 */
export async function openPackage(keyText: string, sealed: string): Promise<PairPackage> {
  let pack: PairPackage;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(keyText),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const bytes = fromBase64Url(sealed);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12)
    );
    pack = JSON.parse(new TextDecoder().decode(plain)) as PairPackage;
  } catch {
    throw new Error("Код не подошёл к этому устройству. Покажите на первом устройстве новый.");
  }
  if (pack?.v !== 1 || !pack.bookKey || !pack.vault) {
    throw new Error("Код не подошёл к этому устройству. Покажите на первом устройстве новый.");
  }
  return pack;
}
