import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Деньги, которые пропадали или брались ниоткуда, — разбор 2.8.3. Каждая
// проверка повторяет то, что человек делал на экране, и падала до исправления.

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

async function balanceOf(client: LocalApiClient, accountId: string) {
  const page = await client.get("/accounts");
  return page.accounts.find((item) => item.id === accountId)?.balance;
}

async function expenseCategory(client: LocalApiClient) {
  const page = await client.get("/categories");
  return page.categories.find((item) => item.kind === "EXPENSE" && item.name !== "Переводы")!;
}

async function stateOf(client: LocalApiClient) {
  return (
    client as unknown as { state(mutable?: boolean): Promise<Record<string, unknown>> }
  ).state(false);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("переводы и архив", () => {
  it("перевод на архивный счёт не удаляется и не правится", async () => {
    const client = createClient();
    const main = await client.post("/accounts", { name: "Основной", balance: "0" });
    const old = await client.post("/accounts", { name: "Старый", balance: "1000" });
    // «Перенести остаток и убрать в архив»: перевод, потом архив.
    const transfer = await client.post("/transactions", {
      action: "transfer",
      amount: "1000",
      fromAccountId: old.id,
      toAccountId: main.id,
      date: "2026-10-12"
    });
    await client.delete(`/accounts?id=${old.id}`);
    const income = transfer.transactions[1];

    await expect(client.delete(`/transactions?id=${income.id}`)).rejects.toThrow(/архив/i);
    await expect(
      client.put("/transactions", {
        id: income.id,
        amount: "500",
        type: "INCOME",
        accountId: main.id,
        categoryId: income.category.id,
        date: "2026-10-12"
      })
    ).rejects.toThrow(/архив/i);
    expect(await balanceOf(client, main.id)).toBe(1000);
  });

  it("половину перевода нельзя превратить в доход или трату", async () => {
    const client = createClient();
    const from = await client.post("/accounts", { name: "A", balance: "1000" });
    const to = await client.post("/accounts", { name: "B", balance: "0" });
    const transfer = await client.post("/transactions", {
      action: "transfer",
      amount: "1000",
      fromAccountId: from.id,
      toAccountId: to.id,
      date: "2026-10-10"
    });
    const [expense, income] = transfer.transactions;

    // Поступление «стало» тратой: B −1000 вместо +1000, а пара осталась
    // переводом — итоги его не видят, капитал сдвинулся из ниоткуда.
    await expect(
      client.put("/transactions", {
        id: income.id,
        amount: "1000",
        type: "EXPENSE",
        accountId: to.id,
        categoryId: income.category.id,
        date: "2026-10-10"
      })
    ).rejects.toThrow(/доходом или тратой/i);
    // Списание на тот же счёт, что и поступление, — уже не перевод.
    await expect(
      client.put("/transactions", {
        id: expense.id,
        amount: "1000",
        type: "EXPENSE",
        accountId: to.id,
        categoryId: expense.category.id,
        date: "2026-10-10"
      })
    ).rejects.toThrow(/разными счетами/i);
    expect(await balanceOf(client, from.id)).toBe(0);
    expect(await balanceOf(client, to.id)).toBe(1000);
  });
});

describe("долги", () => {
  it("автоплатёж не списывает с другого счёта, если выбранный в архиве", async () => {
    const client = createClient();
    const main = await client.post("/accounts", { name: "Основной", balance: "50000" });
    const card = await client.post("/accounts", { name: "Кредитная", balance: "50000" });
    const category = await expenseCategory(client);
    await client.post("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "100000",
      minPayment: "5000",
      dueDay: "1",
      autoPay: "true",
      paymentAccountId: card.id,
      paymentCategoryId: category.id
    });
    await client.delete(`/accounts?id=${card.id}`);

    const result = await client.post("/debts/auto-pay", {});
    expect(result.posted).toBe(0);
    expect(await balanceOf(client, main.id)).toBe(50000);
  });

  it("автоплатёж не берёт чужую категорию, если выбранной больше нет", async () => {
    const client = createClient();
    const main = await client.post("/accounts", { name: "Основной", balance: "50000" });
    const category = await client.post("/categories", { name: "Кредиты", kind: "EXPENSE" });
    await client.post("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "100000",
      minPayment: "5000",
      dueDay: "1",
      autoPay: "true",
      paymentAccountId: main.id,
      paymentCategoryId: category.id
    });
    await client.delete(`/categories?id=${category.id}`);

    const result = await client.post("/debts/auto-pay", {});
    expect(result.posted).toBe(0);
    expect(await balanceOf(client, main.id)).toBe(50000);
  });

  it("удалённый ручной платёж не закрывает месяц для автоплатежа", async () => {
    const client = createClient();
    const main = await client.post("/accounts", { name: "Основной", balance: "50000" });
    const category = await expenseCategory(client);
    const debt = await client.post("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "100000",
      minPayment: "5000",
      dueDay: "1",
      autoPay: "true",
      paymentAccountId: main.id,
      paymentCategoryId: category.id
    });
    const first = await client.post("/debts/pay", { id: debt.id, amount: "1000" });
    const second = await client.post("/debts/pay", { id: debt.id, amount: "2000" });

    // Платёж этого месяца ещё остался — месяц закрыт.
    await client.delete(`/transactions?id=${first.transactionId}`);
    expect((await client.post("/debts/auto-pay", {})).posted).toBe(0);
    expect(await balanceOf(client, main.id)).toBe(48000);

    // Удалён и он — автоплатёж списывает месяц.
    await client.delete(`/transactions?id=${second.transactionId}`);
    expect((await client.post("/debts/auto-pay", {})).posted).toBe(1);
    expect(await balanceOf(client, main.id)).toBe(45000);

    // А удалённый платёж, который записал сам автоплатёж, не воскресает:
    // человек так говорит, что месяц оплачен иначе.
    const rows = (await client.get("/transactions?period=all&limit=all")).transactions;
    const auto = rows.find((row) => row.liabilityId === debt.id)!;
    await client.delete(`/transactions?id=${auto.id}`);
    expect((await client.post("/debts/auto-pay", {})).posted).toBe(0);
  });

  it("сумма долга, остаток счёта и ставка — в разумных пределах", async () => {
    const client = createClient();
    await expect(client.post("/accounts", { name: "A", balance: "1e308" })).rejects.toThrow(/млрд/);
    await expect(client.post("/accounts", { name: "A", balance: "-1e308" })).rejects.toThrow(
      /млрд/
    );
    await expect(client.post("/debts", { name: "Долг", balance: "1e308" })).rejects.toThrow(/млрд/);
    await expect(
      client.post("/debts", { name: "Долг", balance: "1000", minPayment: "1e300" })
    ).rejects.toThrow(/млрд/);
    await expect(
      client.post("/debts", { name: "Долг", balance: "1000", interestRate: "1e308" })
    ).rejects.toThrow(/ставк/i);
    const dashboard = await client.get("/dashboard");
    expect(Number.isFinite(dashboard.netWorth)).toBe(true);
  });
});

