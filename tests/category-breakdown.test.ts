import { describe, expect, it } from "vitest";

import { categoryBreakdown, topCategories } from "@/lib/categories/breakdown";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/categories/palette";

const rows = [
  { type: "INCOME", amount: 80000, date: "2026-08-05", category: { id: "sal", label: "Зарплата" } },
  { type: "INCOME", amount: 12000, date: "2026-08-20", category: { id: "sal", label: "Зарплата" } },
  {
    type: "INCOME",
    amount: 30000,
    date: "2026-08-11",
    category: { id: "fre", label: "Подработка" }
  },
  // Last month — outside the window.
  { type: "INCOME", amount: 99000, date: "2026-07-05", category: { id: "sal", label: "Зарплата" } },
  // Spending must not leak into the income breakdown.
  { type: "EXPENSE", amount: 5000, date: "2026-08-06", category: { id: "food", label: "Продукты" } }
];

const colors: Record<string, string> = { sal: "#9184d9", fre: "#6fc3ad" };
const colorOf = (id: string) => colors[id];

describe("category breakdown", () => {
  it("adds up one month of one kind, largest slice first", () => {
    expect(categoryBreakdown(rows, { type: "INCOME", month: "2026-08", colorOf })).toEqual([
      { name: "Зарплата", value: 92000, fill: "#9184d9" },
      { name: "Подработка", value: 30000, fill: "#6fc3ad" }
    ]);
  });

  it("keeps expenses and income apart", () => {
    const expenses = categoryBreakdown(rows, { type: "EXPENSE", month: "2026-08", colorOf });
    expect(expenses).toEqual([{ name: "Продукты", value: 5000, fill: DEFAULT_CATEGORY_COLOR }]);
  });

  it("counts every row when no month is given", () => {
    const all = categoryBreakdown(rows, { type: "INCOME", colorOf });
    expect(all[0]).toEqual({ name: "Зарплата", value: 191000, fill: "#9184d9" });
  });

  // A slice with no colour would render invisible against the card, which reads
  // as missing data rather than as a category someone forgot to paint.
  it("falls back to the neutral colour instead of drawing nothing", () => {
    const [slice] = categoryBreakdown(rows, {
      type: "INCOME",
      month: "2026-08",
      colorOf: () => undefined
    });
    expect(slice.fill).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it("returns an empty list rather than zero-width slices", () => {
    expect(categoryBreakdown([], { type: "INCOME", colorOf })).toEqual([]);
    const zeroes = [
      { type: "INCOME", amount: 0, date: "2026-08-01", category: { id: "sal", label: "З" } }
    ];
    expect(categoryBreakdown(zeroes, { type: "INCOME", colorOf })).toEqual([]);
  });
});

describe("top categories", () => {
  it("ranks a period and gives each its share of it", () => {
    const ranked = topCategories(rows, { type: "INCOME", since: "2026-07", colorOf });

    // 92 000 + 30 000 + 99 000 = 221 000 across two categories.
    expect(ranked).toEqual([
      { categoryId: "sal", category: "Зарплата", color: "#9184d9", total: 191000, share: 86.4 },
      { categoryId: "fre", category: "Подработка", color: "#6fc3ad", total: 30000, share: 13.6 }
    ]);
    expect(ranked[0].share + ranked[1].share).toBeCloseTo(100, 1);
  });

  it("starts at the given date and ignores anything older", () => {
    const ranked = topCategories(rows, { type: "INCOME", since: "2026-08", colorOf });
    expect(ranked.map((item) => item.total)).toEqual([92000, 30000]);
  });

  it("lists every category, and only as many as asked for", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      type: "INCOME",
      amount: 100 * (index + 1),
      date: "2026-08-01",
      category: { id: `c${index}`, label: `Категория ${index}` }
    }));
    // Without a limit the ranking is complete: a ring drawn from it adds up to
    // the period it claims to show.
    expect(topCategories(many, { type: "INCOME", since: "2026-08", colorOf }).length).toBe(10);
    expect(
      topCategories(many, { type: "INCOME", since: "2026-08", colorOf, limit: 3 }).length
    ).toBe(3);
    // The shares still describe the whole period, whatever is listed.
    const short = topCategories(many, { type: "INCOME", since: "2026-08", colorOf, limit: 3 });
    expect(short.reduce((sum, item) => sum + item.share, 0)).toBeLessThan(100);
  });

  it("reports zero shares instead of dividing by nothing", () => {
    expect(topCategories([], { type: "INCOME", since: "2026-08", colorOf })).toEqual([]);
  });
});
