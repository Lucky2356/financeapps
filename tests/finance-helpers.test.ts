import { describe, expect, it } from "vitest";

import { suggestedLimitFor, type BudgetHistoryTx } from "@/lib/budget-suggest";
import { buildEmergencyFund } from "@/lib/emergency-fund";

describe("suggestedLimitFor", () => {
  const now = new Date("2026-06-15T12:00:00");
  const tx = (date: string, amount: number, categoryId = "cat-food"): BudgetHistoryTx => ({
    date,
    amount,
    type: "EXPENSE",
    category: { id: categoryId }
  });

  it("averages the last 3 months and rounds up to 100", () => {
    // 3000 + 0 + 3050 over Apr/May/Jun → avg 2016.67 → ceil to 2100.
    const history = [tx("2026-04-10", 3000), tx("2026-06-02", 3050), tx("2026-02-01", 9999)];
    expect(suggestedLimitFor("cat-food", history, { now })).toBe(2100);
  });

  it("ignores other categories and income", () => {
    const history = [tx("2026-06-01", 5000, "cat-transport"), { ...tx("2026-06-01", 5000), type: "INCOME" }];
    expect(suggestedLimitFor("cat-food", history, { now })).toBe(0);
  });
});

describe("buildEmergencyFund", () => {
  it("computes months, target amount and progress", () => {
    const fund = buildEmergencyFund({ savingsBalance: 180000, averageMonthlyExpense: 60000, targetMonths: 6 });
    expect(fund.months).toBe(3);
    expect(fund.targetAmount).toBe(360000);
    expect(fund.progress).toBe(50);
  });

  it("handles zero expense gracefully", () => {
    const fund = buildEmergencyFund({ savingsBalance: 1000, averageMonthlyExpense: 0, targetMonths: 6 });
    expect(fund.months).toBe(0);
    expect(fund.targetAmount).toBe(0);
    expect(fund.progress).toBe(100);
  });
});
