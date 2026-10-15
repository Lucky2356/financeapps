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

  // Долг не уходит ниже нуля: переплата снимает с него только остаток. Удаление
  // возвращало всю сумму платежа — долг 100 после удаления переплаты 150
  // становился 150.
  it("удалили переплату — долг как был, а не больше", async () => {
    const { client, account, debt, ledger, cash } = await setup({
      balance: "100",
      originalAmount: "100"
    });
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "150", accountId: account.id });
    expect((await debt()).balance).toBe(0);
    const [row] = await ledger();
    expect(row.debtApplied).toBe(100);
    await client.delete(`/transactions?id=${row.id}`);
    expect((await debt()).balance).toBe(100);
    expect(await cash()).toBe(50000);
  });

  it("переплату вернули из корзины и удалили снова — долг сходится", async () => {
    const { client, account, debt, ledger } = await setup({
      balance: "100",
      originalAmount: "100"
    });
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "150", accountId: account.id });
    const [row] = await ledger();
    await client.delete(`/transactions?id=${row.id}`);
    const trash = await client.get("/trash");
    await client.post("/trash", { action: "restore", ids: trash.entries.map((e) => e.id) });
    expect((await debt()).balance).toBe(0);
    await client.delete(`/transactions?id=${row.id}`);
    expect((await debt()).balance).toBe(100);
  });

  it("поправили сумму переплаты — долг считается от того, что сняли", async () => {
    const { client, account, debt, ledger } = await setup({
      balance: "100",
      originalAmount: "100"
    });
    const { id } = await debt();
    await client.post("/debts/pay", { id, amount: "150", accountId: account.id });
    const [row] = await ledger();
    const edit = (amount: string) =>
      client.put("/transactions", {
        id: row.id,
        amount,
        type: "EXPENSE",
        accountId: account.id,
        categoryId: row.category.id,
        date: row.date
      });
    await edit("60");
    expect((await debt()).balance).toBe(40);
    await edit("200");
    expect((await debt()).balance).toBe(0);
    await client.delete(`/transactions?id=${row.id}`);
    expect((await debt()).balance).toBe(100);
  });

  it("старый платёж без доли — долг возвращается, но не выше исходной суммы", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    const account = await client.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "1000"
    });
    const created = await client.post("/debts", {
      name: "Друг",
      kind: "OTHER",
      balance: "100",
      originalAmount: "100",
      minPayment: "0"
    });
    await client.post("/debts/pay", { id: created.id, amount: "150", accountId: account.id });
    // Такой платёж записала прежняя версия: поля `debtApplied` у него нет.
    const fresh = new LocalApiClient(storage);
    const [row] = (await fresh.get("/transactions?period=all")).transactions;
    const { debtApplied: _applied, ...legacy } = row;
    void _applied;
    await fresh.delete(`/transactions?id=${row.id}`);
    await fresh.post("/debts/pay", { id: created.id, amount: "100", accountId: account.id });
    const [paid] = (await fresh.get("/transactions?period=all")).transactions;
    await fresh.delete(`/transactions?id=${paid.id}`);
    expect((await fresh.get("/debts")).liabilities[0].balance).toBe(100);
    await fresh.post("/transactions", {
      action: "restore",
      transaction: JSON.stringify({ ...legacy, debtApplied: undefined })
    });
    expect((await fresh.get("/debts")).liabilities[0].balance).toBe(0);
  });
});

