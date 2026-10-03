import { describe, expect, it } from "vitest";

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
});
