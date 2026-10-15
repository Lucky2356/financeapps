import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  detectPayday,
  detectPaydays,
  forecastToPayday,
  nextPayday,
  nextPaydayDate,
  parsePaydaySchedule,
  serializePaydaySchedule,
  type IncomeRow,
  type PaydaySchedule
} from "@/lib/analytics/payday";
import {
  describePaydaySchedule,
  paydayDate,
  paydayDays,
  paydayHeadline,
  paydayMoneyLine
} from "@/components/dashboard/payday-text";
import { loadLocale } from "@/lib/i18n/catalog";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

const monthly = (...days: Array<number | "last">): PaydaySchedule => ({ kind: "monthly", days });
const weekly = (weekday: number): PaydaySchedule => ({ kind: "weekly", weekday });
const daily: PaydaySchedule = { kind: "daily" };

describe("хватит ли до зарплаты", () => {
  it("день зарплаты — по самому крупному поступлению каждого месяца, «зарплатные» статьи важнее", () => {
    expect(
      detectPayday([
        { date: "2026-07-10", amount: 90000, category: "Зарплата" },
        { date: "2026-07-25", amount: 40000, category: "Зарплата" },
        { date: "2026-08-11", amount: 90000, category: "Зарплата" },
        { date: "2026-08-03", amount: 150000, category: "Продажа машины" },
        { date: "2026-09-10", amount: 90000, category: "Зарплата" }
      ])
    ).toBe(10);
    expect(detectPayday([{ date: "2026-09-10", amount: 90000, category: "Зарплата" }])).toBeNull();
  });

  it("ближайшая зарплата: в этом месяце, если ещё впереди, иначе в следующем; 31-е в феврале — последний день", () => {
    expect(nextPayday("2026-10-03", 10)).toBe("2026-10-10");
    expect(nextPayday("2026-10-10", 10)).toBe("2026-11-10");
    expect(nextPayday("2026-12-20", 5)).toBe("2027-01-05");
    expect(nextPayday("2027-02-01", 31)).toBe("2027-02-28");
  });

  it("свободно = на картах − платежи до зарплаты; не хватает — «short», меньше обычного — «tight»", () => {
    const base = {
      today: "2026-10-01",
      schedule: monthly(10),
      source: "history" as const,
      payments: [
        { date: "2026-10-05", amount: 6000, title: "Интернет" },
        { date: "2026-10-10", amount: 30000, title: "Аренда" },
        { date: "2026-11-01", amount: 999, title: "Позже" }
      ]
    };
    const ok = forecastToPayday({ ...base, liquid: 24000, usualPerDay: 1000 });
    expect(ok).toMatchObject({
      daysLeft: 9,
      upcoming: 6000,
      free: 18000,
      perDay: 2000,
      status: "ok"
    });
    expect(ok.payments.map((item) => item.title)).toEqual(["Интернет"]);
    expect(forecastToPayday({ ...base, liquid: 10000, usualPerDay: 1000 }).status).toBe("tight");
    expect(forecastToPayday({ ...base, liquid: 5000, usualPerDay: 1000 })).toMatchObject({
      status: "short",
      free: -1000
    });
  });
});

describe("расписание зарплаты: строка на устройстве", () => {
  it("старая запись — одно число — читается как раньше", () => {
    expect(parsePaydaySchedule("10")).toEqual(monthly(10));
    expect(parsePaydaySchedule("31")).toEqual(monthly(31));
  });

  it("несколько чисел, последний день, неделя, каждый день", () => {
    expect(parsePaydaySchedule("25,10,10")).toEqual(monthly(10, 25));
    expect(parsePaydaySchedule("last,10")).toEqual(monthly(10, "last"));
    expect(parsePaydaySchedule("week:5")).toEqual(weekly(5));
    expect(parsePaydaySchedule("week:7")).toEqual(weekly(7));
    expect(parsePaydaySchedule("daily")).toEqual(daily);
  });

  it("пусто и непонятное — по истории", () => {
    for (const raw of [null, undefined, "", " ", "0", "32", "10,abc", "week:0", "week:8", "x"])
      expect(parsePaydaySchedule(raw)).toBeNull();
  });

  it("туда и обратно — то же самое", () => {
    for (const schedule of [monthly(10, 25), monthly("last"), weekly(1), daily])
      expect(parsePaydaySchedule(serializePaydaySchedule(schedule))).toEqual(schedule);
    expect(serializePaydaySchedule(null)).toBe("");
    expect(serializePaydaySchedule(monthly(25, 10, "last"))).toBe("10,25,last");
  });
});

