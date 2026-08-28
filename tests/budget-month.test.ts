import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { budgetInForce } from "@/lib/budget-rollover";
import type { BudgetsPageData } from "@/lib/data";

const STATE_KEY = "localFinanceState_profile-default";

// A limit belongs to a month. The screen has always offered a month picker; the
// figure under it had no month at all, so one typed in September rewrote August.
describe("which limit is in force", () => {
  const budgets = [
    { categoryId: "food", limitAmount: 20_000, month: "2026-03" },
    { categoryId: "food", limitAmount: 30_000, month: "2026-07" },
    { categoryId: "fun", limitAmount: 5_000 }
  ];

  it("holds from the month it was set in until it is changed", () => {
    expect(budgetInForce(budgets, "food", "2026-03")?.limitAmount).toBe(20_000);
    expect(budgetInForce(budgets, "food", "2026-05")?.limitAmount).toBe(20_000);
    expect(budgetInForce(budgets, "food", "2026-07")?.limitAmount).toBe(30_000);
    expect(budgetInForce(budgets, "food", "2026-12")?.limitAmount).toBe(30_000);
  });

  it("says nothing about months before the first limit", () => {
    expect(budgetInForce(budgets, "food", "2026-01")).toBeUndefined();
  });

  it("still honours a record written before limits had a month", () => {
    expect(budgetInForce(budgets, "fun", "2020-01")?.limitAmount).toBe(5_000);
    expect(budgetInForce(budgets, "fun", "2030-01")?.limitAmount).toBe(5_000);
  });
});

describe("setting a limit while looking at a month", () => {
  async function seeded() {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const categories = await api.get<{ categories: Array<{ id: string; name: string }> }>(
      "/categories"
    );
    const food = categories.categories.find((category) => category.name === "Продукты");
    return { api, foodId: food?.id ?? "" };
  }

  const limitOf = (page: BudgetsPageData, categoryId: string) =>
    page.budgets.find((budget) => budget.categoryId === categoryId)?.limitAmount;

  it("leaves the months before it alone", async () => {
    const { api, foodId } = await seeded();

    await api.post("/budgets", { categoryId: foodId, limitAmount: "20000", month: "2026-07" });
    await api.post("/budgets", { categoryId: foodId, limitAmount: "30000", month: "2026-09" });

    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-07"), foodId)).toBe(20_000);
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-08"), foodId)).toBe(20_000);
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-09"), foodId)).toBe(30_000);
  });

  it("leaves a limit set before limits had months alone", async () => {
    // What an upgraded document looks like: one record with no month at all,
    // meaning "the limit, whichever month you are looking at". Saving a new
    // figure in September used to consume that record, and every earlier month
    // fell to no limit — the opposite of what the migration promises.
    const storage = new MemoryStorageAdapter();
    const first = new LocalApiClient(storage);
    const categories = await first.get<{ categories: Array<{ id: string; name: string }> }>(
      "/categories"
    );
    const foodId = categories.categories.find((category) => category.name === "Продукты")?.id ?? "";
    await first.post("/budgets", { categoryId: foodId, limitAmount: "20000" });

    const stored = await storage.getItem<{ budgets: Array<Record<string, unknown>> }>(STATE_KEY);
    await storage.setItem(STATE_KEY, {
      ...stored,
      budgets: (stored?.budgets ?? []).map((budget) => {
        const rest = { ...budget };
        delete rest.month;
        return rest;
      })
    });

    const api = new LocalApiClient(storage);
    await api.post("/budgets", { categoryId: foodId, limitAmount: "30000", month: "2026-09" });

    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-05"), foodId)).toBe(20_000);
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-09"), foodId)).toBe(30_000);
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-11"), foodId)).toBe(30_000);
  });

  it("a zero means no limit that month, not the earlier one coming back", async () => {
    const { api, foodId } = await seeded();

    await api.post("/budgets", { categoryId: foodId, limitAmount: "20000", month: "2026-07" });
    await api.post("/budgets", { categoryId: foodId, limitAmount: "0", month: "2026-09" });

    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-07"), foodId)).toBe(20_000);
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-09"), foodId)).toBe(0);
  });
});
