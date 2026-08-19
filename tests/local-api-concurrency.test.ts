import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { AccountsPageData } from "@/lib/data";

// A change is read-modify-write over the whole state, written as one blob. Run
// two at once without a queue and the second saves a picture taken before the
// first happened — the first is gone with nothing to show it ever ran. The
// background runner writes a capital snapshot on every load, which is precisely
// when a person is adding an operation.
function slowStorage(delayMs: number) {
  const inner = new MemoryStorageAdapter();
  return {
    async getItem<T>(key: string) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return inner.getItem<T>(key);
    },
    async setItem<T>(key: string, value: T) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return inner.setItem(key, value);
    },
    async removeItem(key: string) {
      return inner.removeItem(key);
    },
    async clear() {
      return inner.clear();
    }
  };
}

describe("LocalApiClient under concurrent writes", () => {
  it("keeps both accounts when two are created at the same time", async () => {
    const client = new LocalApiClient(slowStorage(5));

    await Promise.all([
      client.post("/accounts", { name: "Первый", type: "DEBIT_CARD", balance: "1000" }),
      client.post("/accounts", { name: "Второй", type: "CASH", balance: "2000" })
    ]);

    const accounts = await client.get<AccountsPageData>("/accounts");
    const names = accounts.accounts.map((account: { name: string }) => account.name);
    expect(names).toContain("Первый");
    expect(names).toContain("Второй");
  });

  it("does not let a background snapshot swallow an operation saved beside it", async () => {
    const client = new LocalApiClient(slowStorage(5));
    const account = await client.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "10000"
    });

    const categories = await client.get<{ categories: Array<{ id: string; name: string }> }>(
      "/categories"
    );
    const food = categories.categories.find((category) => category.name === "Продукты");

    // The two things that happen together on a real page load.
    await Promise.all([
      client.post("/networth/snapshot"),
      client.post("/transactions", {
        amount: "2500",
        type: "EXPENSE",
        accountId: account.id,
        categoryId: food?.id,
        date: new Date().toISOString().slice(0, 10),
        description: "Продукты"
      })
    ]);

    const ledger = await client.get<{ transactions: Array<{ description: string | null }> }>(
      "/transactions"
    );
    expect(ledger.transactions.some((row) => row.description === "Продукты")).toBe(true);
  });

  it("loads the example without the page's own background work erasing it", async () => {
    const client = new LocalApiClient(slowStorage(5));

    await Promise.all([client.post("/sample"), client.post("/networth/snapshot")]);

    const accounts = await client.get<AccountsPageData>("/accounts");
    expect(accounts.accounts.length).toBeGreaterThan(0);
  });
});
