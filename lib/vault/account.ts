// Учётная запись владельца книги: завести, отпереть, сменить пароль,
// восстановиться по коду.
//
// Служба стоит между экранами и двумя нижними слоями — шкатулкой с ключом
// (lib/sync/vault-crypto) и запираемым хранилищем
// (lib/storage/EncryptingStorageAdapter). Экраны ни про то, ни про другое не
// знают: они зовут отсюда.
//
// Пока сервера нет, шкатулка лежит на устройстве. Когда он появится, она уедет
// туда — и ровно ничего в этом файле не изменится по существу: шкатулка и
// заводилась так, чтобы её можно было отдать наружу, не отдавая книги.

import {
  BookLockedError,
  EncryptingStorageAdapter,
  UNSEALED_KEYS
} from "@/lib/storage/EncryptingStorageAdapter";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { BASE_SUFFIX } from "@/lib/storage/SyncingStorageAdapter";
import {
  changePassword as rewrapWithNewPassword,
  createVault,
  resetPasswordWithRecoveryCode,
  unlockWithPassword,
  unlockWithRecoveryCode,
  type Vault
} from "@/lib/sync/vault-crypto";

/** Где лежит шкатулка. Читается запертым — см. UNSEALED_KEYS. */
export const VAULT_KEY = "financeVault";

/** Где лежит пометка «на этом устройстве не спрашивать». */
export const DEVICE_KEY = "financeDevice";

/**
 * Что помнит устройство, когда владелец попросил не спрашивать пароль.
 *
 * Здесь ЛЕЖИТ САМ КЛЮЧ КНИГИ, и это надо называть своими словами: на таком
 * устройстве книга открывается любому, кто до устройства добрался. Замок при
 * этом не бесполезен — он по-прежнему стоит на копиях и на том, что уедет на
 * сервер, и он по-прежнему нужен на втором устройстве, — но защиты ИМЕННО
 * ЭТОГО устройства больше нет. Экран обязан сказать это человеку прямо, а не
 * прятать за словом «удобно».
 *
 * Сделать лучше можно и нужно: хранилище ключей самой операционной системы
 * (DPAPI в Windows, Keystore в Android) отдаёт ключ только нашему приложению и
 * не отдаёт тому, кто просто читает файлы. Это отдельная работа на стороне
 * Rust, и она здесь ещё не сделана — поэтому написано как есть.
 */
type DeviceMemory = {
  v: 1;
  /** Ключ книги в необработанном виде, base64. */
  bookKey: string;
};

export type AccountState =
  /** Книги нет и учётной записи нет: первый запуск. */
  | { status: "fresh" }
  /** Учётная запись есть, книга заперта — нужен пароль. */
  | { status: "locked"; vault: Vault }
  /** Открыто и готово к работе. */
  | { status: "unlocked"; vault: Vault; remembered: boolean };

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

/**
 * Служба учётной записи.
 *
 * `plain` — настоящее хранилище устройства (читает и пишет как есть), `sealed` —
 * обёртка поверх него, которой отдают ключ. Оба нужны: шкатулку и пометку
 * устройства пишем мимо шифрования, книгу — сквозь него.
 */
/**
 * Поля, по которым видно, что человеку есть что терять.
 *
 * КАТЕГОРИЙ ЗДЕСЬ НЕТ, И ЭТО ГЛАВНОЕ В СПИСКЕ. Книга первого запуска заводится
 * с набором категорий по умолчанию — их сеет само приложение, чтобы операцию
 * было куда отнести, и денег в них нет никаких. Посчитай мы их записями, отказ
 * срабатывал бы на КАЖДОМ только что поставленном устройстве, то есть ровно
 * там, где человек и подключается. Именно так и вышло в 1.35.0: подключить
 * второе устройство стало нельзя вовсе.
 *
 * Здесь только то, что заводит человек своими руками и что пропадёт вместе со
 * старым ключом.
 */