describe("ближайшая выплата по расписанию", () => {
  it("числа месяца: ближайшее впереди; сегодняшнее уже пришло", () => {
    expect(nextPaydayDate("2026-10-13", monthly(10, 25))).toBe("2026-10-25");
    expect(nextPaydayDate("2026-10-10", monthly(10, 25))).toBe("2026-10-25");
    expect(nextPaydayDate("2026-10-25", monthly(10, 25))).toBe("2026-11-10");
    expect(nextPaydayDate("2026-10-30", monthly(10, 25))).toBe("2026-11-10");
    expect(nextPaydayDate("2026-12-26", monthly(10, 25))).toBe("2027-01-10");
  });

  it("последний день месяца и 31-е в коротком месяце", () => {
    expect(nextPaydayDate("2026-09-29", monthly("last"))).toBe("2026-09-30");
    expect(nextPaydayDate("2026-09-30", monthly("last"))).toBe("2026-10-31");
    expect(nextPaydayDate("2026-09-15", monthly(31))).toBe("2026-09-30");
    expect(nextPaydayDate("2026-09-30", monthly(31))).toBe("2026-10-31");
    expect(nextPaydayDate("2027-02-01", monthly(30, "last"))).toBe("2027-02-28");
    expect(nextPaydayDate("2028-02-01", monthly(31))).toBe("2028-02-29");
    // 29-е в феврале 2027 — это 28-е; 28-го оно уже пришло, следующее — в марте.
    expect(nextPaydayDate("2027-02-28", monthly(29))).toBe("2027-03-29");
    expect(nextPaydayDate("2027-01-31", monthly(15, "last"))).toBe("2027-02-15");
  });

  it("раз в неделю: ближайший такой день; сегодня — значит, через неделю", () => {
    // 13.10.2026 — вторник.
    expect(nextPaydayDate("2026-10-13", weekly(5))).toBe("2026-10-16");
    expect(nextPaydayDate("2026-10-13", weekly(2))).toBe("2026-10-20");
    expect(nextPaydayDate("2026-10-13", weekly(1))).toBe("2026-10-19");
    expect(nextPaydayDate("2026-10-13", weekly(7))).toBe("2026-10-18");
    expect(nextPaydayDate("2026-12-29", weekly(5))).toBe("2027-01-01");
    expect(nextPaydayDate("2028-02-27", weekly(2))).toBe("2028-02-29");
  });

  it("каждый день — завтра, через конец месяца и года", () => {
    expect(nextPaydayDate("2026-10-13", daily)).toBe("2026-10-14");
    expect(nextPaydayDate("2026-10-31", daily)).toBe("2026-11-01");
    expect(nextPaydayDate("2026-12-31", daily)).toBe("2027-01-01");
    expect(nextPaydayDate("2028-02-28", daily)).toBe("2028-02-29");
  });
});

describe("прогноз в каждом режиме", () => {
  const payments = [
    { date: "2026-10-13", amount: 1000, title: "Сегодня" },
    { date: "2026-10-14", amount: 2000, title: "Завтра" },
    { date: "2026-10-20", amount: 3000, title: "Через неделю" },
    { date: "2026-10-25", amount: 4000, title: "В день зарплаты" }
  ];
  const run = (schedule: PaydaySchedule) =>
    forecastToPayday({
      today: "2026-10-13",
      schedule,
      source: "manual",
      liquid: 30000,
      payments,
      usualPerDay: 0
    });

  it("аванс и зарплата: до ближайшей из двух", () => {
    expect(run(monthly(10, 25))).toMatchObject({
      nextDate: "2026-10-25",
      daysLeft: 12,
      upcoming: 6000,
      free: 24000,
      perDay: 2000
    });
  });

  it("сегодня день зарплаты — до следующей, сегодняшние платежи в счёт", () => {
    expect(run(monthly(13, 28))).toMatchObject({
      nextDate: "2026-10-28",
      daysLeft: 15,
      upcoming: 10000,
      free: 20000
    });
  });

  it("раз в неделю: до пятницы три дня", () => {
    expect(run(weekly(5))).toMatchObject({
      nextDate: "2026-10-16",
      daysLeft: 3,
      upcoming: 3000,
      free: 27000,
      perDay: 9000
    });
  });

  it("каждый день: один день, всё свободное — на сегодня", () => {
    expect(run(daily)).toMatchObject({
      nextDate: "2026-10-14",
      daysLeft: 1,
      upcoming: 1000,
      free: 29000,
      perDay: 29000,
      schedule: daily
    });
  });
});

