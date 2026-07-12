import { describe, expect, it } from "vitest";

import { buildCategoryTrends, type TrendTransaction } from "@/lib/analytics/category-trends";

function tx(month: string, amount: number, cat = "food", label = "Еда"): TrendTransaction {
  return {
    amount,
    type: "EXPENSE",
    date: `${month}-15`,
    category: { id: cat, label, color: "#f00" }
  };
}

describe("buildCategoryTrends", () => {
  it("flags a category that jumped well above its usual level", () => {
    const trends = buildCategoryTrends([
      tx("2026-01", 1000),
      tx("2026-02", 1000),
      tx("2026-03", 1000),
      tx("2026-04", 3000) // current month, +200%
    ]);
    expect(trends).toHaveLength(1);
    expect(trends[0].anomaly).toBe("high");
    expect(trends[0].currentTotal).toBe(3000);
    expect(trends[0].averageTotal).toBe(1000);
    expect(trends[0].changePct).toBe(200);
  });

  it("flags an unusually low month", () => {
    const trends = buildCategoryTrends([
      tx("2026-01", 2000),
      tx("2026-02", 2000),
      tx("2026-03", 2000),
      tx("2026-04", 200)
    ]);
    expect(trends[0].anomaly).toBe("low");
  });

  it("returns no anomaly for stable spending", () => {
    const trends = buildCategoryTrends([
      tx("2026-01", 1000),
      tx("2026-02", 1050),
      tx("2026-03", 980),
      tx("2026-04", 1020)
    ]);
    expect(trends[0].anomaly).toBeNull();
  });

  it("skips categories with no prior history", () => {
    // Only the current month has data → cannot judge "usual".
    expect(buildCategoryTrends([tx("2026-04", 5000)])).toEqual([]);
  });

  it("ignores income", () => {
    const income: TrendTransaction[] = [
      { ...tx("2026-03", 1000), type: "INCOME" },
      { ...tx("2026-04", 5000), type: "INCOME" }
    ];
    expect(buildCategoryTrends(income)).toEqual([]);
  });

  it("orders anomalies first", () => {
    const trends = buildCategoryTrends([
      // stable category
      tx("2026-01", 500, "rent", "Аренда"),
      tx("2026-02", 500, "rent", "Аренда"),
      tx("2026-03", 500, "rent", "Аренда"),
      tx("2026-04", 500, "rent", "Аренда"),
      // spiking category
      tx("2026-01", 100, "fun", "Развлечения"),
      tx("2026-02", 100, "fun", "Развлечения"),
      tx("2026-03", 100, "fun", "Развлечения"),
      tx("2026-04", 900, "fun", "Развлечения")
    ]);
    expect(trends[0].categoryId).toBe("fun");
    expect(trends[0].anomaly).toBe("high");
  });
});
