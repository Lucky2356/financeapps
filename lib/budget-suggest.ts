// Suggests a monthly budget limit for a category from the user's own history:
// the average monthly spend over the trailing `months` window, rounded up to a
// tidy step.

import { todayDay } from "@/lib/transactions/date";

export type BudgetHistoryTx = {
  date: string | Date;
  type: string;
  amount: number;
  category: { id: string };
};

/**
 * Месяц операции как «ГГГГ-ММ» — тем же `slice(0, 7)`, каким его считают
 * бюджеты. `new Date(...)` читал UTC-полночь 1-го к западу от Гринвича как
 * вечер последнего дня прошлого месяца: траты 1 августа в Нью-Йорке выпадали
 * из окна. Date — уже местный момент, берётся его местный месяц.
 */
function monthOf(date: string | Date): string {
  return typeof date === "string" ? date.slice(0, 7) : todayDay(date).slice(0, 7);
}

export function suggestedLimitFor(
  categoryId: string,
  transactions: BudgetHistoryTx[],
  options?: { now?: Date; months?: number }
): number {
  const now = options?.now ?? new Date();
  const months = options?.months ?? 3;
  const start = monthOf(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
  // The window needs both ends. Opening March's budgets in August summed five
  // extra months and still divided by three, suggesting a limit half again too
  // high — the further back the month, the worse the advice.
  const end = monthOf(now);

  const total = transactions
    .filter((tx) => {
      if (tx.type !== "EXPENSE" || tx.category.id !== categoryId) return false;
      const month = monthOf(tx.date);
      return month >= start && month <= end;
    })
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (total <= 0) return 0;
  // Round up to the nearest 100 for a clean, slightly-headroom limit.
  return Math.ceil(total / months / 100) * 100;
}
