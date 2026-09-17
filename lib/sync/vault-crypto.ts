// Ключ книги и два замка на нём.
//
// Книга шифруется на устройстве и уезжает на сервер уже нечитаемой: сервер
// хранит шкатулку, ключа от которой у него нет и быть не может. Отсюда всё
// остальное устройство этого файла.
//
// Шифровать книгу прямо на пароле было бы проще — и неверно. Пароль меняют, а
// перешифровать всю книгу при каждой смене пароля значит скачать её, расшифровать,
// зашифровать заново и отправить; на телефоне в метро это кончится наполовину
// записанной книгой. Поэтому книгу шифрует СВОЙ случайный ключ (256 бит), а
// пароль шифрует только этот ключ — тридцать два байта. Смена пароля
// переупаковывает тридцать два байта и не трогает книгу вовсе.
//
// Замка на ключе два, и оба открывают один и тот же ключ:
//
//   пароль        — которым пользуются каждый день;
//   код восстановления — 12 слов на бумаге, для того дня, когда пароль забыт.
//
// Третьего пути нет. Потеряны оба — книга потеряна навсегда, и это не недоделка,
// а прямое следствие того, что у сервера ключа нет. Сказать об этом человеку
// надо при регистрации, а не в тот день.
//
// Из того же пароля выводится ещё и секрет входа — то, что уходит на сервер,
// чтобы он узнал человека. Выводится ОТДЕЛЬНОЙ ветвью, и обратного хода нет:
// зная секрет входа, ключ, которым завёрнута книга, не получить. Поэтому и
// утечка базы сервера не отдаёт содержимое книг.
//
// Честная оговорка, которую лучше прочитать сейчас: устойчивость всего этого к
// тому, кто украл базу сервера, упирается в СИЛУ ПАРОЛЯ. Укравший может
// перебирать пароли у себя, проверяя догадки по украденному. Дорого — каждая
// догадка стоит целого прогона PBKDF2 — но возможно, если пароль слабый.
// Код восстановления этим не берётся никогда: в нём 120 случайных бит.

import { fromBase64, toBase64 } from "@/lib/sync/bytes";
import { RECOVERY_WORDS } from "@/lib/sync/recovery-words";

/**
 * Сколько раз прогоняется PBKDF2. Рекомендация OWASP на 2023 год для
 * PBKDF2-HMAC-SHA256; на телефоне это около секунды — терпимо для действия,
 * которое человек делает один раз за всё время.
 *
 * Число записывается в саму шкатулку и при открытии берётся ОТТУДА, а не
 * отсюда: иначе, подняв эту цифру, мы заперли бы всех, кто зарегистрировался
 * раньше.
 */
export const VAULT_KDF_ITERATIONS = 600_000;

/** Длина кода восстановления в словах: 12 × 10 бит = 120 бит. */
export const RECOVERY_CODE_WORDS = 12;

/** По скольким первым буквам слово из словаря узнаётся однозначно. */
const WORD_PREFIX = 4;

const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Один замок: соль для вывода ключа замка и завёрнутый им ключ книги. */
export type VaultLock = {
  salt: string;
  iv: string;
  /** Ключ книги, завёрнутый ключом этого замка. */
  wrapped: string;
};

/** Шкатулка с ключом книги. Лежит на сервере; содержимое книги — отдельно. */
export type Vault = {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  password: VaultLock;
  recovery: VaultLock;
};

/** Зашифрованная книга — то, что уезжает на сервер как содержимое. */
export type SealedBook = {
  v: 1;
  alg: "AES-GCM";
  iv: string;
  ct: string;
};

const encoder = new TextEncoder();

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Пароль (или код восстановления) → корень, из которого растут и ключ замка, и
 * секрет входа. Дорогая часть делается здесь и ровно один раз: PBKDF2 медленный
 * нарочно, и гонять его дважды на одну и ту же строку незачем.
 */
async function deriveRoot(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    256
  );
  return crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey", "deriveBits"]);
}

// Две ветви от одного корня. Метки разные, и этого достаточно: HKDF с разными
// info даёт независимые результаты, а вывернуть его назад к корню нельзя.
const KEK_LABEL = encoder.encode("financeapps/vault/kek/v1");
const AUTH_LABEL = encoder.encode("financeapps/vault/auth/v1");

/** Ключ, которым заворачивается ключ книги. Наружу не отдаётся никогда. */
async function deriveKek(root: CryptoKey) {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: KEK_LABEL },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

