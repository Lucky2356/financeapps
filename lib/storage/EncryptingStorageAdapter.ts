// Хранилище, которое умеет быть запертым.
//
// Обёртка над настоящим хранилищем устройства: наружу — тот же самый
// StorageAdapter из четырёх методов, внутрь — книга, лежащая на диске
// зашифрованной. LocalApiClient об этом не знает вовсе и не меняется ни на
// строку; он и дальше кладёт и берёт свой документ по ключу. Тот же шов потом
// заберёт себе синхронизация с сервером — она встанет сюда же, слоем рядом.
//
// Правило, что шифровать, — обратное привычному: шифруется ВСЁ, кроме явного
// короткого списка исключений. Список «что шифровать» рано или поздно отстал бы
// от жизни: кто-нибудь заведёт новый ключ в хранилище, забудет дописать его в
// список, и данные лягут на диск открытыми — молча, потому что работать будет
// ровно так же. Здесь забывчивость приводит к обратному: новый ключ шифруется
// сам собой, а если его надо читать запертым — об этом придётся сказать вслух.
//
// Исключения — только то, без чего замок не отпереть: сама шкатулка с ключом
// книги и пометка устройства. Ни в том, ни в другом содержимого книги нет.

import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { openBook, sealBook, type SealedBook } from "@/lib/sync/vault-crypto";

/**
 * Ключи, которые не шифруются. Каждый — с причиной, и причина одна из двух.
 *
 *   financeVault, financeDevice — без них замок не отпереть: это сама шкатулка
 *     с ключом книги и пометка устройства. Содержимого книги в них нет.
 *   financeSync — номера версий ячеек на сервере, которые ведёт слой
 *     синхронизации. Он стоит НИЖЕ шифрования и читает свою запись сам; запечатай
 *     мы её, он прочитал бы вместо чисел шкатулку, счёл бы её книгой и принялся
 *     бы синхронизировать собственную бухгалтерию. Ничего, кроме имён ячеек и
 *     чисел, там не лежит, а имена ячеек и так не шифруются.
 *   financeServer — адрес службы, имя входа и билет. Не книга и никогда ею не
 *     был: его выдаёт сервер, и содержимого книги в нём нет.
 *
 * ПОПАСТЬ СЮДА ЗНАЧИТ НЕ ТОЛЬКО «НЕ ШИФРОВАТЬ». Этот же список решает, что
 * считать книгой, когда книгу сносят: clear() ниже и sealableKeys в
 * lib/vault/account.ts. Билет сервера в списке не стоял — и подключение второго
 * устройства сносило его СОБСТВЕННЫЙ билет, записанный секундой раньше: сначала
 * signIn его кладёт, затем adopt зовёт clear(), и привязки больше нет. Вход при
 * этом проходил, экран говорил «подключено», а синхронизация не поднималась
 * никогда — resumeSync не находил привязки и молча отвечал «нет сервера».
 * Устройство, которое РЕГИСТРИРУЕТСЯ, этого не видело: там adopt не зовут вовсе.
 */
export const UNSEALED_KEYS: readonly string[] = [
  "financeVault",
  "financeDevice",
  "financeSync",
  "financeServer"
];

/**
 * Попытка прочитать книгу, пока она заперта.
 *
 * Отдельный класс, а не просто Error: вызывающему надо отличать «заперто» от
 * «сломалось», и по тексту ошибки такое не различают.
 */
export class BookLockedError extends Error {
  constructor() {
    super("Данные заперты — введите пароль.");
    this.name = "BookLockedError";
  }
}

export function isBookLocked(error: unknown): boolean {
  return error instanceof BookLockedError;
}

function sealed(value: unknown): value is SealedBook {
  // Сначала null, потом typeof, а не наоборот: после первой проверки значение
  // уже сужено до объекта, и сравнение сужённого с null читается как сравнение
  // несопоставимых типов — на это и указал разбор кода.
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<SealedBook>;
  return candidate.alg === "AES-GCM" && typeof candidate.ct === "string";
}

