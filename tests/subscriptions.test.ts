import { describe, expect, it } from "vitest";

import { summarizeSubscriptions } from "@/lib/subscriptions";
import type { RecurringTransactionRow } from "@/types/finance";

function row(
  overrides: Partial<RecurringTransactionRow> & Pick<RecurringTransactionRow, "id" | "amount">
): RecurringTransactionRow {
  return {
    type: "EXPENSE",
    frequency: "MONTHLY",
    nextDate: "2026-07-01",
    description: null,
    isActive: true,
    daysUntilNext: 5,
    isDue: false,
    account: { id: "a", label: "Карта" },
    category: { id: "c", label: "Подписки", color: "#fff" },
    ...overrides
  } as RecurringTransactionRow;
}

describe("summarizeSubscriptions", () => {
  it("normalizes frequencies to monthly and annual cost", () => {
    const summary = summarizeSubscriptions([
      row({ id: "1", amount: 1000, frequency: "MONTHLY" }),
      row({ id: "2", amount: 12000, frequency: "YEARLY" }),
      row({ id: "3", amount: 250, frequency: "WEEKLY" })
    ]);

    const monthly = Object.fromEntries(summary.items.map((i) => [i.id, i.monthlyEquivalent]));
    expect(monthly["1"]).toBe(1000);
    expect(monthly["2"]).toBe(1000); // 12000 / 12
    expect(monthly["3"]).toBeCloseTo((250 * 52) / 12, 2);

    expect(summary.totalMonthly).toBeCloseTo(1000 + 1000 + (250 * 52) / 12, 2);
    expect(summary.totalAnnual).toBeCloseTo(summary.totalMonthly * 12, 2);
  });

  it("excludes inactive templates and income", () => {
    const summary = summarizeSubscriptions([
      row({ id: "1", amount: 1000, isActive: false }),
      row({ id: "2", amount: 5000, type: "INCOME" }),
      row({ id: "3", amount: 700 })
    ]);
    expect(summary.items.map((i) => i.id)).toEqual(["3"]);
    expect(summary.totalMonthly).toBe(700);
  });

  it("sorts by monthly cost descending", () => {
    const summary = summarizeSubscriptions([
      row({ id: "small", amount: 200 }),
      row({ id: "big", amount: 5000 })
    ]);
    expect(summary.items.map((i) => i.id)).toEqual(["big", "small"]);
  });
});