/** Секрет входа: единственное, что из пароля уходит на сервер. */
async function deriveAuth(root: CryptoKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: AUTH_LABEL },
    root,
    256
  );
  return toBase64(new Uint8Array(bits));
}

/** Заворачивает ключ книги в новый замок под заданный секрет. */
async function lockWith(
  bookKey: CryptoKey,
  secret: string,
  iterations: number
): Promise<VaultLock> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const kek = await deriveKek(await deriveRoot(secret, salt, iterations));
  const wrapped = await crypto.subtle.wrapKey("raw", bookKey, kek, { name: "AES-GCM", iv });
  return { salt: toBase64(salt), iv: toBase64(iv), wrapped: toBase64(new Uint8Array(wrapped)) };
}

/**
 * Открывает замок. `extractable` просят только там, где ключ надо будет
 * завернуть заново — при смене пароля. В обычной работе ключ книги неизвлекаем:
 * шифровать и расшифровывать им можно, а вытащить из него байты и куда-нибудь
 * отправить — нет.
 */
async function unlockWith(
  lock: VaultLock,
  secret: string,
  iterations: number,
  extractable: boolean
): Promise<CryptoKey> {
  const kek = await deriveKek(await deriveRoot(secret, fromBase64(lock.salt), iterations));
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      fromBase64(lock.wrapped),
      kek,
      { name: "AES-GCM", iv: fromBase64(lock.iv) },
      { name: "AES-GCM", length: 256 },
      extractable,
      ["encrypt", "decrypt"]
    );
  } catch {
    throw new Error("Не подходит — проверьте пароль или код восстановления.");
  }
}

/**
 * Двенадцать слов из словаря, по десять бит на слово.
 *
 * Слова берутся маской из случайных шестнадцатибитных чисел, а НЕ остатком от
 * деления: словарь ровно в 1024 слова, десять младших бит попадают в него
 * целиком, и все слова равновероятны. С остатком от деления по словарю не в
 * степень двойки начало списка выпадало бы чуть чаще конца — незаметно глазом
 * и заметно перебором.
 */
export function generateRecoveryCode(): string {
  const raw = crypto.getRandomValues(new Uint16Array(RECOVERY_CODE_WORDS));
  return Array.from(raw, (value) => RECOVERY_WORDS[value & 0x3ff]).join(" ");
}

/**
 * Приводит переписанный с бумаги код к тому виду, в котором он был выдан.
 *
 * Прощает регистр, любые пробелы и переносы, дефисы и запятые между словами,
 * «ё» вместо «е» (в словаре «ё» нет вовсе) и недописанное слово — по первым
 * четырём буквам оно узнаётся однозначно, так и словарь собран. Не прощает
 * только настоящую ошибку — и тогда прямо называет слово, на котором споткнулась,
 * а не отвечает «неверный код» на двенадцать слов сразу.
 */
export function normalizeRecoveryCode(input: string): string {
  const parts = input
    .toLowerCase()
    .replaceAll("ё", "е")
    .split(/[^а-я]+/)
    .filter(Boolean);
  if (parts.length !== RECOVERY_CODE_WORDS) {
    throw new Error(
      `В коде восстановления должно быть ${RECOVERY_CODE_WORDS} слов, а получено ${parts.length}.`
    );
  }
  return parts
    .map((part) => {
      const full = RECOVERY_WORDS.find((word) => word.startsWith(part.slice(0, WORD_PREFIX)));
      if (!full || !full.startsWith(part)) {
        throw new Error(`Слова «${part}» нет в словаре — проверьте, как оно записано.`);
      }
      return full;
    })
    .join(" ");
}

/**
 * Заводит книге ключ и вешает на него оба замка.
 *
 * Возвращает и код восстановления — показать его человеку можно только сейчас,
 * второго раза не будет: на сервер уезжает не код, а лишь замок, который им
 * открывается.
 */
export async function createVault(
  password: string,
  options: { iterations?: number } = {}
): Promise<{ vault: Vault; recoveryCode: string; bookKey: CryptoKey }> {
  if (!password) throw new Error("Задайте пароль.");
  const iterations = options.iterations ?? VAULT_KDF_ITERATIONS;
  const recoveryCode = generateRecoveryCode();
  // Ключ книги — извлекаемый: его надо заворачивать, и при смене пароля
  // заворачивать заново. Наружу отдаётся неизвлекаемая копия (см. ниже).
  const bookKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt"
  ]);
  const vault: Vault = {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    password: await lockWith(bookKey, password, iterations),
    recovery: await lockWith(bookKey, recoveryCode, iterations)
  };
  return { vault, recoveryCode, bookKey: await unlockWithPassword(vault, password) };
}

