import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";

import { percent } from "@/lib/utils";
import type { AssetKind } from "@/types/enums";
import type {
  ChartDatum,
  MonthlyCashflowDatum,
  PortfolioRow,
  TransactionRow
} from "@/types/finance";
import { ASSET_KIND_COLORS } from "@/lib/charts/palette";
import { countableAmount } from "@/lib/transactions/base-amount";

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
      income: rows
        .filter((row) => row.type === "INCOME")
        .reduce((sum, row) => sum + countableAmount(row), 0),
      expense: rows
        .filter((row) => row.type === "EXPENSE")
        .reduce((sum, row) => sum + countableAmount(row), 0)
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
    current.value += countableAmount(transaction);
    byCategory.set(transaction.category.id, current);
  }

  return [...byCategory.values()].sort((a, b) => b.value - a.value);
}

// What the portfolio is made of — shares, bonds, funds, metal. The sector split
// answers "which industries", which is a different question and no substitute:
// a portfolio can look beautifully spread across sectors and still be entirely
// in shares.
export function buildAssetKindStructure(
  portfolio: PortfolioRow[],
  labelOf: (kind: AssetKind) => string
): ChartDatum[] {
  const totals = new Map<AssetKind, number>();
  const total = portfolio.reduce((sum, row) => sum + row.currentValue, 0);
  if (total === 0) return [];

  for (const row of portfolio) {
    const kind = row.assetKind ?? "STOCK";
    totals.set(kind, (totals.get(kind) ?? 0) + row.currentValue);
  }

  return [...totals.entries()]
    .map(([kind, value]) => ({
      name: labelOf(kind),
      value: percent(value, total),
      // A kind always carries its own colour, whatever order the slices end up
      // in — otherwise two of them can land on neighbouring palette entries and
      // read as one.
      fill: ASSET_KIND_COLORS[kind] ?? ASSET_KIND_COLORS.OTHER
    }))
    .sort((left, right) => right.value - left.value);
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
