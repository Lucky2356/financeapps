import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

/**
 * Реестр людей устройства. Лежит РЯДОМ с их данными, а не внутри чьих-то.
 *
 * Читается голым хранилищем устройства, мимо этого слоя: иначе выбор приставки
 * ждал бы сам себя. Здесь он упомянут ровно затем, чтобы `keys()` его не
 * показывал: увидь его перечисление — и `clear()` одного человека снёс бы
 * список всех остальных.
 */
export const PEOPLE_KEY = "financePeople";

/**
 * Метка чужого пространства.
 *
 * Ключи ВТОРОГО и следующих людей выглядят как `p/<кто>/<ключ>`. У первого
 * человека приставки нет вовсе, и его ключи лежат ровно там, где лежали до
 * появления этого слоя, — переноса данных нет и не будет.
 */
export const PERSON_MARK = "p/";

/**
 * Разделение данных людей, живущих на одном устройстве.
 *
 * Место в стопке выбрано не на вкус. Выше стоит `SyncingStorageAdapter`, и
 * имена ячеек на службе он берёт из имён ключей: окажись приставка выше — и
 * второе устройство ТОГО ЖЕ человека не нашло бы его ячеек никогда. Ниже —
 * диск, где разделение и нужно.
 *
 *     EncryptingStorageAdapter
 *       └─ SyncingStorageAdapter      имена ячеек берутся здесь
 *            └─ NamespacedStorageAdapter   ← приставка появляется только тут
 *                 └─ DesktopStorageAdapter
 *
 * Слой заводится НЕПРИВЯЗАННЫМ: стопка собирается при загрузке модуля,
 * синхронно, а реестр людей читается из хранилища, то есть асинхронно.
 * Асинхронным от этого никто не становится — `StorageAdapter` и так весь на
 * обещаниях, и в этом здесь вся выручка.
 */
export class NamespacedStorageAdapter implements StorageAdapter {
  /** `null` — ещё не привязан. Пустая строка — ЗАКОННОЕ значение: первый человек. */
  private prefix: string | null = null;

  private readonly ready: Promise<void>;
  private settle!: () => void;
  private refuse!: (cause: Error) => void;
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param waitMs сколько ждать привязки, прежде чем отказать.
   *
   * Отказать, а не ждать вечно, — потому что вечное ожидание выглядит как
   * пустой экран навсегда и неотличимо от медленного диска. Отказ хотя бы
   * называет себя.
   */
  constructor(
    private readonly inner: StorageAdapter,
    waitMs = 10_000
  ) {
    this.ready = new Promise<void>((settle, refuse) => {
      this.settle = settle;
      this.refuse = refuse;
    });

    // До первого обращения этот отказ никто не слушает, и без заглушки он
    // всплыл бы как «необработанное обещание» — шумом, за которым не видно
    // настоящей причины.
    this.ready.catch(() => {});

    this.watchdog = setTimeout(() => {
      this.refuse(
        new Error("Не удалось понять, чьи данные открывать: список людей устройства не прочитался.")
      );
    }, waitMs);
  }

  /**
   * Сказать, чьи данные открываем.
   *
   * Пустая строка — первый человек, и это не особый случай, а обычное значение:
   * его ключи лежат без приставки. Так задумано с первого дня и проверено, и
   * если перенос когда-нибудь всё же понадобится, он станет правкой в одну
   * строку, а не переделкой.
   */
  bind(person: string): void {
    this.refuseTwice();
    this.prefix = person;
    this.stopWaiting();
    this.settle();
  }

  /**
   * Сказать, что выбрать человека не вышло.
   *
   * Нужно затем, чтобы неудача пришла КАК ОТКАЗ и сразу, а не тишиной на
   * десять секунд: хранилище всё равно работать не сможет, и притворяться
   * занятым ему незачем.
   */
  fail(reason: string): void {
    this.refuseTwice();
    this.stopWaiting();
    this.refuse(new Error(reason));
  }

  private refuseTwice(): void {
    if (this.prefix !== null) {
      throw new Error(
        "Хранилище уже открыто на одного человека. Смена человека идёт перезагрузкой страницы, и только ей."
      );
    }
  }

  private stopWaiting(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }

  /** Ключ человека → ключ на диске. */
  private full(key: string): string {
    return this.prefix ? `${PERSON_MARK}${this.prefix}/${key}` : key;
  }

  /**
   * Тот же перевод, но с отказом на чужое.
   *
   * Без него разделение держалось бы на вежливости зовущего. У первого
   * человека приставка пустая, перевод ключа — тождество, и запрос ключа
   * `p/маша/financeVault` отдал бы ему замок соседки: перечисление такого не
   * покажет, а прямое обращение прошло бы. Сюда же попадает и реестр людей.
   *
   * Отказ, а не пустота: приложение таких ключей не строит, и раз такой запрос
   * случился — это ошибка в коде, которую надо увидеть, а не тихо получить
   * `null` и пойти дальше.
   */
  private mine(key: string): string {
    const full = this.full(key);
    if (this.own(full) !== key) {
      throw new Error(`Ключ «${key}» принадлежит не этому человеку — читать и писать его нельзя.`);
    }
    return full;
  }

  /**
   * Ключ с диска → ключ человека, либо `null`, если ключ не его.
   *
   * Написано как «моё и ничьё больше», а не как проверка приставки. Разница
   * решающая: у первого человека приставка пустая, и проверкой «начинается ли
   * с моей приставки» он захватил бы ВСЕ ключи на устройстве, включая чужие.
   * Поэтому для него условие обратное — ключ не помечен ничьим именем.
   */
  private own(full: string): string | null {
    if (full === PEOPLE_KEY) return null;
    if (this.prefix) {
      const head = `${PERSON_MARK}${this.prefix}/`;
      return full.startsWith(head) ? full.slice(head.length) : null;
    }
    return full.startsWith(PERSON_MARK) ? null : full;
  }

  async getItem<T>(key: string): Promise<T | null> {
    await this.ready;
    return this.inner.getItem<T>(this.mine(key));
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await this.ready;
    await this.inner.setItem(this.mine(key), value);
  }

  async removeItem(key: string): Promise<void> {
    await this.ready;
    await this.inner.removeItem(this.mine(key));
  }

  async keys(): Promise<string[]> {
    await this.ready;
    const all = await this.inner.keys();
    return all.map((key) => this.own(key)).filter((key): key is string => key !== null);
  }

  /**
   * Стереть данные ЭТОГО человека — перебором своих ключей.
   *
   * `inner.clear()` здесь не зовётся никогда, и это не придирка к стилю.
   * `forgetEverything()` («забыл и пароль, и код») доходит до самого низа и
   * стирает хранилище целиком. Позови мы его отсюда — один человек стёр бы
   * всех соседей и список людей заодно, молча и без возврата. Проверка на это
   * стоит в наборе первой.
   */
  async clear(): Promise<void> {
    await this.ready;
    for (const key of await this.keys()) {
      await this.inner.removeItem(this.full(key));
    }
  }
}
