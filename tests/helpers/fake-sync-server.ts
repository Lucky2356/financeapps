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
  type KnownVersion,
  type PutRequest,
  type PutResult,
  type SlotChanged,
  type SlotName,
  type SlotSnapshot,
  type SlotSummary,
  type SyncTransport
} from "@/lib/sync/protocol";

type Cell = Required<Pick<SlotSnapshot, "version" | "body" | "updatedAt">>;

/** Сколько последних версий ячейки помнит служба (HISTORY_DEPTH в server/src/vault.ts). */
const HISTORY_DEPTH = 64;

type Pair = { version: number; updatedAt: string };

/** Копия «базы»: ячейки вместе с историей версий — как файл копии на службе. */
export type ServerCopy = { cells: Map<SlotName, Cell>; history: Map<SlotName, Pair[]> };

export class FakeSyncServer implements SyncTransport {
  private readonly cells = new Map<SlotName, Cell>();
  private readonly watchers = new Set<(event: SlotChanged) => void>();
  private readonly history = new Map<SlotName, Pair[]>();

  /**
   * Помнит ли служба историю версий. Снимается, чтобы изобразить службу
   * прежней версии: она не отвечает про помнящуюся версию и не сверяет время
   * основы при записи.
   */
  remembers = true;

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

  async pull(slot: SlotName, known?: KnownVersion): Promise<SlotSnapshot> {
    this.guard();
    this.calls.pull += 1;
    const snapshot = this.snapshot(slot);
    const ancestor = known ? this.ancestry(slot, known) : null;
    return ancestor ? { ...snapshot, ancestor } : snapshot;
  }

  private snapshot(slot: SlotName): SlotSnapshot {
    const cell = this.cells.get(slot);
    return cell ? { slot, ...cell } : { slot, version: 0, body: null, updatedAt: null };
  }

  /** То же, что ancestryOf на службе: была ли такая пара, или сказать нельзя. */
  private ancestry(slot: SlotName, known: KnownVersion): "known" | "unknown" | null {
    if (!this.remembers) return null;
    const pairs = this.history.get(slot) ?? [];
    if (pairs.some((pair) => pair.version === known.version && pair.updatedAt === known.updatedAt))
      return "known";
    if (pairs.length === 0) return "unknown";
    return known.version < Math.min(...pairs.map((pair) => pair.version)) ? null : "unknown";
  }

  private remember(slot: SlotName, version: number, updatedAt: string): void {
    const pairs = [...(this.history.get(slot) ?? []), { version, updatedAt }];
    this.history.set(
      slot,
      pairs.filter((pair) => pair.version > version - HISTORY_DEPTH)
    );
  }

  async push(slot: SlotName, request: PutRequest): Promise<PutResult> {
    this.guard();
    if (!this.writable) throw new OfflineError();
    this.calls.push += 1;
    const cell = this.cells.get(slot);
    const current = cell?.version ?? 0;

    // Сердце договора: пишем только поверх той версии, которую устройство
    // видело. Иначе — отказ вместе с тем, что лежит сейчас.
    const stamp = this.remembers ? request.baseUpdatedAt : undefined;
    if (
      request.baseVersion !== current ||
      (stamp !== undefined && (cell?.updatedAt ?? null) !== stamp)
    ) {
      this.calls.rejected += 1;
      const ancestor =
        stamp !== undefined && request.baseVersion > 0
          ? this.ancestry(slot, { version: request.baseVersion, updatedAt: stamp })
          : null;
      const snapshot = this.snapshot(slot);
      return {
        ok: false,
        reason: "stale",
        current: ancestor ? { ...snapshot, ancestor } : snapshot
      };
    }

    const version = current + 1;
    const updatedAt = this.now();
    this.cells.set(slot, { version, body: request.body, updatedAt });
    this.remember(slot, version, updatedAt);
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
   * Сколько подписок живо сейчас.
   *
   * Настоящая служба держит на каждую по открытому соединению, и брошенная
   * подписка не исчезает сама — она висит, получает события и заставляет
   * устройство ходить за книгой лишний раз. Снаружи такое видно только пачкой
   * одинаковых запросов в журнале, то есть уже на живой машине.
   */
  get watching(): number {
    return this.watchers.size;
  }

  /**
   * Положить в обход договора — так изображают ДРУГОЕ устройство, которое
   * успело раньше. Прямой записью, а не через push: у второго устройства своя
   * история версий, и подгонять её под первое значило бы проверять подгонку.
   */
  seed(slot: SlotName, body: SlotSnapshot["body"]): number {
    const version = (this.cells.get(slot)?.version ?? 0) + 1;
    const updatedAt = this.now();
    this.cells.set(slot, { version, body, updatedAt });
    this.remember(slot, version, updatedAt);
    this.announce({ slot, version });
    return version;
  }

  /**
   * Ночная копия базы и возврат из неё — то, что хозяин службы делает после
   * поломки диска. Номера версий при этом уходят НАЗАД: устройство помнит
   * пятую, а сервер снова на третьей. Событий нет — служба перезапускалась, и
   * устройства узнают о возврате только при следующей сверке.
   */
  backup(): ServerCopy {
    // История версий лежит в той же базе и уходит в ту же копию.
    return structuredClone({ cells: this.cells, history: this.history });
  }

  restore(copy: ServerCopy): void {
    this.cells.clear();
    this.history.clear();
    for (const [slot, cell] of copy.cells) this.cells.set(slot, structuredClone(cell));
    for (const [slot, pairs] of copy.history) this.history.set(slot, structuredClone(pairs));
  }

  /** Что сейчас лежит в ячейке — для проверок, не для приложения. */
  peek(slot: SlotName): Cell | null {
    return this.cells.get(slot) ?? null;
  }
}
