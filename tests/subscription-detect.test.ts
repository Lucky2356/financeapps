import { describe, expect, it } from "vitest";

import {
  detectSubscriptions,
  normalizeMerchant,
  type DetectableTransaction
} from "@/lib/subscriptions/detect";

function monthlySeries(
  merchant: string,
  amount: number,
  months: number,
  opts: { category?: { id: string; label: string }; jitter?: number } = {}
): DetectableTransaction[] {
  const out: DetectableTransaction[] = [];
  for (let i = 0; i < months; i += 1) {
    const month = String((i % 12) + 1).padStart(2, "0");
    const year = 2025 + Math.floor(i / 12);
    out.push({
      id: `${merchant}-${i}`,
      amount: amount + (opts.jitter ? (i % 2 === 0 ? opts.jitter : -opts.jitter) : 0),
      type: "EXPENSE",
      date: `${year}-${month}-05`,
      description: merchant,
      category: opts.category ?? null
    });
  }
  return out;
}

describe("normalizeMerchant", () => {
  it("collapses card masks and digits", () => {
    expect(normalizeMerchant("YANDEX*4121")).toBe("yandex");
    expect(normalizeMerchant("Netflix 5537")).toBe("netflix");
  });
  it("returns empty for blank", () => {
    expect(normalizeMerchant(null)).toBe("");
    expect(normalizeMerchant("   ")).toBe("");
  });
});

describe("detectSubscriptions", () => {
  it("detects a stable monthly charge", () => {
    const result = detectSubscriptions(monthlySeries("Netflix", 599, 5));
    expect(result).toHaveLength(1);
    expect(result[0].frequency).toBe("MONTHLY");
    expect(result[0].occurrences).toBe(5);
    expect(result[0].averageAmount).toBe(599);
  });

  it("ignores clusters with too few occurrences", () => {
    expect(detectSubscriptions(monthlySeries("Spotify", 299, 2))).toEqual([]);
  });

  it("ignores merchants with highly variable amounts (groceries)", () => {
    const groceries: DetectableTransaction[] = [
      { id: "g1", amount: 500, type: "EXPENSE", date: "2026-01-05", description: "Пятёрочка" },
      { id: "g2", amount: 2300, type: "EXPENSE", date: "2026-02-05", description: "Пятёрочка" },
      { id: "g3", amount: 1200, type: "EXPENSE", date: "2026-03-05", description: "Пятёрочка" }
    ];
    expect(detectSubscriptions(groceries)).toEqual([]);
  });

  it("tolerates small amount jitter and carries the category", () => {
    const result = detectSubscriptions(
      monthlySeries("Spotify", 299, 4, {
        category: { id: "c-ent", label: "Развлечения" },
        jitter: 10
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("c-ent");
    expect(result[0].categoryLabel).toBe("Развлечения");
  });

  it("ignores income", () => {
    const income = monthlySeries("Salary", 100000, 4).map((t) => ({ ...t, type: "INCOME" }));
    expect(detectSubscriptions(income)).toEqual([]);
  });

  it("sorts by average amount descending", () => {
    const result = detectSubscriptions([
      ...monthlySeries("Cheap", 200, 4),
      ...monthlySeries("Pricey", 1500, 4)
    ]);
    expect(result.map((r) => r.merchant)).toEqual(["Pricey", "Cheap"]);
  });
});
