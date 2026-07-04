import type { AnalyticsData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";

// Builds a compact, privacy-conscious text summary of the user's finances for
// the "ask your finances" AI feature. Only aggregates leave the device — no raw
// transactions, accounts or balances. Pure and unit-testable.

export function buildFinanceSummary(data: AnalyticsData): string {
  const c = data.currency || "RUB";
  const money = (n: number) => formatCurrency(Math.round(n), c);
  const pct = (n: number) => `${Math.round(n)}%`;
  const trend =
    data.savingsRateTrend === "up"
      ? "растёт"
      : data.savingsRateTrend === "down"
        ? "снижается"
        : "стабильна";

  const lines: string[] = [
    `Валюта: ${c}.`,
    `Средний доход в месяц: ${money(data.avgMonthlyIncome)}.`,
    `Средний расход в месяц: ${money(data.avgMonthlyExpense)}.`,
    `Норма сбережений: ${pct(data.avgSavingsRate)} (динамика: ${trend}).`,
    `Изменение расходов за период: ${data.expenseChangePct >= 0 ? "+" : ""}${pct(
      data.expenseChangePct
    )}.`
  ];

  if (data.bestMonth || data.worstMonth) {
    lines.push(
      `Лучший месяц по сбережениям: ${data.bestMonth || "—"}; худший: ${data.worstMonth || "—"}.`
    );
  }

  const topCats = data.topExpenseCategories.slice(0, 6);
  if (topCats.length > 0) {
    const rendered = topCats
      .map((cat) => `${cat.category} — ${money(cat.total)} (${pct(cat.share)})`)
      .join("; ");
    lines.push(`Основные категории расходов: ${rendered}.`);
  }

  const insights = data.insights.slice(0, 4);
  if (insights.length > 0) {
    lines.push(`Наблюдения приложения: ${insights.map((i) => i.title).join("; ")}.`);
  }

  const months = data.monthlyCashflow.slice(-6);
  if (months.length > 0) {
    const rendered = months
      .map((m) => `${m.month}: доход ${money(m.income)}, расход ${money(m.expense)}`)
      .join("; ");
    lines.push(`Последние месяцы — ${rendered}.`);
  }

  return lines.join("\n");
}