const LEDGER_FIELDS = ["transactions", "accounts", "goals", "liabilities"] as const;

export class AccountService {
  constructor(
    private readonly plain: StorageAdapter,
    private readonly sealed: EncryptingStorageAdapter
  ) {}

  async vault(): Promise<Vault | null> {
    return this.plain.getItem<Vault>(VAULT_KEY);
  }

  /** Что показывать при запуске. Попутно отпирает, если устройство помнит ключ. */
  async state(): Promise<AccountState> {
    const vault = await this.vault();
    if (!vault) return { status: "fresh" };

    // Уже отперто в памяти — так и есть, спрашивать нечего. Без этой строки
    // человек, только что задавший пароль, тут же получал бы форму «введите
    // пароль»: ключ лежит в памяти хранилища, а на диске никакой пометки нет,
    // и состояние читалось только с диска.
    if (this.sealed.unlocked) {
      return { status: "unlocked", vault, remembered: await this.remembered() };
    }

    const remembered = await this.plain.getItem<DeviceMemory>(DEVICE_KEY);
    if (remembered?.bookKey) {
      try {
        this.sealed.unlock(await importBookKey(remembered.bookKey));
        return { status: "unlocked", vault, remembered: true };
      } catch {
        // Пометка испорчена — не повод не пустить человека вовсе: просто
        // спросим пароль, как будто её и не было.
        await this.forgetDevice();
      }
    }

    return { status: "locked", vault };
  }

  /**
   * Первый запуск: заводит ключ книги, вешает на него два замка и переводит
   * книгу, которая уже лежит на устройстве, в запечатанный вид.
   *
   * Возвращает код восстановления — показать его можно только сейчас.
   */
  async create(
    password: string,
    options: { iterations?: number } = {}
  ): Promise<{ recoveryCode: string }> {
    if (await this.vault()) throw new Error("Учётная запись на этом устройстве уже заведена.");

    const { vault, recoveryCode, bookKey } = await createVault(password, options);
    await sealExistingBook(this.plain, bookKey);
    this.sealed.unlock(bookKey);
    // Шкатулка кладётся ПОСЛЕДНЕЙ. Если что-то оборвалось раньше, на устройстве
    // нет шкатулки — значит, при следующем запуске это снова первый запуск, а
    // книга читается как лежит (см. EncryptingStorageAdapter: незапечатанное
    // читается как есть). Положи мы шкатулку первой — оборвавшийся перевод
    // оставил бы книгу открытой, а приложение считало бы её запертой и не
    // пустило бы к ней никого.
    await this.plain.setItem(VAULT_KEY, vault);
    return { recoveryCode };
  }

  /**
   * Принять учётную запись со своего сервера — на ВТОРОМ устройстве.
   *
   * Зачем это отдельно от `unlock`. Ключ книги придумывается на первом
   * устройстве и лежит в шкатулке, завёрнутый паролем. Второе устройство, пройдя
   * первый запуск, завело СВОЙ ключ — и книгу, приехавшую с сервера, им не
   * открыть: это разные ключи, и никакой пароль тут не поможет. Значит чужую
   * шкатулку надо принять как свою, а не отпирать имеющуюся.
   *
   * Порядок здесь важен не меньше, чем в первом запуске.
   *
   * Пароль проверяется ПЕРВЫМ, до единой записи: не подойди он к чужой
   * шкатулке — на устройстве не должно измениться ничего.
   *
   * Дальше книга этого устройства убирается. Убирается сознательно: она
   * запечатана ключом, который через секунду перестанет существовать, и
   * оставить её значило бы оставить набор байтов, который уже никто никогда не
   * прочитает. Поэтому выше стоит проверка — если в ней есть что терять, сюда
   * мы не доходим вовсе.
   *
   * Пометка «не спрашивать» стирается тоже: в ней лежит ПРЕЖНИЙ ключ, и
   * следующий запуск отпер бы книгу им — то есть не отпер бы ничего.
   *
   * Шкатулка кладётся последней, как и при первом запуске: оборвись всё
   * раньше, на устройстве останется прежняя шкатулка и пустое место под книгу,
   * а это состояние приложение читать умеет.
   */
  async adopt(
    serverVault: Vault,
    password: string,
    options: { remember?: boolean } = {}
  ): Promise<void> {
    const bookKey = await unlockWithPassword(serverVault, password, {
      extractable: options.remember === true
    });

    const own = await this.ownLedgerKeys();
    if (own.length > 0) {
      throw new Error(
        "На этом устройстве уже есть своя книга с записями. Подключение к учётной " +
          "записи сервера заменит ключ, и прочитать её будет нечем. Выгрузите " +
          "резервную копию (Импорт → Резервная копия), очистите данные в настройках " +
          "и подключитесь заново — книга приедет с сервера."
      );
    }

    await this.sealed.clear();
    await this.forgetDevice();
    await this.plain.setItem(VAULT_KEY, serverVault);
    this.sealed.unlock(bookKey);
    if (options.remember) await this.rememberDevice(bookKey);
  }

