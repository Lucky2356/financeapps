import { describe, expect, it } from "vitest";

import {
  FinanceRecommendationService,
  type FinanceRecommendationInput
} from "@/services/FinanceRecommendationService";

function baseInput(
  overrides: Partial<FinanceRecommendationInput> = {}
): FinanceRecommendationInput {
  return {
    budgets: [],
    monthlyCashflow: [
      { month: "март", income: 200000, expense: 100000 },
      { month: "апр.", income: 200000, expense: 120000 },
      { month: "май", income: 200000, expense: 140000 }
    ],
    currentMonthIncome: 200000,
    currentMonthExpense: 140000,
    freeCashflow: 60000,
    savingsRate: 30,
    emergencyFundMonths: 6,
    emergencyFundTargetMonths: 6,
    essentialExpenseShare: 45,
    subscriptionAndEntertainmentShare: 8,
    goals: [],
    ...overrides
  };
}

describe("FinanceRecommendationService", () => {
  const service = new FinanceRecommendationService();

  it("creates recommendations for exceeded budgets, low reserve, soft spending and expense growth", () => {
    const recommendations = service.build(
      baseInput({
        budgets: [
          {
            category: "Продукты",
            limitAmount: 40000,
            spent: 52000,
            isExceeded: true
          }
        ],
        emergencyFundMonths: 1.8,
        subscriptionAndEntertainmentShare: 14
      })
    );

    expect(recommendations.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "budget-Продукты",
        "emergency-fund-low",
        "subscriptions-entertainment",
        "positive-cashflow",
        "expense-growth"
      ])
    );
    expect(recommendations.find((item) => item.id === "emergency-fund-low")?.severity).toBe(
      "CRITICAL"
    );
  });

  it("does not warn about expense growth when monthly expense is stable", () => {
    const recommendations = service.build(
      baseInput({
        monthlyCashflow: [
          { month: "март", income: 200000, expense: 120000 },
          { month: "апр.", income: 200000, expense: 118000 },
          { month: "май", income: 200000, expense: 119000 }
        ]
      })
    );

    expect(recommendations.some((item) => item.id === "expense-growth")).toBe(false);
  });

  it("calculates a lower health score for negative cashflow and missing emergency fund", () => {
    const health = service.healthScore(
      baseInput({
        freeCashflow: -15000,
        savingsRate: -7.5,
        emergencyFundMonths: 0.5,
        subscriptionAndEntertainmentShare: 16,
        budgets: [{ category: "Рестораны", limitAmount: 12000, spent: 18000, isExceeded: true }]
      })
    );

    expect(health.score).toBeLessThan(50);
    expect(health.checks.find((item) => item.label === "Свободный остаток")?.status).toBe(
      "critical"
    );
    expect(health.checks.find((item) => item.label === "Финансовая подушка")?.status).toBe(
      "critical"
    );

    // The factor breakdown must reconcile with the score (single source of truth).
    const totalDeduction = health.factors.reduce((sum, factor) => sum + factor.deduction, 0);
    expect(health.score).toBe(100 - totalDeduction);
    expect(health.factors.every((factor) => factor.applied === factor.deduction > 0)).toBe(true);
    expect(
      health.factors.some((factor) => factor.label === "Отрицательный остаток" && factor.applied)
    ).toBe(true);
  });

  it("returns a full score with no applied factors for healthy, non-growing finances", () => {
    const health = service.healthScore(
      baseInput({
        freeCashflow: 50000,
        savingsRate: 25,
        emergencyFundMonths: 6,
        emergencyFundTargetMonths: 6,
        subscriptionAndEntertainmentShare: 5,
        budgets: [],
        monthlyCashflow: [
          { month: "март", income: 200000, expense: 120000 },
          { month: "апр.", income: 200000, expense: 110000 },
          { month: "май", income: 200000, expense: 100000 }
        ]
      })
    );

    expect(health.score).toBe(100);
    expect(health.factors.some((factor) => factor.applied)).toBe(false);
  });

  it("flags a high debt-to-income load as a health factor", () => {
    const health = service.healthScore(
      baseInput({ currentMonthIncome: 100000, monthlyDebtPayments: 50000 })
    );
    expect(
      health.factors.some(
        (factor) => factor.label === "Высокая долговая нагрузка" && factor.applied
      )
    ).toBe(true);
  });
});
