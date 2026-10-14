// Условное форматирование таблицы: какую клетку расхода подсветить как «выше
// обычного». Чистые функции — экран только красит то, что отсюда пришло.
//
// «Обычно» — медиана прошлых месяцев этого же столбца, а не среднее: один
// месяц с ремонтом не делает «обычным» вдвое больший счёт за всё остальное
// время. Подсвечивается клетка, которая не меньше обычного в 1,3 раза, и
// только если прошлых месяцев хотя бы три: по одному-двум числам «обычного»
// ещё нет, и таблица подсвечивала бы всё подряд.

import type { ComputedRow, SheetColumn } from "@/lib/sheet/model";
import { cellKey } from "@/lib/sheet/model";

/** Во сколько раз больше обычного — уже повод подсветить. */
export const ABOVE_USUAL_RATIO = 1.3;
/** Сколько прошлых месяцев нужно, чтобы говорить об «обычном». */
export const USUAL_MIN_HISTORY = 3;

export type AboveUsual = {
  /** Медиана прошлых месяцев столбца. */
  usual: number;
  /** На сколько процентов выше обычного, округлено: 34 — «выше на 34%». */
  percent: number;
};

/** Медиана; пустой список — null. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Сравнить одно число с прошлыми месяцами. null — подсвечивать нечего:
 * истории мало, обычное нулевое или число не дотягивает до порога.
 */
export function aboveUsual(
  value: number | null | undefined,
  history: readonly number[],
  options: { ratio?: number; minHistory?: number } = {}
): AboveUsual | null {
  const ratio = options.ratio ?? ABOVE_USUAL_RATIO;
  const minHistory = options.minHistory ?? USUAL_MIN_HISTORY;
  if (value === null || value === undefined || !(value > 0)) return null;
  if (history.length < minHistory) return null;
  const usual = median(history);
  // Обычно ничего не тратили — «выше обычного на бесконечность» не подсказка.
  if (usual === null || usual <= 0) return null;
  if (value < usual * ratio) return null;
  return { usual, percent: Math.round((value / usual - 1) * 100) };
}

/**
 * Клетки расходов выше обычного по всей таблице: ключ `cellKey(месяц, столбец)`.
 * Историей считаются только вписанные числа прошлых месяцев: пустая клетка —
 * не «ноль потратили», а «не заполнили», и в медиану она не идёт.
 */
export function unusualExpenses(
  rows: readonly ComputedRow[],
  columns: readonly SheetColumn[]
): Map<string, AboveUsual> {
  const found = new Map<string, AboveUsual>();
  for (const column of columns) {
    if (column.kind !== "expense") continue;
    const history: number[] = [];
    for (const row of rows) {
      const cell = row.cells[column.id];
      const value = cell && !cell.error && !cell.auto ? cell.value : null;
      const flag = aboveUsual(value, history);
      if (flag) found.set(cellKey(row.month, column.id), flag);
      if (value !== null && value !== undefined) history.push(value);
    }
  }
  return found;
}
