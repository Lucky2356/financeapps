import { describe, expect, it } from "vitest";

import { depositOutlook, depositsEndingSoon } from "@/lib/accounts/deposits";
import { interestSchedule } from "@/lib/accounts/interest";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import {
  ANY_CATEGORY,
  bestCard,
  copyRules,
  monthCashback,
  type CashbackRule
} from "@/lib/cashback/cashback";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { deductionCsv, deductionYear, taxFromNetSalary } from "@/lib/tax/deductions";
import { activeTrip, tripTag, tripView } from "@/lib/trips/trips";

const rule = (over: Partial<CashbackRule>): CashbackRule => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  accountId: "tbank",
  month: "2026-09",
  categoryId: "food",
  percent: 5,
  ...over
});

describe("кэшбэк", () => {
  const rules = [
    rule({ id: "t-food", accountId: "tbank", categoryId: "food", percent: 5, limit: 100 }),
    rule({ id: "t-any", accountId: "tbank", categoryId: ANY_CATEGORY, percent: 1 }),
    rule({ id: "a-any", accountId: "alfa", categoryId: ANY_CATEGORY, percent: 1.5 })
  ];

  it("лучшая карта — по своей категории, иначе базовый процент", () => {
    expect(bestCard(rules, "food", "2026-09")).toEqual({ accountId: "tbank", percent: 5 });
    expect(bestCard(rules, "taxi", "2026-09")).toEqual({ accountId: "alfa", percent: 1.5 });
    expect(bestCard(rules, "food", "2026-10")).toBeNull();
  });

  it("пришло с учётом лимита, упущено — когда платили не той картой", () => {
    const summary = monthCashback(
      rules,
      [
        {
          id: "1",
          date: "2026-09-01",
          amount: 1500,
          accountId: "tbank",
          categoryId: "food",
          category: "Продукты"
        },
        // 5 % от 1500 = 75, из лимита 100 остаётся 25
        {
          id: "2",
          date: "2026-09-02",
          amount: 1000,
          accountId: "tbank",
          categoryId: "food",
          category: "Продукты"
        },
        // продукты картой Альфы: 1,5 % = 30 вместо 5 % (но лимит Т-Банка исчерпан — 0)
        {
          id: "3",
          date: "2026-09-03",
          amount: 2000,
          accountId: "alfa",
          categoryId: "food",
          category: "Продукты"
        }
      ],
      "2026-09"
    );
    expect(summary.earned).toBe(75 + 25 + 30);
    // лимит у Т-Банка съеден — лучше не было бы, упущенного нет
    expect(summary.missed).toBe(0);
  });

  it("копирование с прошлого месяца не дублирует заведённое", () => {
    let n = 0;
    const copied = copyRules(
      [...rules, rule({ id: "x", month: "2026-10", accountId: "tbank", categoryId: "food" })],
      "2026-09",
      "2026-10",
      () => `new-${++n}`
    );
    expect(copied.map((item) => `${item.accountId}|${item.categoryId}`)).toEqual([
      "tbank|*",
      "alfa|*"
    ]);
  });
});

describe("налоговый вычет", () => {
  const spend = (
    kind: Parameters<typeof deductionYear>[0]["spends"][number]["kind"],
    amount: number,
    date = "2026-03-01"
  ) => ({
    id: `${kind}-${amount}`,
    date,
    amount,
    kind,
    description: null,
    category: "x"
  });

  it("социальный — общий лимит 150 000, ИИС — 400 000, 13 %", () => {
    const year = deductionYear({
      year: 2026,
      taxPaid: null,
      spends: [spend("MEDICAL", 100_000), spend("SPORT", 80_000), spend("IIS", 500_000)]
    });
    expect(year.lines.map((line) => [line.group, line.counted, line.refund])).toEqual([
      ["SOCIAL", 150_000, 19_500],
      ["IIS", 400_000, 52_000]
    ]);
    expect(year.refund).toBe(71_500);
  });

  it("не больше уплаченного НДФЛ; дорогое лечение без лимита; дети — на каждого", () => {
    const year = deductionYear({
      year: 2026,
      taxPaid: 30_000,
      children: 2,
      spends: [spend("EXPENSIVE_MEDICAL", 400_000), spend("CHILD_EDUCATION", 250_000)]
    });
    expect(year.lines.find((line) => line.group === "CHILD_EDUCATION")?.counted).toBe(220_000);
    expect(year.possible).toBe(52_000 + 28_600);
    expect(year.refund).toBe(30_000);
    expect(year.cappedByTax).toBe(true);
  });

  it("НДФЛ по зарплате на руки и файл для декларации", () => {
    expect(taxFromNetSalary(87_000)).toBe(13_000);
    const csv = deductionCsv([spend("MEDICAL", 1234.5)], 2026, {
      MEDICAL: "Лечение",
      EXPENSIVE_MEDICAL: "",
      EDUCATION: "",
      SPORT: "",
      CHILD_EDUCATION: "",
      IIS: ""
    });
    expect(csv.startsWith("﻿Дата;")).toBe(true);
    expect(csv).toContain("2026-03-01;Лечение;x;;1234,50");
  });
});

