// Подсказка под категорией в быстром добавлении: сколько осталось в лимите —
// ДО траты, пока ещё можно передумать. Предупреждение после записи («вы
// превысили») приходило, когда деньги уже потрачены.

import { effectiveLimit } from "@/lib/budget-rollover";

export type LimitRow = {
  category: string;
  limitAmount: number;
  spent: number;
  /** Остаток прошлого месяца, добавленный к лимиту (0, если перенос выключен). */
  rolloverAmount: number;
};

export type LimitHint = {
  /** В лимите остаётся или он будет превышен. */
  kind: "left" | "over";
  /** Сколько осталось (`left`) или на сколько сверх (`over`). */
  amount: number;
  /** Сумма из формы уже учтена — тогда это «после траты», иначе «пока». */
  typed: boolean;
  limit: number;
  category: string;
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Что сказать про лимит категории. Нет лимита (или он нулевой) — ничего: «нет
 * лимита» не повод показывать строку про каждую категорию.
 */
export function limitHint(row: LimitRow | undefined, typed: number): LimitHint | null {
  if (!row) return null;
  const limit = effectiveLimit(row.limitAmount, row.rolloverAmount);
  if (limit <= 0) return null;
  const amount = Math.max(0, typed);
  const after = round(limit - row.spent - amount);
  return {
    kind: after >= 0 ? "left" : "over",
    amount: Math.abs(after),
    typed: amount > 0,
    limit,
    category: row.category
  };
}
