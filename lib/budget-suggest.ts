// Suggests a monthly budget limit for a category from the user's own history:
// the average monthly spend over the trailing `months` window, rounded up to a
// tidy step. Shared by the web (Prisma) and desktop (LocalApiClient) paths so
// the suggestion is identical in both.

export type BudgetHistoryTx = {
  date: string | Date;
  type: string;
  amount: number;
  category: { id: string };
};

export function suggestedLimitFor(
  categoryId: string,
  transactions: BudgetHistoryTx[],
  options?: { now?: Date; months?: number }
): number {
  const now = options?.now ?? new Date();
  const months = options?.months ?? 3;
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  // The window needs both ends. Opening March's budgets in August summed five
  // extra months and still divided by three, suggesting a limit half again too
  // high — the further back the month, the worse the advice.
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const total = transactions
    .filter((tx) => {
      if (tx.type !== "EXPENSE" || tx.category.id !== categoryId) return false;
      const date = new Date(tx.date);
      return date >= start && date < end;
    })
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (total <= 0) return 0;
  // Round up to the nearest 100 for a clean, slightly-headroom limit.
  return Math.ceil(total / months / 100) * 100;
}
