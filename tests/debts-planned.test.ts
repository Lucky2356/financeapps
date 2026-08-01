import { describe, expect, it } from "vitest";

import {
  nextDueDate,
  plannedDebtMonthlyTotal,
  plannedDebtPayments,
  type PlannedDebtLiability
} from "@/lib/debts/planned";

function liability(overrides: Partial<PlannedDebtLiability> = {}): PlannedDebtLiability {
  return {
    id: "debt-1",
    name: "Ипотека",
    balance: 1_000_000,
    minPayment: 25_000,
    dueDay: 10,
    ...overrides
  };
}

describe("plannedDebtPayments", () => {
  it("schedules the current month while the due day is still ahead", () => {
    const payments = plannedDebtPayments([liability()], new Date(2026, 7, 3));

    expect(payments).toHaveLength(1);
    expect(payments[0].dueDate.slice(0, 10)).toBe("2026-08-10");
    expect(payments[0].daysUntilNext).toBe(7);
    expect(payments[0].isDue).toBe(false);
  });

  it("marks a passed due day as due instead of skipping to next month", () => {
    const payments = plannedDebtPayments([liability()], new Date(2026, 7, 21));

    expect(payments[0].dueDate.slice(0, 10)).toBe("2026-08-10");
    expect(payments[0].isDue).toBe(true);
    expect(payments[0].daysUntilNext).toBe(0);
  });

  it("moves to next month once the month's payment is posted", () => {
    const payments = plannedDebtPayments(
      [liability({ lastPaidMonth: "2026-08" })],
      new Date(2026, 7, 21)
    );

    expect(payments[0].dueDate.slice(0, 10)).toBe("2026-09-10");
    expect(payments[0].isDue).toBe(false);
  });

  it("clamps the due day in a short month", () => {
    const due = nextDueDate(liability({ dueDay: 31 }), new Date(2027, 1, 5));

    expect(due?.toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  it("never plans more than what is still owed", () => {
    const payments = plannedDebtPayments(
      [liability({ balance: 4_000, minPayment: 25_000 })],
      new Date(2026, 7, 3)
    );

    expect(payments[0].amount).toBe(4_000);
  });

  it("skips liabilities without a due day, payment or balance", () => {
    const payments = plannedDebtPayments(
      [
        liability({ id: "a", dueDay: undefined }),
        liability({ id: "b", minPayment: 0 }),
        liability({ id: "c", balance: 0 })
      ],
      new Date(2026, 7, 3)
    );

    expect(payments).toHaveLength(0);
  });

  it("sorts by due date and totals the monthly load", () => {
    const payments = plannedDebtPayments(
      [
        liability({ id: "later", dueDay: 25, minPayment: 5_000 }),
        liability({ id: "sooner", dueDay: 5, minPayment: 3_000 })
      ],
      new Date(2026, 7, 1)
    );

    expect(payments.map((payment) => payment.id)).toEqual(["sooner", "later"]);
    expect(plannedDebtMonthlyTotal(payments)).toBe(8_000);
  });
});
