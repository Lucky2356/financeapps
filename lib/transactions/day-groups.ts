// Операции по дням: «Сегодня — 2 340 ₽», «Вчера — 890 ₽», «12 сентября — …».
// Список без заголовков дней на телефоне читается как лента одинаковых карточек;
// с ними видно, какой день сколько стоил.

import { isTransfer } from "@/lib/transactions/transfers";

export type DayRow = {
  date: string;
  type: string;
  amount: number;
  description?: string | null;
  transferId?: string;
};

export type DayGroup<T> = {
  /** «ГГГГ-ММ-ДД». */
  day: string;
  /** Сегодня, вчера или обычная дата — подпись строит экран. */
  when: "today" | "yesterday" | "other";
  income: number;
  expense: number;
  items: T[];
};

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Разложить строки по дням, сохраняя их порядок: новая группа начинается там,
 * где день сменился. Переводы между своими счетами в итог дня не входят: это не
 * доход и не трата, и «потратил 50 000» из-за перевода на вклад — ложь.
 * `amountOf` — сумма в основной валюте.
 */
export function groupByDay<T extends DayRow>(
  rows: readonly T[],
  today: Date = new Date(),
  amountOf: (row: T) => number = (row) => row.amount
): Array<DayGroup<T>> {
  const now = isoDay(today);
  const yesterday = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const groups: Array<DayGroup<T>> = [];
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    let group = groups[groups.length - 1];
    if (!group || group.day !== day) {
      group = {
        day,
        when: day === now ? "today" : day === yesterday ? "yesterday" : "other",
        income: 0,
        expense: 0,
        items: []
      };
      groups.push(group);
    }
    group.items.push(row);
    if (isTransfer({ description: row.description ?? null, transferId: row.transferId })) continue;
    if (row.type === "INCOME") group.income = round(group.income + amountOf(row));
    else if (row.type === "EXPENSE") group.expense = round(group.expense + amountOf(row));
  }
  return groups;
}
