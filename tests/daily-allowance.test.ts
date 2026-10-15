import { afterEach, describe, expect, it, vi } from "vitest";

import { computeDailyAllowance } from "@/lib/analytics/daily-allowance";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { convert, DEFAULT_CURRENCY_RATES } from "@/lib/currency";
import { formatInputDate } from "@/lib/format";

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

describe("операции месяца, записанные вперёд", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Доход, записанный на 25-е, в бюджет месяца входил, а расход на 25-е — нет:
  // ни в «потрачено» (только до сегодня), ни в «впереди» (только прогноз).
  async function setup() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 12, 12));
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "0" });
    await api.post("/transactions", {
      type: "INCOME",
      amount: "100000",
      accountId: card.id,
      categoryId: "cat-salary",
      date: "2026-10-01"
    });
    return { api, card };
  }

  it("расход на 25-е — в «впереди», бюджет меньше", async () => {
    const { api, card } = await setup();
    expect((await api.get("/allowance")).budget).toBe(100000);
    await api.post("/transactions", {
      type: "EXPENSE",
      amount: "30000",
      accountId: card.id,
      categoryId: "cat-food",
      date: "2026-10-25"
    });
    const allowance = await api.get("/allowance");
    expect(allowance.upcoming).toBe(30000);
    expect(allowance.budget).toBe(70000);
    expect(allowance.spentBeforeToday).toBe(0);
  });

  it("доход на 25-е по-прежнему доход месяца", async () => {
    const { api, card } = await setup();
    await api.post("/transactions", {
      type: "INCOME",
      amount: "50000",
      accountId: card.id,
      categoryId: "cat-salary",
      date: "2026-10-25"
    });
    expect((await api.get("/allowance")).budget).toBe(150000);
  });

  it("расход следующего месяца в этот не входит", async () => {
    const { api, card } = await setup();
    await api.post("/transactions", {
      type: "EXPENSE",
      amount: "30000",
      accountId: card.id,
      categoryId: "cat-food",
      date: "2026-11-02"
    });
    expect((await api.get("/allowance")).budget).toBe(100000);
  });
});

describe("итог прошлого месяца: остаток или перерасход", () => {
  it("плюс прошлого месяца входит в бюджет отдельной строкой", () => {
    // Октябрь сам по себе в минусе (как на снимке владельца: 28 339 − 35 595),
    // но сентябрь оставил 20 000.
    const allowance = computeDailyAllowance({
      ...base,
      today: "2026-10-10",
      income: 28_339,
      upcoming: 0,
      spentBeforeToday: 35_595,
      spentToday: 0,
      carryOver: 20_000
    });
    expect(allowance.carryOver).toBe(20_000);
    // 28 339 + 20 000 − 35 595 = 12 744 на 22 дня (10…31 октября)
    expect(allowance.budget).toBe(12_744);
    expect(allowance.daysLeft).toBe(22);
    expect(allowance.perDay).toBe(579.27);
    expect(allowance.status).toBe("ok");
  });

  it("перерасход прошлого месяца уменьшает бюджет этого", () => {
    const allowance = computeDailyAllowance({ ...base, carryOver: -15_000 });
    expect(allowance.carryOver).toBe(-15_000);
    // 100 000 − 15 000 − 10 000 − 60 000 = 15 000 на 10 дней
    expect(allowance.budget).toBe(15_000);
    expect(allowance.perDay).toBe(1_500);
  });

  it("перерасход больше остатка месяца — ноль в день и «перебор»", () => {
    const allowance = computeDailyAllowance({ ...base, carryOver: -40_000 });
    expect(allowance.budget).toBe(-10_000);
    expect(allowance.perDay).toBe(0);
    expect(allowance.status).toBe("over");
  });

  it("без прошлого месяца (первый месяц учёта) — ноль", () => {
    const allowance = computeDailyAllowance(base);
    expect(allowance.carryOver).toBe(0);
    expect(allowance.budget).toBe(30_000);
  });

  it("складывается и со средним доходом, пока в месяце доходов нет", () => {
    const allowance = computeDailyAllowance({
      ...base,
      income: 0,
      spentBeforeToday: 0,
      carryOver: 10_000
    });
    expect(allowance.incomeSource).toBe("average");
    expect(allowance.budget).toBe(90_000);
  });
});

