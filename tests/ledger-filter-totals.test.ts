import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Сумма над списком операций — по всему фильтру, а не по странице.
//
// Найдено человеком: в аналитике за месяц одна сумма, в учёте с тем же
// месяцем и категорией — другая, и сходились они, только если поставить
// «На одной странице». Итог складывался из двадцати строк страницы.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 20, 12));
});
afterEach(() => vi.useRealTimers());

async function ledgerWithThirtyCoffees() {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  const card = await client.post("/accounts", { name: "Карта", balance: "100000" });
  const savings = await client.post("/accounts", { name: "Вклад", balance: "0" });
  const categories = (await client.get("/categories")).categories;
  const coffee = categories.find((item) => item.kind === "EXPENSE")!;
  for (let day = 1; day <= 30; day += 1) {
    await client.post("/transactions", {
      amount: "100",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: coffee.id,
      date: `2026-10-${String(Math.min(day, 20)).padStart(2, "0")}`
    });
  }
  // Перевод на вклад: не трата — в аналитике его нет.
  await client.post("/transactions", {
    action: "transfer",
    amount: "5000",
    fromAccountId: card.id,
    toAccountId: savings.id,
    date: "2026-10-05"
  });
  return { client, card, coffee };
}

describe("итоги над списком операций", () => {
  it("по категории за месяц — как в аналитике, на любой странице", async () => {
    const { client, coffee } = await ledgerWithThirtyCoffees();
    const page = await client.get(
      `/transactions?from=2026-10-01&to=2026-10-31&categoryId=${coffee.id}&limit=20`
    );
    expect(page.transactions).toHaveLength(20);
    expect(page.pagination.total).toBe(30);
    expect(page.totals).toEqual({ income: 0, expense: 3000 });

    const analytics = await client.get("/analytics");
    const fromAnalytics = analytics.topExpenseCategories.find(
      (item) => item.categoryId === coffee.id
    );
    expect(fromAnalytics?.total).toBe(3000);
  });

  it("за месяц без фильтра — без переводов, как в аналитике", async () => {
    const { client } = await ledgerWithThirtyCoffees();
    const page = await client.get("/transactions?from=2026-10-01&to=2026-10-31&limit=20");
    const analytics = await client.get("/analytics");
    expect(page.totals?.expense).toBe(analytics.monthlyCashflow.at(-1)!.expense);
    expect(page.totals?.expense).toBe(3000);
  });

  it("по счёту перевод с него — уход денег, и он в итоге", async () => {
    const { client, card } = await ledgerWithThirtyCoffees();
    const page = await client.get(
      `/transactions?from=2026-10-01&to=2026-10-31&accountId=${card.id}&limit=20`
    );
    expect(page.totals?.expense).toBe(8000);
  });
});
