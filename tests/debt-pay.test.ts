import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// «Внести платёж» по долгу: расход со счёта и такое же уменьшение долга.

async function setup(extra: Record<string, string> = {}) {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "50000" });
  const account = (await client.get("/accounts")).accounts[0].id;
  await client.post("/debts", {
    name: "Кредитка",
    kind: "CREDIT_CARD",
    balance: "30000",
    originalAmount: "30000",
    interestRate: "20",
    minPayment: "3000",
    dueDay: "5",
    ...extra
  });
  const debt = async () => (await client.get("/debts")).liabilities[0];
  const balance = async () =>
    (await client.get("/accounts")).accounts.find((a) => a.id === account)!.balance;
  const ledger = async () => (await client.get("/transactions?period=all")).transactions;
  return { client, account, debt, balance, ledger };
}

describe("платёж по долгу", () => {
  it("записывает расход со счёта и уменьшает долг", async () => {
    const { client, account, debt, balance, ledger } = await setup();
    const before = await debt();
    const result = await client.post("/debts/pay", {
      id: before.id,
      amount: "5000",
      accountId: account
    });
    expect(result).toMatchObject({ paid: 5000, balance: 25000, closed: false });
    expect((await debt()).balance).toBe(25000);
    expect(await balance()).toBe(45000);
    const [row] = await ledger();
    expect(row).toMatchObject({ amount: 5000, type: "EXPENSE", description: "Кредитка" });
    expect(row.liabilityId).toBe(before.id);
  });

  it("платёж на сумму и день, которые назвали", async () => {
    const { client, account, debt, ledger } = await setup();
    const { id } = await debt();
    await client.post("/debts/pay", {
      id,
      amount: "1 234,5",
      accountId: account,
      date: "2026-03-07"
    });
    const [row] = await ledger();
    expect(row.amount).toBe(1234.5);
    expect(row.date.slice(0, 10)).toBe("2026-03-07");
    expect((await debt()).balance).toBe(28765.5);
  });

  it("заплатили больше остатка — долг нулевой, со счёта ушла вся сумма", async () => {
    const { client, account, debt, balance } = await setup();
    const { id } = await debt();
    const result = await client.post("/debts/pay", {
      id,
      amount: "31000",
      accountId: account
    });
    expect(result.closed).toBe(true);
    expect((await debt()).balance).toBe(0);
    expect(await balance()).toBe(19000);
  });

  it("платёж в этом месяце — автоплатёж второй раз не спишет", async () => {
    const { client, account, debt } = await setup({ autoPay: "true", dueDay: "1" });
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "3000", accountId: account });
    const posted = await client.post("/debts/auto-pay", {});
    expect(posted.posted).toBe(0);
    expect((await debt()).balance).toBe(27000);
  });

  it("счёт по умолчанию — из долга, если счёт не указан", async () => {
    const { client, account, debt, balance } = await setup({ paymentAccountId: "" });
    const { id } = await debt();
    // Без счёта ни в запросе, ни в долге — понятный отказ.
    await expect(client.post("/debts/pay", { id, amount: "100" })).rejects.toThrow(/счёт/);
    void account;
    expect(await balance()).toBe(50000);
  });

  it("закрытый долг, пустая и странная сумма — отказ", async () => {
    const { client, account, debt } = await setup();
    const { id } = await debt();
    await expect(
      client.post("/debts/pay", { id, amount: "", accountId: account })
    ).rejects.toThrow();
    await expect(
      client.post("/debts/pay", { id, amount: "-5", accountId: account })
    ).rejects.toThrow();
    await expect(
      client.post("/debts/pay", { id: "нет", amount: "5", accountId: account })
    ).rejects.toThrow(/нет/);
    await client.put("/debts", {
      id,
      name: "Кредитка",
      kind: "CREDIT_CARD",
      balance: "30000",
      originalAmount: "30000",
      interestRate: "20",
      minPayment: "3000",
      settled: "true"
    });
    await expect(
      client.post("/debts/pay", { id, amount: "5", accountId: account })
    ).rejects.toThrow(/закрыт/);
  });
});
