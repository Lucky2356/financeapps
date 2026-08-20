import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type {
  AccountsPageData,
  AnalyticsData,
  BudgetsPageData,
  CategoriesPageData,
  GoalsPageData,
  LiabilitiesPageData,
  RecurringTransactionsPageData,
  SettingsPageData,
  TransactionsPageData
} from "@/lib/data";
import type { DashboardData, InvestmentData, PlanFactPageData } from "@/types/finance";

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

  it("keeps transfers out of analytics unless they are asked for", async () => {
    const client = createClient();
    const from = await seedAccount(client, { name: "Счёт А", balance: "100000" });
    const to = await seedAccount(client, { name: "Счёт Б", balance: "0" });
    const categories = await client.get<CategoriesPageData>("/categories");
    const salary = categories.categories.find((category) => category.kind === "INCOME");

    // One real income, and a transfer of five times as much between own
    // accounts. Counting the transfer would make the month look like a fortune
    // earned and a fortune spent.
    await client.post("/transactions", {
      amount: "30000",
      type: "INCOME",
      accountId: from.id,
      categoryId: salary?.id,
      date: todayInput(),
      description: "Зарплата"
    });
    await client.post("/transactions", {
      action: "transfer",
      amount: "150000",
      fromAccountId: from.id,
      toAccountId: to.id,
      date: todayInput(),
      description: "В накопления"
    });

    const withoutTransfers = await client.get<AnalyticsData>("/analytics");
    const withTransfers = await client.get<AnalyticsData>("/analytics?transfers=1");
    const month = (data: AnalyticsData) => data.monthlyCashflow[data.monthlyCashflow.length - 1];

    expect(month(withoutTransfers).income).toBe(30000);
    expect(month(withoutTransfers).expense).toBe(0);
    expect(month(withTransfers).income).toBe(180000);
    expect(month(withTransfers).expense).toBe(150000);
  });

  it("keeps transfers off the home screen unless they are asked for", async () => {
    const client = createClient();
    const from = await seedAccount(client, { name: "Счёт А", balance: "100000" });
    const to = await seedAccount(client, { name: "Счёт Б", balance: "0" });

    await client.post("/transactions", {
      action: "transfer",
      amount: "150000",
      fromAccountId: from.id,
      toAccountId: to.id,
      date: todayInput(),
      description: "В накопления"
    });

    const plain = await client.get<DashboardData>("/dashboard");
    const counted = await client.get<DashboardData>("/dashboard?transfers=1");

    // Nothing was earned or spent, so neither ring has a slice to draw.
    expect(plain.categoryIncome).toHaveLength(0);
    expect(plain.categoryExpenses).toHaveLength(0);
    // Asked for, the same pair shows up on both sides at once.
    expect(counted.categoryIncome.some((slice) => slice.name === "Переводы")).toBe(true);
    expect(counted.categoryExpenses.some((slice) => slice.name === "Переводы")).toBe(true);
    // Capital is read off balances, which the transfer left where they were.
    expect(plain.netWorth).toBe(counted.netWorth);
  });

  it("reports plan against fact for a month, and the gap between them", async () => {
    const client = createClient();
    const account = await seedAccount(client, { name: "Карта", balance: "0" });
    const categories = await client.get<CategoriesPageData>("/categories");
    const salary = categories.categories.find((category) => category.kind === "INCOME");
    const food = categories.categories.find((category) => category.name === "Продукты");
    const month = todayInput().slice(0, 7);

    await client.post("/transactions", {
      amount: "90000",
      type: "INCOME",
      accountId: account.id,
      categoryId: salary?.id,
      date: todayInput(),
      description: "Зарплата"
    });
    await client.post("/transactions", {
      amount: "27000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food?.id,
      date: todayInput(),
      description: "Продукты"
    });

    await client.post("/plan", { month, categoryId: salary?.id, amount: "100000" });
    await client.post("/plan", { month, categoryId: food?.id, amount: "25000" });
    await client.post("/plan", { month, note: "Гасим рассрочку" });
    await client.post("/plan", { month, factNote: "Саша в отпуске" });

    const plan = await client.get<PlanFactPageData>("/plan");
    const row = plan.months.find((entry) => entry.month === month);

    // The gap is plan − fact in every cell, so the whole grid reads one way.
    expect(row?.cells[salary?.id ?? ""]).toMatchObject({ plan: 100000, fact: 90000, diff: 10000 });
    expect(row?.cells[food?.id ?? ""]).toMatchObject({ plan: 25000, fact: 27000, diff: -2000 });
    expect(row?.income).toMatchObject({ plan: 100000, fact: 90000 });
    expect(row?.expense).toMatchObject({ plan: 25000, fact: 27000 });
    // Each band carries its own comment.
    expect(row?.note).toBe("Гасим рассрочку");
    expect(row?.factNote).toBe("Саша в отпуске");

    // Opening balance: the account started at zero and everything since is in
    // this month, so the month opened with nothing.
    expect(row?.opening.fact).toBe(0);
    // opening + income − expense, on both sides.
    expect(row?.result.fact).toBe(63000);
    expect(row?.result.plan).toBe(75000);

    // Income columns come before spending ones, and every category has a
    // column of its own whether or not money went through it.
    const kinds = plan.columns.map((column) => column.kind);
    expect(kinds.indexOf("EXPENSE")).toBeGreaterThan(kinds.lastIndexOf("INCOME"));
    expect(plan.columns).toHaveLength(categories.categories.length);
  });

  it("clears a planned amount when it is set back to zero", async () => {
    const client = createClient();
    const categories = await client.get<CategoriesPageData>("/categories");
    const food = categories.categories.find((category) => category.name === "Продукты");
    const month = todayInput().slice(0, 7);

    await client.post("/plan", { month, categoryId: food?.id, amount: "25000" });
    await client.post("/plan", { month, categoryId: food?.id, amount: "0" });

    const plan = await client.get<PlanFactPageData>("/plan");
    const row = plan.months.find((entry) => entry.month === month);
    expect(row?.cells[food?.id ?? ""]?.plan).toBe(0);
    expect(row?.expense.plan).toBe(0);
  });

  it("keeps each month's plan to itself, newest month first", async () => {
    const client = createClient();
    const categories = await client.get<CategoriesPageData>("/categories");
    const food = categories.categories.find((category) => category.name === "Продукты");
    const key = food?.id ?? "";

    await client.post("/plan", { month: "2026-03", categoryId: key, amount: "11000" });
    await client.post("/plan", { month: "2026-04", categoryId: key, amount: "12000" });

    const plan = await client.get<PlanFactPageData>("/plan");
    const months = plan.months.map((entry) => entry.month);
    expect(plan.months.find((entry) => entry.month === "2026-03")?.cells[key]?.plan).toBe(11000);
    expect(plan.months.find((entry) => entry.month === "2026-04")?.cells[key]?.plan).toBe(12000);
    expect([...months].sort((a, b) => b.localeCompare(a))).toEqual(months);
  });

  it("keeps savings apart from the money on hand in plan/fact", async () => {
    const client = createClient();
    const card = await seedAccount(client, { name: "Карта", balance: "50000" });
    await seedAccount(client, { name: "Накопительный", type: "SAVINGS", balance: "300000" });
    const month = todayInput().slice(0, 7);

    const categories = await client.get<CategoriesPageData>("/categories");
    const food = categories.categories.find((category) => category.name === "Продукты");
    await client.post("/transactions", {
      amount: "10000",
      type: "EXPENSE",
      accountId: card.id,
      categoryId: food?.id,
      date: todayInput(),
      description: "Продукты"
    });

    const plan = await client.get<PlanFactPageData>("/plan");
    const row = plan.months.find((entry) => entry.month === month);

    // The month opened with 50 000 on the card (40 000 left after the spending)
    // and 300 000 set aside — one figure of 350 000 said nothing useful.
    expect(row?.opening.fact).toBe(50000);
    expect(row?.savings.fact).toBe(300000);
    // Both halves still belong to the month's result: opening − spending.
    expect(row?.result.fact).toBe(340000);
  });

  it("leaves the transfer category out of the grid unless transfers are counted", async () => {
    const client = createClient();
    const from = await seedAccount(client, { name: "Счёт А", balance: "100000" });
    const to = await seedAccount(client, { name: "Счёт Б", type: "SAVINGS", balance: "0" });

    await client.post("/transactions", {
      action: "transfer",
      amount: "40000",
      fromAccountId: from.id,
      toAccountId: to.id,
      date: todayInput(),
      description: "В накопления"
    });

    const plain = await client.get<PlanFactPageData>("/plan");
    const counted = await client.get<PlanFactPageData>("/plan?transfers=1");

    // Nothing was earned or spent, so the column would have been two rows of a
    // number the owner had already said not to count.
    expect(plain.columns.some((column) => column.label === "Переводы")).toBe(false);
    expect(counted.columns.filter((column) => column.label === "Переводы")).toHaveLength(2);

    // The transfer still moved the money, whatever the reader chose about
    // totals: it left the card and landed in savings.
    const month = plain.months.find((entry) => entry.month === todayInput().slice(0, 7));
    expect(month?.opening.fact).toBe(100000);
    expect(month?.savings.fact).toBe(0);
  });

  it("keeps a category called «Переводы» that holds real spending", async () => {
    const client = createClient();
    const account = await seedAccount(client, { name: "Карта", balance: "50000" });
    const category = await client.post<{ id: string }>("/categories", {
      name: "Переводы",
      kind: "EXPENSE"
    });

    await client.post("/transactions", {
      amount: "7000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: category.id,
      date: todayInput(),
      description: "Маме"
    });

    // The name alone is not evidence: money sent to relatives is spending, and
    // dropping the column would take it out of the month's totals too.
    const plan = await client.get<PlanFactPageData>("/plan");
    expect(plan.columns.some((column) => column.categoryId === category.id)).toBe(true);
    const month = plan.months.find((entry) => entry.month === todayInput().slice(0, 7));
    expect(month?.cells[category.id]?.fact).toBe(7000);
    expect(month?.expense.fact).toBe(7000);
  });

  it("leaves an archived account out of the opening balance, rows and all", async () => {
    const client = createClient();
    const kept = await seedAccount(client, { name: "Карта", balance: "80000" });
    const closed = await seedAccount(client, { name: "Старый счёт", balance: "30000" });
    const categories = await client.get<CategoriesPageData>("/categories");
    const food = categories.categories.find((category) => category.name === "Продукты");

    await client.post("/transactions", {
      amount: "5000",
      type: "EXPENSE",
      accountId: closed.id,
      categoryId: food?.id,
      date: todayInput(),
      description: "Продукты"
    });
    await client.delete(`/accounts?id=${closed.id}`);

    // The archived account is outside every other total on the screen, so its
    // spending must not be wound back out of a balance that never held it.
    const plan = await client.get<PlanFactPageData>("/plan");
    const month = plan.months.find((entry) => entry.month === todayInput().slice(0, 7));
    expect(month?.opening.fact).toBe(80000);
    expect(kept.id).toBeTruthy();
  });

  it("winds a foreign-currency account back in the base currency", async () => {
    const client = createClient();
    const account = await seedAccount(client, { name: "Долларовый", balance: "1000" });
    // Seeded in roubles first, then re-created in dollars: the helper posts the
    // base currency, and the point here is the conversion.
    await client.delete(`/accounts?id=${account.id}`);
    const usd = await client.post<{ id: string }>("/accounts", {
      name: "Долларовый",
      type: "DEBIT_CARD",
      balance: "1000",
      currency: "USD"
    });
    const categories = await client.get<CategoriesPageData>("/categories");
    const food = categories.categories.find((category) => category.name === "Продукты");

    await client.post("/transactions", {
      amount: "200",
      type: "EXPENSE",
      accountId: usd.id,
      categoryId: food?.id,
      date: todayInput(),
      description: "Продукты"
    });

    const accounts = await client.get<AccountsPageData>("/accounts");
    const plan = await client.get<PlanFactPageData>("/plan");
    const month = plan.months.find((entry) => entry.month === todayInput().slice(0, 7));

    // 800 $ left of 1000 $, so the month opened with 1000 $ — in roubles, at
    // the same rate the balance itself is converted with. Subtracting 200 raw
    // dollars from a rouble total is how this went wrong.
    const rate = accounts.totalBalance / 800;
    expect(month?.opening.fact).toBeCloseTo(1000 * rate, 0);
    expect(month?.opening.fact).toBeGreaterThan(accounts.totalBalance);
  });

  it("offers rows for months ahead only when asked to plan that far", async () => {
    const client = createClient();
    const current = todayInput().slice(0, 7);
    const [year, index] = current.split("-").map(Number);
    const next = `${new Date(year, index, 1).getFullYear()}-${String(
      new Date(year, index, 1).getMonth() + 1
    ).padStart(2, "0")}`;

    const now = await client.get<PlanFactPageData>("/plan");
    expect(now.months.map((entry) => entry.month)).not.toContain(next);

    const ahead = await client.get<PlanFactPageData>("/plan?ahead=1");
    expect(ahead.months[0]?.month).toBe(next);
  });

  it("keeps the funding account and the planned contribution when a goal is topped up", async () => {
    const client = createClient();
    const account = await seedAccount(client, { name: "Карта", balance: "50000" });
    const goal = await client.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "100000",
      currentAmount: "0",
      deadline: "2027-01-01",
      linkedAccountId: account.id,
      plannedContribution: "5000"
    });

    await client.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      amount: "1000",
      accountId: account.id
    });

    // A top-up used to rebuild the goal from five fields and drop the rest.
    const goals = await client.get<GoalsPageData>("/goals");
    const updated = goals.goals.find((item) => item.id === goal.id);
    expect(updated?.currentAmount).toBe(1000);
    expect(updated?.linkedAccountId).toBe(account.id);
    expect(updated?.plannedContribution).toBe(5000);
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

  it("keeps portfolio positions whose ticker is outside the curated board", async () => {
    // Regression: "Сохранить позицию" appeared to do nothing for a security
    // picked through the full-board search (e.g. ETLN). The position was written
    // and then immediately dropped, because the portfolio was rebuilt from the
    // curated securities list only.
    const client = createClient();
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });

    const backup = await client.get<Record<string, unknown>>("/backup");
    const investments = backup.investments as InvestmentData;
    const offBoard = {
      ...investments.portfolio[0],
      ticker: "ETLN",
      name: "Эталон",
      sector: "Строительство",
      quantity: 11,
      averageBuyPrice: 90,
      currentPrice: 96,
      currentValue: 1056,
      pnl: 66
    };
    await client.post("/backup", {
      backup: { ...backup, investments: { ...investments, portfolio: [offBoard] } }
    });

    const restored = await client.get<InvestmentData>("/investments");
    expect(restored.portfolio).toHaveLength(1);
    expect(restored.portfolio[0]).toMatchObject({
      ticker: "ETLN",
      name: "Эталон",
      quantity: 11,
      averageBuyPrice: 90,
      // Unknown to the market directory → the stored price snapshot survives.
      currentPrice: 96,
      share: 100
    });

    // And it must still be there after a second read (the read path persists the
    // rebuilt portfolio back into the local state).
    const again = await client.get<InvestmentData>("/investments");
    expect(again.portfolio.map((position) => position.ticker)).toEqual(["ETLN"]);
  });

  it("derives the average buy price from the list of purchases", async () => {
    const client = createClient();
    await client.post("/investments", {
      ticker: "SBER",
      lots: JSON.stringify([
        { date: "2026-01-10", quantity: 10, price: 100 },
        { date: "2026-03-05", quantity: 30, price: 200 }
      ]),
      // A stale average in the form must lose to the purchases it came from.
      quantity: "1",
      averageBuyPrice: "999"
    });

    const data = await client.get<InvestmentData>("/investments");
    expect(data.portfolio[0]).toMatchObject({
      ticker: "SBER",
      quantity: 40,
      averageBuyPrice: 175
    });
    expect(data.portfolio[0].lots).toEqual([
      { date: "2026-01-10", quantity: 10, price: 100 },
      { date: "2026-03-05", quantity: 30, price: 200 }
    ]);
  });

  it("falls back to the hand-typed average when no purchases are listed", async () => {
    const client = createClient();
    await client.post("/investments", {
      ticker: "GAZP",
      lots: "[]",
      quantity: "5",
      averageBuyPrice: "123.45"
    });

    const data = await client.get<InvestmentData>("/investments");
    expect(data.portfolio[0]).toMatchObject({ quantity: 5, averageBuyPrice: 123.45 });
    expect(data.portfolio[0].lots).toBeUndefined();
  });

  it("validates local backups before restore", async () => {
    const client = createClient();
    const backup = await client.get<{ schemaVersion: number; lastBackupAt: string | null }>(
      "/backup"
    );

    expect(backup.schemaVersion).toBe(LATEST_LOCAL_STATE_VERSION);
    expect(backup.lastBackupAt).toEqual(expect.any(String));
    await expect(client.post("/backup", { backup })).resolves.toEqual({ restored: true });
    await expect(
      client.post("/backup", { backup: { schemaVersion: 1, accounts: "not-an-array" } })
    ).rejects.toThrow("Backup payload is invalid");
  });

  it("restores compatible v1 local backups through the state migration", async () => {
    const client = createClient();
    const backup = await client.get<Record<string, unknown>>("/backup");
    const legacyBackup = { ...backup, schemaVersion: 1 };

    await expect(client.post("/backup", { backup: legacyBackup })).resolves.toEqual({
      restored: true
    });

    const migrated = await client.get<{ schemaVersion: number; lastBackupAt: string | null }>(
      "/backup"
    );
    expect(migrated.schemaVersion).toBe(LATEST_LOCAL_STATE_VERSION);
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

  it("does not post an operation when a recurring template is created", async () => {
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

    // Planning is not bookkeeping: the ledger stays untouched…
    expect(transactions.transactions.some((t) => t.category.id === "cat-food")).toBe(false);
    // …and the template keeps the date the user entered, waiting to be posted.
    expect(recurring.recurringTransactions[0].isDue).toBe(true);
    expect(recurring.recurringTransactions[0].amount).toBe(5000);
  });

  it("keeps already posted operations untouched when a template is edited or deleted", async () => {
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

    // The user posts today's occurrence…
    await client.post("/recurring/materialize", { id: created.id });
    expect(
      (await client.get<TransactionsPageData>("/transactions")).transactions.some(
        (t) => t.amount === 5000
      )
    ).toBe(true);

    // …then raises the planned amount: the posted operation is a fact, it stays 5000.
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

    let transactions = await client.get<TransactionsPageData>("/transactions");
    expect(transactions.transactions.some((t) => t.amount === 5000)).toBe(true);
    expect(transactions.transactions.some((t) => t.amount === 8000)).toBe(false);

    // Deleting the plan does not erase the payment that already happened.
    await client.delete(`/recurring?id=${created.id}`);
    transactions = await client.get<TransactionsPageData>("/transactions");
    expect(transactions.transactions.some((t) => t.amount === 5000)).toBe(true);
    expect(
      (await client.get<RecurringTransactionsPageData>("/recurring")).recurringTransactions
    ).toHaveLength(0);
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

describe("LocalApiClient state cache (plan A4)", () => {
  it("stays fresh across mutations and resets after clearing all data", async () => {
    const client = createClient();

    await seedAccount(client, { name: "Карта", balance: "500" });
    let accounts = await client.get<AccountsPageData>("/accounts");
    expect(accounts.accounts).toHaveLength(1);

    // A second mutation must be visible on the next read (no stale cache).
    await seedAccount(client, { name: "Наличные", balance: "100" });
    accounts = await client.get<AccountsPageData>("/accounts");
    expect(accounts.accounts).toHaveLength(2);
    expect(accounts.totalBalance).toBe(600);

    // Clearing wipes the cache too — the next read sees an empty state.
    await client.delete("/storage/clear");
    accounts = await client.get<AccountsPageData>("/accounts");
    expect(accounts.accounts).toHaveLength(0);
  });
});

describe("LocalApiClient debts (plan D1)", () => {
  it("creates a liability, derives repayment progress, and totals balances", async () => {
    const client = createClient();
    const created = await client.post<LiabilitiesPageData["liabilities"][number]>("/debts", {
      name: "Кредитка",
      kind: "CREDIT_CARD",
      balance: "30000",
      originalAmount: "100000",
      interestRate: "24",
      minPayment: "5000"
    });
    expect(created.id).toBeTruthy();
    // 70k of 100k repaid → 70% progress.
    expect(created.progress).toBe(70);

    const page = await client.get<LiabilitiesPageData>("/debts");
    expect(page.liabilities).toHaveLength(1);
    expect(page.total).toBe(30000);
  });

  it("reduces net worth by outstanding liabilities", async () => {
    const client = createClient();
    await seedAccount(client, { name: "Карта", balance: "100000" });

    const before = await client.get<DashboardData>("/dashboard");
    await client.post("/debts", { name: "Кредит", kind: "LOAN", balance: "40000" });
    const after = await client.get<DashboardData>("/dashboard");

    expect(after.liabilitiesTotal).toBe(40000);
    expect(after.netWorth).toBe(before.netWorth - 40000);
  });

  it("deletes a liability", async () => {
    const client = createClient();
    const created = await client.post<LiabilitiesPageData["liabilities"][number]>("/debts", {
      name: "Рассрочка",
      kind: "INSTALLMENT",
      balance: "12000"
    });
    await client.delete(`/debts?id=${encodeURIComponent(created.id)}`);
    const page = await client.get<LiabilitiesPageData>("/debts");
    expect(page.liabilities).toHaveLength(0);
  });
});

describe("LocalApiClient automation (plan D2c)", () => {
  it("persists the automation toggles", async () => {
    const client = createClient();
    await client.put("/settings", { autoMaterializeRecurring: "true", paymentReminders: "on" });
    const settings = await client.get<SettingsPageData>("/settings");
    expect(settings.autoMaterializeRecurring).toBe(true);
    expect(settings.paymentReminders).toBe(true);
  });

  it("persists AI assistant settings (plan D3)", async () => {
    const client = createClient();
    await client.put("/settings", {
      aiEnabled: "on",
      aiProvider: " openai ",
      aiEffort: " high ",
      aiApiKey: "  sk-ant-test  ",
      aiModel: " claude-opus-4-8 "
    });
    const settings = await client.get<SettingsPageData>("/settings");
    expect(settings.aiEnabled).toBe(true);
    expect(settings.aiProvider).toBe("openai");
    expect(settings.aiEffort).toBe("high");
    expect(settings.aiApiKey).toBe("sk-ant-test");
    expect(settings.aiModel).toBe("claude-opus-4-8");
  });

  it("converts multi-currency balances to the base using cached FX rates", async () => {
    const client = createClient();
    await client.post("/accounts", { name: "Рубли", type: "DEBIT_CARD", balance: "1000" });
    await client.post("/accounts", {
      name: "Доллары",
      type: "DEBIT_CARD",
      balance: "100",
      currency: "USD"
    });

    // Before a refresh the built-in default rate applies; set an explicit one.
    await client.post("/fx", { rates: { USD: 90 } });
    const accounts = await client.get<AccountsPageData>("/accounts");
    // 1000 RUB + 100 USD * 90 = 10 000 RUB
    expect(accounts.totalBalance).toBe(10000);

    const settings = await client.get<SettingsPageData>("/settings");
    expect(settings.currencyRatesUpdatedAt).toBeTruthy();
  });

  it("surfaces debts with a due day on the planning screen", async () => {
    const client = createClient();
    await client.post("/budgets", { categoryId: "cat-food", limitAmount: "15000" });
    await client.post("/debts", {
      name: "Ипотека",
      kind: "MORTGAGE",
      balance: "1000000",
      originalAmount: "1200000",
      interestRate: "9",
      minPayment: "25000",
      dueDay: "10"
    });

    const recurring = await client.get<RecurringTransactionsPageData>("/recurring");

    expect(recurring.debtPayments).toHaveLength(1);
    expect(recurring.debtPayments[0]).toMatchObject({ name: "Ипотека", amount: 25000 });
    // The debt payment counts towards the planned monthly load…
    expect(recurring.summary.monthlyPlannedExpense).toBe(25000);
    // …and the budget limit is offered as a hint for new templates.
    expect(recurring.budgetHints).toEqual([{ categoryId: "cat-food", amount: 15000 }]);
  });

  it("materializes overdue recurring payments idempotently", async () => {
    const client = createClient();
    const account = await seedAccount(client, { name: "Карта", balance: "100000" });
    const past = new Date();
    past.setMonth(past.getMonth() - 3);
    await client.post("/recurring", {
      amount: "1000",
      type: "EXPENSE",
      categoryId: "cat-food",
      accountId: account.id,
      frequency: "MONTHLY",
      nextDate: past.toISOString().slice(0, 10),
      isActive: "true"
    });

    const first = await client.post<{ created: number }>("/recurring/materialize-all", {});
    expect(first.created).toBeGreaterThanOrEqual(1);

    // Second run finds nothing due — no duplicates created.
    const second = await client.post<{ created: number }>("/recurring/materialize-all", {});
    expect(second.created).toBe(0);
  });
});
