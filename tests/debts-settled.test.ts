import { describe, expect, it } from "vitest";

import { dueLiabilities, isDue, type AutoPayLiability } from "@/lib/debts/auto-pay";
import { nextDueDate, plannedDebtPayments } from "@/lib/debts/planned";
import { activeDebts, isSettledDebt, settledDebts } from "@/lib/debts/settled";

const base: AutoPayLiability = {
  id: "debt-1",
  name: "Кредит",
  balance: 100_000,
  minPayment: 5_000,
  dueDay: 5,
  autoPay: true
};

// «Погашен» has to mean the same thing everywhere: the moment the owner ticks
// it, the debt must vanish from capital, planning and auto-payment at once.
describe("settled debts", () => {
  it("recognises a debt marked as repaid", () => {
    expect(isSettledDebt(base)).toBe(false);
    expect(isSettledDebt({ ...base, settledAt: "2026-08-02" })).toBe(true);
  });

  it("splits a list into active and repaid, newest repayment first", () => {
    const list = [
      base,
      { ...base, id: "debt-2", settledAt: "2026-01-31" },
      { ...base, id: "debt-3", settledAt: "2026-07-15" }
    ];

    expect(activeDebts(list).map((item) => item.id)).toEqual(["debt-1"]);
    expect(settledDebts(list).map((item) => item.id)).toEqual(["debt-3", "debt-2"]);
  });

  it("never auto-pays a repaid debt, even on its due day", () => {
    const dueDay = new Date(2026, 7, 10);

    expect(isDue(base, dueDay)).toBe(true);
    expect(isDue({ ...base, settledAt: "2026-08-02" }, dueDay)).toBe(false);
    expect(dueLiabilities([{ ...base, settledAt: "2026-08-02" }], dueDay)).toEqual([]);
  });

  it("drops a repaid debt from the planning schedule", () => {
    const today = new Date(2026, 7, 2);

    expect(nextDueDate(base, today)).not.toBeNull();
    expect(nextDueDate({ ...base, settledAt: "2026-08-02" }, today)).toBeNull();
    expect(plannedDebtPayments([{ ...base, settledAt: "2026-08-02" }], today)).toEqual([]);
  });
});
