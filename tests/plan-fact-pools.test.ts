import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { PlanFactMonth, PlanFactPageData, PlanFactSplit } from "@/types/finance";

const today = () => new Date().toISOString().slice(0, 10);
const monthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const api = () => new LocalApiClient(new MemoryStorageAdapter());

/**
 * One operation, as the ledger takes it. Written once because the shape is the
 * same every time and only the four values differ; spelled out per call it read
 * as five near-identical blocks that said nothing to anyone.
 */
async function record(
  client: LocalApiClient,
  fields: { accountId: string; categoryId: string; type: "INCOME" | "EXPENSE"; amount: number }
) {
  await client.post("/transactions", {
    accountId: fields.accountId,
    categoryId: fields.categoryId,
    type: fields.type,
    amount: String(fields.amount),
    date: today()
  });
}

/** A category of the given side, named so it cannot clash with the built-in ones. */
const category = (client: LocalApiClient, name: string, kind: "INCOME" | "EXPENSE") =>
  client.post<{ id: string }>("/categories", { name, kind });

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

/** Both halves of both flows, in one assertion — the pair is always read together. */
function expectPools(month: PlanFactMonth, income: PlanFactSplit, expense: PlanFactSplit) {
  expect(month.incomeBy).toEqual(income);
  expect(month.expenseBy).toEqual(expense);
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
      category(client, "Оклад-тест", "INCOME"),
      category(client, "Проценты-тест", "INCOME"),
      category(client, "Еда-тест", "EXPENSE")
    ]);

    // Wages onto the card, bank interest onto the deposit, groceries off the
    // card: one of each, so every corner of the split has something in it.
    await record(client, {
      accountId: card.id,
      categoryId: salary.id,
      type: "INCOME",
      amount: 80000
    });
    await record(client, {
      accountId: deposit.id,
      categoryId: percent.id,
      type: "INCOME",
      amount: 1500
    });
    await record(client, {
      accountId: card.id,
      categoryId: food.id,
      type: "EXPENSE",
      amount: 5000
    });

    const month = await thisMonth(client);
    expectPools(month, { main: 80000, savings: 1500 }, { main: 5000, savings: 0 });

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
    const salary = await category(client, "Оклад-тест", "INCOME");

    await record(client, {
      accountId: card.id,
      categoryId: salary.id,
      type: "INCOME",
      amount: 100000
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
    expectPools(month, { main: 0, savings: 0 }, { main: 0, savings: 0 });
  });
});
