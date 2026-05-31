import { describe, expect, it } from "vitest";

import { suggestCategoryId, type SuggestHistoryItem } from "@/lib/category-suggest";

const history: SuggestHistoryItem[] = [
  { description: "Пятёрочка продукты", type: "EXPENSE", category: { id: "cat-food" } },
  { description: "Магнит продукты на неделю", type: "EXPENSE", category: { id: "cat-food" } },
  { description: "Метро проезд", type: "EXPENSE", category: { id: "cat-transport" } },
  { description: "Зарплата за месяц", type: "INCOME", category: { id: "cat-salary" } }
];

describe("suggestCategoryId", () => {
  it("suggests the category most associated with matching keywords", () => {
    expect(suggestCategoryId("Пятёрочка вечерние продукты", history, { type: "EXPENSE" })).toBe("cat-food");
  });

  it("respects the transaction type filter", () => {
    // "месяц" appears in an INCOME item; an expense query must not borrow it.
    expect(suggestCategoryId("проезд на метро", history, { type: "EXPENSE" })).toBe("cat-transport");
  });

  it("returns null when nothing meaningful matches", () => {
    expect(suggestCategoryId("xyz", history)).toBeNull();
    expect(suggestCategoryId("", history)).toBeNull();
  });
});
