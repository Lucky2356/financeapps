// Хранилище, которое само отдаёт и забирает.
//
// Наружу — тот же StorageAdapter из пяти методов. Запись остаётся такой, какой
// была: мгновенной и местной. Отправка на сервер идёт следом, фоном, с
// повторами; приём — по подписке. Ни один из полутора сотен экранов об этом не
// узнаёт, и LocalApiClient не меняется ни на строку — ради этого шва всё и
// затевается.
//
// ГДЕ ЭТОТ СЛОЙ СТОИТ, и почему именно там:
//
//     LocalApiClient
//       └─ EncryptingStorageAdapter   ← здесь книга шифруется
//            └─ SyncingStorageAdapter ← здесь она уезжает на сервер
//                 └─ DesktopStorageAdapter
//
// Синхронизация НИЖЕ шифрования, а не выше. Значит, до неё доезжает уже
// запечатанное, и отправить открытую книгу она физически не может — не потому
// что мы аккуратны, а потому что открытой книги в этом слое просто нет. Встань
// он выше, сохранность держалась бы на внимательности того, кто однажды добавит
// сюда ещё одну ветку кода.
//
// Из того же места растёт второе правило: УЕЗЖАЕТ ТОЛЬКО ЗАПЕЧАТАННОЕ. Всё, что
// не похоже на шкатулку, остаётся на устройстве молча и навсегда. Так пометка
// «не спрашивать на этом устройстве» — а в ней лежит сам ключ книги — не
// уезжает никуда и никогда, и это следствие устройства, а не отдельной оговорки,
// которую можно забыть.
//
// Чего тут нарочно НЕТ: решения, что делать при расхождении. Слить две книги
// можно только открыв их, а ключа в этом слое нет. Поэтому слияние передаётся
// снаружи (см. lib/vault/runtime.ts) — тем, у кого ключ есть.

import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import {
  isOffline,
  type SlotName,
  type SyncTransport
} from "@/lib/sync/protocol";
import type { SealedBook } from "@/lib/sync/vault-crypto";

/** Где лежат номера версий ячеек. Содержимого книги здесь нет — только числа. */
export const SYNC_STATE_KEY = "financeSync";

type Bookkeeping = { v: 1; versions: Record<SlotName, number> };

/**
 * Итог слияния.
 *
 * `differs` — не украшение, а то, без чего два устройства уходят в вечный
 * пинг-понг: слил, отправил, второе приняло, слило, отправило обратно, и так
 * до бесконечности на ровном месте. Отвечать на этот вопрос может только тот,
 * кто видит содержимое: шифротексты одной и той же книги всегда разные — у них
 * разный вектор инициализации, — и сравнивать их между собой бессмысленно.
 */
export type Merged = {
  /** Что должно лежать на устройстве после слияния. */
  body: SealedBook;
  /** Отличается ли слитое от серверного. Нет — отправлять нечего. */
  differs: boolean;
};

export type Merge = (
  slot: SlotName,
  mine: SealedBook | null,
  theirs: SealedBook
) => Promise<Merged>;

export type SyncStatus =
  /** Синхронизация не запущена: не вошли или сервера нет. */
  | "off"
  /** Всё отправлено и принято. */
  | "synced"
  /** Есть что отправить, идёт отправка. */
  | "sending"
  /** Связи нет; отправка ждёт в очереди и не потеряна. */
  | "offline"
  /** Сервер ответил ошибкой, которая не про связь. */
  | "error";

type Timer = (run: () => void, delayMs: number) => void;

/** Задержки перед повторами. Дальше — последняя, без бесконечного роста. */
const BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

/**
 * Сколько раз подряд можно упереться в отказ «вас обогнали», прежде чем
 * признать, что дело не в гонке. Три — это уже не совпадение, а вечный круг;
 * лучше остановиться и показать ошибку, чем молотить по серверу.
 */
const MAX_RACES = 3;

function sealed(value: unknown): value is SealedBook {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<SealedBook>;
  return candidate.alg === "AES-GCM" && typeof candidate.ct === "string";
}

/**
 * Годится ли ключ в ячейку на сервере.
 *
 * Собственная запись о версиях — не ячейка, и это надо проверять явно. Окажись
 * она однажды зашифрованной (а под ней стоит то же устройство, что и под
 * книгой), она стала бы похожа на шкатулку, поехала бы на сервер и принялась
 * бы синхронизировать сама себя.
 */