describe("поездки", () => {
  const trip = {
    id: "t",
    name: "Турция 2026",
    from: "2026-09-20",
    to: "2026-09-29",
    budget: 1000,
    currency: "USD",
    tag: "турция-2026"
  };

  it("метка из названия, идущая поездка по дате", () => {
    expect(tripTag("Турция 2026")).toBe("турция-2026");
    expect(activeTrip([trip], "2026-09-28")?.id).toBe("t");
    expect(activeTrip([trip], "2026-09-30")).toBeNull();
  });

  it("потрачено, осталось и сколько можно в день", () => {
    const view = tripView(
      trip,
      [
        {
          date: "2026-09-21",
          amount: 300,
          categoryId: "cafe",
          category: "Кафе",
          tags: ["турция-2026"]
        },
        {
          date: "2026-09-22",
          amount: 100,
          categoryId: "taxi",
          category: "Такси",
          tags: ["турция-2026"]
        },
        { date: "2026-09-22", amount: 999, categoryId: "food", category: "Продукты", tags: [] }
      ],
      "2026-09-28"
    );
    expect(view.spent).toBe(400);
    expect(view.left).toBe(600);
    expect(view.daysLeft).toBe(2);
    expect(view.perDayLeft).toBe(300);
    expect(view.byCategory[0]).toMatchObject({ category: "Кафе", amount: 300 });
  });
});

describe("вклады", () => {
  const today = new Date(2026, 8, 28);

  it("проценты идут до конца вклада и не дальше", () => {
    const account = {
      id: "d",
      name: "Вклад",
      balance: 100_000,
      interestRate: 12,
      interestCompounding: "MONTHLY" as const,
      depositEndsOn: "2026-12-28"
    };
    expect(interestSchedule(account, today, 365)).toHaveLength(3);
    const outlook = depositOutlook(account, today);
    expect(outlook?.daysLeft).toBe(91);
    expect(outlook?.untilEnd).toBeCloseTo(3030.1, 0);
    expect(outlook?.atEnd).toBeCloseTo(103_030.1, 0);
  });

  it("за неделю до конца — в напоминания", () => {
    const soon = depositsEndingSoon(
      [
        { id: "a", name: "A", balance: 1, depositEndsOn: "2026-10-02" },
        { id: "b", name: "B", balance: 1, depositEndsOn: "2026-11-02" },
        { id: "c", name: "C", balance: 0, depositEndsOn: "2026-09-29" }
      ],
      today
    );
    expect(soon.map((item) => [item.account.id, item.daysLeft])).toEqual([["a", 4]]);
  });
});