  /**
   * Книги этого устройства, в которых есть что терять.
   *
   * Пустая книга, заведённая первым запуском, здесь не в счёт: ради неё
   * отказывать человеку в подключении было бы издевательством — она пуста
   * ровно потому, что устройство новое, и именно поэтому он и подключается.
   */
  private async ownLedgerKeys(): Promise<string[]> {
    const found: string[] = [];
    for (const key of await sealableKeys(this.plain)) {
      let book: Record<string, unknown> | null = null;
      try {
        book = await this.sealed.getItem<Record<string, unknown>>(key);
      } catch {
        // Не прочиталась — значит и потерять нечего: открыть её всё равно нечем.
        continue;
      }
      if (!book) continue;

      const rows = LEDGER_FIELDS.some(
        (field) => Array.isArray(book[field]) && (book[field] as unknown[]).length > 0
      );
      if (rows) found.push(key);
    }
    return found;
  }

  /** Отпирает паролем. Бросает, если пароль не подходит. */
  async unlock(password: string, options: { remember?: boolean } = {}): Promise<void> {
    const vault = await this.requireVault();
    // Извлекаемость просим только когда ключ и правда собираются сохранить:
    // без галки он остаётся неизвлекаемым и из памяти его не достать.
    const bookKey = await unlockWithPassword(vault, password, {
      extractable: options.remember === true
    });
    this.sealed.unlock(bookKey);
    if (options.remember) await this.rememberDevice(bookKey);
  }

  /** Отпирает кодом восстановления — для забывшего пароль. */
  async unlockWithCode(code: string): Promise<void> {
    const vault = await this.requireVault();
    this.sealed.unlock(await unlockWithRecoveryCode(vault, code));
  }

  /** Запирает обратно и забывает устройство: «выйти» означает именно это. */
  async lock(): Promise<void> {
    this.sealed.lock();
    await this.forgetDevice();
  }

  /** Смена пароля. Книга не перешифровывается — переупаковывается только ключ. */
  async changePassword(currentPassword: string, nextPassword: string): Promise<void> {
    const vault = await this.requireVault();
    await this.plain.setItem(
      VAULT_KEY,
      await rewrapWithNewPassword(vault, currentPassword, nextPassword)
    );
  }

  /**
   * Забыли пароль: задаём новый по коду восстановления и сразу отпираем.
   * Книга остаётся той же — ключ книги не менялся.
   */
  async resetPassword(code: string, nextPassword: string): Promise<void> {
    const vault = await this.requireVault();
    const next = await resetPasswordWithRecoveryCode(vault, code, nextPassword);
    await this.plain.setItem(VAULT_KEY, next);
    this.sealed.unlock(await unlockWithPassword(next, nextPassword));
  }

