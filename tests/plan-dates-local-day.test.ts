import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { goalDeadlineMarkers } from "@/lib/calendar/markers";
import { localCalendarDate, localDayOf, todayDay } from "@/lib/transactions/date";

// Плановая дата из формы («2026-01-31») разбиралась `new Date(...)` — как
// UTC-полночь. В Москве это 31-е, 03:00, и ошибки не было видно; западнее
// Гринвича это 30-е, вечер: аренда на 31-е проводилась 30-го, зарплата,
// заведённая в сам день выплаты, получала «через −1 день» и проводилась
// дважды. CI идёт в UTC, где всё сходится, поэтому пояс здесь задаётся явно.

const zone = process.env.TZ;

function inZone(tz: string) {
  process.env.TZ = tz;
}

afterEach(() => {
  vi.useRealTimers();
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

async function setup() {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  const account = await client.post("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "100000"
  });
  return { client, account };
}

describe.each(["America/New_York", "Europe/Moscow", "UTC"])("плановые даты в поясе %s", (tz) => {
  it("платёж на 31 января проводится 31-го, а не 30-го", async () => {
    inZone(tz);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 5, 12));
    const { client, account } = await setup();
    await client.post("/recurring", {
      amount: "1000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      frequency: "MONTHLY",
      nextDate: "2026-01-31",
      isActive: "true"
    });
    const stored = (await client.get("/recurring")).recurringTransactions[0];
    expect(todayDay(new Date(stored.nextDate))).toBe("2026-01-31");

    await client.post("/recurring/materialize-all", {});
    const posted = (await client.get("/transactions?limit=all")).transactions
      .map((row) => row.date.slice(0, 10))
      .sort();
    expect(posted).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("зарплата, заведённая в день выплаты, проводится один раз", async () => {
    inZone(tz);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 1, 12));
    const { client, account } = await setup();
    await client.post("/recurring", {
      amount: "50000",
      type: "INCOME",
      accountId: account.id,
      categoryId: "cat-salary",
      frequency: "MONTHLY",
      nextDate: "2026-03-01",
      isActive: "true"
    });
    const row = (await client.get("/recurring")).recurringTransactions[0];
    expect(row.daysUntilNext).toBe(0);

    await client.post("/recurring/materialize-all", {});
    const posted = (await client.get("/transactions?limit=all")).transactions.map((item) =>
      item.date.slice(0, 10)
    );
    expect(posted).toEqual(["2026-03-01"]);
  });

  it("прогноз ставит платёж на 31-е в клетку 31-го", async () => {
    inZone(tz);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 12, 12));
    const { client, account } = await setup();
    await client.post("/recurring", {
      amount: "1000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      frequency: "MONTHLY",
      nextDate: "2026-10-31",
      isActive: "true"
    });
    const forecast = await client.get("/forecast");
    expect(forecast.events[0].date.slice(0, 10)).toBe("2026-10-31");
  });

  it("срок цели остаётся тем днём, что выбрали в форме", async () => {
    inZone(tz);
    const { client } = await setup();
    const goal = await client.post("/goals", {
      title: "Отпуск",
      targetAmount: "200000",
      currentAmount: "0",
      deadline: "2026-12-31"
    });
    // Форма правки показывает срок в местном дне — так же читается и здесь.
    expect(todayDay(new Date(goal.deadline))).toBe("2026-12-31");
    expect(goalDeadlineMarkers([{ ...goal, progress: 0 }])[0].date).toBe("2026-12-31");
  });
});

describe("localCalendarDate / localDayOf", () => {
  it("голый день — местная полночь этого дня, остальное — как new Date", () => {
    inZone("America/New_York");
    const date = localCalendarDate("2026-01-31");
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 0, 31, 0
    ]);
    expect(localCalendarDate("2026-01-31T12:00:00.000Z").toISOString()).toBe(
      "2026-01-31T12:00:00.000Z"
    );
    expect(localDayOf("2026-12-31")).toBe("2026-12-31");
  });

  it("день срока читается в местном времени, а не из первых десяти знаков", () => {
    inZone("Europe/Moscow");
    // Полночь 31 декабря по Москве — в UTC это ещё 30-е.
    expect(localDayOf("2026-12-30T21:00:00.000Z")).toBe("2026-12-31");
    // Старые записи (UTC-полночь) в Москве по-прежнему тот же день.
    expect(localDayOf("2026-12-31T00:00:00.000Z")).toBe("2026-12-31");
  });
});
