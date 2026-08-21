import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { AnalyticsData, BudgetsPageData, TransactionsPageData } from "@/lib/data";
import type { ForecastData, PlanFactPageData } from "@/types/finance";

// An operation is recorded in the currency of its account: a dollar card stores
// 100, not what that is worth. Balances were converted before being summed;
// operations were not, so every total added dollars to roubles as if they were
// the same unit. 100 $ at the default rate is 9 000 ₽.
const USD_RATE = 90;

async function ledgerInTwoCurrencies() {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  const roubles = await client.post<{ id: string }>("/accounts", {
    name: "Рублёвая карта",
    type: "DEBIT_CARD",
    balance: "100000"
  });
  const dollars = await client.post<{ id: string }>("/accounts", {
    name: "Долларовая карта",
    type: "DEBIT_CARD",
    balance: "1000",
    currency: "USD"
  });
  const categories = await client.get<{
    categories: Array<{ id: string; name: string; kind: string }>;
  }>("/categories");
  const food = categories.categories.find((category) => category.name === "Продукты");
  const today = new Date().toISOString().slice(0, 10);

  await client.post("/transactions", {
    amount: "1000",
    type: "EXPENSE",
    accountId: roubles.id,
    categoryId: food?.id,
    date: today,
    description: "Продукты дома"
  });
  await client.post("/transactions", {
    amount: "100",
    type: "EXPENSE",
    accountId: dollars.id,
    categoryId: food?.id,
    date: today,
    description: "Продукты в поездке"
  });

  // 1 000 ₽ + 100 $ = 1 000 + 9 000 = 10 000 ₽.
  return { client, food, dollars, expected: 1000 + 100 * USD_RATE };
}

describe("money in more than one currency", () => {
  it("adds up the month on the analytics screen by converting first", async () => {
    const { client, expected } = await ledgerInTwoCurrencies();

    const analytics = await client.get<AnalyticsData>("/analytics");
    const thisMonth = analytics.monthlyCashflow[analytics.monthlyCashflow.length - 1];
    expect(thisMonth.expense).toBe(expected);

    const groceries = analytics.topExpenseCategories.find(
      (category) => category.category === "Продукты"
    );
    expect(groceries?.total).toBe(expected);
  });

  it("fills the plan/fact cell with the converted amount", async () => {
    const { client, food, expected } = await ledgerInTwoCurrencies();

    const plan = await client.get<PlanFactPageData>("/plan");
    const month = plan.months.find((entry) => entry.month === new Date().toISOString().slice(0, 7));
    expect(month?.cells[food?.id ?? ""]?.fact).toBe(expected);
    expect(month?.expense.fact).toBe(expected);
  });

  it("measures a limit against converted spending", async () => {
    const { client, food, expected } = await ledgerInTwoCurrencies();
    // The limit is set in the base currency, so the spending has to be in it too.
    await client.post("/budgets", { categoryId: food?.id, limitAmount: "9000" });

    const budgets = await client.get<BudgetsPageData>("/budgets");
    const budget = budgets.budgets.find((item) => item.categoryId === food?.id);
    expect(budget?.spent).toBe(expected);
    expect(budget?.isExceeded).toBe(true);
  });

  it("hands the ledger row its worth in the base currency, keeping the original", async () => {
    const { client } = await ledgerInTwoCurrencies();

    const ledger = await client.get<TransactionsPageData>("/transactions");
    const abroad = ledger.transactions.find((row) => row.description === "Продукты в поездке");
    const home = ledger.transactions.find((row) => row.description === "Продукты дома");

    // The row still says what was actually paid…
    expect(abroad?.amount).toBe(100);
    // …and carries what that is worth, which is what the totals add up.
    expect(abroad?.baseAmount).toBe(100 * USD_RATE);
    // A row already in the base currency carries nothing extra.
    expect(home?.baseAmount).toBeUndefined();
  });

  it("plans a repeating payment abroad in the base currency", async () => {
    const { client, food, dollars } = await ledgerInTwoCurrencies();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await client.post("/recurring", {
      amount: "50",
      type: "EXPENSE",
      accountId: dollars.id,
      categoryId: food?.id,
      frequency: "MONTHLY",
      nextDate: tomorrow.toISOString().slice(0, 10),
      description: "Подписка",
      isActive: "true"
    });

    const forecast = await client.get<ForecastData>("/forecast");
    // 50 $ a month is 4 500 ₽ of planned spending, not 50 ₽.
    expect(forecast.plannedExpense30d).toBe(50 * USD_RATE);
  });
});
