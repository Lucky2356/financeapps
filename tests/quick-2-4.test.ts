import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { AccountsPageData, TransactionsPageData } from "@/lib/data";
import { limitHint } from "@/lib/budget-limit-hint";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { quickDates } from "@/lib/transactions/quick-dates";
import {
  draftDate,
  DRAFT_MAX_AGE_MS,
  encodeDraft,
  hasContent,
  readDraft,
  type QuickDraft
} from "@/lib/transactions/quick-draft";

describe("подсказка про лимит", () => {
  const row = { category: "Продукты", limitAmount: 20000, spent: 16800, rolloverAmount: 0 };

  it("нет лимита — нет подсказки", () => {
    expect(limitHint(undefined, 500)).toBeNull();
    expect(limitHint({ ...row, limitAmount: 0 }, 500)).toBeNull();
  });

  it("пока сумму не ввели — сколько осталось", () => {
    expect(limitHint(row, 0)).toEqual({
      kind: "left",
      amount: 3200,
      typed: false,
      limit: 20000,
      category: "Продукты"
    });
  });

  it("с суммой — сколько останется после траты", () => {
    expect(limitHint(row, 1200)).toMatchObject({ kind: "left", amount: 2000, typed: true });
    expect(limitHint(row, 3200)).toMatchObject({ kind: "left", amount: 0 });
  });

  it("сверх лимита — на сколько", () => {
    expect(limitHint(row, 4000)).toMatchObject({ kind: "over", amount: 800, typed: true });
  });

  it("лимит уже превышен и суммы нет", () => {
    expect(limitHint({ ...row, spent: 21000 }, 0)).toMatchObject({
      kind: "over",
      amount: 1000,
      typed: false
    });
  });

  it("перенос остатка входит в лимит", () => {
    expect(limitHint({ ...row, rolloverAmount: 1000 }, 0)).toMatchObject({
      kind: "left",
      amount: 4200,
      limit: 21000
    });
  });
});

describe("даты одним касанием", () => {
  it("сегодня, вчера, позавчера — и через границу месяца", () => {
    expect(quickDates(new Date(2026, 9, 1))).toEqual([
      { id: "today", iso: "2026-10-01" },
      { id: "yesterday", iso: "2026-09-30" },
      { id: "dayBefore", iso: "2026-09-29" }
    ]);
  });
});

describe("черновик быстрого добавления", () => {
  const now = new Date(2026, 8, 30, 15, 0).getTime();
  const draft: QuickDraft = {
    v: 1,
    savedAt: now - 5 * 60_000,
    type: "EXPENSE",
    amount: "1200",
    categoryId: "cat",
    accountId: "acc",
    description: "хлеб",
    tags: "",
    date: "2026-09-29"
  };

  it("пустой диалог черновика не оставляет", () => {
    expect(hasContent({ amount: "", description: " ", tags: "" })).toBe(false);
    expect(hasContent({ amount: "5", description: "", tags: "" })).toBe(true);
    expect(readDraft(encodeDraft({ ...draft, amount: "", description: "" }), now)).toBeNull();
  });

  it("свежий черновик читается как был", () => {
    expect(readDraft(encodeDraft(draft), now)).toEqual(draft);
  });

  it("старше получаса, из будущего, мусор — ничего", () => {
    expect(
      readDraft(encodeDraft({ ...draft, savedAt: now - DRAFT_MAX_AGE_MS - 1 }), now)
    ).toBeNull();
    expect(readDraft(encodeDraft({ ...draft, savedAt: now + 3_600_000 }), now)).toBeNull();
    expect(readDraft("не json", now)).toBeNull();
    expect(readDraft(null, now)).toBeNull();
    expect(readDraft(JSON.stringify({ v: 2, savedAt: now }), now)).toBeNull();
  });

  it("неизвестный тип — расход", () => {
    const raw = JSON.stringify({ ...draft, type: "ЧТО-ТО" });
    expect(readDraft(raw, now)?.type).toBe("EXPENSE");
  });

  it("дата — только если отложен сегодня", () => {
    expect(draftDate(draft, now)).toBe("2026-09-29");
    const yesterday = { ...draft, savedAt: new Date(2026, 8, 29, 23, 0).getTime() };
    expect(draftDate(yesterday, now)).toBeNull();
  });
});

describe("«Отменить» после удаления операции", () => {
  async function setup() {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "10000" });
    const page = await client.get<TransactionsPageData>("/transactions");
    const account = page.accounts[0].id;
    const category = page.categories.find((item) => item.kind === "EXPENSE")!.id;
    const created = await client.post<{ id: string }>("/transactions", {
      type: "EXPENSE",
      amount: "1500",
      accountId: account,
      categoryId: category,
      description: "обед",
      tags: "работа",
      date: new Date().toISOString().slice(0, 10)
    });
    const balance = async () =>
      (await client.get<AccountsPageData>("/accounts")).accounts.find((a) => a.id === account)!
        .balance;
    const list = async () =>
      (await client.get<TransactionsPageData>("/transactions?period=all")).transactions;
    return { client, account, category, id: created.id, balance, list };
  }

  it("возвращает ту же строку и деньги на счёт", async () => {
    const { client, id, balance, list } = await setup();
    expect(await balance()).toBe(8500);
    const [row] = await list();
    await client.delete(`/transactions?id=${id}`);
    expect(await balance()).toBe(10000);
    expect(await list()).toHaveLength(0);

    await client.post("/transactions", { action: "restore", transaction: row });
    expect(await balance()).toBe(8500);
    const [back] = await list();
    expect(back).toMatchObject({
      id,
      amount: 1500,
      description: "обед",
      tags: ["работа"],
      createdAt: row.createdAt
    });
  });

  it("второе нажатие деньги не удваивает", async () => {
    const { client, id, balance, list } = await setup();
    const [row] = await list();
    await client.delete(`/transactions?id=${id}`);
    await client.post("/transactions", { action: "restore", transaction: row });
    await client.post("/transactions", { action: "restore", transaction: row });
    expect(await list()).toHaveLength(1);
    expect(await balance()).toBe(8500);
  });

  it("счёт удалён — понятный отказ, деньги не двигаются", async () => {
    const { client, account, id, list } = await setup();
    const [row] = await list();
    await client.delete(`/transactions?id=${id}`);
    await client.delete(`/accounts?id=${account}`);
    await expect(
      client.post("/transactions", { action: "restore", transaction: row })
    ).rejects.toThrow(/уже удалены/);
  });

  it("мусор вместо операции — отказ", async () => {
    const { client } = await setup();
    await expect(
      client.post("/transactions", { action: "restore", transaction: { id: "x" } })
    ).rejects.toThrow(/Не получилось вернуть/);
  });
});
