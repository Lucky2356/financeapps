// «Итоги года» — как «Итоги месяца», только за год.
//
// Сколько заработали, потратили и отложили; на что ушло больше всего; лучший и
// худший месяц; самая крупная трата; и главное — насколько выросли деньги и
// подушка от начала года до конца (или до сегодня, если год ещё идёт). С
// разницей к прошлому году — иначе число само по себе ни о чём не говорит.
//
// Чистая функция: экран и проверки зовут одно и то же.

import type { RecapRow } from "@/lib/analytics/month-recap";

export type YearRecap = {
  year: number;
  /** Год ещё идёт — итоги на сегодня. */
  partial: boolean;
  income: number;
  expense: number;
  saved: number;
  savedRate: number | null;
  previous: { income: number; expense: number; saved: number } | null;
  months: Array<{ month: string; income: number; expense: number; saved: number }>;
  best: { month: string; saved: number } | null;
  worst: { month: string; saved: number } | null;
  top: Array<{
    categoryId: string;
    category: string;
    color?: string;
    amount: number;
    share: number;
  }>;
  biggest: { description: string; category: string; amount: number; date: string } | null;
  /** Все деньги (счета и цели) на начало и конец года. */
  capital: { start: number; end: number };
  /** Подушка — сбережения и цели — на начало и конец года. */
  cushion: { start: number; end: number };
  operations: number;
};

export type YearRow = RecapRow & { description?: string | null };

const round = (value: number) => Math.round(value * 100) / 100;

function sums(rows: readonly YearRow[]) {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.type === "INCOME") income += row.amount;
    else expense += row.amount;
  }
  return { income: round(income), expense: round(expense), saved: round(income - expense) };
}

export function buildYearRecap(input: {
  year: number;
  rows: readonly YearRow[];
  today: string;
  capital: { start: number; end: number };
  cushion: { start: number; end: number };
}): YearRecap {
  const prefix = String(input.year);
  const mine = input.rows.filter((row) => row.date.startsWith(prefix));
  const partial = input.today.startsWith(prefix);
  const total = sums(mine);

  // Прошлый год — целиком, а если этот ещё идёт — до того же дня, иначе в
  // октябре расходы всегда «меньше прошлогодних».
  const previousPrefix = String(input.year - 1);
  const sameDay = `${previousPrefix}${input.today.slice(4, 10)}`;
  const before = input.rows.filter(
    (row) => row.date.startsWith(previousPrefix) && (!partial || row.date.slice(0, 10) <= sameDay)
  );

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${prefix}-${String(index + 1).padStart(2, "0")}`;
    return { month, ...sums(mine.filter((row) => row.date.startsWith(month))) };
  }).filter((entry) => entry.income > 0 || entry.expense > 0);

  const ranked = [...months].sort((a, b) => b.saved - a.saved);
  const byCategory = new Map<string, { category: string; color?: string; amount: number }>();
  let biggest: YearRecap["biggest"] = null;
  for (const row of mine) {
    if (row.type !== "EXPENSE") continue;
    const entry = byCategory.get(row.categoryId) ?? {
      category: row.category,
      color: row.color,
      amount: 0
    };
    entry.amount += row.amount;
    byCategory.set(row.categoryId, entry);
    if (!biggest || row.amount > biggest.amount)
      biggest = {
        description: row.description || row.category,
        category: row.category,
        amount: row.amount,
        date: row.date.slice(0, 10)
      };
  }
  const top = [...byCategory.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      category: entry.category,
      color: entry.color,
      amount: round(entry.amount),
      share: total.expense > 0 ? Math.round((entry.amount / total.expense) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    year: input.year,
    partial,
    ...total,
    savedRate: total.income > 0 ? Math.round((total.saved / total.income) * 100) : null,
    previous: before.length > 0 ? sums(before) : null,
    months,
    best: ranked.length > 0 ? { month: ranked[0].month, saved: ranked[0].saved } : null,
    worst:
      ranked.length > 1
        ? { month: ranked[ranked.length - 1].month, saved: ranked[ranked.length - 1].saved }
        : null,
    top,
    biggest: biggest ? { ...biggest, amount: round(biggest.amount) } : null,
    capital: { start: round(input.capital.start), end: round(input.capital.end) },
    cushion: { start: round(input.cushion.start), end: round(input.cushion.end) },
    operations: mine.length
  };
}
