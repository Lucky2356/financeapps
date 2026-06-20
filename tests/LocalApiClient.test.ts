import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type {
  AccountsPageData,
  BudgetsPageData,
  CategoriesPageData,
  GoalsPageData,
  RecurringTransactionsPageData,
  SettingsPageData,
  TransactionsPageData
} from "@/lib/data";
import type { DashboardData, InvestmentData } from "@/types/finance";

function todayInput() {
  // Local date (matches the app's formatInputDate), so month bucketing stays
  // consistent across the UTC/local month boundary.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

// A fresh install now starts with no accounts (the user adds their own), so
// tests that need an account must create one first.
async function seedAccount(
  client: LocalApiClient,
  overrides: { name?: string; type?: string; balance?: string } = {}
) {
  return client.post<AccountsPageData["accounts"][number]>("/accounts", {
    name: overrides.name ?? "Карта",
    type: overrides.type ?? "DEBIT_CARD",
    balance: overrides.balance ?? "0"
  });
}

describe("LocalApiClient", () => {
  it("creates account-to-account transfers and updates local balances", async () => {
    const client = createClient();
    const fromAccount = await seedAccount(client, { name: "Счёт А", balance: "10000" });
    const toAccount = await seedAccount(client, { name: "Счёт Б", balance: "2000" });

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

    expect(after.accounts.find((account) => account.id === fromAccount.id)?.balance).toBe(
      fromAccount.balance - 1250
    );
    expect(after.accounts.find((account) => account.id === toAccount.id)?.balance).toBe(
      toAccount.balance + 1250
    );
    expect(transactions.transactions).toHaveLength(2);
    expect(transactions.transactions.map((transaction) => transaction.type).sort()).toEqual([
      "EXPENSE",
      "INCOME"
    ]);
  });

  it("manages watchlist and portfolio positions in desktop local mode", async () => {
    const client = createClient();
    const initial = await client.get<InvestmentData>("/investments");

    expect(initial.securities.length).toBeGreaterThan(0);
    // A fresh install starts with an empty watchlist — the user adds their own.
    expect(initial.watchlist).toHaveLength(0);
    expect(initial.portfolio).toHaveLength(0);

    await client.post("/investments", { action: "addWatchlist", ticker: "SBER" });
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });

    const updated = await client.get<InvestmentData>("/investments");
    expect(updated.watchlist.map((item) => item.ticker)).toContain("SBER");
    expect(updated.portfolio).toHaveLength(1);
    expect(updated.portfolio[0]).toMatchObject({
      ticker: "SBER",
      quantity: 10,
      averageBuyPrice: 250,
      share: 100
    });
    expect(updated.portfolio[0].currentValue).toBeGreaterThan(0);
    expect(updated.risks.length).toBeGreaterThan(0);

    await client.post("/investments", { action: "delete", ticker: "SBER" });
    const afterDelete = await client.get<InvestmentData>("/investments");
    expect(afterDelete.portfolio).toHaveLength(0);
  });

  it("validates local backups before restore", async () => {
    const client = createClient();
    const backup = await client.get<{ schemaVersion: number; lastBackupAt: string | null }>(
      "/backup"
    );

    expect(backup.schemaVersion).toBe(2);
    expect(backup.lastBackupAt).toEqual(expect.any(String));
    await expect(client.post("/backup", { backup })).resolves.toEqual({ restored: true });
    await expect(
      client.post("/backup", { backup: { schemaVersion: 1, accounts: "not-an-array" } })
    ).rejects.toThrow("Backup payload is invalid");
  });

  it("restores compatible v1 local backups through the v2 state migration", async () => {
    const client = createClient();
    const backup = await client.get<Record<string, unknown>>("/backup");
    const legacyBackup = { ...backup, schemaVersion: 1 };

    await expect(client.post("/backup", { backup: legacyBackup })).resolves.toEqual({
      restored: true
    });

    const migrated = await client.get<{ schemaVersion: number; lastBackupAt: string | null }>(
      "/backup"
    );
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.lastBackupAt).toEqual(expect.any(String));
  });

  it("creates a transaction against a freshly created account", async () => {
    const client = createClient();
    const account = await client.post<AccountsPageData["accounts"][number]>("/accounts", {
      name: "Новая карта",
      type: "DEBIT_CARD",
      balance: "0"
    });

    // Should NOT throw "account does not exist"
    await client.post("/transactions", {
      amount: "1200",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      date: todayInput()
    });

    const transactions = await client.get<TransactionsPageData>("/transactions");
    expect(
      transactions.transactions.some((t) => t.account.id === account.id && t.amount === 1200)
    ).toBe(true);
  });

  it("applies a partial settings update without resetting other fields", async () => {
    const client = createClient();
    // Set several non-default settings first.
    await client.put("/settings", {
      riskProfileCode: "AGGRESSIVE",
      emergencyFundMonthsTarget: "12",
      demoMode: true,
      defaultTransactionType: "INCOME",
      density: "compact"
    });

    // Then save ONLY the theme (what the sidebar toggle does).
    await client.put("/settings", { theme: "dark" });

    const settings = await client.get<SettingsPageData>("/settings");
    expect(settings.theme).toBe("dark");
    // The single-field save must not clobber the rest.
    expect(settings.riskProfileCode).toBe("AGGRESSIVE");
    expect(settings.emergencyFundMonthsTarget).toBe(12);
    expect(settings.demoMode).toBe(true);
    expect(settings.defaultTransactionType).toBe("INCOME");
    expect(settings.density).toBe("compact");
  });

  it("net worth combines account balances with portfolio value and records a snapshot", async () => {
    const client = createClient();
    await seedAccount(client, { balance: "10000" });
    await client.post("/investments", { action: "addWatchlist", ticker: "SBER" });
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });

    const dashboard = await client.get<DashboardData>("/dashboard");
    // 10 000 in cash + 10 SBER shares at a positive market price.
    expect(dashboard.netWorth).toBeGreaterThan(10000);
    expect(dashboard.netWorthTrend.length).toBeGreaterThanOrEqual(1);
    expect(dashboard.netWorthTrend.at(-1)?.value).toBe(dashboard.netWorth);
  });

  it("goal deposit debits the account, grows the goal, and keeps net worth conserved", async () => {
    const client = createClient();
    const account = await seedAccount(client, { balance: "20000" });
    const goal = await client.post<GoalsPageData["goals"][number]>("/goals", {
      title: "Отпуск",
      targetAmount: "100000",
      currentAmount: "0",
      deadline: "2027-01-01"
    });

    const before = await client.get<DashboardData>("/dashboard");

    await client.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      amount: "5000",
      accountId: account.id
    });

    const accounts = await client.get<AccountsPageData>("/accounts");
    const goals = await client.get<GoalsPageData>("/goals");
    const transactions = await client.get<TransactionsPageData>("/transactions");
    const after = await client.get<DashboardData>("/dashboard");

    expect(accounts.accounts.find((a) => a.id === account.id)?.balance).toBe(15000);
    expect(goals.goals.find((g) => g.id === goal.id)?.currentAmount).toBe(5000);
    // A deposit is a transfer to savings, not a consumption expense — so no
    // income/expense transaction is recorded (savings rate stays intact).
    expect(transactions.transactions).toHaveLength(0);
    // Money moved from a balance into the goal, so net worth is unchanged.
    expect(after.netWorth).toBe(before.netWorth);
  });

  it("rejects a goal deposit larger than the account balance", async () => {
    const client = createClient();
    const account = await seedAccount(client, { balance: "1000" });
    const goal = await client.post<GoalsPageData["goals"][number]>("/goals", {
      title: "Тест",
      targetAmount: "100000",
      currentAmount: "0",
      deadline: "2027-01-01"
    });
    await expect(
      client.post("/goals", {
        action: "deposit",
        goalId: goal.id,
        amount: "5000",
        accountId: account.id
      })
    ).rejects.toThrow();
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
    const account = await seedAccount(client);

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
    expect(
      transactions.transactions.some((t) => t.amount === 5000 && t.category.id === "cat-food")
    ).toBe(true);
    // And the next date advanced past today, so it is no longer "due now"
    expect(recurring.recurringTransactions[0].isDue).toBe(false);
  });

  it("keeps the linked transaction in sync when a recurring amount is edited", async () => {
    const client = createClient();
    const account = await seedAccount(client);

    const created = await client.post<
      RecurringTransactionsPageData["recurringTransactions"][number]
    >("/recurring", {
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
    const account = await seedAccount(client);

    await client.post("/budgets", { categoryId: "cat-food", limitAmount: "1000" });

    const result = await client.post<{
      budgetWarning: { category: string; spent: number; limit: number } | null;
    }>("/transactions", {
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

describe("LocalApiClient currency (plan C7)", () => {
  it("changes the app currency and propagates it to accounts and page data", async () => {
    const client = createClient();
    await seedAccount(client, { name: "Карта", balance: "1000" });

    let accounts = await client.get<AccountsPageData>("/accounts");
    expect(accounts.currency).toBe("RUB");
    expect(accounts.accounts[0].currency).toBe("RUB");

    await client.put("/settings", { currency: "USD" });

    const settings = await client.get<SettingsPageData>("/settings");
    expect(settings.currency).toBe("USD");

    accounts = await client.get<AccountsPageData>("/accounts");
    expect(accounts.currency).toBe("USD");
    expect(accounts.accounts[0].currency).toBe("USD");
    // Single-currency model: amounts are not converted, only the label changes.
    expect(accounts.accounts[0].balance).toBe(1000);
  });

  it("ignores an unsupported currency code", async () => {
    const client = createClient();
    await client.put("/settings", { currency: "ZZZ" });
    const settings = await client.get<SettingsPageData>("/settings");
    expect(settings.currency).toBe("RUB");
  });
});
