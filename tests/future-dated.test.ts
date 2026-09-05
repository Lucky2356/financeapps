import { describe, expect, it } from "vitest";

import { futureDated, isFutureDay, todayDay } from "@/lib/transactions/date";

// An operation dated ahead of today is counted the moment it is saved: it leaves
// the balance and the net worth straight away. For a deliberate post-dating that
// is right; for a year typed wrong it is a silently wrong headline figure. These
// guard the counting the screen uses to stop being silent about it.
const NOW = new Date(2026, 8, 5); // 5 сентября 2026, local
const day = (d: string) => `${d}T00:00:00.000Z`;

describe("операции с датой в будущем", () => {
  it("сегодняшний день будущим не считается", () => {
    expect(isFutureDay(day(todayDay(NOW)), NOW)).toBe(false);
  });

  it("завтрашний — считается", () => {
    expect(isFutureDay(day("2026-09-06"), NOW)).toBe(true);
  });

  it("вчерашний — нет", () => {
    expect(isFutureDay(day("2026-09-04"), NOW)).toBe(false);
  });

  // The whole point: a year mistyped is a year out, not a day.
  it("считает промах в годе", () => {
    const rows = [
      { date: day("2026-09-01"), amount: 1000, type: "EXPENSE" },
      { date: day("2027-03-15"), amount: 50000, type: "EXPENSE" }
    ];
    expect(futureDated(rows, NOW)).toEqual({ count: 1, net: -50000 });
  });

  it("сводит доходы и расходы в одно число со знаком", () => {
    const rows = [
      { date: day("2026-12-01"), amount: 80000, type: "INCOME" },
      { date: day("2026-12-05"), amount: 30000, type: "EXPENSE" }
    ];
    expect(futureDated(rows, NOW)).toEqual({ count: 2, net: 50000 });
  });

  it("на книге без будущих дат отдаёт нули", () => {
    const rows = [{ date: day("2026-08-01"), amount: 500, type: "EXPENSE" }];
    expect(futureDated(rows, NOW)).toEqual({ count: 0, net: 0 });
  });

  // Local calendar, not UTC: east of Greenwich `toISOString()` on a local
  // midnight lands on the previous day, and "сегодня" would read as future.
  it("сегодня не становится будущим из-за часового пояса", () => {
    const lateEvening = new Date(2026, 8, 5, 23, 30);
    expect(isFutureDay(day("2026-09-05"), lateEvening)).toBe(false);
  });
});
