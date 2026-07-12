// Dividend income tracking. Summarizes realized dividend payments (from the
// investment events journal) into an annual income figure, and orders the
// upcoming expected payouts. Pure and testable; FX is intentionally ignored —
// amounts are summed as-entered (most portfolios are single-currency).

export type DividendEvent = {
  type: string;
  date: string;
  amount: number;
  ticker: string;
};

export type ExpectedDividendLike = {
  id: string;
  ticker: string;
  name: string;
  date: string;
  amount: number;
  currency: string;
};

export type DividendYear = { year: number; total: number };

export type DividendIncomeSummary = {
  byYear: DividendYear[];
  total: number;
  lastTwelveMonths: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeDividendIncome(
  events: DividendEvent[],
  now: Date = new Date()
): DividendIncomeSummary {
  const dividends = events.filter((event) => event.type === "DIVIDEND");
  const byYearMap = new Map<number, number>();
  let total = 0;
  let lastTwelveMonths = 0;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  for (const event of dividends) {
    const amount = Math.abs(event.amount);
    const year = Number(event.date.slice(0, 4));
    if (!Number.isNaN(year)) byYearMap.set(year, (byYearMap.get(year) ?? 0) + amount);
    total += amount;
    if (new Date(event.date) >= cutoff) lastTwelveMonths += amount;
  }

  const byYear = [...byYearMap.entries()]
    .map(([year, value]) => ({ year, total: round2(value) }))
    .sort((a, b) => b.year - a.year);

  return { byYear, total: round2(total), lastTwelveMonths: round2(lastTwelveMonths) };
}

// Expected dividends still in the future (or today), earliest first.
export function upcomingDividends(
  expected: ExpectedDividendLike[],
  now: Date = new Date()
): ExpectedDividendLike[] {
  const today = now.toISOString().slice(0, 10);
  return expected
    .filter((dividend) => dividend.date.slice(0, 10) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}
