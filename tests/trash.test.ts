import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { SheetPageData } from "@/lib/api/local/sheet";
import type { AccountsPageData, TransactionsPageData } from "@/lib/data";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { addToTrash, pruneTrash, vanishedRows, type TrashEntry } from "@/lib/trash/trash";

// Корзина: удалённое — здесь или на другом устройстве — 30 дней можно вернуть.

type TrashList = {
  entries: Array<{
    id: string;
    collection: string;
    title: string;
    amount: number | null;
    origin: string;
  }>;
};

describe("корзина — чистые функции", () => {
  const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    updatedAt: "x",
    ...extra
  });

  it("видит исчезнувшие строки в разделах, которые человек заводил сам", () => {
    const before = {
      transactions: [row("t1"), row("t2")],
      accounts: [row("a1")],
      sheetCells: [row("2026-10|c1")]
    };
    const after = { transactions: [row("t2")], accounts: [row("a1")], sheetCells: [] };
    const gone = vanishedRows(before, after);
    // Клетка таблицы — не «запись», её стирание — обычная правка.
    expect(gone.map((item) => `${item.collection}/${item.key}`)).toEqual(["transactions/t1"]);
  });

  it("старше 30 дней — выбрасывается, повторное удаление замещает прежнее", () => {
    let n = 0;
    const makeId = () => `e${++n}`;
    const old: TrashEntry = {
      id: "old",
      collection: "transactions",
      key: "t0",
      row: row("t0"),
      deletedAt: "2026-08-01T00:00:00.000Z",
      origin: "here"
    };
    const first = addToTrash(
      [old],
      [{ collection: "transactions", key: "t1", row: row("t1") }],
      "2026-10-01T00:00:00.000Z",
      "here",
      makeId
    );
    expect(first.map((entry) => entry.key)).toEqual(["t1"]);
    const again = addToTrash(
      first,
      [{ collection: "transactions", key: "t1", row: row("t1") }],
      "2026-10-02T00:00:00.000Z",
      "elsewhere",
      makeId
    );
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ key: "t1", origin: "elsewhere" });
    expect(pruneTrash(again, "2026-11-05T00:00:00.000Z")).toEqual([]);
  });
});

