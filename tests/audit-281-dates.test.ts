import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { suggestedLimitFor } from "@/lib/budget-suggest";
import { plannedExpenseByDay, plannedOnDay } from "@/lib/calendar/planned";
import { formatPercent } from "@/lib/format";
import { buildNetWorthTrend } from "@/lib/net-worth";
import { parseDecimalInput } from "@/lib/number-input";
import { suggestFavorites, type FavoriteSource } from "@/lib/transactions/favorites";
import type { ForecastEvent } from "@/types/finance";

// Ошибки с датами, числами и вводом, найденные разбором 2.8.1. Каждая проверка
// падала до исправления. Пояс задаётся явно: CI идёт в UTC, где день из
// «2026-10-15T00:00:00.000Z» читается верно в любом случае.

const zone = process.env.TZ;

function inZone(tz: string, now: Date | (() => Date)) {
  process.env.TZ = tz;
  vi.useFakeTimers({ toFake: ["Date"] });
  // Дата строится после смены пояса — местное время уже нового пояса.
  vi.setSystemTime(typeof now === "function" ? now() : now);
}

afterEach(() => {
  vi.useRealTimers();
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

describe("«Можно тратить»: просроченный и сегодняшний плановый платёж", () => {
  // Прогноз ставит неподтверждённый платёж сегодняшним днём, а «впереди»
  // брало только дни после сегодня — аренда пропадала из бюджета целиком.
  it.each(["2026-10-15", "2026-10-14"])("платёж на %s уменьшает бюджет", async (nextDate) => {
    inZone("Europe/Moscow", () => new Date(2026, 9, 15, 12));
    const client = createClient();
    const card = await client.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "0"
    });
    await client.post("/transactions", {
      type: "INCOME",
      amount: "100000",
      accountId: card.id,
      categoryId: "cat-salary",
      date: "2026-10-05"
    });
    await client.post("/recurring", {
      amount: "30000",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: "cat-food",
      frequency: "MONTHLY",
      nextDate,
      isActive: "true"
    });

    expect((await client.get("/allowance")).budget).toBe(70000);
  });

  // Тот же платёж в календаре: клетка сегодняшнего дня его не показывала.
  it("календарь показывает неподтверждённый платёж в сегодняшней клетке", () => {
    const events: ForecastEvent[] = [
      {
        id: "rent-overdue",
        date: "2026-10-15T00:00:00.000Z",
        title: "Аренда",
        amount: 30000,
        type: "EXPENSE",
        category: "Жильё",
        account: "Карта"
      }
    ];
    expect(plannedExpenseByDay(events, "2026-10-15", "2026-10").get("2026-10-15")).toBe(30000);
    expect(plannedOnDay(events, "2026-10-15", "2026-10-15")).toHaveLength(1);
    // Прошедший день — уже история: плановое там не рисуется.
    expect(plannedOnDay(events, "2026-10-15", "2026-10-16")).toHaveLength(0);
  });
});

describe("прогноз к западу от Гринвича", () => {
  // `new Date("2026-11-15T00:00:00.000Z")` в Нью-Йорке — вечер 14-го: платёж
  // через 31 день попадал в «30 дней», а день в предупреждении — на день раньше.
  async function setup(amount: string, nextDate: string) {
    inZone("America/New_York", () => new Date(2026, 9, 15, 12));
    const client = createClient();
    const card = await client.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "10000"
    });
    await client.post("/recurring", {
      amount,
      type: "EXPENSE",
      accountId: card.id,
      categoryId: "cat-food",
      frequency: "YEARLY",
      nextDate,
      isActive: "true"
    });
    return client;
  }

  it("платёж через 31 день не входит в «30 дней»", async () => {
    const client = await setup("5000", "2026-11-15");
    const forecast = await client.get("/forecast");
    expect(forecast.plannedExpense30d).toBe(0);
    expect(forecast.plannedExpense90d).toBe(5000);
  });

  it("платёж через 8 дней не входит в точку «через неделю»", async () => {
    const client = await setup("5000", "2026-10-23");
    const forecast = await client.get("/forecast");
    expect(forecast.points[1].expense).toBe(0);
    expect(forecast.points[2].expense).toBe(5000);
  });

  it("день ухода в минус — тот, на который записан платёж", async () => {
    const client = await setup("20000", "2026-10-20");
    const forecast = await client.get("/forecast");
    const warning = forecast.warnings.find((item) => item.id === "negative-balance");
    expect(warning?.description).toContain("20 октября");
  });
});

