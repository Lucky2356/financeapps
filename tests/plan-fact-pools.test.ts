import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { PlanFactPageData } from "@/types/finance";

const today = () => new Date().toISOString().slice(0, 10);
const monthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const api = () => new LocalApiClient(new MemoryStorageAdapter());

/** One account in each pool — the whole point of the split is telling them apart. */
async function twoPools(client: LocalApiClient) {
  const card = await client.post<{ id: string }>("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "0"
  });
  const deposit = await client.post<{ id: string }>("/accounts", {
    name: "Вклад",
    type: "SAVINGS",
    balance: "0"
  });
  return { card, deposit };
}

async function thisMonth(client: LocalApiClient) {
  const page = await client.get<PlanFactPageData>("/plan");
  const month = page.months.find((entry) => entry.month === monthKey());
  if (!month) throw new Error("текущего месяца нет в таблице");
  return month;
}

// The month totals are split by which pool of accounts the money passed
// through: cash and cards on one side, savings and brokerage on the other.
// Without it "Итого" answered how much but never where it ended up — and where
// it ended up is the whole question for someone trying to put money aside.
describe("month totals split by pool", () => {
  it("files income and spending under the pool of the account they touched", async () => {
    const client = api();
    const { card, deposit } = await twoPools(client);
    const [salary, percent, food] = await Promise.all([
      client.post<{ id: string }>("/categories", { name: "Оклад-тест", kind: "INCOME" }),
      client.post<{ id: string }>("/categories", { name: "Проценты-тест", kind: "INCOME" }),
      client.post<{ id: string }>("/categories", { name: "Еда-тест", kind: "EXPENSE" })
    ]);

    await client.post("/transactions", {
      accountId: card.id,
      categoryId: salary.id,
      type: "INCOME",
      amount: "80000",
      date: today()
    });
    await client.post("/transactions", {
      accountId: deposit.id,
      categoryId: percent.id,
      type: "INCOME",
      amount: "1500",
      date: today()
    });
    await client.post("/transactions", {
      accountId: card.id,
      categoryId: food.id,
      type: "EXPENSE",
      amount: "5000",
      date: today()
    });

    const month = await thisMonth(client);
    expect(month.incomeBy).toEqual({ main: 80000, savings: 1500 });
    expect(month.expenseBy).toEqual({ main: 5000, savings: 0 });

    // The two halves are the whole: a split that does not add back up to the
    // figure it came from is worse than no split at all.
    expect(month.incomeBy.main + month.incomeBy.savings).toBeCloseTo(month.income.fact, 2);
    expect(month.expenseBy.main + month.expenseBy.savings).toBeCloseTo(month.expense.fact, 2);
  });

  // The trap this is built around: a transfer between the two pools moves both
  // halves without being income or spending on either side, so a closing figure
  // derived as opening + income − expense drifts away from what the next month
  // actually opens with. It is read off the balances instead.
  it("closes each pool where the next month opens it, transfers included", async () => {
    const client = api();
    const { card, deposit } = await twoPools(client);
    const salary = await client.post<{ id: string }>("/categories", {
      name: "Оклад-тест",
      kind: "INCOME"
    });

    await client.post("/transactions", {
      accountId: card.id,
      categoryId: salary.id,
      type: "INCOME",
      amount: "100000",
      date: today()
    });
    await client.post("/transactions", {
      action: "transfer",
      amount: "30000",
      fromAccountId: card.id,
      toAccountId: deposit.id,
      date: today()
    });

    const month = await thisMonth(client);
    expect(month.resultBy.main).toBeCloseTo(70000, 2);
    expect(month.resultBy.savings).toBeCloseTo(30000, 2);

    // Naive arithmetic would have put all 100 000 on the main side and nothing
    // in savings, because the transfer is neither income nor spending.
    expect(month.resultBy.main + month.resultBy.savings).toBeCloseTo(month.result.fact, 2);
  });

  it("has both pools at zero for a month nothing was recorded in", async () => {
    const client = api();
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "0" });

    const month = await thisMonth(client);
    expect(month.incomeBy).toEqual({ main: 0, savings: 0 });
    expect(month.expenseBy).toEqual({ main: 0, savings: 0 });
  });
});