describe("корзина в книге", () => {
  async function setup() {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "10000" });
    const page = await client.get<TransactionsPageData>("/transactions");
    const account = page.accounts[0].id;
    const category = page.categories.find((item) => item.kind === "EXPENSE")!.id;
    await client.post("/transactions", {
      type: "EXPENSE",
      amount: "1500",
      accountId: account,
      categoryId: category,
      description: "Ужин",
      date: "2026-10-01"
    });
    const balance = async () =>
      (await client.get<AccountsPageData>("/accounts")).accounts.find((a) => a.id === account)!
        .balance;
    const ledger = async () =>
      (await client.get<TransactionsPageData>("/transactions?period=all")).transactions;
    return { client, balance, ledger };
  }

  it("удалённая операция лежит в корзине и возвращается с деньгами на счёте", async () => {
    const { client, balance, ledger } = await setup();
    expect(await balance()).toBe(8500);
    const [row] = await ledger();
    await client.delete(`/transactions?id=${row.id}`);
    expect(await balance()).toBe(10000);

    const trash = await client.get<TrashList>("/trash");
    expect(trash.entries).toHaveLength(1);
    expect(trash.entries[0]).toMatchObject({
      collection: "transactions",
      title: "Ужин",
      amount: 1500,
      origin: "here"
    });

    const result = await client.post<{ restored: number }>("/trash", {
      action: "restore",
      ids: [trash.entries[0].id]
    });
    expect(result.restored).toBe(1);
    expect((await ledger()).map((item) => item.description)).toEqual(["Ужин"]);
    expect(await balance()).toBe(8500);
    expect((await client.get<TrashList>("/trash")).entries).toEqual([]);
  });

  it("удаление, пришедшее с другого устройства, тоже попадает в корзину", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "10000" });
    const page = await client.get<TransactionsPageData>("/transactions");
    await client.post("/transactions", {
      type: "EXPENSE",
      amount: "700",
      accountId: page.accounts[0].id,
      categoryId: page.categories.find((item) => item.kind === "EXPENSE")!.id,
      description: "Такси",
      date: "2026-10-01"
    });
    await client.get("/transactions");

    // Синхронизация пишет слитую книгу ниже клиента и просит его забыть кэш —
    // как это делает lib/api/client.ts.
    const key = (await storage.keys()).find((item) => /^localFinanceState_[^:]+$/.test(item))!;
    const book = (await storage.getItem<Record<string, unknown>>(key))!;
    await storage.setItem(key, { ...book, transactions: [] });
    client.forgetCachedState();

    await client.get("/transactions");
    const trash = await client.get<TrashList>("/trash");
    expect(trash.entries).toHaveLength(1);
    expect(trash.entries[0]).toMatchObject({ title: "Такси", origin: "elsewhere" });
  });

  it("перевод удаляется целиком и возвращается целиком — деньги не исчезают", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "1000" });
    await client.post("/accounts", { name: "Наличные", type: "CASH", balance: "0" });
    const accounts = async () =>
      (await client.get<AccountsPageData>("/accounts")).accounts.map((item) => item.balance);
    const [from, to] = (await client.get<AccountsPageData>("/accounts")).accounts;
    await client.post("/transactions", {
      action: "transfer",
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "300",
      date: "2026-10-01"
    });
    expect(await accounts()).toEqual([700, 300]);
    const legs = (await client.get<TransactionsPageData>("/transactions?period=all")).transactions;

    // Правка одной строки (форма не присылает номер перевода) не отрывает её
    // от перевода.
    await client.put("/transactions", {
      id: legs[0].id,
      type: legs[0].type,
      amount: String(legs[0].amount),
      accountId: legs[0].account.id,
      categoryId: legs[0].category.id,
      date: "2026-10-02",
      description: legs[0].description
    });
    const edited = (await client.get<TransactionsPageData>("/transactions?period=all"))
      .transactions;
    expect(edited.every((item) => item.transferId === legs[1].transferId)).toBe(true);

    // Удалили одну строку перевода — ушёл весь перевод, оба счёта как были.
    await client.delete(`/transactions?id=${legs[0].id}`);
    expect(await accounts()).toEqual([1000, 0]);
    expect(
      (await client.get<TransactionsPageData>("/transactions?period=all")).transactions
    ).toEqual([]);

    // Вернули одну запись корзины — вернулся весь перевод.
    const trash = await client.get<TrashList>("/trash");
    expect(trash.entries).toHaveLength(2);
    await client.post("/trash", { action: "restore", ids: [trash.entries[0].id] });
    expect(await accounts()).toEqual([700, 300]);
    expect((await client.get<TrashList>("/trash")).entries).toEqual([]);
  });

  it("старый перевод (до 1.10, только метка в описании) тоже удаляется целиком", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "1000" });
    await client.post("/accounts", { name: "Наличные", type: "CASH", balance: "0" });
    const [from, to] = (await client.get<AccountsPageData>("/accounts")).accounts;
    await client.post("/transactions", {
      action: "transfer",
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "300",
      date: "2026-10-01"
    });
    // Как было записано до 1.10: номера перевода нет, есть метка в описании.
    const key = (await storage.keys()).find((item) => /^localFinanceState_[^:]+$/.test(item))!;
    const book = (await storage.getItem<{ transactions: Array<Record<string, unknown>> }>(key))!;
    await storage.setItem(key, {
      ...book,
      transactions: book.transactions.map(({ transferId: _id, ...row }) => (void _id, row))
    });
    client.forgetCachedState();
    const legs = (await client.get<TransactionsPageData>("/transactions?period=all")).transactions;
    expect(legs).toHaveLength(2);
    expect(legs.every((row) => !row.transferId)).toBe(true);

    await client.delete(`/transactions?id=${legs[0].id}`);
    expect(
      (await client.get<TransactionsPageData>("/transactions?period=all")).transactions
    ).toEqual([]);
  });

  it("удалённый столбец таблицы возвращается со своими числами", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const column = await client.post<{ id: string }>("/sheet", {
      action: "addColumn",
      name: "Продукты",
      kind: "expense"
    });
    await client.post("/sheet", {
      action: "setCells",
      cells: [
        { month: "2026-08", columnId: column.id, input: "20000" },
        { month: "2026-09", columnId: column.id, input: "18000+500" }
      ]
    });
    await client.post("/sheet", { action: "removeColumn", id: column.id });
    expect((await client.get<SheetPageData>("/sheet")).cells).toEqual([]);

    const trash = await client.get<TrashList>("/trash");
    expect(trash.entries).toHaveLength(1);
    expect(trash.entries[0]).toMatchObject({ collection: "sheetColumns", title: "Продукты" });
    await client.post("/trash", { action: "restore", ids: [trash.entries[0].id] });
    const sheet = await client.get<SheetPageData>("/sheet");
    expect(sheet.columns.map((item) => item.name)).toContain("Продукты");
    expect(sheet.cells.map((cell) => cell.input).sort()).toEqual(["18000+500", "20000"]);
  });

  it("«Очистить корзину» убирает всё; удалить одну — только её", async () => {
    const { client, ledger } = await setup();
    const [row] = await ledger();
    await client.delete(`/transactions?id=${row.id}`);
    const trash = await client.get<TrashList>("/trash");
    await client.post("/trash", { action: "purge", ids: [trash.entries[0].id] });
    expect((await client.get<TrashList>("/trash")).entries).toEqual([]);
  });
});
