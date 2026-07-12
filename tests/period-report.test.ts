import { describe, expect, it } from "vitest";

import { buildPeriodReport, buildYoY, type ReportTransaction } from "@/lib/reports/period-report";

const data: ReportTransaction[] = [
  {
    amount: 100000,
    type: "INCOME",
    date: "2026-01-10",
    category: { id: "sal", label: "Зарплата" }
  },
  { amount: 30000, type: "EXPENSE", date: "2026-01-15", category: { id: "rent", label: "Аренда" } },
  { amount: 10000, type: "EXPENSE", date: "2026-01-20", category: { id: "food", label: "Еда" } },
  {
    amount: 100000,
    type: "INCOME",
    date: "2026-02-10",
    category: { id: "sal", label: "Зарплата" }
  },
  { amount: 30000, type: "EXPENSE", date: "2026-02-15", category: { id: "rent", label: "Аренда" } },
  // Prior year for YoY
  { amount: 80000, type: "INCOME", date: "2025-01-10", category: { id: "sal", label: "Зарплата" } },
  { amount: 20000, type: "EXPENSE", date: "2025-01-15", category: { id: "rent", label: "Аренда" } }
];

describe("buildPeriodReport", () => {
  it("aggregates income/expense/savings for a range", () => {
    const report = buildPeriodReport(data, "2026-01-01", "2026-02-28");
    expect(report.totals.income).toBe(200000);
    expect(report.totals.expense).toBe(70000);
    expect(report.totals.savings).toBe(130000);
    expect(report.totals.savingsRate).toBe(65);
  });

  it("excludes out-of-range transactions", () => {
    const report = buildPeriodReport(data, "2026-02-01", "2026-02-28");
    expect(report.totals.income).toBe(100000);
    expect(report.totals.expense).toBe(30000);
    expect(report.monthly).toHaveLength(1);
    expect(report.monthly[0].month).toBe("2026-02");
  });

  it("ranks top expense categories by share", () => {
    const report = buildPeriodReport(data, "2026-01-01", "2026-02-28");
    expect(report.topCategories[0].category).toBe("Аренда");
    expect(report.topCategories[0].total).toBe(60000);
    // rent = 60000 of 70000 total expense ≈ 85.71%
    expect(report.topCategories[0].share).toBeCloseTo(85.71, 1);
  });
});

describe("buildYoY", () => {
  it("compares a year against the prior year", () => {
    const yoy = buildYoY(data, 2026);
    expect(yoy.current.income).toBe(200000);
    expect(yoy.previous.income).toBe(80000);
    expect(yoy.incomeChangePct).toBe(150); // (200k-80k)/80k
    expect(yoy.expenseChangePct).toBe(250); // (70k-20k)/20k
  });

  it("handles a prior year with no data", () => {
    const yoy = buildYoY(data, 2025);
    expect(yoy.previous.income).toBe(0);
    expect(yoy.incomeChangePct).toBe(100);
  });
});
