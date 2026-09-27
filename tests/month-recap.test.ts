import { describe, expect, it } from "vitest";

import { buildMonthRecap, previousMonth, type RecapRow } from "@/lib/analytics/month-recap";

const row = (
  type: RecapRow["type"],
  date: string,
  amount: number,
  categoryId = "food",
  category = "Продукты"
): RecapRow => ({ type, date, amount, categoryId, category });

const rows: RecapRow[] = [
  row("INCOME", "2026-08-05", 100_000, "salary", "Зарплата"),
  row("EXPENSE", "2026-08-10", 20_000),
  row("EXPENSE", "2026-08-11", 10_000, "cafe", "Кафе"),
  row("INCOME", "2026-09-05", 100_000, "salary", "Зарплата"),
  row("EXPENSE", "2026-09-10", 22_000),
  row("EXPENSE", "2026-09-12", 18_000, "cafe", "Кафе"),
  row("EXPENSE", "2026-09-13", 5_000, "taxi", "Такси"),
  row("EXPENSE", "2026-10-01", 999_999)
];

describe("итоги месяца", () => {
  const recap = buildMonthRecap({
    month: "2026-09",
    rows,
    budgets: [
      { category: "Кафе", limitAmount: 15_000, spent: 18_000 },
      { category: "Продукты", limitAmount: 30_000, spent: 22_000 }
    ]
  });

  it("доходы, расходы и отложенное — только за этот месяц", () => {
    expect(recap.income).toBe(100_000);
    expect(recap.expense).toBe(45_000);
    expect(recap.saved).toBe(55_000);
    expect(recap.savedRate).toBe(55);
    expect(recap.previous.savedRate).toBe(70);
  });

  it("где потратили больше всего и что выросло", () => {
    expect(recap.top.map((c) => c.category)).toEqual(["Продукты", "Кафе", "Такси"]);
    // Кафе: 10 000 → 18 000 — больше всех в рублях.
    expect(recap.grew?.category).toBe("Кафе");
  });

  it("превышенные лимиты", () => {
    expect(recap.overBudget).toEqual([{ category: "Кафе", over: 3000 }]);
  });

  it("январь — предыдущий месяц в прошлом году", () => {
    expect(previousMonth("2027-01")).toBe("2026-12");
  });

  it("без дохода доля отложенного не выдумывается", () => {
    const empty = buildMonthRecap({ month: "2026-11", rows: [row("EXPENSE", "2026-11-02", 100)] });
    expect(empty.savedRate).toBeNull();
    expect(empty.grew).toBeNull();
  });
});

describe("итоги идущего месяца", () => {
  it("сравнивает с прошлым месяцем к тому же числу", () => {
    const recap = buildMonthRecap({
      month: "2026-09",
      asOfDay: 11,
      rows: [
        row("EXPENSE", "2026-08-10", 1_000),
        row("EXPENSE", "2026-08-25", 50_000),
        row("EXPENSE", "2026-09-10", 1_500),
        row("EXPENSE", "2026-09-20", 9_999)
      ]
    });
    expect(recap.expense).toBe(1_500);
    // 25 августа — после 11-го, в сравнение не идёт.
    expect(recap.previous.expense).toBe(1_000);
    expect(recap.asOfDay).toBe(11);
  });
});