  /**
   * Стереть вообще всё и начать с чистого листа: и книгу, и шкатулку.
   *
   * Единственный выход для того, кто потерял и пароль, и код восстановления.
   * Книга при этом пропадает навсегда — открыть её всё равно нечем, и делать
   * вид, что данные ещё можно спасти, было бы обманом. Поэтому действие
   * отдельное, названное своими словами и спрятанное за подтверждением, а не
   * спрятанное совсем: иначе человек остался бы с приложением, которое не
   * открывается и не сбрасывается.
   */
  async forgetEverything(): Promise<void> {
    this.sealed.lock();
    await this.plain.clear();
  }

  /** Помнит ли это устройство ключ. */
  async remembered(): Promise<boolean> {
    return (await this.plain.getItem<DeviceMemory>(DEVICE_KEY)) !== null;
  }

  async forgetDevice(): Promise<void> {
    await this.plain.removeItem(DEVICE_KEY);
  }

  private async rememberDevice(bookKey: CryptoKey): Promise<void> {
    const raw = await crypto.subtle.exportKey("raw", bookKey);
    await this.plain.setItem<DeviceMemory>(DEVICE_KEY, {
      v: 1,
      bookKey: toBase64(new Uint8Array(raw))
    });
  }

  private async requireVault(): Promise<Vault> {
    const vault = await this.vault();
    if (!vault) throw new BookLockedError();
    return vault;
  }
}

/**
 * Ключ книги, извлекаемый — иначе его нельзя было бы запомнить на устройстве.
 * Извлекаемость и есть цена галки «не спрашивать»: см. DeviceMemory.
 */
async function importBookKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64(base64),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Что надо запечатать: всё, что лежит в хранилище, кроме исключений.
 *
 * Именно обход хранилища целиком, а не список известных ключей. Список был бы
 * короче и понятнее — и однажды отстал бы: забытый в нём ключ остался бы лежать
 * открытым навсегда, а заметить это было бы нечем, потому что работало бы всё
 * ровно так же.
 */
async function sealableKeys(storage: StorageAdapter): Promise<string[]> {
  const all = await storage.keys();
  // `:base` — основа для слияния: она приехала с сервера уже запечатанной.
  // Запечатай её ещё раз, и ключ книги не откроет её никогда.
  return all.filter(
    (key) => !UNSEALED_KEYS.includes(key) && !key.endsWith(":sealing") && !key.endsWith(BASE_SUFFIX)
  );
}

/**
 * Переводит книгу, лежащую на устройстве открытой, в запечатанный вид.
 *
 * Здесь дороже всего ошибиться, поэтому порядок такой и никакой другой:
 * записать запечатанное рядом → ПРОЧИТАТЬ его обратно → сверить с исходным →
 * и только теперь положить на место. Открытое не убирается до тех пор, пока
 * запечатанное не прочитано и не сошлось. Оборвись питание на любом шаге —
 * на устройстве останется либо исходная открытая книга, либо она же плюс
 * лишняя временная запись, которую подберут в следующий раз.
 *
 * «Записал и понадеялся» здесь недопустимо: если шифрование по какой-то
 * причине даст нечитаемое, человек узнает об этом при следующем запуске, когда
 * возвращать будет уже нечего.
 */
async function sealExistingBook(plain: StorageAdapter, bookKey: CryptoKey): Promise<void> {
  const sealing = new EncryptingStorageAdapter(plain);
  sealing.unlock(bookKey);

  for (const key of await sealableKeys(plain)) {
    const original = await plain.getItem<unknown>(key);
    if (original == null) continue;

    const staging = `${key}:sealing`;
    await sealing.setItem(staging, original);

    const readBack = await sealing.getItem<unknown>(staging);
    if (JSON.stringify(readBack) !== JSON.stringify(original)) {
      await plain.removeItem(staging);
      throw new Error(
        "Не удалось зашифровать книгу: прочитанное обратно не совпало с исходным. " +
          "Книга не тронута — сообщите об этом, ничего не удаляя."
      );
    }

    await plain.setItem(key, await plain.getItem(staging));
    await plain.removeItem(staging);
  }
}
