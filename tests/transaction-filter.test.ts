import { describe, expect, it } from "vitest";

import {
  criteriaFromParams,
  filterTransactions,
  matchesCriteria,
  parseCategoryIds,
  type FilterableTransaction
} from "@/lib/transactions/filter";

function tx(overrides: Partial<FilterableTransaction> = {}): FilterableTransaction {
  return {
    date: "2026-05-10",
    type: "EXPENSE",
    amount: 1000,
    description: "Пятёрочка продукты",
    account: { id: "acc-1", label: "Карта" },
    category: { id: "cat-food", label: "Продукты" },
    ...overrides
  };
}

describe("parseCategoryIds", () => {
  it("splits a comma-separated list and trims", () => {
    expect(parseCategoryIds("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("returns empty for null/empty", () => {
    expect(parseCategoryIds(null)).toEqual([]);
    expect(parseCategoryIds("")).toEqual([]);
  });
});

describe("matchesCriteria", () => {
  it("filters by date range inclusively", () => {
    expect(
      matchesCriteria(tx({ date: "2026-05-10" }), { from: "2026-05-01", to: "2026-05-31" })
    ).toBe(true);
    expect(matchesCriteria(tx({ date: "2026-04-30" }), { from: "2026-05-01" })).toBe(false);
    expect(matchesCriteria(tx({ date: "2026-06-01" }), { to: "2026-05-31" })).toBe(false);
  });

  it("filters by type", () => {
    expect(matchesCriteria(tx({ type: "INCOME" }), { type: "EXPENSE" })).toBe(false);
    expect(matchesCriteria(tx({ type: "INCOME" }), { type: "ALL" })).toBe(true);
  });

  it("filters by multiple categories (OR)", () => {
    expect(
      matchesCriteria(tx({ category: { id: "a", label: "A" } }), { categoryIds: ["a", "b"] })
    ).toBe(true);
    expect(
      matchesCriteria(tx({ category: { id: "c", label: "C" } }), { categoryIds: ["a", "b"] })
    ).toBe(false);
    // empty list means "any"
    expect(matchesCriteria(tx(), { categoryIds: [] })).toBe(true);
  });

  it("filters by amount range", () => {
    expect(matchesCriteria(tx({ amount: 500 }), { minAmount: 1000 })).toBe(false);
    expect(matchesCriteria(tx({ amount: 1500 }), { minAmount: 1000, maxAmount: 2000 })).toBe(true);
    expect(matchesCriteria(tx({ amount: 2500 }), { maxAmount: 2000 })).toBe(false);
  });

  it("filters by text over description/account/category", () => {
    expect(matchesCriteria(tx(), { q: "пятёрочка" })).toBe(true);
    expect(matchesCriteria(tx(), { q: "карта" })).toBe(true);
    expect(matchesCriteria(tx(), { q: "перекрёсток" })).toBe(false);
  });

  it("filters by tag (case-insensitive)", () => {
    expect(matchesCriteria(tx({ tags: ["Отпуск", "Еда"] }), { tag: "отпуск" })).toBe(true);
    expect(matchesCriteria(tx({ tags: ["Еда"] }), { tag: "отпуск" })).toBe(false);
    expect(matchesCriteria(tx(), { tag: "отпуск" })).toBe(false);
  });

  it("includes tags in the text search haystack", () => {
    expect(matchesCriteria(tx({ tags: ["командировка"] }), { q: "командиров" })).toBe(true);
  });
});

describe("criteriaFromParams", () => {
  it("reads all criteria from URL params", () => {
    const params = new URLSearchParams(
      "from=2026-05-01&to=2026-05-31&type=EXPENSE&categoryId=a,b&accountId=acc-1&q=кофе&minAmount=100&maxAmount=5000"
    );
    expect(criteriaFromParams(params)).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
      type: "EXPENSE",
      categoryIds: ["a", "b"],
      accountId: "acc-1",
      q: "кофе",
      minAmount: 100,
      maxAmount: 5000
    });
  });

  it("defaults type to ALL", () => {
    expect(criteriaFromParams(new URLSearchParams()).type).toBe("ALL");
  });
});

describe("filterTransactions", () => {
  it("combines criteria", () => {
    const list = [
      tx({ amount: 100, category: { id: "food", label: "Еда" } }),
      tx({ amount: 5000, category: { id: "rent", label: "Аренда" } }),
      tx({ amount: 300, type: "INCOME", category: { id: "salary", label: "Зарплата" } })
    ];
    const result = filterTransactions(list, {
      type: "EXPENSE",
      minAmount: 200,
      categoryIds: ["rent", "food"]
    });
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(5000);
  });
});
