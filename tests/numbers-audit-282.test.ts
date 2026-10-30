import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { buildCategoryTrends, type TrendTransaction } from "@/lib/analytics/category-trends";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Цифры, разошедшиеся между экранами (разбор №282). Каждая проверка
// воспроизводит то, что человек видел на экране, и падала до исправления.
// Курс по умолчанию: 1 $ = 90 ₽.

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

async function expenseCategory(client: LocalApiClient, name?: string) {
  const page = await client.get("/categories");
  return page.categories.find(
    (item) => item.kind === "EXPENSE" && item.name !== "Переводы" && (!name || item.name === name)
  )!;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("цифры после разбора №282", () => {
  it("сравнение месяцев режет идущий месяц тем же числом, что и прошлый", async () => {
    const client = createClient();
    const account = await client.post("/accounts", { name: "Карта", balance: "200000" });
    const category = await expenseCategory(client);
    const spend = (date: string, amount: string) =>
      client.post("/transactions", {
        type: "EXPENSE",
        amount,
        accountId: account.id,
        categoryId: category.id,
        date
      });
    // Аренда на 25-е записана заранее и в сентябре, и в октябре.
    await spend("2026-09-05", "1000");
    await spend("2026-09-25", "30000");
    await spend("2026-10-05", "1000");
    await spend("2026-10-25", "30000");

    const compare = await client.get("/compare-months?a=2026-10&b=2026-09");
    const recap = await client.get("/month-recap?month=2026-10");
    expect(compare.asOfDay).toBe(12);
    // 12-го оба месяца — по 12-е: 1 000 против 1 000, как в итогах месяца.
    expect(compare.totals.expenseA).toBe(1000);
    expect(compare.totals.expenseB).toBe(1000);
    expect(compare.totals.expenseA).toBe(recap.expense);
    expect(compare.totals.expenseB).toBe(recap.previous.expense);
  });

  it("тренды по статьям не считают переводы, пока галка их не включила", () => {
    const tx = (month: string, amount: number, extra: Partial<TrendTransaction> = {}) => ({
      amount,
      type: "EXPENSE",
      date: `${month}-15`,
      description: null,
      category: { id: "food", label: "Продукты" },
      ...extra
    });
    const transfer = (month: string, amount: number, extra: Partial<TrendTransaction>) =>
      tx(month, amount, { category: { id: "transfers", label: "Переводы" }, ...extra });
    const rows: TrendTransaction[] = [
      tx("2026-08", 1000),
      tx("2026-09", 1000),
      tx("2026-10", 1000),
      transfer("2026-09", 50000, { transferId: "t-1" }),
      transfer("2026-10", 80000, { description: "В копилку [transfer:old-1]" })
    ];
    const without = buildCategoryTrends(rows, {
      currentMonth: "2026-10",
      includeTransfers: false
    });
    expect(without.map((trend) => trend.categoryId)).toEqual(["food"]);

    const withTransfers = buildCategoryTrends(rows, {
      currentMonth: "2026-10",
      includeTransfers: true
    });
    expect(withTransfers.map((trend) => trend.categoryId).sort()).toEqual(["food", "transfers"]);
  });

  it("кэшбэк считает трату по долларовой карте в рублях", async () => {
    const client = createClient();
    const usd = await client.post("/accounts", {
      name: "Долларовая",
      type: "DEBIT_CARD",
      balance: "1000",
      currency: "USD"
    });
    const rub = await client.post("/accounts", {
      name: "Рублёвая",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const category = await expenseCategory(client);
    const month = "2026-10";
    await client.post("/cashback", {
      month,
      accountId: usd.id,
      categoryId: category.id,
      percent: "1"
    });
    await client.post("/cashback", {
      month,
      accountId: rub.id,
      categoryId: category.id,
      percent: "5"
    });
    await client.post("/transactions", {
      type: "EXPENSE",
      amount: "100",
      accountId: usd.id,
      categoryId: category.id,
      date: "2026-10-10"
    });

    const page = await client.get(`/cashback?month=${month}`);
    // 100 $ = 9 000 ₽: 1 % — 90 ₽ получено, 5 % рублёвой карты — ещё 360 ₽ упущено.
    expect(page.summary.earned).toBe(90);
    expect(page.summary.missed).toBe(360);
  });

  it("семья не считает тратой старый перевод с пометкой в описании", async () => {
    const client = createClient();
    const account = await client.post("/accounts", { name: "Карта", balance: "50000" });
    const category = await expenseCategory(client);
    const sasha = await client.post("/family", { action: "addMember", name: "Саша" });
    await client.post("/transactions", {
      type: "EXPENSE",
      amount: "700",
      accountId: account.id,
      categoryId: category.id,
      date: "2026-10-03",
      memberId: sasha.id
    });
    // Перевод из версий до 1.10.0: связь половин — только пометка в описании.
    await client.post("/transactions", {
      type: "EXPENSE",
      amount: "20000",
      accountId: account.id,
      categoryId: category.id,
      description: "В копилку [transfer:old-1]",
      date: "2026-10-04",
      memberId: sasha.id
    });

    const family = await client.get("/family?month=2026-10");
    expect(family.picture.perMember[0].personal).toBe(700);
    expect(family.picture.unassigned).toBe(0);
  });
});
