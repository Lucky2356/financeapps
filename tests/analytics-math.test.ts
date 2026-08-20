import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { NO_MONTH } from "@/lib/analytics/best-month";
import type { AnalyticsData } from "@/lib/data";

// The figures on the analytics screen. Each case here is one that used to print
// a number the owner could act on and that was simply wrong.

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

async function seed(client: LocalApiClient) {
  const account = await client.post<{ id: string }>("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "100000"
  });
  const categories = await client.get<{
    categories: Array<{ id: string; name: string; kind: string }>;
  }>("/categories");
  return {
    account,
    salary: categories.categories.find((category) => category.kind === "INCOME"),
    food: categories.categories.find((category) => category.name === "Продукты")
  };
}

const today = () => new Date().toISOString().slice(0, 10);

describe("analytics figures", () => {
  it("averages the savings rate over the months that have something in them", async () => {
    const client = createClient();
    const { account, salary, food } = await seed(client);

    // One active month: earned 100 000, spent 50 000 — a rate of 50%.
    await client.post("/transactions", {
      amount: "100000",
      type: "INCOME",
      accountId: account.id,
      categoryId: salary?.id,
      date: today(),
      description: "Зарплата"
    });
    await client.post("/transactions", {
      amount: "50000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food?.id,
      date: today(),
      description: "Продукты"
    });

    const analytics = await client.get<AnalyticsData>("/analytics");
    // Divided by six regardless of activity, this read 8.3% — and sat next to
    // an insight that computed the same thing honestly and said 50%.
    expect(analytics.avgSavingsRate).toBe(50);
  });

  it("names no best month when there is nothing to compare", async () => {
    const client = createClient();
    await seed(client);

    const analytics = await client.get<AnalyticsData>("/analytics");
    expect(analytics.bestMonth).toBe(NO_MONTH);
    expect(analytics.worstMonth).toBe(NO_MONTH);
  });

  it("leaves an operation dated past the window out of the category shares", async () => {
    const client = createClient();
    const { account, food } = await seed(client);

    await client.post("/transactions", {
      amount: "10000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food?.id,
      date: today(),
      description: "Продукты"
    });
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    await client.post("/transactions", {
      amount: "990000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food?.id,
      date: nextYear.toISOString().slice(0, 10),
      description: "Ремонт когда-нибудь"
    });

    // The window says "six months"; a row dated next year took a share of it
    // while being absent from every month drawn beside it.
    const analytics = await client.get<AnalyticsData>("/analytics");
    const groceries = analytics.topExpenseCategories.find(
      (category) => category.category === "Продукты"
    );
    expect(groceries?.total).toBe(10000);
  });

  it("counts a transfer as neither income nor spending on the budgets screen", async () => {
    const client = createClient();
    const { account, salary, food } = await seed(client);
    const savings = await client.post<{ id: string }>("/accounts", {
      name: "Накопительный",
      type: "SAVINGS",
      balance: "0"
    });

    await client.post("/transactions", {
      amount: "100000",
      type: "INCOME",
      accountId: account.id,
      categoryId: salary?.id,
      date: today(),
      description: "Зарплата"
    });
    // 70 000 of the 100 000 went on an essential category — a share the advice
    // has an opinion about (it warns above 65% of income).
    await client.post("/transactions", {
      amount: "70000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food?.id,
      date: today(),
      description: "Продукты"
    });
    const before = await client.get<{ recommendations: Array<{ id: string }> }>("/budgets");
    expect(before.recommendations.map((item) => item.id)).toContain("essential-share-high");

    await client.post("/transactions", {
      action: "transfer",
      amount: "40000",
      fromAccountId: account.id,
      toAccountId: savings.id,
      date: today(),
      description: "В накопления"
    });
    const after = await client.get<{ recommendations: Array<{ id: string }> }>("/budgets");

    // Moving money between your own accounts changes nothing about how the
    // month went, so the advice built on it must not change either. The home
    // screen already ignored the pair; this screen counted it, and the two gave
    // different readings of the same three months.
    expect(after.recommendations.map((item) => item.id)).toEqual(
      before.recommendations.map((item) => item.id)
    );
  });
});
