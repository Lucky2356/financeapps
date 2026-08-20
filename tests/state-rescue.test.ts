import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { AccountsPageData, TransactionsPageData } from "@/lib/data";

// The document holding every account, operation and plan is read through a
// strict schema. Until 1.13.0 a document that failed it was REPLACED with an
// empty one — so a single unreadable row, or a file written by a newer build,
// erased everything. These are the cases that used to end that way.
const STATE_KEY = "localFinanceState_profile-default";

async function seeded() {
  const storage = new MemoryStorageAdapter();
  const client = new LocalApiClient(storage);
  const account = await client.post<{ id: string }>("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "50000"
  });
  const categories = await client.get<{ categories: Array<{ id: string; name: string }> }>(
    "/categories"
  );
  const food = categories.categories.find((category) => category.name === "Продукты");
  await client.post("/transactions", {
    amount: "1500",
    type: "EXPENSE",
    accountId: account.id,
    categoryId: food?.id,
    date: new Date().toISOString().slice(0, 10),
    description: "Продукты"
  });
  return { storage, stored: () => storage.getItem<Record<string, unknown>>(STATE_KEY) };
}

describe("unreadable stored state", () => {
  it("drops the rows it cannot read and keeps everything else", async () => {
    const { storage, stored } = await seeded();
    const document = (await stored()) as Record<string, unknown>;
    const transactions = document.transactions as Array<Record<string, unknown>>;
    // The shape a zero-rouble operation used to leave behind: the schema wants
    // a positive amount, so the whole document stopped parsing.
    document.transactions = [...transactions, { ...transactions[0], id: "tx-broken", amount: 0 }];
    await storage.setItem(STATE_KEY, document);

    const reopened = new LocalApiClient(storage);
    const accounts = await reopened.get<AccountsPageData>("/accounts");
    const ledger = await reopened.get<TransactionsPageData>("/transactions");

    expect(accounts.accounts.map((account) => account.name)).toContain("Карта");
    expect(ledger.transactions.some((row) => row.description === "Продукты")).toBe(true);
    expect(ledger.transactions.some((row) => row.id === "tx-broken")).toBe(false);
    // And the damaged original is kept, not thrown away.
    expect(await storage.getItem(`${STATE_KEY}:rescue`)).not.toBeNull();
  });

  it("refuses to read a document written by a newer version, and leaves it alone", async () => {
    const { storage, stored } = await seeded();
    const document = (await stored()) as Record<string, unknown>;
    await storage.setItem(STATE_KEY, { ...document, schemaVersion: 99 });

    const reopened = new LocalApiClient(storage);
    await expect(reopened.get("/accounts")).rejects.toThrow(/более новой версией/);

    // Untouched: an older build must not be able to eat a newer file.
    const after = (await storage.getItem<Record<string, unknown>>(STATE_KEY)) ?? {};
    expect(after.schemaVersion).toBe(99);
    expect((after.transactions as unknown[]).length).toBeGreaterThan(0);
  });

  it("says so rather than starting empty when nothing can be salvaged", async () => {
    const { storage } = await seeded();
    await storage.setItem(STATE_KEY, "не документ вовсе");

    const reopened = new LocalApiClient(storage);
    await expect(reopened.get("/accounts")).rejects.toThrow(/Не удалось прочитать/);
    expect(await storage.getItem(STATE_KEY)).toBe("не документ вовсе");
  });

  it("still starts fresh when there is genuinely nothing stored", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    const accounts = await client.get<AccountsPageData>("/accounts");
    expect(accounts.accounts).toEqual([]);
  });
});

describe("amounts are checked before they are stored", () => {
  it("refuses an operation that would make the document unreadable", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    const account = await client.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "50000"
    });
    const categories = await client.get<{ categories: Array<{ id: string; name: string }> }>(
      "/categories"
    );
    const food = categories.categories.find((category) => category.name === "Продукты");
    const base = {
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food?.id,
      date: new Date().toISOString().slice(0, 10)
    };

    await expect(client.post("/transactions", { ...base, amount: "0" })).rejects.toThrow(
      /больше нуля/
    );
    await expect(client.post("/transactions", { ...base, amount: "не число" })).rejects.toThrow(
      /больше нуля/
    );
    await expect(client.post("/transactions", { ...base, amount: "-500" })).rejects.toThrow(
      /больше нуля/
    );

    const ledger = await client.get<TransactionsPageData>("/transactions");
    expect(ledger.transactions).toHaveLength(0);
  });
});
