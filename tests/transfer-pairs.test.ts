import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { AccountsPageData, TransactionsPageData } from "@/lib/data";
import type { PlanFactPageData } from "@/types/finance";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import {
  findTransferPairs,
  pairKey,
  type PairRow,
  type TransferPair
} from "@/lib/transactions/transfer-pairs";

// «Это перевод?»: сняли со вклада на карту, а в книгу это пришло доходом на
// карте и тратой со вклада — из выписки или двумя записями руками.

const row = (
  id: string,
  type: "INCOME" | "EXPENSE",
  amount: number,
  accountId: string,
  date = "2026-10-01",
  extra: Partial<PairRow> = {}
): PairRow => ({
  id,
  type,
  amount,
  date,
  description: null,
  account: { id: accountId, label: accountId },
  category: { id: "c", label: "c" },
  ...extra
});

const rub = () => "RUB";

describe("поиск пар", () => {
  it("списание и поступление той же суммы на разных счетах, соседний день — пара", () => {
    const pairs = findTransferPairs(
      [row("out", "EXPENSE", 50000, "deposit"), row("in", "INCOME", 50000, "card", "2026-10-02")],
      rub
    );
    expect(pairs.map((pair) => pair.key)).toEqual([pairKey("out", "in")]);
  });

  it("не пара: тот же счёт, другая сумма, через два дня, другая валюта, уже перевод", () => {
    const currency = (id: string) => (id === "usd" ? "USD" : "RUB");
    expect(
      findTransferPairs(
        [
          row("a", "EXPENSE", 100, "card"),
          row("b", "INCOME", 100, "card"),
          row("c", "EXPENSE", 200, "card"),
          row("d", "INCOME", 201, "cash"),
          row("e", "EXPENSE", 300, "card", "2026-10-01"),
          row("f", "INCOME", 300, "cash", "2026-10-03"),
          row("g", "EXPENSE", 400, "card"),
          row("h", "INCOME", 400, "usd"),
          row("i", "EXPENSE", 500, "card", "2026-10-01", { transferId: "t" }),
          row("j", "INCOME", 500, "cash")
        ],
        currency
      )
    ).toEqual([]);
  });

  it("каждая строка — в одной паре, берётся ближайшая по дате; «нет» больше не предлагается", () => {
    const rows = [
      row("out", "EXPENSE", 1000, "card", "2026-10-02"),
      row("far", "INCOME", 1000, "cash", "2026-10-01"),
      row("near", "INCOME", 1000, "cash", "2026-10-02")
    ];
    expect(findTransferPairs(rows, rub).map((pair: TransferPair) => pair.income.id)).toEqual([
      "near"
    ]);
    expect(
      findTransferPairs(rows, rub, new Set([pairKey("out", "near")])).map((pair) => pair.income.id)
    ).toEqual(["far"]);
  });
});

describe("связать в перевод", () => {
  it("две операции становятся переводом: остатки те же, в доходах и расходах их больше нет", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "0"
    });
    const deposit = await api.post<{ id: string }>("/accounts", {
      name: "Вклад",
      type: "SAVINGS",
      balance: "100000"
    });
    const page = await api.get<TransactionsPageData>("/transactions");
    const income = page.categories.find((item) => item.kind === "INCOME")!.id;
    const expense = page.categories.find((item) => item.kind === "EXPENSE")!.id;
    const today = new Date().toISOString().slice(0, 10);
    await api.post("/transactions", {
      type: "EXPENSE",
      amount: "50000",
      accountId: deposit.id,
      categoryId: expense,
      date: today,
      description: "Снятие со вклада"
    });
    await api.post("/transactions", {
      type: "INCOME",
      amount: "50000",
      accountId: card.id,
      categoryId: income,
      date: today,
      description: "Пополнение"
    });
    const balances = async () =>
      (await api.get<AccountsPageData>("/accounts")).accounts.map((item) => item.balance);
    const before = await balances();

    const { pairs } = await api.get<{ pairs: TransferPair[] }>("/transfer-pairs");
    expect(pairs).toHaveLength(1);
    await api.post("/transactions", {
      action: "linkTransfer",
      expenseId: pairs[0].expense.id,
      incomeId: pairs[0].income.id
    });

    expect(await balances()).toEqual(before);
    const ledger = (await api.get<TransactionsPageData>("/transactions?period=all")).transactions;
    expect(new Set(ledger.map((item) => item.transferId)).size).toBe(1);
    expect(ledger.every((item) => item.transferId)).toBe(true);
    expect((await api.get<{ pairs: TransferPair[] }>("/transfer-pairs")).pairs).toEqual([]);
    const plan = await api.get<PlanFactPageData>("/plan");
    const month = plan.months.find((item) => item.month === today.slice(0, 7))!;
    expect(month.income.fact).toBe(0);
    expect(month.expense.fact).toBe(0);
    expect(month.toSavings.fact).toBe(-50000);

    // Связанное удаляется и возвращается как перевод — целиком.
    await api.delete(`/transactions?id=${ledger[0].id}`);
    expect((await api.get<TransactionsPageData>("/transactions?period=all")).transactions).toEqual(
      []
    );
  });

  it("не то, что можно связать, — понятный отказ", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await expect(
      api.post("/transactions", { action: "linkTransfer", expenseId: "x", incomeId: "y" })
    ).rejects.toThrow(/уже нет/);
  });
});