describe("ручка /allowance: остаток с прошлого", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "0" });
    const add = (type: "INCOME" | "EXPENSE", amount: number, date: string) =>
      api.post("/transactions", {
        type,
        amount: String(amount),
        accountId: card.id,
        categoryId: type === "INCOME" ? "cat-salary" : "cat-food",
        date
      });
    return { api, card, add };
  }

  it("первый месяц учёта — остатка нет", async () => {
    const { api, add } = await setup();
    await add("INCOME", 50_000, "2026-10-05");
    const allowance = await api.get("/allowance");
    expect(allowance.carryOver).toBe(0);
    expect(allowance.budget).toBe(50_000);
  });

  it("сентябрьский остаток вытягивает октябрь из перерасхода", async () => {
    const { api, add } = await setup();
    await add("INCOME", 28_339, "2026-10-05");
    await add("EXPENSE", 35_595, "2026-10-06");
    expect((await api.get("/allowance")).status).toBe("over");

    await add("INCOME", 100_000, "2026-09-05");
    await add("EXPENSE", 80_000, "2026-09-20");
    const allowance = await api.get("/allowance");
    expect(allowance.carryOver).toBe(20_000);
    expect(allowance.budget).toBe(12_744);
    expect(allowance.status).toBe("ok");
  });

  it("сентябрь в минусе — минус переходит в октябрь; август в счёт не идёт", async () => {
    const { api, add } = await setup();
    await add("INCOME", 50_000, "2026-10-05");
    await add("INCOME", 200_000, "2026-08-05");
    await add("INCOME", 40_000, "2026-09-05");
    await add("EXPENSE", 60_000, "2026-09-20");
    const allowance = await api.get("/allowance");
    expect(allowance.carryOver).toBe(-20_000);
    expect(allowance.budget).toBe(30_000);
  });

  it("перевод между своими счетами в прошлом месяце остатком не становится", async () => {
    const { api, card, add } = await setup();
    const cash = await api.post("/accounts", { name: "Наличные", type: "CASH", balance: "0" });
    await add("INCOME", 50_000, "2026-10-05");
    await api.post("/transactions", {
      action: "transfer",
      amount: "5000",
      fromAccountId: card.id,
      toAccountId: cash.id,
      date: "2026-09-15"
    });
    expect((await api.get("/allowance")).carryOver).toBe(0);
  });

  it("платёж по долгу в прошлом месяце — расход, как и в этом", async () => {
    const { api, card, add } = await setup();
    await add("INCOME", 50_000, "2026-10-05");
    await add("INCOME", 60_000, "2026-09-05");
    await api.post("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "100000",
      originalAmount: "100000",
      interestRate: "10",
      minPayment: "10000",
      dueDay: "1"
    });
    const debt = (await api.get("/debts")).liabilities[0];
    await api.post("/debts/pay", {
      id: debt.id,
      amount: "10000",
      accountId: card.id,
      date: "2026-09-25"
    });
    expect((await api.get("/allowance")).carryOver).toBe(50_000);
  });

  it("операция в валюте пересчитывается в основную, как в этом месяце", async () => {
    const { api, add } = await setup();
    const usd = await api.post("/accounts", {
      name: "Доллары",
      type: "DEBIT_CARD",
      balance: "0",
      currency: "USD"
    });
    await add("INCOME", 50_000, "2026-10-05");
    await api.post("/transactions", {
      type: "INCOME",
      amount: "100",
      accountId: usd.id,
      categoryId: "cat-salary",
      date: "2026-09-05"
    });
    // Курсов в документе нет — пересчёт идёт по встроенным.
    const expected = convert(100, "USD", "RUB", DEFAULT_CURRENCY_RATES);
    expect(expected).toBeGreaterThan(100);
    expect((await api.get("/allowance")).carryOver).toBeCloseTo(expected, 2);
  });
});