/** Сколько раз прогонять PBKDF2 для ЭТОЙ шкатулки — по её собственной записи. */
function roundsOf(vault: Vault): number {
  return Number.isFinite(vault.iterations) && vault.iterations > 0
    ? vault.iterations
    : VAULT_KDF_ITERATIONS;
}

/**
 * Открывает книгу паролем.
 *
 * По умолчанию ключ НЕИЗВЛЕКАЕМ: им можно шифровать и расшифровывать, а достать
 * из него байты и куда-нибудь положить — нельзя. `extractable` просят там, где
 * ключ собираются сохранить, — сегодня это одно место, галка «не спрашивать на
 * этом устройстве». Пусть намерение сохранить ключ будет видно в коде, а не
 * окажется случайным свойством ключа, который и так всем раздали.
 */
export async function unlockWithPassword(
  vault: Vault,
  password: string,
  options: { extractable?: boolean } = {}
): Promise<CryptoKey> {
  return unlockWith(vault.password, password, roundsOf(vault), options.extractable ?? false);
}

/** Открывает книгу кодом восстановления — путь для забывшего пароль. */
export async function unlockWithRecoveryCode(
  vault: Vault,
  code: string,
  options: { extractable?: boolean } = {}
): Promise<CryptoKey> {
  return unlockWith(
    vault.recovery,
    normalizeRecoveryCode(code),
    roundsOf(vault),
    options.extractable ?? false
  );
}

/**
 * Секрет входа для сервера. Считается из пароля и соли того же замка, поэтому
 * на любом устройстве выходит одинаковым — а на ключ книги не наводит.
 */
export async function authSecret(vault: Vault, password: string): Promise<string> {
  return deriveAuth(await deriveRoot(password, fromBase64(vault.password.salt), roundsOf(vault)));
}

/**
 * Смена пароля. Переупаковывается ТОЛЬКО ключ книги; сама книга не читается, не
 * перешифровывается и никуда не ездит. Замок кода восстановления остаётся
 * прежним: выданные на бумаге слова после смены пароля обязаны работать.
 */
export async function changePassword(
  vault: Vault,
  currentPassword: string,
  nextPassword: string
): Promise<Vault> {
  if (!nextPassword) throw new Error("Задайте новый пароль.");
  const rounds = roundsOf(vault);
  const bookKey = await unlockWith(vault.password, currentPassword, rounds, true);
  return { ...vault, password: await lockWith(bookKey, nextPassword, rounds) };
}

/**
 * Забыли пароль — задаём новый по коду восстановления. Ключ книги тот же, так
 * что всё записанное до этого дня остаётся читаемым.
 */
export async function resetPasswordWithRecoveryCode(
  vault: Vault,
  code: string,
  nextPassword: string
): Promise<Vault> {
  if (!nextPassword) throw new Error("Задайте новый пароль.");
  const rounds = roundsOf(vault);
  const bookKey = await unlockWith(vault.recovery, normalizeRecoveryCode(code), rounds, true);
  return { ...vault, password: await lockWith(bookKey, nextPassword, rounds) };
}

/** Шифрует книгу ключом книги. Свой вектор на каждую запись — обязательно. */
export async function sealBook(plaintext: string, bookKey: CryptoKey): Promise<SealedBook> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    bookKey,
    encoder.encode(plaintext)
  );
  return { v: 1, alg: "AES-GCM", iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

/**
 * Расшифровывает книгу. Падает и на неверном ключе, и на подменённом хоть в
 * одном байте шифротексте: AES-GCM проверяет целостность сам, и подсунуть
 * изменённую книгу мимо этой проверки нельзя.
 */
export async function openBook(sealed: SealedBook, bookKey: CryptoKey): Promise<string> {
  if (sealed?.alg !== "AES-GCM" || !sealed.iv || !sealed.ct) {
    throw new Error("Данные с сервера пришли в неизвестном виде.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv) },
      bookKey,
      fromBase64(sealed.ct)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Данные не удалось прочитать — не тот ключ или файл повреждён.");
  }
}
