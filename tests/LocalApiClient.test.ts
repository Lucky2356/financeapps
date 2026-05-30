import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { AccountsPageData, TransactionsPageData } from "@/lib/data";
import type { InvestmentData } from "@/types/finance";

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

describe("LocalApiClient", () => {
  it("creates account-to-account transfers and updates local balances", async () => {
    const client = createClient();
    const before = await client.get<AccountsPageData>("/accounts");
    const [fromAccount, toAccount] = before.accounts;

    await client.post("/transactions", {
      action: "transfer",
      amount: "1250",
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      date: "2026-05-30",
      description: "Test transfer"
    });

    const after = await client.get<AccountsPageData>("/accounts");
    const transactions = await client.get<TransactionsPageData>("/transactions?q=Test%20transfer");

    expect(after.accounts.find((account) => account.id === fromAccount.id)?.balance).toBe(fromAccount.balance - 1250);
    expect(after.accounts.find((account) => account.id === toAccount.id)?.balance).toBe(toAccount.balance + 1250);
    expect(transactions.transactions).toHaveLength(2);
    expect(transactions.transactions.map((transaction) => transaction.type).sort()).toEqual(["EXPENSE", "INCOME"]);
  });

  it("manages watchlist and portfolio positions in desktop local mode", async () => {
    const client = createClient();
    const initial = await client.get<InvestmentData>("/investments");

    expect(initial.securities.length).toBeGreaterThan(0);
    // Watchlist is pre-populated with 5 default stocks for new users (Bug 4 fix)
    expect(initial.watchlist.length).toBeGreaterThan(0);
    expect(initial.portfolio).toHaveLength(0);

    await client.post("/investments", { action: "addWatchlist", ticker: "SBER" });
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });

    const updated = await client.get<InvestmentData>("/investments");
    expect(updated.watchlist.map((item) => item.ticker)).toContain("SBER");
    expect(updated.portfolio).toHaveLength(1);
    expect(updated.portfolio[0]).toMatchObject({ ticker: "SBER", quantity: 10, averageBuyPrice: 250, share: 100 });
    expect(updated.portfolio[0].currentValue).toBeGreaterThan(0);
    expect(updated.risks.length).toBeGreaterThan(0);

    await client.post("/investments", { action: "delete", ticker: "SBER" });
    const afterDelete = await client.get<InvestmentData>("/investments");
    expect(afterDelete.portfolio).toHaveLength(0);
  });

  it("validates local backups before restore", async () => {
    const client = createClient();
    const backup = await client.get<unknown>("/backup");

    await expect(client.post("/backup", { backup })).resolves.toEqual({ restored: true });
    await expect(client.post("/backup", { backup: { schemaVersion: 1, accounts: "not-an-array" } })).rejects.toThrow(
      "Backup payload is invalid"
    );
  });
});
