import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { parseImportedAmount } from "@/services/import/CsvParsing";

// Ошибки в деньгах, найденные разбором перед 2.7.7. Каждая проверка
// воспроизводит то, что человек видел на экране, и падала до исправления.

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

async function categoryOf(client: LocalApiClient, kind: "INCOME" | "EXPENSE") {
  const page = await client.get("/categories");
  return page.categories.find((item) => item.kind === kind && item.name !== "Переводы")!;
}

async function balanceOf(client: LocalApiClient, accountId: string) {
  const page = await client.get("/accounts");
  return page.accounts.find((item) => item.id === accountId)!.balance;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("деньги после разбора 2.7.7", () => {
  it("смена основной валюты не превращает рубли в целях в доллары", async () => {
    const client = createClient();
    const account = await client.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000",
      currency: "RUB"
    });
    const goal = await client.post("/goals", {
      title: "Отпуск",
      targetAmount: "200000",
      deadline: "2027-06-01",
      linkedAccountId: account.id
    });
    await client.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      accountId: account.id,
      amount: "90000"
    });
    const before = await client.get("/dashboard");

    await client.post("/settings", { currency: "USD" });
    const after = await client.get("/dashboard");
    // Капитал тот же, только в долларах: не в сто раз больше.
    expect(after.netWorth).toBeLessThan(before.netWorth / 10);

    // Удалённая цель возвращает на рублёвый счёт ровно отложенные 90 000 ₽.
    await client.delete(`/goals?id=${goal.id}`);
    expect(await balanceOf(client, account.id)).toBeCloseTo(100000, 0);
  });

  it("правка одной половины перевода двигает и вторую", async () => {
    const client = createClient();
    const from = await client.post("/accounts", { name: "A", balance: "10000" });
    const to = await client.post("/accounts", { name: "B", balance: "0" });
    const result = await client.post("/transactions", {
      action: "transfer",
      amount: "1000",
      fromAccountId: from.id,
      toAccountId: to.id,
      date: "2026-10-10"
    });
    const expense = result.transactions[0];

    await client.put("/transactions", {
      id: expense.id,
      amount: "1500",
      type: "EXPENSE",
      accountId: from.id,
      categoryId: expense.category.id,
      date: "2026-10-11"
    });

    expect(await balanceOf(client, from.id)).toBe(8500);
    expect(await balanceOf(client, to.id)).toBe(1500);
    const list = await client.get("/transactions?limit=all");
    const income = list.transactions.find((row) => row.type === "INCOME")!;
    expect(income.amount).toBe(1500);
    expect(income.date.slice(0, 10)).toBe("2026-10-11");
  });

  it("внесённый заранее платёж по долгу не вычитается второй раз", async () => {
    const client = createClient();
    const account = await client.post("/accounts", { name: "Карта", balance: "100000" });
    const debt = await client.post("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "500000",
      minPayment: "20000",
      dueDay: "25",
      autoPay: "true",
      paymentAccountId: account.id,
      currency: "RUB"
    });
    const before = await client.get("/payday?day=5");

    await client.post("/debts/pay", { id: debt.id, amount: "20000", accountId: account.id });
    const after = await client.get("/payday?day=5");

    // Платёж и до этого был учтён как предстоящий: внесённый, он уходит из
    // предстоящих, а со счёта списывается — свободных столько же.
    expect(after.forecast?.free).toBe(before.forecast?.free);
  });

  it("просроченный неподтверждённый платёж остаётся в «До зарплаты»", async () => {
    vi.setSystemTime(new Date(2026, 9, 9, 12));
    const client = createClient();
    const account = await client.post("/accounts", { name: "Карта", balance: "50000" });
    const expense = await categoryOf(client, "EXPENSE");
    await client.post("/recurring", {
      amount: "30000",
      type: "EXPENSE",
      frequency: "MONTHLY",
      nextDate: "2026-10-10",
      accountId: account.id,
      categoryId: expense.id,
      isActive: "true",
      description: "Аренда"
    });
    const due = await client.get("/payday?day=5");

    // Срок прошёл, аренду не подтвердили: деньги ещё на счету, но заняты.
    vi.setSystemTime(new Date(2026, 9, 11, 12));
    const overdue = await client.get("/payday?day=5");
    expect(overdue.forecast?.free).toBe(due.forecast?.free);
  });

  it("месяц без лимита ничего не переносит в следующий", async () => {
    const client = createClient();
    const account = await client.post("/accounts", { name: "Карта", balance: "100000" });
    const food = await categoryOf(client, "EXPENSE");
    await client.post("/transactions", {
      amount: "5000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food.id,
      date: "2026-09-10"
    });
    await client.post("/budgets", {
      categoryId: food.id,
      limitAmount: "30000",
      rollover: "true",
      month: "2026-10"
    });
    const page = await client.get("/budgets?month=2026-10");
    expect(page.budgets.find((row) => row.categoryId === food.id)?.rolloverAmount).toBe(0);
  });

  it("история долларового счёта пересчитывает отложенное в цель в доллары", async () => {
    const client = createClient();
    const usd = await client.post("/accounts", { name: "USD", balance: "1000", currency: "USD" });
    const goal = await client.post("/goals", {
      title: "Цель",
      targetAmount: "100000",
      deadline: "2027-06-01",
      linkedAccountId: usd.id
    });
    await client.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      accountId: usd.id,
      amount: "100"
    });
    const history = await client.get("/balance-history?months=3");
    const row = history.accounts.find((item) => item.id === usd.id)!;
    // До пополнения на карте было 1 000 $, а не 900 + 9 000.
    expect(row.values[row.values.length - 2]).toBeCloseTo(1000, 0);
    expect(row.values[row.values.length - 1]).toBe(900);
  });

  it("минус валютного счёта гасится суммой в его валюте", async () => {
    const client = createClient();
    const rub = await client.post("/accounts", { name: "RUB", balance: "100000", currency: "RUB" });
    const usd = await client.post("/accounts", { name: "USD", balance: "-100", currency: "USD" });
    // То, что отправляет архив счёта с переводом остатка.
    await client.post("/transactions", {
      action: "transfer",
      toAmount: "100",
      fromAccountId: rub.id,
      toAccountId: usd.id,
      date: "2026-10-12"
    });
    expect(await balanceOf(client, usd.id)).toBe(0);
    // С рублёвого ушло 100 $ по курсу, а не 100 ₽.
    expect(await balanceOf(client, rub.id)).toBeLessThan(100000 - 100 * 10);
  });
});