describe("аванс и зарплата по истории", () => {
  const salary = (date: string, amount: number, category = "Зарплата"): IncomeRow => ({
    date,
    amount,
    category
  });

  it("два крупных поступления каждый месяц — два дня", () => {
    expect(
      detectPaydays([
        salary("2026-07-10", 40000, "Аванс"),
        salary("2026-07-25", 60000),
        salary("2026-08-11", 40000, "Аванс"),
        salary("2026-08-24", 60000),
        salary("2026-09-09", 40000, "Аванс"),
        salary("2026-09-25", 60000)
      ])
    ).toEqual([10, 25]);
  });

  it("второе поступление было один раз из трёх — один день, как прежде", () => {
    expect(
      detectPaydays([
        salary("2026-07-10", 90000),
        salary("2026-07-25", 40000),
        salary("2026-08-11", 90000),
        salary("2026-09-10", 90000)
      ])
    ).toEqual([10]);
  });

  it("идущий и самый первый месяц без второй выплаты не мешают", () => {
    expect(
      detectPaydays(
        [
          salary("2026-07-25", 60000),
          salary("2026-08-10", 40000),
          salary("2026-08-25", 60000),
          salary("2026-09-10", 40000),
          salary("2026-09-25", 60000),
          salary("2026-10-10", 40000)
        ],
        "2026-10-13"
      )
    ).toEqual([10, 25]);
  });

  it("мелкое второе поступление и две строки одной выплаты — не аванс", () => {
    const small = [
      salary("2026-08-10", 90000),
      salary("2026-08-25", 5000),
      salary("2026-09-10", 90000),
      salary("2026-09-25", 5000)
    ];
    expect(detectPaydays(small)).toEqual([10]);
    const split = [
      salary("2026-08-10", 50000),
      salary("2026-08-12", 50000),
      salary("2026-09-10", 50000),
      salary("2026-09-12", 50000)
    ];
    expect(detectPaydays(split)).toHaveLength(1);
  });

  it("дни скачут больше чем на три — не уверены, один день", () => {
    expect(
      detectPaydays([
        salary("2026-07-03", 40000),
        salary("2026-07-25", 60000),
        salary("2026-08-12", 40000),
        salary("2026-08-25", 60000),
        salary("2026-09-20", 40000),
        salary("2026-09-28", 60000)
      ])
    ).toHaveLength(1);
  });

  it("меньше двух месяцев истории — не угадываем вовсе", () => {
    expect(detectPaydays([salary("2026-09-10", 40000), salary("2026-09-25", 60000)])).toBeNull();
  });
});

