// Picks the best/worst savings month for the analytics summary.
//
// Guard against the "empty profile" case: with no income and no expenses every
// month has savings = 0, so a plain sort is stable and would report the FIRST
// month of the window (e.g. "март") as the best one — which reads like real
// data. When there is nothing to compare, report an em dash instead.

export const NO_MONTH = "—";

export type MonthSavingsRow = { month: string; income: number; expense: number; savings: number };

export function pickBestWorstMonth(rows: MonthSavingsRow[]): { best: string; worst: string } {
  const hasActivity = rows.some((row) => row.income !== 0 || row.expense !== 0);
  if (!hasActivity || rows.length === 0) return { best: NO_MONTH, worst: NO_MONTH };

  const sorted = [...rows].sort((a, b) => b.savings - a.savings);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // All months identical → nothing meaningfully "best".
  if (best.savings === worst.savings) return { best: NO_MONTH, worst: NO_MONTH };

  return { best: best.month, worst: worst.month };
}
