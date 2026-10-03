// «Это перевод?» — пары операций, которые на деле перевод между своими счетами.
//
// Перевод, записанный в приложении, — это пара строк с общим номером: итоги
// знают, что это не доход и не трата. Но деньги часто попадают в книгу иначе:
// из выписки банка, из уведомления, руками двумя записями. Тогда «снял со
// вклада 50 000 на карту» — это доход 50 000 на карте и трата 50 000 со вклада,
// и обе честно попадают в итоги. Отсюда задвоение, о котором спросил владелец.
//
// Здесь только поиск: списание с одного своего счёта и поступление на другой
// той же суммы в тот же или соседний день. Решает человек — связать или нет;
// уверенности, что две строки — одно движение, у приложения нет.
//
// Чистые функции: экран и проверки зовут одно и то же.

import { transferKeyOf } from "@/lib/transactions/transfers";

export type PairRow = {
  id: string;
  type: string;
  amount: number;
  date: string;
  description: string | null;
  account: { id: string; label: string };
  category: { id: string; label: string };
  transferId?: string;
  splitGroupId?: string;
  liabilityId?: string;
};

export type TransferPair = {
  /** Устойчивый ключ пары — по нему же пара откладывается «это не перевод». */
  key: string;
  expense: PairRow;
  income: PairRow;
};

const DAY = 86_400_000;

const dayOf = (date: string) => Date.parse(`${date.slice(0, 10)}T12:00:00Z`);

export function pairKey(expenseId: string, incomeId: string): string {
  return `${expenseId}|${incomeId}`;
}

/**
 * Пары «ушло с одного счёта — пришло на другой». Каждая строка — не больше чем
 * в одной паре; из нескольких подходящих берётся ближайшая по дате. Валюта
 * счетов должна совпадать: 100 $ и 100 ₽ — не перевод.
 */
export function findTransferPairs(
  rows: readonly PairRow[],
  currencyOf: (accountId: string) => string,
  dismissed: ReadonlySet<string> = new Set()
): TransferPair[] {
  // Уже перевод, часть разделённой покупки или платёж по долгу — не кандидаты.
  const free = rows.filter(
    (row) => !transferKeyOf(row) && !row.splitGroupId && !row.liabilityId && row.amount > 0
  );
  // Поступления — по сумме в копейках: сличать каждую трату с каждым доходом
  // на книге в двадцать тысяч строк — полсекунды на каждое открытие «Учёта».
  const cents = (amount: number) => Math.round(amount * 100);
  const incomes = new Map<number, PairRow[]>();
  for (const row of free) {
    if (row.type !== "INCOME") continue;
    const bucket = incomes.get(cents(row.amount));
    if (bucket) bucket.push(row);
    else incomes.set(cents(row.amount), [row]);
  }
  const expenses = free
    .filter((row) => row.type === "EXPENSE")
    .sort((a, b) => b.date.localeCompare(a.date));
  const used = new Set<string>();
  const pairs: TransferPair[] = [];

  for (const expense of expenses) {
    let best: PairRow | null = null;
    let bestGap = Infinity;
    for (const income of incomes.get(cents(expense.amount)) ?? []) {
      if (used.has(income.id)) continue;
      if (income.account.id === expense.account.id) continue;
      if (Math.abs(income.amount - expense.amount) >= 0.005) continue;
      if (currencyOf(income.account.id) !== currencyOf(expense.account.id)) continue;
      if (dismissed.has(pairKey(expense.id, income.id))) continue;
      const gap = Math.abs(dayOf(income.date) - dayOf(expense.date));
      if (gap > DAY) continue;
      if (gap < bestGap) {
        best = income;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.id);
      pairs.push({ key: pairKey(expense.id, best.id), expense, income: best });
    }
  }
  return pairs;
}