describe("импорт выписки", () => {
  it("«руб.» и «р.» после суммы не умножают её на сто", () => {
    expect(parseImportedAmount("1 234,56 руб.")).toBe(1234.56);
    expect(parseImportedAmount("1234.56 р.")).toBe(1234.56);
    expect(parseImportedAmount("-500 руб.")).toBe(-500);
    expect(parseImportedAmount("‐100")).toBe(-100);
  });

  it("правило человека важнее категории из выписки", async () => {
    const client = createClient();
    const food = await categoryOf(client, "EXPENSE");
    await client.post("/rules", { match: "Пятёрочка", categoryId: food.id });
    const body = {
      dateColumn: "date",
      amountColumn: "amount",
      categoryColumn: "category",
      descriptionColumn: "description",
      rows: JSON.stringify([
        {
          date: "2025-12-31",
          amount: "-1 234,56",
          category: "Супермаркеты",
          description: "Пятёрочка"
        }
      ])
    };
    await client.post("/import", body);
    const list = await client.get("/transactions?limit=all");
    expect(list.transactions[0].category.id).toBe(food.id);

    // Повторная загрузка того же файла ничего не задваивает.
    const again = await client.post("/import", body);
    expect(again).toEqual(expect.objectContaining({ imported: 0, skipped: 1 }));
  });
});
