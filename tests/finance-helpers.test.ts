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
    const history = [
      tx("2026-06-01", 5000, "cat-transport"),
      { ...tx("2026-06-01", 5000), type: "INCOME" }
    ];
    expect(suggestedLimitFor("cat-food", history, { now })).toBe(0);
  });
});

describe("buildEmergencyFund", () => {
  it("computes months, target amount and progress", () => {
    const fund = buildEmergencyFund({
      savingsBalance: 180000,
      averageMonthlyExpense: 60000,
      targetMonths: 6
    });
    expect(fund.months).toBe(3);
    expect(fund.targetAmount).toBe(360000);
    expect(fund.progress).toBe(50);
  });

  it("treats a reserve with nothing to cover as complete", () => {
    const fund = buildEmergencyFund({
      savingsBalance: 1000,
      averageMonthlyExpense: 0,
      targetMonths: 6
    });
    // The bar has always read 100% here — there is money set aside and no
    // spending to cover. `months` used to say 0 at the same time, and the
    // readers of that number put a CRITICAL "low reserve" beside the full bar
    // and took 25 points off the health score. The two now agree.
    expect(fund.progress).toBe(100);
    expect(fund.months).toBe(6);
    expect(fund.targetAmount).toBe(0);
  });

  it("keeps an empty reserve empty", () => {
    const fund = buildEmergencyFund({
      savingsBalance: 0,
      averageMonthlyExpense: 0,
      targetMonths: 6
    });
    expect(fund.progress).toBe(0);
    expect(fund.months).toBe(0);
  });
});