describe("продажа бумаг", () => {
  it("деньги за бумагу, которой нет в портфеле, приходят на счёт", async () => {
    const client = createClient();
    const broker = await client.post("/accounts", {
      name: "Брокерский",
      type: "BROKERAGE",
      balance: "0"
    });
    const event = await client.post("/investments/events", {
      type: "SELL",
      ticker: "GAZP",
      quantity: "10",
      sellPrice: "150",
      fee: "0",
      date: "2026-10-01",
      accountId: broker.id
    });
    expect(await balanceOf(client, broker.id)).toBe(1500);

    // Удаление продажи снимает и эти деньги.
    await client.delete(`/investments/events?id=${event.id}`);
    expect(await balanceOf(client, broker.id)).toBe(0);
  });

  it("отмена продажи у позиции без покупок не теряет бумаги при докупке", async () => {
    const client = createClient();
    await client.post("/investments", {
      action: "addPosition",
      ticker: "SBER",
      quantity: "10",
      averageBuyPrice: "100"
    });
    const sale = await client.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "4",
      sellPrice: "150",
      fee: "0",
      date: "2026-10-01"
    });
    await client.post("/investments", {
      action: "addLot",
      ticker: "SBER",
      quantity: "1",
      price: "120",
      date: "2026-10-05"
    });
    await client.delete(`/investments/events?id=${sale.id}`);
    await client.post("/investments", {
      action: "addLot",
      ticker: "SBER",
      quantity: "1",
      price: "120",
      date: "2026-10-06"
    });

    const data = await client.get("/investments");
    expect(data.portfolio.find((row) => row.ticker === "SBER")?.quantity).toBe(12);
  });
});

describe("плановые операции", () => {
  it("недельный шаблон, ставший месячным, держит число из своей даты", async () => {
    const client = createClient();
    const account = await client.post("/accounts", { name: "Карта", balance: "10000" });
    const category = await expenseCategory(client);
    const weekly = await client.post("/recurring", {
      amount: "100",
      type: "EXPENSE",
      frequency: "WEEKLY",
      nextDate: "2026-10-05",
      isActive: "true",
      accountId: account.id,
      categoryId: category.id
    });
    // Проведены 5-е и 12-е, следующий — 19-е.
    await client.post("/recurring/materialize", { id: weekly.id });
    const page = await client.get("/recurring");
    const stored = page.recurringTransactions.find((item) => item.id === weekly.id)!;
    expect(stored.dayOfMonth).toBeUndefined();

    const monthly = await client.put("/recurring", {
      id: weekly.id,
      amount: "100",
      type: "EXPENSE",
      frequency: "MONTHLY",
      nextDate: "2026-10-19",
      isActive: "true",
      accountId: account.id,
      categoryId: category.id
    });
    expect(monthly.dayOfMonth).toBe(19);
  });

  it("шаблон со счётом в архиве можно поставить на паузу", async () => {
    const client = createClient();
    const account = await client.post("/accounts", { name: "Старая карта", balance: "0" });
    const category = await expenseCategory(client);
    const plan = await client.post("/recurring", {
      amount: "300",
      type: "EXPENSE",
      frequency: "MONTHLY",
      nextDate: "2026-11-01",
      isActive: "true",
      accountId: account.id,
      categoryId: category.id
    });
    await client.delete(`/accounts?id=${account.id}`);

    const paused = await client.put("/recurring", {
      id: plan.id,
      amount: "300",
      type: "EXPENSE",
      frequency: "MONTHLY",
      nextDate: "2026-11-01",
      isActive: "false",
      accountId: account.id,
      categoryId: category.id
    });
    expect(paused.isActive).toBe(false);
  });

  it("категорию из шаблона удалить нельзя", async () => {
    const client = createClient();
    const account = await client.post("/accounts", { name: "Карта", balance: "0" });
    const category = await client.post("/categories", { name: "Стриминг", kind: "EXPENSE" });
    await client.post("/recurring", {
      amount: "300",
      type: "EXPENSE",
      frequency: "MONTHLY",
      nextDate: "2026-11-01",
      isActive: "true",
      accountId: account.id,
      categoryId: category.id
    });

    await expect(client.delete(`/categories?id=${category.id}`)).rejects.toThrow(/планов/i);
    const state = await stateOf(client);
    expect(
      (state.categories as Array<{ id: string }>).some((item) => item.id === category.id)
    ).toBe(true);
  });
});
