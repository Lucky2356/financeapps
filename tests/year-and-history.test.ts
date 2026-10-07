import { describe, expect, it } from "vitest";

import { balanceHistory, monthsBack } from "@/lib/accounts/balance-history";
import { buildYearRecap, type YearRow } from "@/lib/analytics/year-recap";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// История остатка — отматыванием операций назад; итоги года — за год с
// разницей к прошлому.

describe("история остатка", () => {
  it("месяцы назад и остаток на конец каждого — сходится с операциями", () => {
    expect(monthsBack("2026-03", 4)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"]);
    const history = balanceHistory({
      accounts: [{ id: "card", name: "Карта", type: "DEBIT_CARD", currency: "RUB", balance: 7000 }],
      flows: [
        { accountId: "card", date: "2026-01-10", signed: 10000 },
        { accountId: "card", date: "2026-02-05", signed: -2000 },
        { accountId: "card", date: "2026-03-01", signed: -1000 }
      ],
      goalsNow: 500,
      goalMovements: [{ date: "2026-02-20", amount: 500 }],
      months: ["2025-12", "2026-01", "2026-02", "2026-03"]
    });
    expect(history.accounts[0].values).toEqual([0, 10000, 8000, 7000]);
    expect(history.goals).toEqual([0, 0, 500, 500]);
  });

  it("через API: пополнение цели переносит деньги со счёта в цели, итог не меняется", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "20000"
    });
    const goal = await api.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "100000",
      currentAmount: "0",
      deadline: "2027-01-01"
    });
    await api.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      amount: "5000",
      accountId: card.id
    });
    const history = await api.get("/balance-history?months=2");
    expect(history.months).toHaveLength(2);
    expect(history.total[history.total.length - 1]).toBe(20000);
    expect(history.cushion[history.cushion.length - 1]).toBe(5000);
  });
});

describe("итоги года", () => {
  const row = (
    type: "INCOME" | "EXPENSE",
    amount: number,
    date: string,
    category = "food"
  ): YearRow => ({
    type,
    amount,
    date,
    categoryId: category,
    category: category === "food" ? "Продукты" : "Отпуск",
    description: null
  });

  it("год целиком: суммы, топ статей, лучший и худший месяц, к прошлому году", () => {
    const recap = buildYearRecap({
      year: 2025,
      today: "2026-10-03",
      rows: [
        row("INCOME", 100000, "2025-01-10"),
        row("EXPENSE", 30000, "2025-01-15"),
        row("INCOME", 100000, "2025-07-10"),
        row("EXPENSE", 90000, "2025-07-20", "trip"),
        row("EXPENSE", 50000, "2024-05-01")
      ],
      capital: { start: 10000, end: 90000 },
      cushion: { start: 0, end: 50000 }
    });
    expect(recap).toMatchObject({
      partial: false,
      income: 200000,
      expense: 120000,
      saved: 80000,
      savedRate: 40,
      previous: { expense: 50000 },
      best: { month: "2025-01", saved: 70000 },
      worst: { month: "2025-07", saved: 10000 },
      biggest: { amount: 90000 }
    });
    expect(recap.top[0]).toMatchObject({ category: "Отпуск", share: 75 });
  });

  it("год ещё идёт: прошлый год берётся до того же дня", () => {
    const recap = buildYearRecap({
      year: 2026,
      today: "2026-10-03",
      rows: [
        row("EXPENSE", 1000, "2026-02-01"),
        row("EXPENSE", 500, "2025-03-01"),
        row("EXPENSE", 9999, "2025-12-01")
      ],
      capital: { start: 0, end: 0 },
      cushion: { start: 0, end: 0 }
    });
    expect(recap.partial).toBe(true);
    expect(recap.previous?.expense).toBe(500);
  });
});
