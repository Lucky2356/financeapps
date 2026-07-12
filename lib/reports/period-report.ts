// Pure period aggregation for the reports page: income/expense/savings for an
// arbitrary date range, a monthly breakdown, top expense categories, and a
// year-over-year comparison. Deterministic and dependency-free so it can run in
// both the web and desktop builds and be unit-tested directly.

export type ReportTransaction = {
  amount: number;
  type: string;
  date: string;
  category: { id: string; label: string };
};

export type PeriodTotals = {
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
};

export type MonthlyRow = { month: string; income: number; expense: number; savings: number };
export type ReportCategoryRow = {
  categoryId: string;
  category: string;
  total: number;
  share: number;
};

export type PeriodReport = {
  from: string;
  to: string;
  totals: PeriodTotals;
  monthly: MonthlyRow[];
  topCategories: ReportCategoryRow[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyTotals(): PeriodTotals {
  return { income: 0, expense: 0, savings: 0, savingsRate: 0 };
}

function finalizeTotals(income: number, expense: number): PeriodTotals {
  const savings = round2(income - expense);
  return {
    income: round2(income),
    expense: round2(expense),
    savings,
    savingsRate: income > 0 ? round2((savings / income) * 100) : 0
  };
}

function inRange(dateIso: string, from: string, to: string): boolean {
  const day = dateIso.slice(0, 10);
  return day >= from && day <= to;
}

export function buildPeriodReport(
  transactions: ReportTransaction[],
  from: string,
  to: string
): PeriodReport {
  const rows = transactions.filter((transaction) => inRange(transaction.date, from, to));

  let income = 0;
  let expense = 0;
  const monthly = new Map<string, { income: number; expense: number }>();
  const categories = new Map<string, { category: string; total: number }>();

  for (const transaction of rows) {
    const amount = Math.abs(transaction.amount);
    const monthKey = transaction.date.slice(0, 7);
    const bucket = monthly.get(monthKey) ?? { income: 0, expense: 0 };
    if (transaction.type === "INCOME") {
      income += amount;
      bucket.income += amount;
    } else if (transaction.type === "EXPENSE") {
      expense += amount;
      bucket.expense += amount;
      const category = categories.get(transaction.category.id) ?? {
        category: transaction.category.label,
        total: 0
      };
      category.total += amount;
      categories.set(transaction.category.id, category);
    }
    monthly.set(monthKey, bucket);
  }

  const monthlyRows: MonthlyRow[] = [...monthly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({
      month,
      income: round2(value.income),
      expense: round2(value.expense),
      savings: round2(value.income - value.expense)
    }));

  const totalExpense = expense;
  const topCategories: ReportCategoryRow[] = [...categories.entries()]
    .map(([categoryId, value]) => ({
      categoryId,
      category: value.category,
      total: round2(value.total),
      share: totalExpense > 0 ? round2((value.total / totalExpense) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total);

  return { from, to, totals: finalizeTotals(income, expense), monthly: monthlyRows, topCategories };
}

export type YoYComparison = {
  year: number;
  current: PeriodTotals;
  previous: PeriodTotals;
  incomeChangePct: number;
  expenseChangePct: number;
  savingsChangePct: number;
};

function yearTotals(transactions: ReportTransaction[], year: number): PeriodTotals {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    if (Number(transaction.date.slice(0, 4)) !== year) continue;
    const amount = Math.abs(transaction.amount);
    if (transaction.type === "INCOME") income += amount;
    else if (transaction.type === "EXPENSE") expense += amount;
  }
  return finalizeTotals(income, expense);
}

function changePct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function buildYoY(transactions: ReportTransaction[], year: number): YoYComparison {
  const current = yearTotals(transactions, year);
  const previous = yearTotals(transactions, year - 1);
  return {
    year,
    current,
    previous,
    incomeChangePct: changePct(current.income, previous.income),
    expenseChangePct: changePct(current.expense, previous.expense),
    savingsChangePct: changePct(current.savings, previous.savings)
  };
}

export { emptyTotals };