describe("продажа доли бумаги", () => {
  // Количество округлялось как деньги, до сотых: из 0,01 продали 0,006 —
  // 0,004 превращалось в 0, и позиция исчезала.
  it("остаток 0,004 остаётся в портфеле и возвращается при удалении продажи", async () => {
    const client = createClient();
    await client.post("/investments", {
      action: "addPosition",
      ticker: "SBER",
      quantity: "0.01",
      averageBuyPrice: "300"
    });
    const sale = await client.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "0.006",
      sellPrice: "320",
      buyPrice: "300",
      fee: "0",
      date: "2026-10-10"
    });

    let data = await client.get("/investments");
    expect(data.portfolio.find((row) => row.ticker === "SBER")?.quantity).toBeCloseTo(0.004, 6);

    await client.delete(`/investments/events?id=${sale.id}`);
    data = await client.get("/investments");
    expect(data.portfolio.find((row) => row.ticker === "SBER")?.quantity).toBeCloseTo(0.01, 6);
  });
});

describe("местный день вместо UTC", () => {
  // Окно «два месяца» отсчитывалось от UTC-дня: в Москве в час ночи 15-го
  // это ещё 14-е, и в окно попадал лишний, 61-й день.
  it("избранное не считает трату 61 день назад", () => {
    inZone("Europe/Moscow", () => new Date(2026, 9, 15, 1));
    const row = (date: string): FavoriteSource => ({
      type: "EXPENSE",
      date: `${date}T00:00:00.000Z`,
      amount: 250,
      description: "Кофе",
      categoryId: "cat-food",
      categoryLabel: "Еда",
      accountId: "a1"
    });
    const rows = [row("2026-08-15"), row("2026-09-01"), row("2026-10-01")];
    expect(suggestFavorites(rows, { pinned: [], hidden: [] }, new Date())).toHaveLength(0);
  });

  // Доход 1 октября в Нью-Йорке читался как 30 сентября, вечер: точка
  // сентября на графике капитала уже включала октябрьскую зарплату.
  it("капитал на конец сентября не включает доход 1 октября", () => {
    inZone("America/New_York", () => new Date(2026, 9, 15, 12));
    const trend = buildNetWorthTrend({
      currentNetWorth: 100000,
      transactions: [{ date: "2026-10-01T00:00:00.000Z", type: "INCOME", amount: 1000 }],
      now: new Date(),
      monthsBack: 2
    });
    expect(trend.map((point) => point.value)).toEqual([99000, 100000]);
  });

  // Траты 1 августа в Нью-Йорке попадали в июль и выпадали из окна
  // «три последних месяца».
  it("подсказка лимита считает трату 1-го числа в её месяце", () => {
    inZone("America/New_York", () => new Date(2026, 9, 15, 12));
    const limit = suggestedLimitFor(
      "food",
      [
        {
          date: "2026-08-01T00:00:00.000Z",
          type: "EXPENSE",
          amount: 3000,
          category: { id: "food" }
        }
      ],
      { now: new Date() }
    );
    expect(limit).toBe(1000);
  });
});

describe("числа на экране и в форме", () => {
  // «66,7» в доле участника давало NaN, и доля молча пропадала; пустое поле
  // сигнала давало 0 — сигнал на нуле.
  it("дробь с запятой и пробелами читается, пустое — нет", () => {
    expect(parseDecimalInput("66,7")).toBe(66.7);
    expect(parseDecimalInput("1 000,5")).toBe(1000.5);
    expect(parseDecimalInput(" 12 ")).toBe(12);
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("   ")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
  });

  // −0,04 % округлялось до «-0 %», будто что-то ушло в минус.
  it("процент около нуля без минуса", () => {
    expect(formatPercent(-0.04, 1, "ru")).not.toMatch(/[-−]/);
    expect(formatPercent(-0.04, 1, "en")).not.toMatch(/[-−]/);
  });
});

describe("остаток не числом", () => {
  // NaN доходил до проверки книги, и человек видел «значение не подходит —
  // поле accounts.0.balance»; «1 000,50» с пробелом и запятой не принималось
  // вовсе. Теперь остаток читается как в остальных полях, а не число — понятный
  // отказ до записи.
  it("счёт: «1 000,50» принимается, «abc» — понятный отказ", async () => {
    const client = createClient();
    await expect(
      client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "abc" })
    ).rejects.toThrow("Остаток на счёте — число.");
    const account = await client.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "1\u00a0000,50"
    });
    expect(account.balance).toBe(1000.5);
  });

  it("долг: «1 000,50» принимается, «abc» — понятный отказ", async () => {
    const client = createClient();
    await expect(
      client.post("/debts", { name: "Кредит", kind: "LOAN", balance: "abc" })
    ).rejects.toThrow("Введите сумму от нуля.");
    await expect(
      client.post("/debts", { name: "Кредит", kind: "LOAN", balance: "100", minPayment: "x" })
    ).rejects.toThrow("Введите сумму от нуля.");
    const debt = await client.post("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "1 000,50",
      minPayment: "100,5"
    });
    expect(debt.balance).toBe(1000.5);
    expect(debt.minPayment).toBe(100.5);
  });
});
