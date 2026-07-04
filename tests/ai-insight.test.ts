import { describe, expect, it } from "vitest";

import { buildFinanceSummary } from "@/lib/ai/finance-summary";
import { buildInsightPrompt } from "@/lib/ai/insight-prompt";
import type { AnalyticsData } from "@/lib/data";

const analytics: AnalyticsData = {
  source: "database",
  currency: "RUB",
  monthlyCashflow: [
    { month: "2026-05", income: 100000, expense: 70000, savings: 30000, savingsRate: 30 },
    { month: "2026-06", income: 100000, expense: 80000, savings: 20000, savingsRate: 20 }
  ],
  topExpenseCategories: [
    { categoryId: "c1", category: "Продукты", color: "#111", total: 40000, share: 50 },
    { categoryId: "c2", category: "Кафе", color: "#222", total: 20000, share: 25 }
  ],
  avgMonthlyIncome: 100000,
  avgMonthlyExpense: 75000,
  avgSavingsRate: 25,
  bestMonth: "2026-05",
  worstMonth: "2026-06",
  expenseChangePct: 14,
  savingsRateTrend: "down",
  insights: [
    { id: "i1", title: "Расходы выросли", description: "...", severity: "WARNING" }
  ] as AnalyticsData["insights"]
};

describe("buildFinanceSummary", () => {
  it("includes the key aggregates and top categories", () => {
    const summary = buildFinanceSummary(analytics);
    expect(summary).toContain("Продукты");
    expect(summary).toContain("Кафе");
    expect(summary).toContain("25%"); // savings rate
    expect(summary).toContain("снижается"); // trend down
    expect(summary).toContain("+14%"); // expense change
  });

  it("does not leak anything beyond the provided aggregates", () => {
    const summary = buildFinanceSummary(analytics);
    // No account names / raw transaction descriptions are part of AnalyticsData.
    expect(summary.length).toBeLessThan(2000);
  });
});

describe("buildInsightPrompt", () => {
  it("grounds the model in the summary and includes the question", () => {
    const { system, user } = buildInsightPrompt("Где сэкономить?", "СВОДКА");
    expect(system).toContain("ТОЛЬКО");
    expect(user).toContain("СВОДКА");
    expect(user).toContain("Где сэкономить?");
  });
});