function syncableKey(key: string): boolean {
  return key !== SYNC_STATE_KEY;
}

function first(set: Set<SlotName>): SlotName | null {
  for (const value of set) return value;
  return null;
}

export class SyncingStorageAdapter implements StorageAdapter {
  private transport: SyncTransport | null = null;
  private merge: Merge | null = null;
  private unwatch: (() => void) | null = null;

  /** Ячейки, которые надо отправить. */
  private readonly outbox = new Set<SlotName>();
  /** Ячейки, которые надо забрать. */
  private readonly inbox = new Set<SlotName>();

  private versions: Record<SlotName, number> = {};
  private loaded = false;
  /** Прогонка, идущая прямо сейчас. Второй такой же не заводится. */
  private running: Promise<void> | null = null;
  private attempt = 0;
  private retryArmed = false;

  private state: SyncStatus = "off";
  private readonly listeners = new Set<(status: SyncStatus) => void>();

  constructor(
    private readonly inner: StorageAdapter,
    private readonly timer: Timer = (run, delayMs) => {
      setTimeout(run, delayMs);
    }
  ) {}

  // ——— то, ради чего всё: обычное хранилище ————————————————————————————

  async getItem<T>(key: string): Promise<T | null> {
    // Читаем всегда местное. Ходить за книгой в сеть значило бы, что без сети
    // приложение не открывается, — а оно местное и обязано открываться.
    return this.inner.getItem<T>(key);
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await this.inner.setItem(key, value);
    if (!sealed(value) || !syncableKey(key)) return;
    this.outbox.add(key);
    void this.pump();
  }

  /**
   * Убрать с устройства — и НЕ убирать с сервера.
   *
   * «Очистить хранилище» — про эту машину, а не про книгу всех устройств.
   * Отправь мы следом пустоту, человек, нажавший очистку на телефоне, стёр бы
   * книгу и на компьютере, и у всех, с кем ею делится.
   *
   * Заодно забывается номер версии: со следующей встречей с сервером
   * устройство пойдёт от нуля, получит законный отказ «вас обогнали» и заберёт
   * книгу обратно. То есть очистка на устройстве, где книга уже была
   * синхронизирована, — это не потеря, а перезалив.
   */
  async removeItem(key: string): Promise<void> {
    await this.inner.removeItem(key);
    this.outbox.delete(key);
    if (this.versions[key] !== undefined) {
      delete this.versions[key];
      await this.persist();
    }
  }

  async clear(): Promise<void> {
    await this.inner.clear();
    this.outbox.clear();
    this.inbox.clear();
    this.versions = {};
    await this.persist();
  }

  async keys(): Promise<string[]> {
    return this.inner.keys();
  }

  // ——— синхронизация ————————————————————————————————————————————————

  /** Подключает провод и слияние. До этого вызова слой — просто хранилище. */
  async start(transport: SyncTransport, merge: Merge): Promise<void> {
    this.transport = transport;
    this.merge = merge;
    await this.load();

    // Событие говорит «сходи посмотри», а не «вот данные»: соединение рвётся,
    // события теряются, и сходиться всё обязано и без них.
    this.unwatch = transport.watch(({ slot, version }) => {
      if (!syncableKey(slot) || (this.versions[slot] ?? 0) >= version) return;
      this.inbox.add(slot);
      void this.pump();
    });

    // Первым делом — забрать всё, что уже лежит на сервере по знакомым ячейкам,
    // и отправить всё, что успели написать без связи.
    for (const key of await this.inner.keys()) {
      if (syncableKey(key) && sealed(await this.inner.getItem(key))) this.inbox.add(key);
    }
    for (const slot of Object.keys(this.versions)) {
      if (syncableKey(slot)) this.inbox.add(slot);
    }

    await this.pump();
  }

