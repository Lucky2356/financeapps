import { describe, expect, it } from "vitest";

import { matchRule, type CategorizationRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";

const rules: CategorizationRule[] = [
  { id: "1", match: "Пятёрочка", categoryId: "cat-food" },
  { id: "2", match: "Яндекс.Такси", categoryId: "cat-taxi" }
];

describe("matchRule", () => {
  it("matches a case-insensitive substring", () => {
    expect(matchRule("Покупка ПЯТЁРОЧКА 1200", rules)).toBe("cat-food");
    expect(matchRule("яндекс.такси поездка", rules)).toBe("cat-taxi");
  });

  it("returns the first matching rule", () => {
    const overlapping: CategorizationRule[] = [
      { id: "a", match: "кофе", categoryId: "cat-coffee" },
      { id: "b", match: "кофейня", categoryId: "cat-cafe" }
    ];
    expect(matchRule("кофейня на углу", overlapping)).toBe("cat-coffee");
  });

  it("returns null when nothing matches or description is empty", () => {
    expect(matchRule("Аптека", rules)).toBeNull();
    expect(matchRule("   ", rules)).toBeNull();
  });
});

describe("suggestCategoryId with rules", () => {
  it("prefers a rule over the history heuristic", () => {
    const history = [
      {
        description: "Пятёрочка продукты",
        type: "EXPENSE" as const,
        category: { id: "cat-history" }
      }
    ];
    // History would suggest cat-history, but the rule pins cat-food.
    expect(suggestCategoryId("Пятёрочка", history, { type: "EXPENSE", rules })).toBe("cat-food");
  });

  it("falls back to history when no rule matches", () => {
    const history = [
      { description: "Аптека Ригла", type: "EXPENSE" as const, category: { id: "cat-health" } }
    ];
    expect(suggestCategoryId("аптека ригла", history, { type: "EXPENSE", rules })).toBe(
      "cat-health"
    );
  });
});
