import { roundMoney } from "@/lib/utils";

/** The stored shape this module needs: a limit, its category, and its month. */
export type StoredBudget = {
  categoryId: string;
  limitAmount: number;
  rollover?: boolean;
  /** "ГГГГ-ММ"; absent on records written before limits were kept per month. */
  month?: string;
};

/**
 * The limit in force for a category in a given month.
 *
 * A limit is set once and holds until it is changed, which is how people think
 * about budgets: «с марта на продукты 30 000» means March onwards, not March
 * alone, and certainly not February as well. Before this, one record per
 * category meant a limit typed while looking at September silently rewrote
 * August — the screen offered a month picker over a figure that had no month.
 *
 * Order: the month's own record → the newest earlier month → the record with no
 * month at all (everything written before the change).
 */
export function budgetInForce<T extends StoredBudget>(
  budgets: readonly T[],
  categoryId: string,
  month: string
): T | undefined {
  const mine = budgets.filter((budget) => budget.categoryId === categoryId);
  const exact = mine.find((budget) => budget.month === month);
  if (exact) return exact;
  const earlier = mine
    .filter((budget) => budget.month && budget.month < month)
    .sort((left, right) => (left.month ?? "").localeCompare(right.month ?? ""));
  return earlier[earlier.length - 1] ?? mine.find((budget) => !budget.month);
}

// Budget rollover (single-month carryover): when enabled, the previous month's
// unspent remainder is added to this month's available limit. Only a positive
// remainder carries over (an overspend does not create negative headroom).
// Shared by the web (Prisma) and desktop (LocalApiClient) paths.

export function rolloverCarry(enabled: boolean, prevLimit: number, prevSpent: number): number {
  if (!enabled) return 0;
  return Math.max(0, roundMoney(prevLimit - prevSpent));
}

export function effectiveLimit(limitAmount: number, carried: number): number {
  return roundMoney(limitAmount + carried);
}
