import { describe, expect, it } from "vitest";

import { computeDailyAllowance } from "@/lib/analytics/daily-allowance";

const base = {
  today: "2026-09-21",
  income: 100_000,
  averageIncome: 90_000,
  upcoming: 10_000,
  spentBeforeToday: 60_000,
  spentToday: 500,
  spentYesterday: 1_200
};

describe("можно тратить сегодня", () => {
  it("остаток месяца делится на оставшиеся дни, считая сегодня", () => {
    const allowance = computeDailyAllowance(base);
    // (100 000 − 10 000 − 60 000) / 10 дней (21…30 сентября)
    expect(allowance.daysLeft).toBe(10);
    expect(allowance.perDay).toBe(3000);
    expect(allowance.leftToday).toBe(2500);
    expect(allowance.status).toBe("ok");
  });

  it("последний день месяца — весь остаток на сегодня", () => {
    const allowance = computeDailyAllowance({ ...base, today: "2026-09-30" });
    expect(allowance.daysLeft).toBe(1);
    expect(allowance.perDay).toBe(30_000);
  });

  it("перерасход — ноль в день и красный, без отрицательных «можно»", () => {
    const allowance = computeDailyAllowance({ ...base, spentBeforeToday: 95_000 });
    expect(allowance.perDay).toBe(0);
    expect(allowance.status).toBe("over");
  });

  it("доходов в месяце ещё нет — по среднему, и об этом сказано", () => {
    const allowance = computeDailyAllowance({ ...base, income: 0, spentBeforeToday: 0 });
    expect(allowance.incomeSource).toBe("average");
    expect(allowance.perDay).toBe(8000);
  });

  it("на сегодня почти всё потрачено — жёлтый", () => {
    const allowance = computeDailyAllowance({ ...base, spentToday: 2400 });
    expect(allowance.status).toBe("tight");
  });

  it("февраль високосного года", () => {
    expect(computeDailyAllowance({ ...base, today: "2028-02-28" }).daysLeft).toBe(2);
  });
});

describe("ручка /allowance", () => {
  it("считает доходы и расходы месяца, переводы — нет", async () => {
    const { LocalApiClient } = await import("@/lib/api/LocalApiClient");
    const { MemoryStorageAdapter } = await import("@/lib/storage/MemoryStorageAdapter");
    const { formatInputDate } = await import("@/lib/format");
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "0"
    });
    const cash = await api.post("/accounts", {
      name: "Наличные",
      type: "CASH",
      balance: "0"
    });
    const categories = await api.get("/categories");
    const income = categories.categories.find((c) => c.kind === "INCOME")!;
    const expense = categories.categories.find((c) => c.kind === "EXPENSE")!;
    const today = formatInputDate(new Date());
    await api.post("/transactions", {
      type: "INCOME",
      amount: "50000",
      accountId: card.id,
      categoryId: income.id,
      date: today
    });
    await api.post("/transactions", {
      type: "EXPENSE",
      amount: "700",
      accountId: card.id,
      categoryId: expense.id,
      date: today
    });
    await api.post("/transactions", {
      action: "transfer",
      amount: "5000",
      fromAccountId: card.id,
      toAccountId: cash.id,
      date: today
    });

    const allowance = await api.get("/allowance");
    expect(allowance.income).toBe(50000);
    expect(allowance.spentToday).toBe(700);
  });
});
