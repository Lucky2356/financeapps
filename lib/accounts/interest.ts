// Interest on a savings account: the rate, how often it is capitalised, and the
// money it will add in the future.
//
// A savings account with a rate is a PLANNED INCOME the same way a debt with a
// due day is a planned expense — leaving it out understates every forecast. This
// module only derives the schedule and the amounts; nothing here posts a
// transaction (the balance still changes only when the user records it).
//
// Model: simple interest inside a period, capitalised (added to the balance) at
// the end of each period, so the next period earns on the larger balance. The
// period is a whole number of months, and a year is treated as 12 equal months —
// bank contracts differ in day count, so this is deliberately the round, honest
// approximation rather than a false-precision daily accrual.

import { roundMoney } from "@/lib/utils";

export type CompoundingPeriod = "MONTHLY" | "QUARTERLY" | "YEARLY";

export type InterestAccount = {
  id: string;
  name: string;
  balance: number;
  currency?: string;
  /** Annual rate in percent, e.g. 16 for 16 % годовых. */
  interestRate?: number;
  /** How often the interest is added to the balance. Defaults to monthly. */
  interestCompounding?: CompoundingPeriod;
};

export type InterestAccrual = {
  /** Account id — the row links back to the accounts page. */
  accountId: string;
  accountName: string;
  /** ISO date the interest is credited. */
  date: string;
  amount: number;
  /** The balance the interest was computed on. */
  onBalance: number;
  daysUntil: number;
};

const MONTHS_PER_PERIOD: Record<CompoundingPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function compoundingMonths(period: CompoundingPeriod | undefined): number {
  return MONTHS_PER_PERIOD[period ?? "MONTHLY"];
}

/** An account earns interest only with a positive rate and a positive balance. */
export function earnsInterest(account: InterestAccount): boolean {
  return (
    typeof account.interestRate === "number" &&
    Number.isFinite(account.interestRate) &&
    account.interestRate > 0 &&
    account.balance > 0
  );
}

/** What one capitalisation period adds to a given balance. */
export function periodInterest(balance: number, annualRatePercent: number, months: number): number {
  return roundMoney((balance * (annualRatePercent / 100) * months) / 12);
}

/**
 * The capitalisation dates and amounts inside the horizon, oldest first. Each
 * accrual is computed on the balance grown by the previous ones — that is what
 * "капитализация" means, and it is why the total is more than rate × balance.
 */
export function interestSchedule(
  account: InterestAccount,
  today: Date = new Date(),
  horizonDays = 365
): InterestAccrual[] {
  if (!earnsInterest(account)) return [];

  const months = compoundingMonths(account.interestCompounding);
  const rate = account.interestRate ?? 0;
  // Calendar days as UTC midnight — same convention as the debt schedule, so a
  // date never slides to the previous day when it is serialised.
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const horizon = new Date(start.getTime() + horizonDays * DAY_MS);

  const accruals: InterestAccrual[] = [];
  let balance = account.balance;
  for (let index = 1; ; index += 1) {
    // Day-of-month is preserved; a short month clamps to its last day, which is
    // what `Date.UTC(y, m + n, d)` does not do — so clamp explicitly.
    const target = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months * index, 1)
    );
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
    ).getUTCDate();
    const date = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(start.getUTCDate(), lastDay))
    );
    if (date > horizon) break;

    const amount = periodInterest(balance, rate, months);
    if (amount <= 0) break;
    accruals.push({
      accountId: account.id,
      accountName: account.name,
      date: date.toISOString(),
      amount,
      onBalance: roundMoney(balance),
      daysUntil: Math.max(0, Math.round((date.getTime() - start.getTime()) / DAY_MS))
    });
    balance = roundMoney(balance + amount);

    // Defensive stop: a horizon in years with monthly capitalisation is bounded,
    // but never let a bad rate spin this loop forever.
    if (accruals.length >= 600) break;
  }

  return accruals;
}

/** Interest every earning account will add within the horizon, soonest first. */
export function upcomingInterest(
  accounts: readonly InterestAccount[],
  today: Date = new Date(),
  horizonDays = 365
): InterestAccrual[] {
  return accounts
    .flatMap((account) => interestSchedule(account, today, horizonDays))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/** Total interest over the horizon — the headline number for the planning page. */
export function totalInterest(accruals: readonly InterestAccrual[]): number {
  return roundMoney(accruals.reduce((sum, accrual) => sum + accrual.amount, 0));
}

/**
 * Average monthly interest across the accruals — the planning summary shows a
 * per-month figure, and quarterly or yearly capitalisation would otherwise read
 * as zero in most months.
 */
export function monthlyInterestAverage(
  accruals: readonly InterestAccrual[],
  horizonMonths = 12
): number {
  if (accruals.length === 0 || horizonMonths <= 0) return 0;
  return roundMoney(totalInterest(accruals) / horizonMonths);
}

/** What the account will be worth after `horizonDays`, interest included. */
export function projectedBalance(
  account: InterestAccount,
  today: Date = new Date(),
  horizonDays = 365
): number {
  return roundMoney(account.balance + totalInterest(interestSchedule(account, today, horizonDays)));
}
