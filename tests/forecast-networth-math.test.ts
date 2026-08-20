import { describe, expect, it } from "vitest";

import { buildNetWorthTrend } from "@/lib/net-worth";
import { suggestedLimitFor } from "@/lib/budget-suggest";
import { describeGoalPace } from "@/lib/goal-pace";
import { buildYoY } from "@/lib/reports/period-report";
import { runLocalStateMigrations } from "@/lib/storage/migrations/runLocalStateMigrations";
import { CashflowForecastService } from "@/services/CashflowForecastService";
import { FinanceRecommendationService } from "@/services/FinanceRecommendationService";
import type { AccountRow, GoalRow, LiabilityRow } from "@/types/finance";

describe("capital chart", () => {
  it("does not treat a debt payment as money gone", () => {
    const now = new Date(2026, 5, 15);
    const payment = {
      date: new Date(2026, 4, 10).toISOString(),
      type: "EXPENSE",
      amount: 30000,
      category: { label: "Долги" },
      liabilityId: "debt-1"
    };

    const withDebt = buildNetWorthTrend({
      currentNetWorth: 100000,
      transactions: [payment],
      now,
      monthsBack: 3
    });
    const withoutAnything = buildNetWorthTrend({
      currentNetWorth: 100000,
      transactions: [],
      now,
      monthsBack: 3
    });

    // The payment took 30 000 off an account and 30 000 off what is owed, so
    // net worth never moved. Counted as spending, the line before it sat
    // 30 000 higher and the chart sloped down while the debt was shrinking.
    expect(withDebt.map((point) => point.value)).toEqual(
      withoutAnything.map((point) => point.value)
    );
  });
});

describe("state migration to v12", () => {
  it("marks the debt payments the app posted before the link existed", () => {
    const state = {
      schemaVersion: 11,
      liabilities: [{ id: "debt-1", name: "Рассрочка", autoPay: true }],
      transactions: [
        { id: "tx-1", type: "EXPENSE", amount: 30000, description: "Рассрочка" },
        { id: "tx-2", type: "EXPENSE", amount: 1200, description: "Продукты" },
        { id: "tx-3", type: "INCOME", amount: 90000, description: "Рассрочка" }
      ]
    };

    const migrated = runLocalStateMigrations(state, 12) as unknown as {
      transactions: Array<{ id: string; liabilityId?: string }>;
    };
    const marked = new Map(migrated.transactions.map((row) => [row.id, row.liabilityId]));

    expect(marked.get("tx-1")).toBe("debt-1");
    // Ordinary spending, and income that merely mentions the name, stay as they are.
    expect(marked.get("tx-2")).toBeUndefined();
    expect(marked.get("tx-3")).toBeUndefined();
  });
});

