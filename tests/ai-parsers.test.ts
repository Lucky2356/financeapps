import { describe, expect, it } from "vitest";

import {
  buildCategorizePrompt,
  parseCategorizeReply,
  type BatchCategory,
  type BatchItem
} from "@/lib/ai/categorize-batch";
import { parseBudgetPlan, type BudgetCategoryInput } from "@/lib/ai/budget-plan";

const items: BatchItem[] = [
  { id: "t1", description: "Пятёрочка", type: "EXPENSE" },
  { id: "t2", description: "Зарплата", type: "INCOME" }
];
const cats: BatchCategory[] = [
  { id: "c-food", label: "Продукты", kind: "EXPENSE" },
  { id: "c-salary", label: "Зарплата", kind: "INCOME" }
];

describe("parseCategorizeReply", () => {
  it("keeps only valid ids with a matching kind", () => {
    const reply = `[{"id":"t1","categoryId":"c-food"},{"id":"t2","categoryId":"c-salary"}]`;
    expect(parseCategorizeReply(reply, items, cats)).toEqual([
      { id: "t1", categoryId: "c-food" },
      { id: "t2", categoryId: "c-salary" }
    ]);
  });

  it("drops kind mismatches and unknown ids, tolerates prose/fences", () => {
    const reply =
      'Sure!```json\n[{"id":"t1","categoryId":"c-salary"},{"id":"tX","categoryId":"c-food"},{"id":"t1","categoryId":"c-food"}]\n```';
    // t1→c-salary is INCOME cat on an EXPENSE tx (dropped); tX unknown (dropped);
    // t1→c-food valid and kept once (dedup).
    expect(parseCategorizeReply(reply, items, cats)).toEqual([{ id: "t1", categoryId: "c-food" }]);
  });

  it("returns [] on non-JSON", () => {
    expect(parseCategorizeReply("no json here", items, cats)).toEqual([]);
  });
});

describe("buildCategorizePrompt", () => {
  it("lists categories and items with ids", () => {
    const { user } = buildCategorizePrompt(items, cats, "ru");
    expect(user).toContain("c-food");
    expect(user).toContain("t1");
  });
});

describe("parseBudgetPlan", () => {
  const budgetCats: BudgetCategoryInput[] = [
    { categoryId: "c-food", label: "Продукты", avgMonthly: 20000 },
    { categoryId: "c-fun", label: "Развлечения", avgMonthly: 8000 }
  ];

  it("keeps known ids with positive rounded limits", () => {
    const reply = `[{"categoryId":"c-food","limit":18000.4,"rationale":"чуть ниже среднего"},{"categoryId":"c-fun","limit":6000}]`;
    expect(parseBudgetPlan(reply, budgetCats)).toEqual([
      { categoryId: "c-food", limit: 18000, rationale: "чуть ниже среднего" },
      { categoryId: "c-fun", limit: 6000, rationale: "" }
    ]);
  });

  it("drops unknown ids and non-positive limits", () => {
    const reply = `[{"categoryId":"c-x","limit":100},{"categoryId":"c-food","limit":0}]`;
    expect(parseBudgetPlan(reply, budgetCats)).toEqual([]);
  });
});
