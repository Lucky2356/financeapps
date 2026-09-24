import { describe, expect, it } from "vitest";

import {
  LocalApiClient,
  OPENING_BALANCE_ID,
  SAVINGS_BALANCE_ID,
  SAVINGS_TRANSFER_ID
} from "@/lib/api/LocalApiClient";
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
    expect(month.resultBy.main.fact).toBeCloseTo(70000, 2);
    expect(month.resultBy.savings.fact).toBeCloseTo(30000, 2);

    // Naive arithmetic would have put all 100 000 on the main side and nothing
    // in savings, because the transfer is neither income nor spending.
    expect(month.resultBy.main.fact + month.resultBy.savings.fact).toBeCloseTo(
      month.result.fact,
      2
    );
  });

  // The bottom line is shown as two pools and compared against the plan as one
  // number. Those used to be worked out two different ways, and an operation on
  // an account since archived pulled them apart: the money stays in the category
  // column (it was spent, and the history says so) but leaves the balances the
  // pools are wound back from. The difference band then measured the plan
  // against a total that appeared nowhere on the screen.
  it("closes on the balances even when the account of an operation is archived", async () => {
    const client = api();
    const { card } = await twoPools(client);
    const closed = await client.post<{ id: string }>("/accounts", {
      name: "Старая карта",
      type: "DEBIT_CARD",
      balance: "0"
    });
    const [salary, food] = await Promise.all([
      category(client, "Оклад-тест", "INCOME"),
      category(client, "Еда-тест", "EXPENSE")
    ]);

    await record(client, {
      accountId: card.id,
      categoryId: salary.id,
      type: "INCOME",
      amount: 90000
    });
    await record(client, {
      accountId: closed.id,
      categoryId: food.id,
      type: "EXPENSE",
      amount: 700
    });
    // Убрать счёт в архив — это и есть удаление счёта в приложении.
    await client.delete(`/accounts?id=${closed.id}`);

    const month = await thisMonth(client);

    // Потраченное со старого счёта из колонки расходов никуда не делось.
    expect(month.expense.fact).toBeCloseTo(700, 2);
    // А нижняя строка — это остатки: 90 000 на карте, и всё.
    expect(month.resultBy.main.fact).toBeCloseTo(90000, 2);
    expect(month.result.fact).toBeCloseTo(90000, 2);
    expect(month.result.fact).toBeCloseTo(
      month.resultBy.main.fact + month.resultBy.savings.fact,
      2
    );
  });

  it("has both pools at zero for a month nothing was recorded in", async () => {
    const client = api();
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "0" });

    const month = await thisMonth(client);
    expectPools(month, { main: 0, savings: 0 }, { main: 0, savings: 0 });
  });
});

// Планируемый перевод в сбережения — то, чем план вообще стало возможно
// разделить на две группы. У статьи есть категория и нет счёта, поэтому
// «сколько из задуманного осядет на вкладе» взять было неоткуда: обе колонки
// плана показывали одну цифру на двоих.
describe("планируемый перевод в сбережения", () => {
  /** Ставит план по псевдостатье — так же, как это делает экран. */
  const plan = (client: LocalApiClient, categoryId: string, amount: number) =>
    client.post("/plan", { month: monthKey(), categoryId, amount: String(amount) });

  it("делит план на две группы: отложенное уходит из основных в сбережения", async () => {
    const client = api();
    await twoPools(client);
    const salary = await category(client, "Зарплата-тест", "INCOME");
    const food = await category(client, "Еда-тест", "EXPENSE");

    await plan(client, OPENING_BALANCE_ID, 10000);
    await plan(client, SAVINGS_BALANCE_ID, 50000);
    await plan(client, salary.id, 100000);
    await plan(client, food.id, 30000);
    await plan(client, SAVINGS_TRANSFER_ID, 20000);

    const month = await thisMonth(client);
    // 10 000 + 100 000 − 30 000 − 20 000
    expect(month.resultBy.main.plan).toBeCloseTo(60000, 2);
    // 50 000 + 20 000
    expect(month.resultBy.savings.plan).toBeCloseTo(70000, 2);
    // И итог — те же две половины сложенные, а не посчитанные заново.
    expect(month.result.plan).toBeCloseTo(130000, 2);
  });

  it("без отложенного план сбережений — это просто остаток на начало", async () => {
    const client = api();
    await twoPools(client);
    await plan(client, OPENING_BALANCE_ID, 10000);
    await plan(client, SAVINGS_BALANCE_ID, 50000);

    const month = await thisMonth(client);
    expect(month.toSavings.plan).toBeCloseTo(0, 2);
    expect(month.resultBy.savings.plan).toBeCloseTo(50000, 2);
    expect(month.resultBy.main.plan).toBeCloseTo(10000, 2);
  });

  it("факт считает настоящий переезд денег, а не задуманный", async () => {
    const client = api();
    const { card, deposit } = await twoPools(client);
    const salary = await category(client, "Зарплата-тест", "INCOME");

    await record(client, {
      accountId: card.id,
      categoryId: salary.id,
      type: "INCOME",
      amount: 100000
    });
    await client.post("/transactions/transfer", {
      fromAccountId: card.id,
      toAccountId: deposit.id,
      amount: "30000",
      date: today()
    });
    await plan(client, SAVINGS_TRANSFER_ID, 20000);

    const month = await thisMonth(client);
    expect(month.toSavings.fact).toBeCloseTo(30000, 2);
    // Собирался отложить 20 000, отложил 30 000 — разница отвечает на живой
    // вопрос, а не на арифметический.
    expect(month.toSavings.diff).toBeCloseTo(-10000, 2);
  });

  it("доход, пришедший прямо на вклад, переводом не считается", async () => {
    // Иначе проценты по вкладу выглядели бы как перевод, которого не было.
    const client = api();
    const { deposit } = await twoPools(client);
    const percent = await category(client, "Проценты-тест", "INCOME");

    await record(client, {
      accountId: deposit.id,
      categoryId: percent.id,
      type: "INCOME",
      amount: 5000
    });

    const month = await thisMonth(client);
    expect(month.incomeBy.savings).toBeCloseTo(5000, 2);
    expect(month.toSavings.fact).toBeCloseTo(0, 2);
  });

  it("трата с вклада переводом тоже не считается", async () => {
    const client = api();
    const { deposit } = await twoPools(client);
    const repair = await category(client, "Ремонт-тест", "EXPENSE");
    await client.put(`/accounts?id=${deposit.id}`, {
      id: deposit.id,
      name: "Вклад",
      type: "SAVINGS",
      balance: "40000"
    });

    await record(client, {
      accountId: deposit.id,
      categoryId: repair.id,
      type: "EXPENSE",
      amount: 15000
    });

    const month = await thisMonth(client);
    expect(month.expenseBy.savings).toBeCloseTo(15000, 2);
    expect(month.toSavings.fact).toBeCloseTo(0, 2);
  });

  it("пополнение цели — это тоже переезд в сбережения", async () => {
    const client = api();
    const { card } = await twoPools(client);
    const goal = await client.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "100000",
      currentAmount: "0",
      deadline: "2027-01-01"
    });
    await client.put(`/accounts?id=${card.id}`, {
      id: card.id,
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "50000"
    });
    await client.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      accountId: card.id,
      amount: "12000"
    });

    const month = await thisMonth(client);
    expect(month.toSavings.fact).toBeCloseTo(12000, 2);
  });
});