describe("cashflow forecast", () => {
  const account: AccountRow = {
    id: "acc-1",
    name: "Карта",
    type: "DEBIT_CARD",
    balance: 100000,
    currency: "RUB"
  } as AccountRow;

  const debt: LiabilityRow = {
    id: "debt-1",
    name: "Рассрочка",
    kind: "INSTALLMENT",
    balance: 240000,
    originalAmount: 300000,
    interestRate: 0,
    minPayment: 40000,
    dueDay: 10,
    currency: "RUB",
    autoPay: true,
    progress: 20
  } as LiabilityRow;

  it("counts the debt payments it will post itself", () => {
    const today = new Date(2026, 5, 1);
    const forecast = new CashflowForecastService().build({
      source: "database",
      currency: "RUB",
      accounts: [account],
      recurringTransactions: [],
      goals: [] as GoalRow[],
      liabilities: [debt],
      today
    });

    // Three payments of 40 000 fall inside 90 days, and the app posts them on
    // the due day without being asked. Leaving them out told the owner they
    // would have 100 000 in three months when the true figure is −20 000.
    expect(forecast.plannedExpense30d).toBe(40000);
    expect(forecast.plannedExpense90d).toBe(120000);
    expect(forecast.forecast90dBalance).toBe(-20000);
    expect(forecast.warnings.some((warning) => warning.severity === "CRITICAL")).toBe(true);
  });

  it("stops paying a debt once it is repaid", () => {
    const today = new Date(2026, 5, 1);
    const forecast = new CashflowForecastService().build({
      source: "database",
      currency: "RUB",
      accounts: [account],
      recurringTransactions: [],
      goals: [] as GoalRow[],
      liabilities: [{ ...debt, balance: 50000 }],
      today
    });

    // 50 000 left means one full payment and a last one of 10 000.
    expect(forecast.plannedExpense90d).toBe(50000);
  });

  it("does not warn about a shrinking balance when it is already below zero", () => {
    const today = new Date(2026, 5, 1);
    const forecast = new CashflowForecastService().build({
      source: "database",
      currency: "RUB",
      accounts: [{ ...account, balance: -100000 }],
      recurringTransactions: [],
      goals: [] as GoalRow[],
      today
    });

    // −100 000 standing still is not "the balance is about to run low"; the
    // threshold flips sign below zero and the warning fired regardless.
    expect(forecast.warnings.some((warning) => warning.id === "low-30d-balance")).toBe(false);
  });
});

describe("smaller figures", () => {
  it("keeps the budget suggestion inside its window", () => {
    const now = new Date(2026, 2, 15); // March
    const rows = [
      { date: new Date(2026, 1, 5), type: "EXPENSE", amount: 3000, category: { id: "cat" } },
      // Spending from months after the one being budgeted must not count.
      { date: new Date(2026, 6, 5), type: "EXPENSE", amount: 60000, category: { id: "cat" } }
    ];

    expect(suggestedLimitFor("cat", rows, { now, months: 3 })).toBe(1000);
  });

  it("calls an expired goal expired on the day after its deadline", () => {
    const goal = {
      title: "Отпуск",
      targetAmount: 100000,
      currentAmount: 20000,
      deadline: new Date(2026, 5, 5).toISOString()
    };

    // Counted in calendar months, the 5th was still "this month" on the 20th.
    const pace = describeGoalPace(goal, new Date(2026, 5, 20));
    expect(pace.hint).toMatch(/просроч|overdue|Срок/i);
  });

  it("reports a fall from nothing as a fall", () => {
    const rows = [
      { date: new Date(2026, 0, 10).toISOString(), type: "EXPENSE", amount: 50000 },
      { date: new Date(2025, 0, 10).toISOString(), type: "INCOME", amount: 0 }
    ];
    const yoy = buildYoY(rows as never, 2026);
    // Savings went from 0 to −50 000; that used to read as +100% growth.
    expect(yoy.savingsChangePct).toBe(-100);
  });

  it("keeps the critical advice when a dozen budgets are exceeded", () => {
    const budgets = Array.from({ length: 12 }, (_, index) => ({
      id: `b-${index}`,
      categoryId: `c-${index}`,
      category: `Категория ${index}`,
      color: "#000",
      limitAmount: 1000,
      spent: 2000 + index,
      progress: 200,
      isExceeded: true,
      suggestedLimit: 0,
      rollover: false,
      rolloverAmount: 0
    }));

    const advice = new FinanceRecommendationService().build({
      monthlyCashflow: [{ month: "2026-06", income: 100000, expense: 90000 }],
      freeCashflow: 10000,
      savingsRate: 10,
      emergencyFundMonths: 0,
      emergencyFundTargetMonths: 6,
      essentialExpenseShare: 40,
      subscriptionAndEntertainmentShare: 5,
      monthlyDebtPayments: 0,
      goals: [],
      budgets
    } as never);

    // Twelve budget warnings used to fill the list of eight and push the
    // reserve warning — the only CRITICAL one — off the end.
    expect(advice.some((item) => item.id === "emergency-fund-low")).toBe(true);
  });
});
