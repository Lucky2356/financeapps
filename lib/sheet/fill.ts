// Массовые правки таблицы: скопировать месяц, очистить месяц, заполнить
// прошлое фактом из учёта. Каждая возвращает список правок ячеек — экран
// отдаёт их одной записью, и одно «Отменить» возвращает всё как было.

import type { ComputedRow, SheetColumn } from "@/lib/sheet/model";

export type CellChange = { month: string; columnId: string; input: string };

/**
 * Что не копируется и не стирается вместе с месяцем: Остаток и Подушка на начало
 * — они тянутся из прошлого Итога сами, а вписанные руками — это начальная точка,
 * потеряв которую, таблица уехала бы на весь свой остаток.
 */
const CARRIED = new Set(["opening", "savingsOpening"]);

const money = (value: number) => String(Math.round(value * 100) / 100);

const rowOf = (rows: readonly ComputedRow[], month: string) =>
  rows.find((row) => row.month === month);

/**
 * Перенести числа одного месяца в другой: то, что вписано в исходном, ложится
 * поверх; пустое в исходном не стирает уже написанное. Заметки не копируются:
 * «купили торт» про тот месяц, а не про этот.
 */
export function copyMonth(
  rows: readonly ComputedRow[],
  columns: readonly SheetColumn[],
  from: string,
  to: string
): CellChange[] {
  const source = rowOf(rows, from);
  if (!source || from === to) return [];
  const changes: CellChange[] = [];
  for (const column of columns) {
    if (CARRIED.has(column.kind) || column.kind === "note") continue;
    const input = source.cells[column.id]?.input ?? "";
    if (!input.trim()) continue;
    if (rowOf(rows, to)?.cells[column.id]?.input === input) continue;
    changes.push({ month: to, columnId: column.id, input });
  }
  return changes;
}

/** Стереть всё вписанное в месяце, кроме начальных остатков. */
export function clearMonth(
  rows: readonly ComputedRow[],
  columns: readonly SheetColumn[],
  month: string
): CellChange[] {
  const row = rowOf(rows, month);
  if (!row) return [];
  return columns
    .filter((column) => !CARRIED.has(column.kind) && (row.cells[column.id]?.input ?? "").trim())
    .map((column) => ({ month, columnId: column.id, input: "" }));
}

export type FactOptions = {
  /** Месяцы строго раньше этого: нынешний ещё не закончился, его «факт» неполон. */
  before: string;
  /** Поверх уже написанного (мастер создания) или только в пустое. */
  overwrite?: boolean;
  /** Категории-доходы: столбец «Доходы» без своей категории складывает их все. */
  incomeCategoryIds?: ReadonlySet<string>;
};

/**
 * Заполнить прошедшие месяцы тем, что на самом деле записано в учёте.
 *
 * Только столбцы «Доход» и «Расход», и только там, где факт больше нуля:
 * писать нули в месяц, про который учёта нет, значило бы выдать отсутствие
 * записей за «тогда ничего не потратил».
 */
export function factFill(
  rows: readonly ComputedRow[],
  columns: readonly SheetColumn[],
  facts: Readonly<Record<string, Readonly<Record<string, number>>>>,
  options: FactOptions
): CellChange[] {
  const changes: CellChange[] = [];
  for (const row of rows) {
    if (row.month >= options.before) continue;
    const byCategory = facts[row.month];
    if (!byCategory) continue;
    for (const column of columns) {
      if (column.kind !== "expense" && column.kind !== "income") continue;
      let fact = 0;
      if (column.categoryId) fact = byCategory[column.categoryId] ?? 0;
      else if (column.kind === "income" && options.incomeCategoryIds) {
        for (const id of options.incomeCategoryIds) fact += byCategory[id] ?? 0;
      }
      if (fact <= 0) continue;
      const already = (row.cells[column.id]?.input ?? "").trim();
      if (already && !options.overwrite) continue;
      const input = money(fact);
      if (already === input) continue;
      changes.push({ month: row.month, columnId: column.id, input });
    }
  }
  return changes;
}
