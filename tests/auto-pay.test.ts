import { describe, expect, it } from "vitest";

import {
  dueLiabilities,
  effectiveDueDay,
  isDue,
  monthKey,
  paymentAmount,
  type AutoPayLiability
} from "@/lib/debts/auto-pay";

const base: AutoPayLiability = {
  id: "l1",
  name: "Кредит",
  balance: 100000,
  minPayment: 10800,
  dueDay: 5,
  autoPay: true,
  paymentAccountId: "acc-1",
  paymentCategoryId: "cat-debt"
};

describe("isDue", () => {
  it("posts once the due day has arrived", () => {
    expect(isDue(base, new Date(2026, 6, 5))).toBe(true);
    expect(isDue(base, new Date(2026, 6, 9))).toBe(true); // opened later — still due
  });

  it("does not post before the due day", () => {
    expect(isDue(base, new Date(2026, 6, 4))).toBe(false);
  });

  it("is idempotent within a month (lastPaidMonth guard)", () => {
    const paid = { ...base, lastPaidMonth: "2026-07" };
    expect(isDue(paid, new Date(2026, 6, 20))).toBe(false);
    // Next month it is due again.
    expect(isDue(paid, new Date(2026, 7, 6))).toBe(true);
  });

  it("skips when autoPay is off, nothing owed, or no payment set", () => {
    expect(isDue({ ...base, autoPay: false }, new Date(2026, 6, 9))).toBe(false);
    expect(isDue({ ...base, balance: 0 }, new Date(2026, 6, 9))).toBe(false);
    expect(isDue({ ...base, minPayment: 0 }, new Date(2026, 6, 9))).toBe(false);
    expect(isDue({ ...base, dueDay: undefined }, new Date(2026, 6, 9))).toBe(false);
  });
});

describe("effectiveDueDay", () => {
  it("clamps to the length of a short month", () => {
    // 31st in February 2026 (28 days) → the 28th.
    expect(effectiveDueDay(31, new Date(2026, 1, 10))).toBe(28);
    expect(effectiveDueDay(15, new Date(2026, 1, 10))).toBe(15);
  });

  it("makes a 31st payment due on the last day of a short month", () => {
    const endOfMonth = { ...base, dueDay: 31 };
    expect(isDue(endOfMonth, new Date(2026, 1, 28))).toBe(true);
    expect(isDue(endOfMonth, new Date(2026, 1, 27))).toBe(false);
  });
});

describe("paymentAmount", () => {
  it("never exceeds the remaining balance", () => {
    expect(paymentAmount({ ...base, balance: 5000 })).toBe(5000);
    expect(paymentAmount(base)).toBe(10800);
  });
});

describe("dueLiabilities / monthKey", () => {
  it("returns only the due ones", () => {
    const list: AutoPayLiability[] = [
      base,
      { ...base, id: "l2", autoPay: false },
      { ...base, id: "l3", lastPaidMonth: "2026-07" }
    ];
    expect(dueLiabilities(list, new Date(2026, 6, 9)).map((l) => l.id)).toEqual(["l1"]);
  });

  it("formats the month key with a leading zero", () => {
    expect(monthKey(new Date(2026, 0, 9))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 9))).toBe("2026-12");
  });
});