describe("слова карточки", () => {
  beforeAll(async () => {
    await loadLocale("en");
  });
  const money = (value: number) => `${value} ₽`;

  it("расписание словами", () => {
    expect(describePaydaySchedule(monthly(10), "ru")).toBe("10-го числа");
    expect(describePaydaySchedule(monthly(10, 25), "ru")).toBe("10-го и 25-го числа");
    expect(describePaydaySchedule(monthly(5, 15, 25), "ru")).toBe("5-го, 15-го и 25-го числа");
    expect(describePaydaySchedule(monthly(10, "last"), "ru")).toBe(
      "10-го числа и в последний день месяца"
    );
    expect(describePaydaySchedule(monthly("last"), "ru")).toBe("в последний день месяца");
    expect(describePaydaySchedule(weekly(5), "ru")).toBe("каждую пятницу");
    expect(describePaydaySchedule(weekly(1), "ru")).toBe("каждый понедельник");
    expect(describePaydaySchedule(weekly(7), "ru")).toBe("каждое воскресенье");
    expect(describePaydaySchedule(daily, "ru")).toBe("каждый день");
    expect(describePaydaySchedule(monthly(1, 22, 23), "en")).toBe("on the 1st, 22nd, and 23rd");
    expect(describePaydaySchedule(weekly(5), "en")).toBe("every Friday");
  });

  it("дни со склонением", () => {
    expect(paydayDays(1, "ru")).toBe("1 день");
    expect(paydayDays(2, "ru")).toBe("2 дня");
    expect(paydayDays(5, "ru")).toBe("5 дней");
    expect(paydayDays(21, "ru")).toBe("21 день");
    expect(paydayDays(22, "ru")).toBe("22 дня");
    expect(paydayDays(30, "ru")).toBe("30 дней");
    expect(paydayDays(1, "en")).toBe("1 day");
    expect(paydayDays(12, "en")).toBe("12 days");
  });

  it("заголовок: каждый день, завтра, через N дней", () => {
    expect(paydayHeadline({ schedule: daily, daysLeft: 1 }, "ru", "14 окт.")).toBe(
      "Зарплата каждый день"
    );
    expect(paydayHeadline({ schedule: monthly(14), daysLeft: 1 }, "ru", "14 окт.")).toBe(
      "Зарплата завтра, 14 окт."
    );
    expect(paydayHeadline({ schedule: monthly(10, 25), daysLeft: 22 }, "ru", "4 нояб.")).toBe(
      "До зарплаты 22 дня (4 нояб.)"
    );
    expect(paydayHeadline({ schedule: monthly(9), daysLeft: 30 }, "en", "9 Nov")).toBe(
      "30 days to payday (9 Nov)"
    );
  });

  it("сумма: при одном дне — «до завтра», без «в день»", () => {
    const one = { status: "ok" as const, free: 2900, perDay: 2900, daysLeft: 1 };
    expect(paydayMoneyLine(one, "ru", money)).toBe("До завтра свободно 2900 ₽");
    expect(paydayMoneyLine({ ...one, status: "short", free: -500, perDay: 0 }, "ru", money)).toBe(
      "До завтра не хватает 500 ₽"
    );
    expect(
      paydayMoneyLine({ status: "ok", free: 9000, perDay: 3000, daysLeft: 3 }, "ru", money)
    ).toBe("Свободно 9000 ₽ — 3000 ₽ в день");
    expect(
      paydayMoneyLine({ status: "short", free: -700, perDay: 0, daysLeft: 3 }, "ru", money)
    ).toBe("До зарплаты не хватает 700 ₽");
  });

  it("дата коротко, с днём недели для недельной зарплаты", () => {
    expect(paydayDate("2026-11-09", "ru")).toBe("9 нояб.");
    expect(paydayDate("2026-10-16", "ru", true)).toBe("пт, 16 окт.");
  });
});

describe("ручка /payday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 12));
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "30000"
    });
    for (const [date, amount] of [
      ["2026-08-10", "40000"],
      ["2026-08-25", "60000"],
      ["2026-09-10", "40000"],
      ["2026-09-25", "60000"],
      ["2026-10-10", "40000"]
    ])
      await api.post("/transactions", {
        type: "INCOME",
        amount,
        accountId: card.id,
        categoryId: "cat-salary",
        date
      });
    return api;
  }

  it("по истории — аванс и зарплата, до ближайшей", async () => {
    const api = await setup();
    const { forecast, detected } = await api.get("/payday");
    expect(detected).toEqual([10, 25]);
    expect(forecast).toMatchObject({
      source: "history",
      schedule: monthly(10, 25),
      nextDate: "2026-10-25",
      daysLeft: 12
    });
  });

  it("указанное расписание важнее истории; старое ?day= тоже понимается", async () => {
    const api = await setup();
    expect((await api.get("/payday?schedule=daily")).forecast).toMatchObject({
      source: "manual",
      nextDate: "2026-10-14",
      daysLeft: 1
    });
    expect((await api.get("/payday?schedule=week%3A5")).forecast?.nextDate).toBe("2026-10-16");
    expect((await api.get("/payday?schedule=15%2Clast")).forecast?.nextDate).toBe("2026-10-15");
    expect((await api.get("/payday?day=20")).forecast).toMatchObject({
      source: "manual",
      schedule: monthly(20),
      nextDate: "2026-10-20"
    });
    // Так зовёт Лоли: строка расписания в ?day= как есть.
    expect((await api.get("/payday?day=week:1")).forecast?.nextDate).toBe("2026-10-19");
    // Мусор — по истории, а не ошибка.
    expect((await api.get("/payday?schedule=nonsense")).forecast?.source).toBe("history");
  });
});
