import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { convert, DEFAULT_CURRENCY_RATES } from "@/lib/currency";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Платёж по долгу и сам долг держатся вместе: удалили платёж — долг вернулся,
// вернули из корзины — снова меньше, поправили сумму — долг на разницу.

async function setup(extra: Record<string, string> = {}) {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "50000" });
  const account = (await client.get("/accounts")).accounts[0];
  await client.post("/debts", {
    name: "Кредит",
    kind: "LOAN",
    balance: "30000",
    originalAmount: "30000",
    interestRate: "10",
    minPayment: "3000",
    dueDay: "1",
    ...extra
  });
  const debt = async () => (await client.get("/debts")).liabilities[0];
  const ledger = async () => (await client.get("/transactions?period=all")).transactions;
  const cash = async () =>
    (await client.get("/accounts")).accounts.find((a) => a.id === account.id)!.balance;
  return { client, account, debt, ledger, cash };
}

describe("платёж по долгу и долг", () => {
  it("удалили платёж — долг и счёт как были", async () => {
    const { client, account, debt, ledger, cash } = await setup();
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "5000", accountId: account.id });
    expect((await debt()).balance).toBe(25000);
    const [row] = await ledger();
    await client.delete(`/transactions?id=${row.id}`);
    expect((await debt()).balance).toBe(30000);
    expect(await cash()).toBe(50000);
  });

  it("вернули платёж из корзины — долг снова меньше", async () => {
    const { client, account, debt, ledger } = await setup();
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "5000", accountId: account.id });
    const [row] = await ledger();
    await client.delete(`/transactions?id=${row.id}`);
    const trash = await client.get("/trash");
    await client.post("/trash", { action: "restore", ids: trash.entries.map((e) => e.id) });
    expect((await debt()).balance).toBe(25000);
  });

  it("поправили сумму платежа — долг на разницу", async () => {
    const { client, account, debt, ledger, cash } = await setup();
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "5000", accountId: account.id });
    const [row] = await ledger();
    await client.put("/transactions", {
      id: row.id,
      amount: "4000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: row.category.id,
      date: row.date
    });
    expect((await debt()).balance).toBe(26000);
    expect(await cash()).toBe(46000);
    expect((await ledger())[0].liabilityId).toBe(id);
  });

  it("обычная трата долг не трогает", async () => {
    const { client, account, debt, ledger } = await setup();
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "5000", accountId: account.id });
    const category = (await ledger())[0].category.id;
    await client.post("/transactions", {
      amount: "700",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: category,
      date: "2026-03-01"
    });
    const plain = (await ledger()).find((row) => !row.liabilityId)!;
    await client.delete(`/transactions?id=${plain.id}`);
    expect((await debt()).balance).toBe(25000);
  });

  it("автоплатёж по долларовому долгу с рублёвой карты — по курсу", async () => {
    const { client, debt, ledger } = await setup({
      currency: "USD",
      balance: "1000",
      originalAmount: "1000",
      minPayment: "100",
      autoPay: "true"
    });
    const { id } = await debt();
    expect((await debt()).currency).toBe("USD");
    await client.post("/debts/auto-pay", {});
    const [row] = await ledger();
    expect(row.liabilityId).toBe(id);
    expect(row.amount).toBeCloseTo(convert(100, "USD", "RUB", DEFAULT_CURRENCY_RATES), 2);
    expect((await debt()).balance).toBe(900);
    // Удалили — долг вернулся ровно на 100 $.
    await client.delete(`/transactions?id=${row.id}`);
    expect((await debt()).balance).toBe(1000);
  });
});
