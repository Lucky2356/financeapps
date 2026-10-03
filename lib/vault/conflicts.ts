"use client";

// Спорные строки: те, которые правили в двух местах сразу.
//
// Слияние не решает такие случаи молча — оно кладёт в книгу одну из версий и
// оставляет здесь обе, чтобы выбрать мог человек. Пока он не выбрал, в книге
// лежит что-то разумное: приложение работает, ничего не заблокировано, а
// невыбранное не потеряно.
//
// Хранится это в самой книге (то есть зашифрованным), но НЕ уезжает на сервер —
// см. LOCAL_ONLY_KEYS. Спор разбирает тот, кто его увидел; разъезжаться по
// устройствам самому спору незачем, потому что решение уедет обычной правкой,
// как всякая другая.

import { LOCAL_ONLY_KEYS } from "@/lib/storage/SyncingStorageAdapter";
import { isTrivialConflict } from "@/lib/sync/conflict-diff";
import type { RowConflict } from "@/lib/sync/merge";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

/** Где лежат спорные строки. Это же имя стоит в LOCAL_ONLY_KEYS. */
export const CONFLICTS_KEY = "financeConflicts";

/** Спор вместе с тем, откуда он взялся. */
export type StoredConflict = RowConflict & {
  /** Ячейка — то есть какой профиль. */
  slot: string;
  /** Когда его заметили. */
  noticedAt: string;
};

type Stored = { v: 1; conflicts: StoredConflict[] };

function keyOf(conflict: { slot: string; collection: string; key: string }): string {
  return JSON.stringify([conflict.slot, conflict.collection, conflict.key]);
}

export class ConflictStore {
  private cache: StoredConflict[] | null = null;
  private readonly listeners = new Set<(conflicts: StoredConflict[]) => void>();

  constructor(private readonly storage: StorageAdapter) {}

  async list(): Promise<StoredConflict[]> {
    if (this.cache) return this.cache;
    const stored = await this.storage.getItem<Stored>(CONFLICTS_KEY);
    const all = stored?.v === 1 ? stored.conflicts : [];
    // Споры без выбора, накопленные версиями до 2.5.3, уходят сами: в данных
    // уже лежит версия без потерь, а показывать «Не сходится: 0» — мучить.
    const real = all.filter((item) => !isTrivialConflict(item.mine, item.theirs));
    if (real.length !== all.length) await this.write(real);
    else this.cache = real;
    return this.cache ?? real;
  }

  /**
   * Добавляет замеченные споры.
   *
   * Повторный спор о той же строке ЗАМЕЩАЕТ прежний, а не ложится рядом: книга
   * с тех пор ушла вперёд, и показывать человеку позавчерашние версии значило
   * бы предлагать ему выбрать из того, чего уже нет.
   */
  async add(slot: string, conflicts: RowConflict[], noticedAt: string): Promise<void> {
    if (conflicts.every((conflict) => isTrivialConflict(conflict.mine, conflict.theirs))) return;
    const byKey = new Map((await this.list()).map((item) => [keyOf(item), item]));
    for (const conflict of conflicts) {
      // Человеку тут нечего выбирать — слияние уже положило версию без потерь.
      if (isTrivialConflict(conflict.mine, conflict.theirs)) continue;
      const item: StoredConflict = { ...conflict, slot, noticedAt };
      byKey.set(keyOf(item), item);
    }
    await this.write([...byKey.values()]);
  }

  /** Убирает разобранный спор. Сам выбор делает обычная правка книги. */
  async resolve(conflict: StoredConflict): Promise<void> {
    const id = keyOf(conflict);
    await this.write((await this.list()).filter((item) => keyOf(item) !== id));
  }

  async clear(): Promise<void> {
    await this.write([]);
  }

  onChange(listener: (conflicts: StoredConflict[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async write(conflicts: StoredConflict[]): Promise<void> {
    this.cache = conflicts;
    await this.storage.setItem<Stored>(CONFLICTS_KEY, { v: 1, conflicts });
    for (const listener of this.listeners) listener(conflicts);
  }
}

// Имя ключа записано в двух местах — здесь и в списке «не уезжает». Разойдись
// они, спорные строки поехали бы на сервер, и никто бы этого не заметил:
// работало бы ровно так же.
if (!LOCAL_ONLY_KEYS.includes(CONFLICTS_KEY)) {
  throw new Error("Спорные строки не отмечены как остающиеся на устройстве.");
}
