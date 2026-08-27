import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { BudgetsPageData, GoalsPageData, LiabilitiesPageData } from "@/lib/data";
import type { DashboardData } from "@/types/finance";
import type { PlanFactPageData } from "@/types/finance";

const USD_RATE = 90;
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

async function client() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

describe("moving money between own accounts", () => {
  it("does not create or destroy any of it across currencies", async () => {
    const api = await client();
    const roubles = await api.post<{ id: string }>("/accounts", {
      name: "Рубли",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const dollars = await api.post<{ id: string }>("/accounts", {
      name: "Доллары",
      type: "DEBIT_CARD",
      balance: "1000",
      currency: "USD"
    });

    const before = await api.get<{ totalBalance: number }>("/accounts");
    await api.post("/transactions", {
      action: "transfer",
      amount: "100",
      fromAccountId: dollars.id,
      toAccountId: roubles.id,
      date: today()
    });
    const after = await api.get<{
      totalBalance: number;
      accounts: Array<{ id: string; balance: number }>;
    }>("/accounts");

    // 100 $ leaves the dollar card and 9 000 ₽ arrives on the rouble one, so
    // capital is exactly where it was. Both halves used to carry "100".
    expect(after.totalBalance).toBeCloseTo(before.totalBalance, 2);
    expect(after.accounts.find((account) => account.id === dollars.id)?.balance).toBe(900);
    expect(after.accounts.find((account) => account.id === roubles.id)?.balance).toBe(
      100_000 + 100 * USD_RATE
    );
  });
});

describe("putting money into a goal", () => {
  it("credits the goal in the app's currency and stays visible in plan/fact", async () => {
    const api = await client();
    const dollars = await api.post<{ id: string }>("/accounts", {
      name: "Доллары",
      type: "DEBIT_CARD",
      balance: "1000",
      currency: "USD"
    });
    const goal = await api.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "300000",
      currentAmount: "0",
      deadline: new Date(new Date().getFullYear() + 1, 0, 1).toISOString().slice(0, 10)
    });

    const planBefore = await api.get<PlanFactPageData>("/plan");
    const monthBefore = planBefore.months.find((entry) => entry.month === monthKey());
    const totalBefore = (monthBefore?.opening.fact ?? 0) + (monthBefore?.savings.fact ?? 0);

    await api.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      accountId: dollars.id,
      amount: "100"
    });

    const goals = await api.get<GoalsPageData>("/goals");
    expect(goals.goals[0]?.currentAmount).toBe(100 * USD_RATE);

    // The money changed pocket, so the two halves of the opening row together
    // are where they were — a top-up used to take it out of the screen entirely.
    const planAfter = await api.get<PlanFactPageData>("/plan");
    const monthAfter = planAfter.months.find((entry) => entry.month === monthKey());
    const totalAfter = (monthAfter?.opening.fact ?? 0) + (monthAfter?.savings.fact ?? 0);
    expect(totalAfter).toBeCloseTo(totalBefore, 2);
  });
});

