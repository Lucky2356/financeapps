import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { BudgetsPageData } from "@/lib/data";
import type { PlanFactPageData } from "@/types/finance";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Лимит категории на месяц и план расхода по ней в «План/факте» — одно число.
// Владелец: «лимиты и план/факт пусть заполняются одинаково и один раз».

const STATE_KEY = "localFinanceState_profile-default";

async function seeded(storage = new MemoryStorageAdapter()) {
  const api = new LocalApiClient(storage);
  const page = await api.get<{ categories: Array<{ id: string; name: string }> }>("/categories");
  const id = (name: string) => page.categories.find((category) => category.name === name)?.id ?? "";
  return { api, storage, food: id("Продукты"), salary: id("Зарплата") };
}

const limitOf = (page: BudgetsPageData, categoryId: string) =>
  page.budgets.find((budget) => budget.categoryId === categoryId)?.limitAmount;

const planOf = (page: PlanFactPageData, month: string, categoryId: string) =>
  page.months.find((entry) => entry.month === month)?.cells[categoryId]?.plan ?? 0;

describe("лимиты и план/факт — одно число", () => {
  it("лимит появляется в плане", async () => {
    const { api, food } = await seeded();
    await api.post("/budgets", { categoryId: food, limitAmount: "20000", month: "2026-07" });

    const plan = await api.get<PlanFactPageData>("/plan");
    expect(planOf(plan, "2026-07", food)).toBe(20_000);
  });

  it("план расхода появляется в лимитах, и правка с любой стороны видна на другой", async () => {
    const { api, food } = await seeded();
    await api.post("/plan", { month: "2026-07", categoryId: food, amount: "15000" });
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-07"), food)).toBe(15_000);

    await api.post("/budgets", { categoryId: food, limitAmount: "18000", month: "2026-07" });
    expect(planOf(await api.get<PlanFactPageData>("/plan"), "2026-07", food)).toBe(18_000);

    await api.post("/plan", { month: "2026-07", categoryId: food, amount: "0" });
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-07"), food)).toBe(0);
  });

  it("лимит действует и в следующих месяцах — там он тоже план", async () => {
    const { api, food } = await seeded();
    await api.post("/budgets", { categoryId: food, limitAmount: "20000", month: "2026-07" });
    await api.post("/plan", { action: "addMonth", month: "2026-08" });

    expect(planOf(await api.get<PlanFactPageData>("/plan"), "2026-08", food)).toBe(20_000);
  });

  it("план доходов остаётся планом и в лимиты не попадает", async () => {
    const { api, salary } = await seeded();
    await api.post("/plan", { month: "2026-07", categoryId: salary, amount: "100000" });

    expect(planOf(await api.get<PlanFactPageData>("/plan"), "2026-07", salary)).toBe(100_000);
    const budgets = await api.get<BudgetsPageData>("/budgets?month=2026-07");
    expect(budgets.budgets.some((budget) => budget.categoryId === salary)).toBe(false);
  });

  it("удаление месяца из плана не снимает лимит, по которому живут следующие", async () => {
    const { api, food } = await seeded();
    await api.post("/budgets", { categoryId: food, limitAmount: "20000", month: "2026-07" });

    await api.post("/plan", { action: "removeMonth", month: "2026-07" });

    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-07"), food)).toBe(0);
    expect(limitOf(await api.get<BudgetsPageData>("/budgets?month=2026-08"), food)).toBe(20_000);
  });

  it("клетка плана из прежней версии уступает более поздней правке лимита", async () => {
    const { api, storage, food } = await seeded();
    await api.post("/budgets", { categoryId: food, limitAmount: "20000", month: "2026-07" });

    // Так лежит план, вписанный прежней версией (или приехавший с устройства,
    // где она ещё стоит): отдельная клетка, более поздняя, чем лимит.
    const stored = await storage.getItem<Record<string, unknown>>(STATE_KEY);
    await storage.setItem(STATE_KEY, {
      ...stored,
      plans: [
        { month: "2026-07", categoryId: food, amount: 12000, updatedAt: "2999-01-01T00:00:00.000Z" }
      ]
    });
    const reopened = new LocalApiClient(storage);
    expect(limitOf(await reopened.get<BudgetsPageData>("/budgets?month=2026-07"), food)).toBe(
      12_000
    );
    expect(planOf(await reopened.get<PlanFactPageData>("/plan"), "2026-07", food)).toBe(12_000);

    // Новая правка лимита — самое позднее слово, и клетка ей больше не спорит.
    await reopened.post("/budgets", { categoryId: food, limitAmount: "25000", month: "2026-07" });
    expect(limitOf(await reopened.get<BudgetsPageData>("/budgets?month=2026-07"), food)).toBe(
      25_000
    );
    expect(planOf(await reopened.get<PlanFactPageData>("/plan"), "2026-07", food)).toBe(25_000);
  });

  it("предупреждение о превышении сверяется с лимитом месяца операции", async () => {
    const { api, food } = await seeded();
    const account = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "0"
    });
    await api.post("/budgets", { categoryId: food, limitAmount: "1000", month: "2026-07" });
    await api.post("/budgets", { categoryId: food, limitAmount: "100000", month: "2026-08" });

    const spent = await api.post<{ budgetWarning?: { limit: number } | null }>("/transactions", {
      amount: "2000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food,
      date: "2026-07-15"
    });
    expect(spent.budgetWarning?.limit).toBe(1000);
  });
});
