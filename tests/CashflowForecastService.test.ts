import { describe, expect, it } from "vitest";

import { CashflowForecastService } from "@/services/CashflowForecastService";

describe("CashflowForecastService", () => {
  it("projects planned recurring events and detects negative balance", () => {
    const forecast = new CashflowForecastService().build({
      source: "database",
      currency: "RUB",
      today: new Date("2026-01-01"),
      accounts: [{ id: "cash", name: "Карта", type: "DEBIT_CARD", balance: 10000, currency: "RUB" }],
      goals: [],
      recurringTransactions: [
        {
          id: "salary",
          amount: 50000,
          type: "INCOME",
          frequency: "MONTHLY",
          nextDate: "2026-01-10T00:00:00.000Z",
          description: "Зарплата",
          isActive: true,
          daysUntilNext: 9,
          isDue: false,
          account: { id: "cash", label: "Карта" },
          category: { id: "salary", label: "Зарплата", color: "#16a34a" }
        },
        {
          id: "rent",
          amount: 70000,
          type: "EXPENSE",
          frequency: "MONTHLY",
          nextDate: "2026-01-05T00:00:00.000Z",
          description: "Аренда",
          isActive: true,
          daysUntilNext: 4,
          isDue: false,
          account: { id: "cash", label: "Карта" },
          category: { id: "rent", label: "Аренда", color: "#f97316" }
        }
      ]
    });

    expect(forecast.plannedIncome30d).toBe(50000);
    expect(forecast.plannedExpense30d).toBe(70000);
    expect(forecast.warnings.some((warning) => warning.id === "negative-balance")).toBe(true);
  });
});
