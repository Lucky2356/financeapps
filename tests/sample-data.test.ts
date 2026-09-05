import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { sampleDate } from "@/lib/sample-data";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type {
  AccountsPageData,
  BudgetsPageData,
  GoalsPageData,
  TransactionsPageData
} from "@/lib/data";
import type { DashboardData } from "@/types/finance";

describe("sample data seeding", () => {
  it("populates a realistic example and can be cleared back to empty", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());

    await client.post("/sample", {});

    const dashboard = await client.get<DashboardData>("/dashboard");
    const accounts = await client.get<AccountsPageData>("/accounts");
    const transactions = await client.get<TransactionsPageData>("/transactions");
    const budgets = await client.get<BudgetsPageData>("/budgets");
    const goals = await client.get<GoalsPageData>("/goals");

    expect(accounts.accounts.length).toBeGreaterThan(0);
    expect(transactions.transactions.length).toBeGreaterThan(0);
    expect(budgets.budgets.some((b) => b.limitAmount > 0)).toBe(true);
    expect(goals.goals.length).toBeGreaterThan(0);
    expect(dashboard.netWorth).toBeGreaterThan(0);
    // Activity present → real health score, not the empty-state neutral 100 fallback.
    expect(dashboard.emergencyFund.amount).toBeGreaterThan(0);

    await client.delete("/storage/clear");
    const cleared = await client.get<DashboardData>("/dashboard");
    const clearedAccounts = await client.get<AccountsPageData>("/accounts");
    expect(cleared.netWorth).toBe(0);
    expect(clearedAccounts.accounts).toHaveLength(0);
  });
});

// The sample days are fixed (the 6th, the 12th, the 20th), so in the current
// month they depend on when the example is loaded. Loaded early in the month,
// most of them landed after today: the example's own balance counted money that
// had not been spent, and the app reported future-dated operations on a ledger
// the owner had not typed a line into.
describe("даты примера не убегают в будущее", () => {
  it("день текущего месяца не позже сегодняшнего", () => {
    const today = new Date();
    for (const day of [1, 6, 12, 20, 28]) {
      const resolved = sampleDate(0, day);
      expect(resolved.getTime()).toBeLessThanOrEqual(
        new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime()
      );
    }
  });

  it("прошлые месяцы берут свой день как есть", () => {
    expect(sampleDate(-1, 20).getDate()).toBe(20);
  });
});
