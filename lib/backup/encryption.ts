/**
 * Файл резервной копии под паролем.
 *
 * Копия — это вся история денег человека, и лежит она чаще всего не на диске
 * этого компьютера, а в облачной папке (Яндекс Диск, Dropbox) или в
 * переписке «самому себе». Открытым JSON её прочитает любой, кто доберётся до
 * облака или до переписки. Поэтому файл можно запереть паролем.
 *
 * КАК ВЫГЛЯДИТ ФАЙЛ. Тот же `.json` — имя не меняется: копии по расписанию
 * ищутся и чистятся по имени (lib/backup/auto-backup, команды Rust), и
 * человек, привыкший к «financial-assistant-backup-….json», узнаёт свой файл.
 * Внутри — обёртка, по которой его видно с первого поля:
 *
 *     { "format": "financeapps-encrypted-backup", "v": 1,
 *       "payload": "<вывод encryptString>" }
 *
 * `payload` — ровно то, что пишет lib/sync/crypto для файла синхронизации
 * (PBKDF2-SHA256 + AES-GCM, с собственным номером версии и числом прогонов),
 * строкой. Под ним — РОВНО тот текст, который лёг бы в файл без пароля. После
 * расшифровки восстановление идёт тем же путём, что и для открытого файла, и
 * разойтись им негде.
 *
 * ЧЕМ ЗАПЕРТ — ТОЛЬКО ПАРОЛЕМ. Ни ключом книги, ни шкатулкой с этого
 * устройства: копию берут именно туда, где ни книги, ни шкатулки нет, — на
 * новый компьютер после потери старого. Пароль нигде не хранится (кроме
 * копий по расписанию, и то лишь на этом устройстве — см. AutoBackupService),
 * поэтому забытый пароль — потерянная копия. Это сказано человеку рядом с
 * полем, а не здесь.
 */

import { decryptString, encryptString } from "@/lib/sync/crypto";
import { apiText } from "@/lib/i18n/api-text";

export const ENCRYPTED_BACKUP_FORMAT = "financeapps-encrypted-backup";
const ENCRYPTED_BACKUP_VERSION = 1;

/**
 * Самый короткий пароль к файлу. Тот же, что у замка на устройстве: файл
 * лежит у чужой компании, и перебирать пароль к нему можно сколько угодно.
 */
export const MIN_BACKUP_PASSWORD = 8;

export type EncryptedBackupFile = {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  v: number;
  payload: string;
};

/** Файл заперт паролем, а пароля не дали. Экран ловит его и спрашивает пароль. */
export class BackupPasswordRequiredError extends Error {
  constructor() {
    super(apiText("api.backup.locked"));
    this.name = "BackupPasswordRequiredError";
  }
}

/**
 * Пароль не подошёл. Отдельный класс — чтобы экран оставил выбранный файл и
 * предложил попробовать ещё раз, а не сбросил всё как «файл не тот».
 */
export class BackupWrongPasswordError extends Error {
  constructor() {
    super(apiText("api.backup.wrongPassword"));
    this.name = "BackupWrongPasswordError";
  }
}

/** Похоже ли прочитанное из файла на запертую копию — по обёртке, без пароля. */
export function isEncryptedBackup(value: unknown): value is EncryptedBackupFile {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedBackupFile>;
  return candidate.format === ENCRYPTED_BACKUP_FORMAT && typeof candidate.payload === "string";
}

/** Запереть текст копии паролем. Возвращает содержимое файла целиком. */
export async function encryptBackupText(plaintext: string, password: string): Promise<string> {
  if (!password) throw new Error(apiText("api.backup.needPassword"));
  const file: EncryptedBackupFile = {
    format: ENCRYPTED_BACKUP_FORMAT,
    v: ENCRYPTED_BACKUP_VERSION,
    payload: await encryptString(plaintext, password)
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Отпереть запертую копию — получить тот JSON, что лёг бы в файл без пароля.
 *
 * Обёртку внутри payload проверяем сами, ДО расшифровки: decryptString на
 * любую неудачу самой расшифровки отвечает «неверный пароль», и только так
 * можно честно разделить «пароль не тот» (попробуйте ещё) и «файл испорчен»
 * (пробовать бесполезно). Слова у неё к тому же про файл синхронизации.
 */
export async function decryptBackupFile(
  file: EncryptedBackupFile,
  password: string
): Promise<unknown> {
  if (file.v !== ENCRYPTED_BACKUP_VERSION) throw new Error(apiText("api.backup.newerFormat"));
  if (!password) throw new BackupPasswordRequiredError();
  let inner: Record<string, unknown>;
  try {
    inner = JSON.parse(file.payload) as Record<string, unknown>;
  } catch {
    throw new Error(apiText("api.backup.corrupt"));
  }
  if (
    inner === null ||
    typeof inner !== "object" ||
    inner.alg !== "AES-GCM" ||
    typeof inner.salt !== "string" ||
    typeof inner.iv !== "string" ||
    typeof inner.ct !== "string"
  ) {
    throw new Error(apiText("api.backup.corrupt"));
  }
  let plaintext: string;
  try {
    plaintext = await decryptString(file.payload, password);
  } catch {
    // Число прогонов вне допустимого тоже попадает сюда — и это правильно:
    // такой файл подсунут или испорчен, и пароль от него не откроет ничего.
    throw new BackupWrongPasswordError();
  }
  try {
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new Error(apiText("api.backup.corrupt"));
  }
}

/**
 * Прочитать содержимое файла копии — запертого или открытого.
 *
 * Открытый файл возвращается разобранным как есть, ровно как читался прежде:
 * JSON.parse и больше ничего (битый JSON — SyntaxError, как и раньше). Запертый
 * без пароля — BackupPasswordRequiredError, с неверным —
 * BackupWrongPasswordError. Что делать с документом дальше (unwrapBackup и
 * отправка в /backup), решает экран — так же, как для открытого файла.
 */
export async function readBackupFileText(text: string, password?: string): Promise<unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!isEncryptedBackup(parsed)) return parsed;
  return decryptBackupFile(parsed, password ?? "");
}