// Возврат из корзины в любом порядке даёт тот же долг.
//
// Счёт, возвращаемый вместе со своими операциями, несёт остаток с ними, и
// операции по нему не проводятся второй раз. Долг при этом пропускался тоже:
// платёж возвращался, а долг оставался таким, будто платежа нет. Долг же,
// удалённый раньше платежа, держит этот платёж в своём остатке — вернуть его, а
// потом платёж, значило снять платёж с долга дважды.
describe("возврат из корзины: долг сходится в любом порядке", () => {
  const PAID = 25000;
  type Entry = { id: string; collection: string; key: string; deletedAt: string };

  async function world() {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "50000" });
    const account = (await client.get("/accounts")).accounts[0];
    await client.post("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "30000",
      originalAmount: "30000",
      interestRate: "10",
      minPayment: "3000",
      dueDay: "1"
    });
    const debtId = (await client.get("/debts")).liabilities[0].id;
    await client.post("/debts/pay", { id: debtId, amount: "5000", accountId: account.id });
    const payment = (await client.get("/transactions?period=all")).transactions[0];
    const bookKey = (await storage.keys()).find((key) => /^localFinanceState_[^:]+$/.test(key))!;
    const trashKey = `${bookKey}:trash`;
    const entries = async () =>
      (await storage.getItem<{ entries: Entry[] }>(trashKey))?.entries ?? [];

    return {
      client,
      debtId,
      payment,
      debt: async () =>
        (await client.get("/debts")).liabilities.find((item) => item.id === debtId)?.balance,
      /** Время удаления — явно: два удаления подряд могут прийтись на одну миллисекунду. */
      async stamp(collection: string, at: string) {
        await storage.setItem(trashKey, {
          v: 1,
          entries: (await entries()).map((entry) =>
            entry.collection === collection ? { ...entry, deletedAt: at } : entry
          )
        });
      },
      /**
       * Счёт исчезает из книги — так, как его убирает сверка с другим
       * устройством (здесь же счёт только прячется в архив). В корзину его
       * кладёт само приложение, заметив пропажу при следующем чтении.
       */
      async accountVanishes(at: string) {
        const book = (await storage.getItem<{ accounts: Array<{ id: string }> }>(bookKey))!;
        await storage.setItem(bookKey, {
          ...book,
          accounts: book.accounts.filter((item) => item.id !== account.id)
        });
        client.forgetCachedState();
        await client.get("/trash");
        await this.stamp("accounts", at);
      },
      async restore(collections: string[]) {
        const ids = (await entries())
          .filter((entry) => collections.includes(entry.collection))
          .map((entry) => entry.id);
        return client.post("/trash", { action: "restore", ids });
      }
    };
  }

  describe("платёж и его счёт", () => {
    // Платёж удалили (долг вернулся), потом не стало и счёта.
    async function bothInTrash() {
      const w = await world();
      await w.client.delete(`/transactions?id=${w.payment.id}`);
      expect(await w.debt()).toBe(30000);
      await w.stamp("transactions", "2026-10-01T10:00:00.000Z");
      await w.accountVanishes("2026-10-01T11:00:00.000Z");
      return w;
    }

    it("вместе, одним возвратом", async () => {
      const w = await bothInTrash();
      expect((await w.restore(["accounts", "transactions"])).restored).toBe(2);
      expect(await w.debt()).toBe(PAID);
    });

    it("сначала счёт, потом платёж", async () => {
      const w = await bothInTrash();
      await w.restore(["accounts"]);
      await w.restore(["transactions"]);
      expect(await w.debt()).toBe(PAID);
    });

    it("сначала платёж (не выходит — счёта нет), потом оба", async () => {
      const w = await bothInTrash();
      expect((await w.restore(["transactions"])).restored).toBe(0);
      await w.restore(["accounts", "transactions"]);
      expect(await w.debt()).toBe(PAID);
    });
  });

  describe("платёж и его долг", () => {
    async function debtThenPayment(debtAt: string, paymentAt: string) {
      const w = await world();
      await w.client.delete(`/debts?id=${w.debtId}`);
      await w.client.delete(`/transactions?id=${w.payment.id}`);
      await w.stamp("liabilities", debtAt);
      await w.stamp("transactions", paymentAt);
      return w;
    }

    it("долг удалён раньше платежа — вместе", async () => {
      const w = await debtThenPayment("2026-10-01T10:00:00.000Z", "2026-10-01T11:00:00.000Z");
      await w.restore(["liabilities", "transactions"]);
      expect(await w.debt()).toBe(PAID);
    });

    it("долг удалён раньше платежа — сначала долг, потом платёж", async () => {
      const w = await debtThenPayment("2026-10-01T10:00:00.000Z", "2026-10-01T11:00:00.000Z");
      await w.restore(["liabilities"]);
      // Платежа в книге нет — и в долге его нет.
      expect(await w.debt()).toBe(30000);
      await w.restore(["transactions"]);
      expect(await w.debt()).toBe(PAID);
    });

    it("долг и платёж исчезли разом (сверка) — вместе", async () => {
      const w = await debtThenPayment("2026-10-01T10:00:00.000Z", "2026-10-01T10:00:00.000Z");
      await w.restore(["liabilities", "transactions"]);
      expect(await w.debt()).toBe(PAID);
    });

    it("платёж удалён раньше долга — вместе и по очереди", async () => {
      for (const order of [
        [["liabilities", "transactions"]],
        [["liabilities"], ["transactions"]]
      ]) {
        const w = await world();
        await w.client.delete(`/transactions?id=${w.payment.id}`);
        await w.client.delete(`/debts?id=${w.debtId}`);
        await w.stamp("transactions", "2026-10-01T10:00:00.000Z");
        await w.stamp("liabilities", "2026-10-01T11:00:00.000Z");
        for (const step of order) await w.restore(step);
        expect(await w.debt(), JSON.stringify(order)).toBe(PAID);
      }
    });
  });
});
