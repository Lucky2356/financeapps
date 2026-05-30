import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { AccountsPageData, BudgetsPageData, CategoriesPageData, RecurringTransactionsPageData, TransactionsPageData } from "@/lib/data";
import type { InvestmentData } from "@/types/finance";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

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

  it("wipes everything to a blank state on storage clear", async () => {
    const client = createClient();
    // Seed some data first
    await client.post("/accounts", { name: "Тест", type: "CASH", balance: "100" });

    await client.delete("/storage/clear");

    const accounts = await client.get<AccountsPageData>("/accounts");
    const categories = await client.get<CategoriesPageData>("/categories");
    const investments = await client.get<InvestmentData>("/investments");

    expect(accounts.accounts).toHaveLength(0);
    expect(categories.categories).toHaveLength(0);
    expect(investments.watchlist).toHaveLength(0);
  });

  it("immediately materializes a transaction when a recurring payment is created", async () => {
    const client = createClient();
    const accounts = await client.get<AccountsPageData>("/accounts");
    const account = accounts.accounts[0];

    await client.post("/recurring", {
      amount: "5000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      frequency: "MONTHLY",
      nextDate: todayInput(),
      isActive: "true"
    });

    const transactions = await client.get<TransactionsPageData>("/transactions");
    const recurring = await client.get<RecurringTransactionsPageData>("/recurring");

    // A real transaction was created right away
    expect(transactions.transactions.some((t) => t.amount === 5000 && t.category.id === "cat-food")).toBe(true);
    // And the next date advanced past today, so it is no longer "due now"
    expect(recurring.recurringTransactions[0].isDue).toBe(false);
  });

  it("keeps the linked transaction in sync when a recurring amount is edited", async () => {
    const client = createClient();
    const accounts = await client.get<AccountsPageData>("/accounts");
    const account = accounts.accounts[0];

    const created = await client.post<RecurringTransactionsPageData["recurringTransactions"][number]>("/recurring", {
      amount: "5000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      frequency: "MONTHLY",
      nextDate: todayInput(),
      isActive: "true"
    });

    await client.put("/recurring", {
      id: created.id,
      amount: "8000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      frequency: "MONTHLY",
      nextDate: todayInput(),
      isActive: "true"
    });

    const transactions = await client.get<TransactionsPageData>("/transactions");
    expect(transactions.transactions.some((t) => t.amount === 8000)).toBe(true);
    expect(transactions.transactions.some((t) => t.amount === 5000)).toBe(false);
  });

  it("returns a budget warning when an expense exceeds its limit", async () => {
    const client = createClient();
    const accounts = await client.get<AccountsPageData>("/accounts");
    const account = accounts.accounts[0];

    await client.post("/budgets", { categoryId: "cat-food", limitAmount: "1000" });

    const result = await client.post<{ budgetWarning: { category: string; spent: number; limit: number } | null }>("/transactions", {
      amount: "1500",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      date: todayInput()
    });

    expect(result.budgetWarning).not.toBeNull();
    expect(result.budgetWarning?.limit).toBe(1000);
    expect(result.budgetWarning?.spent).toBe(1500);

    const budgets = await client.get<BudgetsPageData>("/budgets");
    const food = budgets.budgets.find((b) => b.categoryId === "cat-food");
    expect(food?.isExceeded).toBe(true);
  });
});
