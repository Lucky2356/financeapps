// Что таблица говорит человеку сама: какой месяц показать в сводке и хватит ли
// денег. Чистые функции — экран только рисует.

import type { ComputedRow } from "@/lib/sheet/model";

/**
 * Месяц для сводки над таблицей: нынешний, а если его нет в таблице — ближайший
 * прошедший, иначе первый. Пустая таблица — ничего.
 */
export function focusRow(rows: readonly ComputedRow[], current: string): ComputedRow | null {
  if (rows.length === 0) return null;
  const exact = rows.find((row) => row.month === current);
  if (exact) return exact;
  const before = [...rows].reverse().find((row) => row.month < current);
  return before ?? rows[0];
}

export type Shortfall = { month: string; total: number };

/**
 * Первый месяц, начиная с нынешнего, в конце которого основных денег меньше
 * нуля: «в декабре не хватит 12 000». Прошлые месяцы не считаются — что было,
 * то уже случилось, а предупреждать о нём поздно.
 */
export function firstShortfall(rows: readonly ComputedRow[], current: string): Shortfall | null {
  const row = rows.find((item) => item.month >= current && item.total < 0);
  return row ? { month: row.month, total: row.total } : null;
}

/** Сколько месяцев в таблице ещё впереди — чтобы напомнить, что пора добавить. */
export function monthsAhead(rows: readonly ComputedRow[], current: string): number {
  return rows.filter((row) => row.month > current).length;
}