// Просьба владельца: «в итогах должно быть разделение для Основных и
// Сбережений». До 1.46.0 делился только факт итога, а план и разница стояли
// одной цифрой на обе колонки.
describe("итоги доходов и расходов по двум группам — во всех строках", () => {
  const plan = (client: LocalApiClient, categoryId: string, amount: number) =>
    client.post("/plan", { month: monthKey(), categoryId, amount: String(amount) });

  it("план статьи без истории идёт через основные", async () => {
    const client = api();
    await twoPools(client);
    const salary = await category(client, "Зарплата-итог", "INCOME");
    const food = await category(client, "Еда-итог", "EXPENSE");
    await plan(client, salary.id, 100000);
    await plan(client, food.id, 30000);

    const month = await thisMonth(client);
    expect(month.incomePools.main.plan).toBeCloseTo(100000, 2);
    expect(month.incomePools.savings.plan).toBeCloseTo(0, 2);
    expect(month.expensePools.main.plan).toBeCloseTo(30000, 2);
    expect(month.expensePools.savings.plan).toBeCloseTo(0, 2);
  });

  it("план статьи, чьи деньги оседают на вкладе, идёт в сбережения", async () => {
    // Проценты приходят на вклад. Запиши их план в основные — и в каждом
    // месяце вышла бы ложная разница в обе стороны: «основные недобрали»,
    // «сбережения перевыполнили», хотя всё пришло ровно как задумано.
    const client = api();
    const { deposit } = await twoPools(client);
    const percent = await category(client, "Проценты-итог", "INCOME");
    await record(client, {
      accountId: deposit.id,
      categoryId: percent.id,
      type: "INCOME",
      amount: 5000
    });
    await plan(client, percent.id, 5000);

    const month = await thisMonth(client);
    expect(month.incomePools.savings.plan).toBeCloseTo(5000, 2);
    expect(month.incomePools.savings.fact).toBeCloseTo(5000, 2);
    expect(month.incomePools.savings.diff).toBeCloseTo(0, 2);
    expect(month.incomePools.main.diff).toBeCloseTo(0, 2);
  });

  it("половины складываются в целое — и итог месяца сходится с ними", async () => {
    const client = api();
    const { card, deposit } = await twoPools(client);
    const salary = await category(client, "Зарплата-сумма", "INCOME");
    const percent = await category(client, "Проценты-сумма", "INCOME");
    const food = await category(client, "Еда-сумма", "EXPENSE");
    await record(client, {
      accountId: card.id,
      categoryId: salary.id,
      type: "INCOME",
      amount: 90000
    });
    await record(client, {
      accountId: deposit.id,
      categoryId: percent.id,
      type: "INCOME",
      amount: 3000
    });
    await record(client, {
      accountId: card.id,
      categoryId: food.id,
      type: "EXPENSE",
      amount: 20000
    });
    await plan(client, salary.id, 100000);
    await plan(client, percent.id, 2500);
    await plan(client, food.id, 25000);

    const month = await thisMonth(client);
    for (const [pools, whole] of [
      [month.incomePools, month.income],
      [month.expensePools, month.expense]
    ] as const) {
      expect(pools.main.plan + pools.savings.plan).toBeCloseTo(whole.plan, 2);
      expect(pools.main.fact + pools.savings.fact).toBeCloseTo(whole.fact, 2);
      expect(pools.main.diff + pools.savings.diff).toBeCloseTo(whole.diff, 2);
    }
    // Итог месяца — одна сумма, как бы её ни делили.
    expect(month.resultBy.main.plan + month.resultBy.savings.plan).toBeCloseTo(
      month.result.plan,
      2
    );
    // Проценты по плану осели в сбережениях — и итог сбережений их видит.
    expect(month.resultBy.savings.plan).toBeCloseTo(2500, 2);
  });
});