export class EncryptingStorageAdapter implements StorageAdapter {
  /** Ключ книги. null — заперто. В памяти и только в памяти. */
  private bookKey: CryptoKey | null = null;

  constructor(private readonly inner: StorageAdapter) {}

  /** Отпирает хранилище ключом книги. */
  unlock(bookKey: CryptoKey): void {
    this.bookKey = bookKey;
  }

  /** Запирает обратно. Ключ из памяти уходит; на диске всё остаётся. */
  lock(): void {
    this.bookKey = null;
  }

  get unlocked(): boolean {
    return this.bookKey !== null;
  }

  private require(): CryptoKey {
    if (!this.bookKey) throw new BookLockedError();
    return this.bookKey;
  }

  /**
   * Открыть чужую шкатулку и запечатать свою — для слияния.
   *
   * Слияние стоит НИЖЕ этого слоя и ключа не имеет; открыть две книги и
   * сложить их может только тот, у кого ключ есть. Отдавать ему сам ключ было
   * бы проще и хуже: ключ, однажды отданный наружу, оказывается в местах, про
   * которые никто уже не помнит. Эти два действия — ровно то, что слиянию
   * нужно, и ни байтом больше.
   */
  async open<T>(body: SealedBook): Promise<T> {
    return JSON.parse(await openBook(body, this.require())) as T;
  }

  async seal<T>(value: T): Promise<SealedBook> {
    return sealBook(JSON.stringify(value), this.require());
  }

  async getItem<T>(key: string): Promise<T | null> {
    if (UNSEALED_KEYS.includes(key)) return this.inner.getItem<T>(key);

    // Заперто — именно ОШИБКА, а не пустота. Пустота означала бы «книги нет»,
    // и приложение завело бы поверх запертой книги новую, пустую: человек
    // открыл бы его и увидел, что все его счета и операции исчезли. Ошибку
    // экран замка поймает и покажет форму ввода пароля.
    const bookKey = this.require();

    const stored = await this.inner.getItem<unknown>(key);
    if (stored == null) return null;
    // Ещё не запечатанная книга читается как есть: так выглядит книга, которая
    // лежала здесь до появления замка, и так же — книга посреди перевода в
    // запечатанный вид, если он оборвался. Читать её надо, а не терять.
    if (!sealed(stored)) return stored as T;

    return JSON.parse(await openBook(stored, bookKey)) as T;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    if (UNSEALED_KEYS.includes(key)) return this.inner.setItem(key, value);
    const bookKey = this.require();
    await this.inner.setItem(key, await sealBook(JSON.stringify(value), bookKey));
  }

  // Убрать можно и запертым: для этого читать нечего.
  async removeItem(key: string): Promise<void> {
    await this.inner.removeItem(key);
  }

  /**
   * Стирает книгу — и НЕ трогает шкатулку.
   *
   * Правило, которое здесь держится: книга на диске и шкатулка от неё живут и
   * умирают вместе, но «очистить хранилище» — это про книгу, а не про замок.
   * Снеси оно заодно и шкатулку, вышло бы вот что: ключ остался бы в памяти,
   * пустая книга легла бы на диск запечатанной им, а при следующем запуске
   * шкатулки бы не нашлось — приложение сочло бы это первым запуском и стало
   * бы запечатывать заново то, что уже запечатано ключом, которого больше нет.
   * Получилась бы книга, которую не открыть ничем.
   *
   * Тому, кто потерял и пароль, и код, нужно другое — стереть вообще всё и
   * начать с чистого листа. Это отдельное, ясно названное действие:
   * AccountService.forgetEverything().
   */
  async clear(): Promise<void> {
    for (const key of await this.inner.keys()) {
      if (!UNSEALED_KEYS.includes(key)) await this.inner.removeItem(key);
    }
  }

  // Имена ключей не шифруются — шифруется содержимое. Поэтому список отдаётся
  // и запертым: по нему видно, что книга на устройстве есть, но не что в ней.
  async keys(): Promise<string[]> {
    return this.inner.keys();
  }
}