  /** Отключает провод. Написанное остаётся на устройстве, как и было. */
  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.transport = null;
    this.merge = null;
    this.set("off");
  }

  get status(): SyncStatus {
    return this.state;
  }

  onStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Прогнать очередь один раз.
   *
   * Наружу — чтобы проверки гоняли настоящую очередь, а не ждали таймеров, и
   * чтобы приложение могло толкнуть её при возвращении в сеть.
   */
  async flush(): Promise<void> {
    await this.pump();
  }

  private set(status: SyncStatus): void {
    if (this.state === status) return;
    this.state = status;
    for (const listener of this.listeners) listener(status);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.inner.getItem<Bookkeeping>(SYNC_STATE_KEY);
    this.versions = stored?.v === 1 ? { ...stored.versions } : {};
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    if (!this.loaded) return;
    await this.inner.setItem<Bookkeeping>(SYNC_STATE_KEY, { v: 1, versions: this.versions });
  }

  /**
   * Прогонка идёт в одном экземпляре, и второй вызов ЖДЁТ первый, а не уходит
   * ни с чем. Разница не косметическая: уйди он ни с чем, вызвавший решил бы,
   * что очередь разобрана, хотя она только начата.
   */
  private pump(): Promise<void> {
    if (this.running) return this.running;
    if (!this.transport || !this.merge) return Promise.resolve();
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    try {
      // По одной ячейке за раз, и убираем её из очереди ТОЛЬКО после успеха.
      // Возьми мы всю очередь списком и очисти заранее — первый же обрыв связи
      // посреди списка унёс бы с собой всё, что стояло за ним, и отправлять
      // это было бы уже некому: в хранилище оно записано, а в очереди нет.
      for (;;) {
        const incoming = first(this.inbox);
        if (incoming !== null) {
          await this.receive(incoming);
          this.inbox.delete(incoming);
          continue;
        }
        const outgoing = first(this.outbox);
        if (outgoing === null) break;
        await this.send(outgoing);
        this.outbox.delete(outgoing);
      }
      this.attempt = 0;
      this.set("synced");
    } catch (error) {
      if (isOffline(error)) {
        this.set("offline");
        this.arm();
      } else {
        this.set("error");
      }
    }
  }

  /** Ставит повтор. Задержка растёт, но не бесконечно. */
  private arm(): void {
    if (this.retryArmed) return;
    this.retryArmed = true;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt += 1;
    this.timer(() => {
      this.retryArmed = false;
      void this.pump();
    }, delay);
  }

  private async receive(slot: SlotName): Promise<void> {
    const transport = this.transport;
    const merge = this.merge;
    if (!transport || !merge) return;

    const snapshot = await transport.pull(slot);
    if (snapshot.body === null) {
      // На сервере пусто, а у нас что-то есть — значит, мы первые.
      if (sealed(await this.inner.getItem(slot))) this.outbox.add(slot);
      return;
    }
    if (snapshot.version === this.versions[slot]) return;

    const mine = await this.inner.getItem<unknown>(slot);
    const result = await merge(slot, sealed(mine) ? mine : null, snapshot.body);

    await this.inner.setItem(slot, result.body);
    this.versions[slot] = snapshot.version;
    await this.persist();

    // Отправляем обратно, только если в слитом есть что-то наше. Иначе два
    // устройства перекидывали бы одну и ту же книгу друг другу без конца.
    if (result.differs) this.outbox.add(slot);
  }

  private async send(slot: SlotName): Promise<void> {
    const transport = this.transport;
    const merge = this.merge;
    if (!transport || !merge) return;

    for (let race = 0; race <= MAX_RACES; race++) {
      const body = await this.inner.getItem<unknown>(slot);
      if (!sealed(body)) return;

      this.set("sending");
      const result = await transport.push(slot, {
        baseVersion: this.versions[slot] ?? 0,
        body
      });

      if (result.ok) {
        this.versions[slot] = result.version;
        await this.persist();
        return;
      }

      // Нас обогнали. Это не ошибка, а обычный ход: сливаем с тем, что нам
      // вернули вместе с отказом, кладём слитое на устройство и пробуем снова
      // уже поверх их версии.
      if (result.current.body === null) {
        this.versions[slot] = result.current.version;
        await this.persist();
        continue;
      }

      const merged = await merge(slot, body, result.current.body);
      await this.inner.setItem(slot, merged.body);
      this.versions[slot] = result.current.version;
      await this.persist();
      if (!merged.differs) return;
    }

    // Три подряд — это уже не гонка, а круг. Лучше сказать вслух.
    this.set("error");
  }
}
