import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";

import { percent } from "@/lib/utils";
import type {
  ChartDatum,
  MonthlyCashflowDatum,
  PortfolioRow,
  TransactionRow
} from "@/types/finance";

// Pure, platform-agnostic derivations shared by the server data layer (plan A2).
// They operate purely on domain arrays — no Prisma, demo data, or request state.

export function currentMonthRange() {
  const now = new Date();
  return {
    start: startOfMonth(now),
    end: endOfMonth(now)
  };
}

export function buildMonthlyCashflow(transactions: TransactionRow[]): MonthlyCashflowDatum[] {
  const months = [subMonths(new Date(), 2), subMonths(new Date(), 1), new Date()];

  return months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const rows = transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return date >= start && date <= end;
    });

    return {
      month: format(month, "LLL", { locale: ru }),
      income: rows.filter((row) => row.type === "INCOME").reduce((sum, row) => sum + row.amount, 0),
      expense: rows
        .filter((row) => row.type === "EXPENSE")
        .reduce((sum, row) => sum + row.amount, 0)
    };
  });
}

export function buildCategoryExpenses(transactions: TransactionRow[]): ChartDatum[] {
  const { start, end } = currentMonthRange();
  const byCategory = new Map<string, ChartDatum>();

  for (const transaction of transactions) {
    const date = new Date(transaction.date);
    if (transaction.type !== "EXPENSE" || date < start || date > end) continue;

    const current = byCategory.get(transaction.category.id) ?? {
      name: transaction.category.label,
      value: 0,
      fill: transaction.category.color
    };
    current.value += transaction.amount;
    byCategory.set(transaction.category.id, current);
  }

  return [...byCategory.values()].sort((a, b) => b.value - a.value);
}

export function buildSectorStructure(portfolio: PortfolioRow[]): ChartDatum[] {
  const totals = new Map<string, number>();
  const total = portfolio.reduce((sum, row) => sum + row.currentValue, 0);
  if (total === 0) return [];

  for (const row of portfolio) {
    totals.set(row.sector, (totals.get(row.sector) ?? 0) + row.currentValue);
  }

  return [...totals.entries()]
    .map(([name, value]) => ({ name, value: percent(value, total) }))
    .sort((left, right) => right.value - left.value);
}
