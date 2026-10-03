import { describe, expect, it } from "vitest";

import { compareMonths, type CompareRow } from "@/lib/analytics/compare-months";

const row = (date: string, amount: number, category = "food", type = "EXPENSE"): CompareRow => ({
  type,
  date,
  amount,
  categoryId: category,
  category
});

describe("сравнение месяцев", () => {
  it("по статьям: изменение в рублях и процентах, крупное первым; новое — без процента", () => {
    const result = compareMonths({
      a: "2026-09",
      b: "2026-08",
      today: "2026-10-03",
      rows: [
        row("2026-09-05", 12000),
        row("2026-08-05", 10000),
        row("2026-09-10", 30000, "trip"),
        row("2026-08-20", 500, "cafe"),
        row("2026-09-01", 90000, "salary", "INCOME")
      ]
    });
    expect(result.asOfDay).toBeNull();
    expect(result.expense.map((line) => [line.category, line.change, line.percent])).toEqual([
      ["trip", 30000, null],
      ["food", 2000, 20],
      ["cafe", -500, -100]
    ]);
    expect(result.totals).toMatchObject({ expenseA: 42000, expenseB: 10500, incomeA: 90000 });
  });

  it("месяц ещё идёт: второй берётся до того же числа", () => {
    const result = compareMonths({
      a: "2026-10",
      b: "2026-09",
      today: "2026-10-03",
      rows: [row("2026-10-02", 1000), row("2026-09-02", 800), row("2026-09-25", 5000)]
    });
    expect(result.asOfDay).toBe(3);
    expect(result.expense[0]).toMatchObject({ a: 1000, b: 800, percent: 25 });
  });
});
