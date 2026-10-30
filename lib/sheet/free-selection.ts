// Выделение в свободном листе: прямоугольник клеток, как в Excel.
//
// Чистая арифметика без React — её проверяют тесты (tests/free-grid.test.ts),
// а лист (components/sheet/free-sheet.tsx) только зовёт.

import type { FreeShown } from "@/lib/sheet/free-grid";

export type Position = { r: number; c: number };
export type Selection = { anchor: Position; focus: Position };
export type Box = { top: number; left: number; bottom: number; right: number };

export function boxOf(selection: Selection): Box {
  return {
    top: Math.min(selection.anchor.r, selection.focus.r),
    bottom: Math.max(selection.anchor.r, selection.focus.r),
    left: Math.min(selection.anchor.c, selection.focus.c),
    right: Math.max(selection.anchor.c, selection.focus.c)
  };
}

export function inBox(box: Box, r: number, c: number): boolean {
  return r >= box.top && r <= box.bottom && c >= box.left && c <= box.right;
}

export function positionsIn(box: Box): Position[] {
  const all: Position[] = [];
  for (let r = box.top; r <= box.bottom; r += 1) {
    for (let c = box.left; c <= box.right; c += 1) all.push({ r, c });
  }
  return all;
}

/**
 * Сумма, среднее и число чисел в выделении — то, что Excel пишет в строке
 * состояния. Ради этого лист чаще всего и открывают: «сколько тут всего».
 * Текст и пустые клетки не считаются; null — чисел в выделении нет.
 */
export function selectionStats(
  box: Box,
  shown: ReadonlyMap<string, FreeShown>
): { sum: number; average: number; count: number } | null {
  let sum = 0;
  let count = 0;
  for (const { r, c } of positionsIn(box)) {
    const value = shown.get(`${r}|${c}`)?.value;
    if (value === null || value === undefined) continue;
    sum += value;
    count += 1;
  }
  if (count === 0) return null;
  const round = (value: number) => Math.round(value * 100) / 100;
  return { sum: round(sum), average: round(sum / count), count };
}

/**
 * Выделение — текстом для буфера обмена: столбцы через табуляцию, строки
 * через перевод строки. Так его понимает Excel и сам этот лист при вставке.
 * Формула копируется формулой — вставленная обратно, она считается снова.
 */
export function selectionAsText(box: Box, inputs: ReadonlyMap<string, string>): string {
  const lines: string[] = [];
  for (let r = box.top; r <= box.bottom; r += 1) {
    const line: string[] = [];
    for (let c = box.left; c <= box.right; c += 1) {
      line.push((inputs.get(`${r}|${c}`) ?? "").replace(/[\t\n\r]+/g, " "));
    }
    lines.push(line.join("\t"));
  }
  return lines.join("\n");
}
