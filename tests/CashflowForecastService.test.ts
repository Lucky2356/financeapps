import { describe, expect, it } from "vitest";

import { CashflowForecastService } from "@/services/CashflowForecastService";

describe("CashflowForecastService", () => {
  it("counts savings interest as planned income", () => {
    // 12 % годовых с ежемесячной капитализацией на 100 000 ₽ — 1 000 ₽ в первый
    // месяц и чуть больше во второй, потому что процент идёт на процент.
    const forecast = new CashflowForecastService().build({
      source: "database",
      currency: "RUB",
      today: new Date("2026-01-15"),
      accounts: [
        {
          id: "savings",
          name: "Накопительный счёт",
          type: "SAVINGS",
          balance: 100_000,
          currency: "RUB",
          interestRate: 12,
          interestCompounding: "MONTHLY"
        }
      ],
      goals: [],
      recurringTransactions: []
    });

    const interest = forecast.events.filter((event) => event.account === "Накопительный счёт");
    expect(interest.map((event) => event.date.slice(0, 10))).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15"
    ]);
    expect(interest.every((event) => event.type === "INCOME")).toBe(true);
    expect(interest.map((event) => event.amount)).toEqual([1000, 1010, 1020.1]);
    // Первое начисление приходится на 31-й день, поэтому в 30-дневное окно оно
    // не попадает, а в 90-дневное — попадает вместе со следующими.
    expect(forecast.plannedIncome30d).toBe(0);
    expect(forecast.plannedIncome90d).toBeGreaterThanOrEqual(2010);
    expect(forecast.forecast90dBalance).toBeGreaterThan(102_000);
  });

  it("leaves the forecast untouched for an account without a rate", () => {
    const forecast = new CashflowForecastService().build({
      source: "database",
      currency: "RUB",
      today: new Date("2026-01-15"),
      accounts: [
        { id: "cash", name: "Карта", type: "DEBIT_CARD", balance: 100_000, currency: "RUB" }
      ],
      goals: [],
      recurringTransactions: []
    });

    expect(forecast.events).toEqual([]);
    expect(forecast.forecast90dBalance).toBe(100_000);
  });

  it("projects planned recurring events and detects negative balance", () => {
    const forecast = new CashflowForecastService().build({
      source: "database",
      currency: "RUB",
      today: new Date("2026-01-01"),
      accounts: [
        { id: "cash", name: "Карта", type: "DEBIT_CARD", balance: 10000, currency: "RUB" }
      ],
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

  it("dates every planned payment on its own day east of Greenwich", () => {
    // Календарь раскладывает события по дню из строки даты. Платежи и долги
    // писались местной полуночью через toISOString(), и в Москве это 21:00
    // накануне: зарплата на 5-е лежала в клетке 4-го.
    const zone = process.env.TZ;
    process.env.TZ = "Europe/Moscow";
    try {
      const forecast = new CashflowForecastService().build({
        source: "database",
        currency: "RUB",
        today: new Date(2026, 8, 26),
        accounts: [],
        goals: [],
        recurringTransactions: [
          {
            id: "salary",
            amount: 100_000,
            type: "INCOME",
            frequency: "MONTHLY",
            nextDate: "2026-10-05T00:00:00.000Z",
            description: "Зарплата",
            isActive: true,
            daysUntilNext: 9,
            isDue: false,
            account: { id: "card", label: "Карта" },
            category: { id: "cat-salary", label: "Зарплата", color: "#16a34a" }
          }
        ],
        liabilities: [
          {
            id: "loan",
            name: "Кредит",
            kind: "LOAN",
            balance: 50_000,
            minPayment: 10_000,
            autoPay: true,
            dueDay: 10
          } as never
        ]
      });

      const days = forecast.events.map((event) => `${event.title}: ${event.date.slice(0, 10)}`);
      expect(days).toContain("Зарплата: 2026-10-05");
      expect(days.filter((entry) => entry.includes("Кредит"))[0]).toContain("2026-10-10");
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});
