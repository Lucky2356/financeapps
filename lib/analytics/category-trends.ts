// Per-category spending trends with simple anomaly detection. Pure and
// deterministic: given raw expense transactions it builds a month-by-month
// series per category, compares the latest month against the average of the
// prior months in the window, and flags unusually high/low months. Feeds the
// sparklines + "you spent X% more than usual" badges on the Analytics page.

export type TrendTransaction = {
  amount: number;
  type: string;
  date: string;
  category: { id: string; label: string; color?: string };
};

export type CategoryTrend = {
  categoryId: string;
  category: string;
  color: string;
  /** Chronological monthly totals across the window (oldest → newest). */
  monthly: { month: string; total: number }[];
  currentTotal: number;
  /** Mean of the prior months in the window (excludes the current month). */
  averageTotal: number;
  changePct: number;
  anomaly: "high" | "low" | null;
};

export type TrendOptions = {
  /** Number of months in the window, including the current one (default 6). */
  months?: number;
  /** Relative jump above average to flag as high (default 0.4 = +40%). */
  highThreshold?: number;
  /** Relative drop below average to flag as low (default 0.5 = −50%). */
  lowThreshold?: number;
};

function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function addMonthKey(anchor: string, delta: number): string {
  const [year, month] = anchor.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildCategoryTrends(
  transactions: TrendTransaction[],
  options: TrendOptions = {}
): CategoryTrend[] {
  const months = options.months ?? 6;
  const highThreshold = options.highThreshold ?? 0.4;
  const lowThreshold = options.lowThreshold ?? 0.5;

  const expenses = transactions.filter((transaction) => transaction.type === "EXPENSE");
  if (expenses.length === 0) return [];

  // Anchor the window on the latest month present so demo/imported data with an
  // older timeframe still produces a sensible series.
  const anchor = expenses.reduce((max, tx) => {
    const key = monthKey(tx.date);
    return key > max ? key : max;
  }, monthKey(expenses[0].date));

  const windowMonths = Array.from({ length: months }, (_, i) =>
    addMonthKey(anchor, -(months - 1 - i))
  );
  const windowSet = new Set(windowMonths);

  const byCategory = new Map<
    string,
    { category: string; color: string; totals: Map<string, number> }
  >();

  for (const transaction of expenses) {
    const key = monthKey(transaction.date);
    if (!windowSet.has(key)) continue;
    const id = transaction.category.id;
    const entry = byCategory.get(id) ?? {
      category: transaction.category.label,
      color: transaction.category.color ?? "#64748b",
      totals: new Map<string, number>()
    };
    entry.totals.set(key, (entry.totals.get(key) ?? 0) + Math.abs(transaction.amount));
    byCategory.set(id, entry);
  }

  const trends: CategoryTrend[] = [];

  for (const [categoryId, entry] of byCategory) {
    const monthly = windowMonths.map((month) => ({
      month,
      total: Math.round((entry.totals.get(month) ?? 0) * 100) / 100
    }));
    const currentTotal = monthly[monthly.length - 1].total;
    const prior = monthly.slice(0, -1);
    const priorWithData = prior.filter((item) => item.total > 0);
    if (priorWithData.length === 0) continue; // need history to judge "usual"

    const averageTotal =
      Math.round(
        (priorWithData.reduce((sum, item) => sum + item.total, 0) / priorWithData.length) * 100
      ) / 100;
    const changePct = averageTotal > 0 ? ((currentTotal - averageTotal) / averageTotal) * 100 : 0;

    let anomaly: CategoryTrend["anomaly"] = null;
    if (averageTotal > 0) {
      if (currentTotal > averageTotal * (1 + highThreshold)) anomaly = "high";
      else if (currentTotal > 0 && currentTotal < averageTotal * (1 - lowThreshold))
        anomaly = "low";
    }

    trends.push({
      categoryId,
      category: entry.category,
      color: entry.color,
      monthly,
      currentTotal,
      averageTotal,
      changePct: Math.round(changePct * 10) / 10,
      anomaly
    });
  }

  // Anomalies first (high before low), then by current spend.
  const rank = (anomaly: CategoryTrend["anomaly"]) =>
    anomaly === "high" ? 0 : anomaly === "low" ? 1 : 2;
  return trends.sort(
    (a, b) => rank(a.anomaly) - rank(b.anomaly) || b.currentTotal - a.currentTotal
  );
}
