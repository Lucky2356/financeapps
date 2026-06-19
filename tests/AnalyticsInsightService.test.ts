import { describe, expect, it } from "vitest";

import { buildAnalyticsDerived } from "@/services/AnalyticsInsightService";

describe("AnalyticsInsightService", () => {
  it("flags negative cashflow, expense growth and category concentration", () => {
    const result = buildAnalyticsDerived(
      [
        { month: "апр.", income: 100000, expense: 80000, savings: 20000, savingsRate: 20 },
        { month: "май", income: 100000, expense: 120000, savings: -20000, savingsRate: -20 }
      ],
      [{ categoryId: "cat-food", category: "Продукты", color: "#f97316", total: 50000, share: 42 }]
    );

    expect(result.expenseChangePct).toBe(50);
    expect(result.savingsRateTrend).toBe("down");
    expect(result.insights.map((insight) => insight.id)).toEqual(
      expect.arrayContaining([
        "analytics-negative-cashflow",
        "analytics-expense-growth",
        "analytics-category-concentration"
      ])
    );
  });

  it("returns a stable positive insight when no warning is needed", () => {
    const result = buildAnalyticsDerived(
      [
        { month: "апр.", income: 100000, expense: 85000, savings: 15000, savingsRate: 15 },
        { month: "май", income: 100000, expense: 83000, savings: 17000, savingsRate: 17 }
      ],
      [
        {
          categoryId: "cat-transport",
          category: "Транспорт",
          color: "#2563eb",
          total: 20000,
          share: 24
        }
      ]
    );

    expect(result.savingsRateTrend).toBe("flat");
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].id).toBe("analytics-stable");
  });
});
