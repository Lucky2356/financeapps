import { describe, expect, it } from "vitest";

import {
  earnsInterest,
  interestSchedule,
  periodInterest,
  projectedBalance,
  totalInterest,
  upcomingInterest,
  type InterestAccount
} from "@/lib/accounts/interest";

const today = new Date(2026, 0, 15); // 15 января 2026

function savings(overrides: Partial<InterestAccount> = {}): InterestAccount {
  return {
    id: "acc-savings",
    name: "Накопительный счёт",
    balance: 100_000,
    interestRate: 12,
    interestCompounding: "MONTHLY",
    ...overrides
  };
}

describe("savings interest", () => {
  it("splits the annual rate across the capitalisation period", () => {
    // 12 % годовых на 100 000 ₽ — это 1 000 ₽ за месяц и 3 000 ₽ за квартал.
    expect(periodInterest(100_000, 12, 1)).toBe(1000);
    expect(periodInterest(100_000, 12, 3)).toBe(3000);
    expect(periodInterest(100_000, 12, 12)).toBe(12_000);
  });

  it("earns nothing without a rate or without money on the account", () => {
    expect(earnsInterest(savings({ interestRate: undefined }))).toBe(false);
    expect(earnsInterest(savings({ interestRate: 0 }))).toBe(false);
    expect(earnsInterest(savings({ balance: 0 }))).toBe(false);
    expect(earnsInterest(savings())).toBe(true);
  });

  it("compounds: every month earns on the balance the previous month left", () => {
    const schedule = interestSchedule(savings(), today, 90);

    expect(schedule.map((accrual) => accrual.date.slice(0, 10))).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15"
    ]);
    expect(schedule.map((accrual) => accrual.amount)).toEqual([1000, 1010, 1020.1]);
    expect(schedule[1].onBalance).toBe(101_000);
  });

  it("keeps quarterly capitalisation on the same day of the month", () => {
    const schedule = interestSchedule(savings({ interestCompounding: "QUARTERLY" }), today, 365);

    expect(schedule.map((accrual) => accrual.date.slice(0, 10))).toEqual([
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
      "2027-01-15"
    ]);
    expect(schedule[0].amount).toBe(3000);
  });

  it("clamps the accrual day in a short month", () => {
    const schedule = interestSchedule(savings(), new Date(2026, 0, 31), 40);
    expect(schedule[0].date.slice(0, 10)).toBe("2026-02-28");
  });

  it("adds up the year and projects the resulting balance", () => {
    const schedule = interestSchedule(savings(), today, 365);
    expect(schedule).toHaveLength(12);
    // Ежемесячная капитализация под 12 % даёт больше 12 000 ₽ — в этом её смысл.
    expect(totalInterest(schedule)).toBeCloseTo(12_682.5, 0);
    expect(projectedBalance(savings(), today, 365)).toBeCloseTo(112_682.5, 0);
  });

  it("merges several accounts into one schedule, soonest first", () => {
    const accruals = upcomingInterest(
      [
        savings({ id: "a", name: "Копилка", interestCompounding: "QUARTERLY" }),
        savings({ id: "b", name: "Вклад" })
      ],
      today,
      100
    );

    expect(accruals[0]).toMatchObject({ accountId: "b", date: expect.stringContaining("2026-02") });
    expect(accruals.some((accrual) => accrual.accountId === "a")).toBe(true);
    expect(accruals.map((accrual) => accrual.date)).toEqual(
      [...accruals.map((accrual) => accrual.date)].sort()
    );
  });

  it("ignores accounts that earn nothing", () => {
    expect(upcomingInterest([savings({ interestRate: 0 })], today)).toEqual([]);
  });
});
