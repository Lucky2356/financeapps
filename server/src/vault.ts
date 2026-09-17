// Ячейки: то, ради чего служба существует.
//
// Написано по договору из lib/sync/protocol.ts, и это не фигура речи: договор
// писался раньше и именно как техзадание сюда. Расхождение между этим файлом и
// тем обязано ронять проверки, а не всплывать у человека на телефоне.
//
// Сердце здесь одно — ЗАПИСЬ ТОЛЬКО ПОВЕРХ ИЗВЕСТНОЙ ВЕРСИИ. Устройство
// предъявляет номер версии, поверх которой пишет; совпало — приняли, не
// совпало — отказали и вернули то, что лежит. Отказ не ошибка, а нормальный ход:
// с него начинается слияние на устройстве. Без этого правила два устройства,
// вышедшие в сеть одновременно, затёрли бы работу друг друга молча.

import type { DatabaseSync } from "node:sqlite";

import type { BookRow } from "./db.ts";

/** Сколько может весить одна книга. */
export const MAX_BODY_BYTES = 32 * 1024 * 1024;

export type Snapshot = {
  slot: string;
  version: number;
  body: unknown | null;
  updatedAt: string | null;
};

export function readSlot(db: DatabaseSync, personId: string, slot: string): Snapshot {
  const row = db
    .prepare("select version, body, updated_at from books where person_id = ? and slot = ?")
    .get<Pick<BookRow, "version" | "body" | "updated_at">>(personId, slot);

  if (!row) return { slot, version: 0, body: null, updatedAt: null };
  return {
    slot,
    version: row.version,
    body: JSON.parse(row.body) as unknown,
    updatedAt: row.updated_at
  };
}

/**
 * Перечень ячеек человека — без содержимого.
 *
 * Нужен свежему устройству: иначе оно не знает, что спрашивать, и вторая книга
 * (второй профиль) не доедет до него никогда.
 */
export function listSlots(
  db: DatabaseSync,
  personId: string
): Array<{ slot: string; version: number; updatedAt: string }> {
  return db
    .prepare(
      "select slot, version, updated_at as updatedAt from books where person_id = ? order by slot"
    )
    .all<{ slot: string; version: number; updatedAt: string }>(personId);
}

export type PutOutcome =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; reason: "stale"; current: Snapshot };

export function writeSlot(
  db: DatabaseSync,
  personId: string,
  slot: string,
  baseVersion: number,
  body: unknown,
  now: string
): PutOutcome {
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    throw new Error("Данные не помещаются в отведённый предел.");
  }

  const current = readSlot(db, personId, slot);
  if (current.version !== baseVersion) return { ok: false, reason: "stale", current };

  const version = current.version + 1;
  // Одним запросом, а не «проверить и записать»: между двумя запросами
  // помещается вторая запись того же человека с другого устройства, и обе
  // прошли бы проверку. Условие в самом запросе не оставляет этой щели.
  const written = db
    .prepare(
      `insert into books (person_id, slot, version, body, updated_at)
       values (?, ?, ?, ?, ?)
       on conflict(person_id, slot) do update set
         version = excluded.version,
         body = excluded.body,
         updated_at = excluded.updated_at
       where books.version = ?`
    )
    .run(personId, slot, version, text, now, baseVersion);

  if (written.changes === 0) {
    // Кто-то успел между чтением и записью. Возвращаем свежее.
    return { ok: false, reason: "stale", current: readSlot(db, personId, slot) };
  }

  return { ok: true, version, updatedAt: now };
}

/** Сколько места занимают книги человека — для страницы управления. */
export function usageOf(db: DatabaseSync, personId: string): { slots: number; bytes: number } {
  const row = db
    .prepare(
      "select count(*) as slots, coalesce(sum(length(body)), 0) as bytes from books where person_id = ?"
    )
    .get<{ slots: number; bytes: number }>(personId);
  return { slots: row?.slots ?? 0, bytes: row?.bytes ?? 0 };
}
