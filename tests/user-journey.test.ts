import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type {
  AccountsPageData,
  BudgetsPageData,
  CategoriesPageData,
  GoalsPageData,
  RecurringTransactionsPageData,
  TransactionsPageData
} from "@/lib/data";
import type { DashboardData, ForecastData } from "@/types/finance";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

// Simulates a brand-new user going through the whole app the way the desktop
// build does (LocalApiClient + in-memory storage). Acts as an automated
// play-through that exercises the real code paths end to end.
describe("new user journey", () => {
  it("walks from empty state through accounts, transactions, budgets, goals, recurring and investments", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());

    // 0. Fresh install — empty and a neutral health score (not a phantom 60).
    const emptyDashboard = await client.get<DashboardData>("/dashboard");
    expect(emptyDashboard.netWorth).toBe(0);
    expect(emptyDashboard.health.score).toBe(100);
    const emptyAccounts = await client.get<AccountsPageData>("/accounts");
    expect(emptyAccounts.accounts).toHaveLength(0);

    // 1. Create accounts.
    const card = await client.post<AccountsPageData["accounts"][number]>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const savings = await client.post<AccountsPageData["accounts"][number]>("/accounts", {
      name: "Накопительный",
      type: "SAVINGS",
      balance: "120000"
    });

    // 2. Record income and expenses.
    await client.post("/transactions", { amount: "150000", type: "INCOME", accountId: card.id, categoryId: "cat-salary", date: todayInput() });
    await client.post("/transactions", { amount: "20000", type: "EXPENSE", accountId: card.id, categoryId: "cat-food", date: todayInput() });
    await client.post("/transactions", { amount: "8000", type: "EXPENSE", accountId: card.id, categoryId: "cat-transport", date: todayInput() });

    const afterTx = await client.get<DashboardData>("/dashboard");
    // Net worth = card (100000+150000-28000) + savings (120000) = 342000.
    expect(afterTx.netWorth).toBe(342000);
    expect(afterTx.health.score).toBeGreaterThan(0);
    expect(afterTx.health.score).toBeLessThanOrEqual(100);
    expect(afterTx.emergencyFund.amount).toBe(120000);

    // 3. Budget with an overrun warning.
    await client.post("/budgets", { categoryId: "cat-food", limitAmount: "10000" });
    const budgets = await client.get<BudgetsPageData>("/budgets");
    const food = budgets.budgets.find((b) => b.categoryId === "cat-food");
    expect(food?.isExceeded).toBe(true);
    expect(food?.suggestedLimit).toBeGreaterThan(0); // suggestion from history

    // 4. Goal + deposit (money moves from a balance into the goal; net worth held).
    const goal = await client.post<GoalsPageData["goals"][number]>("/goals", {
      title: "Отпуск",
      targetAmount: "200000",
      currentAmount: "0",
      deadline: "2027-06-01"
    });
    const beforeDeposit = await client.get<DashboardData>("/dashboard");
    await client.post("/goals", { action: "deposit", goalId: goal.id, amount: "30000", accountId: savings.id });
    const afterDeposit = await client.get<DashboardData>("/dashboard");
    expect(afterDeposit.netWorth).toBe(beforeDeposit.netWorth);
    const goalsAfter = await client.get<GoalsPageData>("/goals");
    expect(goalsAfter.goals[0].currentAmount).toBe(30000);

    // 5. Recurring payment → forecast events exist and the full event list is exposed.
    await client.post("/recurring", {
      amount: "5000",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: "cat-utilities",
      frequency: "MONTHLY",
      nextDate: todayInput(),
      isActive: "true"
    });
    const forecast = await client.get<ForecastData>("/forecast");
    expect(forecast.events.length).toBeGreaterThan(0);
    expect(forecast.events.length).toBeGreaterThanOrEqual(forecast.upcomingEvents.length);
    // The due recurring payment auto-materialized a real expense, lowering net worth.
    const beforeInvest = await client.get<DashboardData>("/dashboard");
    expect(beforeInvest.netWorth).toBeLessThan(afterDeposit.netWorth);

    // 6. Investments: add a position by ticker; it lifts net worth.
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });
    const withInvest = await client.get<DashboardData>("/dashboard");
    expect(withInvest.netWorth).toBeGreaterThan(beforeInvest.netWorth);

    // 7. Categories CRUD still consistent.
    const categories = await client.get<CategoriesPageData>("/categories");
    expect(categories.categories.length).toBeGreaterThan(0);

    // 8. Transactions list reflects everything entered.
    const transactions = await client.get<TransactionsPageData>("/transactions");
    expect(transactions.transactions.length).toBeGreaterThanOrEqual(3);

    // 9. Clear all data → back to neutral empty state.
    await client.delete("/storage/clear");
    const cleared = await client.get<DashboardData>("/dashboard");
    expect(cleared.netWorth).toBe(0);
    expect(cleared.health.score).toBe(100);
    const clearedRecurring = await client.get<RecurringTransactionsPageData>("/recurring");
    expect(clearedRecurring.recurringTransactions).toHaveLength(0);
  });
});