describe("через приложение", () => {
  async function setup() {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const card = await client.post<{ id: string }>("/accounts", {
      name: "Т-Банк",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const { categories } = await client.get("/categories");
    const food = categories.find((category) => category.name === "Продукты")!;
    return { client, card, food };
  }
  const todayIso = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  it("кэшбэк: условие, итог месяца", async () => {
    const { client, card, food } = await setup();
    const month = todayIso().slice(0, 7);
    await client.post("/cashback", {
      month,
      accountId: card.id,
      categoryId: food.id,
      percent: "5"
    });
    await client.post("/transactions", {
      amount: "2000",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: food.id,
      date: todayIso()
    });
    // Погашение кредита с той же карты — не покупка, кэшбэка за него нет.
    await client.post("/transactions", {
      amount: "30000",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: food.id,
      date: todayIso(),
      liabilityId: "debt-1"
    });
    const page = await client.get(`/cashback?month=${month}`);
    expect(page.rules).toHaveLength(1);
    expect(page.summary.earned).toBe(100);
  });

  it("поездка: новая трата получает метку сама, «не отмечать» уважается", async () => {
    const { client, card, food } = await setup();
    await client.post("/trips", {
      name: "Казань",
      from: todayIso(),
      to: todayIso(),
      budget: "30000",
      currency: "RUB"
    });
    const tagged = await client.post<{ tags?: string[] }>("/transactions", {
      amount: "1500",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: food.id,
      date: todayIso()
    });
    expect(tagged.tags).toEqual(["казань"]);
    const skipped = await client.post<{ tags?: string[] }>("/transactions", {
      amount: "700",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: food.id,
      date: todayIso(),
      noTrip: "1"
    });
    expect(skipped.tags).toBeUndefined();
    // Платёж по долгу и перевод между своими счетами — не траты поездки.
    const debt = await client.post<{ tags?: string[] }>("/transactions", {
      amount: "25000",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: food.id,
      date: todayIso(),
      liabilityId: "debt-1"
    });
    expect(debt.tags).toBeUndefined();
    const cash = await client.post<{ id: string }>("/accounts", {
      name: "Наличные",
      type: "CASH",
      balance: "0"
    });
    await client.post("/transactions", {
      action: "transfer",
      fromAccountId: card.id,
      toAccountId: cash.id,
      amount: "5000",
      date: todayIso()
    });
    const ledger = await client.get("/transactions?period=all");
    expect(ledger.transactions.filter((row) => row.transferId && row.tags?.length)).toEqual([]);
    const trips = await client.get("/trips");
    expect(trips.active?.spent).toBe(1500);
  });

  it("вычет: отметили категорию — траты в вычете", async () => {
    const { client, card, food } = await setup();
    await client.post("/deductions", { action: "mark", categoryId: food.id, kind: "MEDICAL" });
    await client.post("/transactions", {
      amount: "10000",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: food.id,
      date: todayIso()
    });
    await client.post("/deductions", { year: new Date().getFullYear(), taxPaid: "50000" });
    const page = await client.get(`/deductions?year=${new Date().getFullYear()}`);
    expect(page.refund).toBe(1300);
    expect(page.taxEstimated).toBe(false);
    expect(page.marked).toEqual([{ categoryId: food.id, kind: "MEDICAL" }]);
  });

  it("вклад: дата окончания сохраняется, конец на неделе — предупреждение в прогнозе", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const endsOn = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    await client.post("/accounts", {
      name: "Вклад",
      type: "SAVINGS",
      balance: "200000",
      interestRate: "15",
      depositEndsOn: endsOn
    });
    const forecast = await client.get("/forecast");
    expect(forecast.warnings.some((warning) => warning.id.startsWith("deposit-"))).toBe(true);
  });
});

describe("кэшбэк: правка условия", () => {
  it("правка на уже занятую категорию оставляет одно условие", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const card = await client.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "0"
    });
    const { categories } = await client.get("/categories");
    const expense = categories.filter((category) => category.kind === "EXPENSE");
    const month = "2026-09";
    await client.post("/cashback", {
      month,
      accountId: card.id,
      categoryId: expense[0].id,
      percent: "5"
    });
    const second = await client.post<{ id: string }>("/cashback", {
      month,
      accountId: card.id,
      categoryId: expense[1].id,
      percent: "3"
    });
    await client.post("/cashback", {
      id: second.id,
      month,
      accountId: card.id,
      categoryId: expense[0].id,
      percent: "7"
    });
    const page = await client.get(`/cashback?month=${month}`);
    expect(page.rules).toHaveLength(1);
    expect(page.rules[0]).toMatchObject({ categoryId: expense[0].id, percent: 7 });
  });
});