describe("the money in a goal", () => {
  it("cannot appear without leaving an account", async () => {
    const api = await client();
    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "100000" });

    // A figure typed into a goal used to raise capital by itself — money out of
    // nothing. Now it has to say which account it came from.
    await expect(
      api.post("/goals", {
        title: "Уже накоплено",
        targetAmount: "300000",
        currentAmount: "50000",
        deadline: new Date(new Date().getFullYear() + 1, 0, 1).toISOString().slice(0, 10)
      })
    ).rejects.toThrow(/счёт/i);
  });

  it("moves between the account and the goal, and back again", async () => {
    const api = await client();
    const account = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const capitalBefore = (await api.get<DashboardData>("/dashboard")).netWorth;

    const goal = await api.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "300000",
      currentAmount: "50000",
      accountId: account.id,
      deadline: new Date(new Date().getFullYear() + 1, 0, 1).toISOString().slice(0, 10)
    });

    // Half the card is now in the jar; together they are what they were.
    let accounts = await api.get<{ accounts: Array<{ id: string; balance: number }> }>("/accounts");
    expect(accounts.accounts[0].balance).toBe(50_000);
    expect((await api.get<GoalsPageData>("/goals")).goals[0]?.currentAmount).toBe(50_000);
    expect((await api.get<DashboardData>("/dashboard")).netWorth).toBeCloseTo(capitalBefore, 2);

    // And out again.
    await api.post("/goals", {
      action: "withdraw",
      goalId: goal.id,
      accountId: account.id,
      amount: "20000"
    });
    accounts = await api.get<{ accounts: Array<{ id: string; balance: number }> }>("/accounts");
    expect(accounts.accounts[0].balance).toBe(70_000);
    expect((await api.get<GoalsPageData>("/goals")).goals[0]?.currentAmount).toBe(30_000);
    expect((await api.get<DashboardData>("/dashboard")).netWorth).toBeCloseTo(capitalBefore, 2);
  });

  it("goes back to an account when the goal is deleted", async () => {
    const api = await client();
    const account = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const goal = await api.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "300000",
      currentAmount: "40000",
      accountId: account.id,
      deadline: new Date(new Date().getFullYear() + 1, 0, 1).toISOString().slice(0, 10)
    });

    await api.delete(`/goals?id=${goal.id}&accountId=${account.id}`);

    const accounts = await api.get<{ accounts: Array<{ balance: number }> }>("/accounts");
    // Deleting used to make the 40 000 ₽ vanish from capital with no account
    // any better off.
    expect(accounts.accounts[0].balance).toBe(100_000);
    expect((await api.get<GoalsPageData>("/goals")).goals).toHaveLength(0);
  });

  it("stays visible in plan/fact after a top-up", async () => {
    const api = await client();
    const account = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const before = await api.get<PlanFactPageData>("/plan");
    const monthBefore = before.months.find((entry) => entry.month === monthKey());
    const totalBefore = (monthBefore?.opening.fact ?? 0) + (monthBefore?.savings.fact ?? 0);

    const goal = await api.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "300000",
      currentAmount: "0",
      deadline: new Date(new Date().getFullYear() + 1, 0, 1).toISOString().slice(0, 10)
    });
    await api.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      accountId: account.id,
      amount: "25000"
    });

    // The opening row describes the START of the month, so a top-up made today
    // must not move it at all. It used to drag the "everyday" half down by the
    // amount — every earlier month read poorer for money that had only changed
    // pocket.
    const after = await api.get<PlanFactPageData>("/plan");
    const monthAfter = after.months.find((entry) => entry.month === monthKey());
    expect(monthAfter?.opening.fact).toBe(monthBefore?.opening.fact);
    expect(monthAfter?.savings.fact).toBe(monthBefore?.savings.fact);
    expect((monthAfter?.opening.fact ?? 0) + (monthAfter?.savings.fact ?? 0)).toBeCloseTo(
      totalBefore,
      2
    );
  });
});

describe("the head of the debts screen", () => {
  it("names the next payment by the calendar and converts what is owed", async () => {
    const api = await client();
    const now = new Date();
    // Two debts: one due earlier in the month than today, one later.
    const earlier = Math.max(1, now.getDate() - 3);
    const later = Math.min(28, now.getDate() + 3);
    await api.post("/debts", {
      name: "Рассрочка",
      kind: "INSTALLMENT",
      balance: "60000",
      originalAmount: "120000",
      interestRate: "0",
      minPayment: "10000",
      dueDay: String(earlier)
    });
    await api.post("/debts", {
      name: "Кредит в долларах",
      kind: "LOAN",
      balance: "1000",
      originalAmount: "1000",
      interestRate: "10",
      minPayment: "100",
      dueDay: String(later),
      currency: "USD"
    });

    const debts = await api.get<LiabilitiesPageData>("/debts");
    // 60 000 ₽ + 1 000 $ = 150 000 ₽, not "61 000" of nothing in particular.
    expect(debts.totals?.balance).toBe(60_000 + 1000 * USD_RATE);
    expect(debts.totals?.monthly).toBe(10_000 + 100 * USD_RATE);
    // The nearest payment is the overdue one — the day has come and gone and
    // nothing was recorded against it, so it is what needs paying next. It is
    // reported as a date and marked as due, rather than as a bare "23 числа"
    // printed under the word «ближайший» three days after it passed.
    expect(debts.totals?.nextDue?.isDue).toBe(true);
    expect(new Date(debts.totals?.nextDue?.date ?? "").getUTCDate()).toBe(earlier);
  });
});

describe("limits", () => {
  it("are not eaten by moving money between own accounts", async () => {
    const api = await client();
    const from = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const to = await api.post<{ id: string }>("/accounts", {
      name: "Копилка",
      type: "SAVINGS",
      balance: "0"
    });
    await api.post("/transactions", {
      action: "transfer",
      amount: "20000",
      fromAccountId: from.id,
      toAccountId: to.id,
      date: today()
    });

    const budgets = await api.get<BudgetsPageData>("/budgets");
    const spentAnywhere = budgets.budgets.reduce((sum, budget) => sum + budget.spent, 0);
    expect(spentAnywhere).toBe(0);
  });
});
