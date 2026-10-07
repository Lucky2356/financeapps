import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { annuity, simulate, type WhatIfBase } from "@/lib/whatif/simulate";

const base: WhatIfBase = {
  currency: "RUB",
  liquid: 100_000,
  savings: 300_000,
  avgIncome: 150_000,
  avgExpense: 90_000,
  debtPayments: 10_000,
  cushionTarget: 3,
  goals: [{ id: "g", title: "Отпуск", target: 200_000, saved: 50_000, monthly: 30_000 }]
};

describe("«Что если»", () => {
  it("аннуитет как в банке; без процентов — поровну", () => {
    // 300 000 на 12 мес. под 20 % — 27 790,35 в месяц (сверено отдельным расчётом).
    expect(annuity(300_000, 12, 20)).toBeCloseTo(27_790.35, 2);
    expect(annuity(120_000, 12, 0)).toBe(10_000);
  });

  it("покупка со счетов: деньги через год меньше на сумму, подушка не тронута", () => {
    const result = simulate(base, {
      amount: 60_000,
      mode: "cash",
      from: "liquid",
      months: 12,
      ratePercent: 0,
      downPayment: 0
    });
    expect(result.freeBefore).toBe(50_000);
    expect(result.freeAfter).toBe(50_000);
    expect(result.pathAfter[12]).toBe(result.pathBefore[12] - 60_000);
    expect(result.cushionAfter).toBe(result.cushionBefore);
    expect(result.verdict).toBe("ok");
  });

  it("свободных денег и сейчас меньше взносов на цели — покупка со счетов их не отодвигает", () => {
    const result = simulate(
      { ...base, goals: [{ ...base.goals[0], monthly: 80_000 }] },
      { amount: 10_000, mode: "cash", from: "liquid", months: 12, ratePercent: 0, downPayment: 0 }
    );
    expect(result.goals[0].after).toBe(result.goals[0].before);
    expect(result.verdict).toBe("ok");
  });

  it("из подушки ниже цели — «впритык» и почему", () => {
    const result = simulate(base, {
      amount: 150_000,
      mode: "cash",
      from: "savings",
      months: 12,
      ratePercent: 0,
      downPayment: 0
    });
    expect(result.cushionBefore).toBe(3);
    expect(result.cushionAfter).toBe(1.5);
    expect(result.verdict).toBe("tight");
    expect(result.reasons[0].key).toBe("wi.reason.cushion");
  });

  it("кредит съедает свободные деньги — цель отодвигается", () => {
    const result = simulate(base, {
      amount: 300_000,
      mode: "credit",
      from: "liquid",
      months: 12,
      ratePercent: 20,
      downPayment: 0
    });
    expect(result.monthlyPayment).toBeCloseTo(27_790.35, 2);
    expect(result.overpayment).toBeCloseTo(33_484.2, 0);
    expect(result.freeAfter).toBeCloseTo(22_209.65, 2);
    const goal = result.goals[0];
    expect(goal.before).toBe(5);
    expect(goal.after).toBeGreaterThan(5);
    expect(result.verdict).toBe("tight");
  });

  it("платёж больше свободных денег — «опасно»", () => {
    const result = simulate(base, {
      amount: 1_000_000,
      mode: "credit",
      from: "liquid",
      months: 12,
      ratePercent: 20,
      downPayment: 0
    });
    expect(result.freeAfter).toBeLessThan(0);
    expect(result.verdict).toBe("danger");
    expect(result.reasons.map((reason) => reason.key)).toContain("wi.reason.negative");
  });

  it("денег на счетах не хватает — «опасно», с недостачей", () => {
    const result = simulate(base, {
      amount: 120_000,
      mode: "cash",
      from: "liquid",
      months: 12,
      ratePercent: 0,
      downPayment: 0
    });
    expect(result.verdict).toBe("danger");
    expect(result.reasons[0]).toEqual({ key: "wi.reason.noCash", vars: { short: 20_000 } });
  });

  it("платёж по долгу не считается дважды: он уже в «платежах по долгам», не в расходах", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "50000" });
    const page = await api.get("/transactions");
    const accountId = page.accounts[0].id;
    const categoryId = page.categories.find((item) => item.kind === "EXPENSE")!.id;
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const date = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-15`;
    const expense = (amount: string, extra: Record<string, string> = {}) =>
      api.post("/transactions", { type: "EXPENSE", amount, accountId, categoryId, date, ...extra });
    const loan = await api.post<{ id: string }>("/debts", {
      name: "Кредит",
      kind: "LOAN",
      balance: "300000",
      minPayment: "12000"
    });
    const card = await api.post<{ id: string }>("/debts", {
      name: "Кредитка",
      kind: "CREDIT_CARD",
      balance: "20000",
      minPayment: "0"
    });
    await expense("30000");
    await expense("12000", { liabilityId: loan.id });
    // Кредитка без минимального платежа — в «платежах по долгам» её нет, и
    // её погашение остаётся обычным расходом, а не пропадает.
    await expense("5000", { liabilityId: card.id });
    const whatIf = await api.get("/what-if");
    expect(whatIf.avgExpense).toBe(35_000);
    expect(whatIf.debtPayments).toBe(12_000);
  });
});
