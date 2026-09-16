// Поддельный сервер: исполняет договор из lib/sync/protocol.ts в памяти.
//
// Он здесь не ради удобства, а потому что иначе проверять нечего: службы (06.6)
// ещё нет, а синхронизация должна быть проверена ДО неё — и проверена на том,
// что умеет отказывать, терять связь и обгонять устройство. Заглушка, которая
// всегда говорит «принято», доказала бы ровно ничего: весь смысл синхронизации
// в том, как она ведёт себя, когда всё идёт не так.
//
// Поэтому здесь по-настоящему: версии растут, запись поверх устаревшей версии
// отвергается, связь можно оборвать и вернуть, а события приходят подписчикам.
// Когда служба будет написана, этот файл останется её описанием — расхождение
// между ними обязано ронять проверки.

import {
  OfflineError,
  type PutRequest,
  type PutResult,
  type SlotChanged,
  type SlotName,
  type SlotSnapshot,
  type SlotSummary,
  type SyncTransport
} from "@/lib/sync/protocol";

type Cell = Required<Pick<SlotSnapshot, "version" | "body" | "updatedAt">>;

export class FakeSyncServer implements SyncTransport {
  private readonly cells = new Map<SlotName, Cell>();
  private readonly watchers = new Set<(event: SlotChanged) => void>();

  /** Связь. Снимается, чтобы проверить очередь и повторы. */
  online = true;

  /**
   * Доходят ли события до подписчиков.
   *
   * Снимается, чтобы проверить путь, который держит договор, когда соединение
   * событий оборвалось: тогда об обгоне устройство узнаёт единственным
   * способом — получив отказ на собственную запись.
   */
  events = true;

  /**
   * Связь ТОЛЬКО на запись. Снимается, чтобы поймать состояние между «уже
   * слил» и «ещё не отправил»: там живёт основа, и ошибка в ней переживает
   * обрыв, а при удачной отправке немедленно затирается и остаётся незамеченной.
   */
  writable = true;

  /** Сколько раз спрашивали и сколько раз клали — для проверок про повторы. */
  readonly calls = { pull: 0, push: 0, rejected: 0 };

  /** Время сервера. Своим шагом, чтобы проверки не зависели от часов. */
  private clock = Date.parse("2026-01-01T00:00:00.000Z");

  private now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private guard(): void {
    if (!this.online) throw new OfflineError();
  }

  async list(): Promise<SlotSummary[]> {
    this.guard();
    return [...this.cells.entries()].map(([slot, cell]) => ({
      slot,
      version: cell.version,
      updatedAt: cell.updatedAt
    }));
  }

  async pull(slot: SlotName): Promise<SlotSnapshot> {
    this.guard();
    this.calls.pull += 1;
    const cell = this.cells.get(slot);
    return cell
      ? { slot, ...cell }
      : { slot, version: 0, body: null, updatedAt: null };
  }

  async push(slot: SlotName, request: PutRequest): Promise<PutResult> {
    this.guard();
    if (!this.writable) throw new OfflineError();
    this.calls.push += 1;
    const cell = this.cells.get(slot);
    const current = cell?.version ?? 0;

    // Сердце договора: пишем только поверх той версии, которую устройство
    // видело. Иначе — отказ вместе с тем, что лежит сейчас.
    if (request.baseVersion !== current) {
      this.calls.rejected += 1;
      return {
        ok: false,
        reason: "stale",
        current: cell
          ? { slot, ...cell }
          : { slot, version: 0, body: null, updatedAt: null }
      };
    }

    const version = current + 1;
    const updatedAt = this.now();
    this.cells.set(slot, { version, body: request.body, updatedAt });
    this.announce({ slot, version });
    return { ok: true, version, updatedAt };
  }

  private announce(event: SlotChanged): void {
    if (!this.events) return;
    for (const watcher of this.watchers) watcher(event);
  }

  watch(onChange: (event: SlotChanged) => void): () => void {
    this.watchers.add(onChange);
    return () => this.watchers.delete(onChange);
  }

  /**
   * Положить в обход договора — так изображают ДРУГОЕ устройство, которое
   * успело раньше. Прямой записью, а не через push: у второго устройства своя
   * история версий, и подгонять её под первое значило бы проверять подгонку.
   */
  seed(slot: SlotName, body: SlotSnapshot["body"]): number {
    const version = (this.cells.get(slot)?.version ?? 0) + 1;
    this.cells.set(slot, { version, body, updatedAt: this.now() });
    this.announce({ slot, version });
    return version;
  }

  /** Что сейчас лежит в ячейке — для проверок, не для приложения. */
  peek(slot: SlotName): Cell | null {
    return this.cells.get(slot) ?? null;
  }
}
