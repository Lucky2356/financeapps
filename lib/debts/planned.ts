// Debts as planned payments: a liability with a due day and a monthly payment is
// a scheduled obligation, so it belongs on the planning screen next to recurring
// templates — that is the whole point of entering a due day.
//
// This module only derives the schedule; it never posts anything. Actual posting
// stays in lib/debts/auto-pay.ts (opt-in per liability).
//
// Rules:
//   • only liabilities with a due day, a payment amount and a remaining balance;
//   • the payment never exceeds the remaining balance (same as auto-pay);
//   • a short month clamps the due day (31st → last day of February);
//   • once the month's payment is posted, the schedule points at the next month;
//   • a due day that has already passed unpaid stays on the current month and is
//     reported as due (overdue payments must not silently jump a month).

import { effectiveDueDay, monthKey, type AutoPayLiability } from "@/lib/debts/auto-pay";

export type PlannedDebtLiability = AutoPayLiability;

export type PlannedDebtPayment = {
  /** Liability id — the row links back to the debts page. */
  id: string;
  name: string;
  amount: number;
  /** ISO date of the upcoming payment. */
  dueDate: string;
  daysUntilNext: number;
  isDue: boolean;
  /** Whether this payment is posted automatically on its due day. */
  autoPay: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day as UTC midnight — the same convention recurring nextDate uses. */
function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** The date of the upcoming payment for a liability, or null if it has none. */
export function nextDueDate(
  liability: PlannedDebtLiability,
  today: Date = new Date()
): Date | null {
  if (!liability.dueDay) return null;
  if (liability.minPayment <= 0 || liability.balance <= 0) return null;

  const paidThisMonth = liability.lastPaidMonth === monthKey(today);
  const anchor = paidThisMonth
    ? new Date(today.getFullYear(), today.getMonth() + 1, 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);

  return utcDay(anchor.getFullYear(), anchor.getMonth(), effectiveDueDay(liability.dueDay, anchor));
}

/** Upcoming debt payments, soonest first. */
export function plannedDebtPayments(
  liabilities: PlannedDebtLiability[],
  today: Date = new Date()
): PlannedDebtPayment[] {
  const reference = utcDay(today.getFullYear(), today.getMonth(), today.getDate());

  return liabilities
    .map((liability) => {
      const dueDate = nextDueDate(liability, today);
      if (!dueDate) return null;

      const daysUntilNext = Math.round((dueDate.getTime() - reference.getTime()) / DAY_MS);
      return {
        id: liability.id,
        name: liability.name,
        amount: Math.round(Math.min(liability.minPayment, liability.balance) * 100) / 100,
        dueDate: dueDate.toISOString(),
        daysUntilNext: Math.max(0, daysUntilNext),
        isDue: daysUntilNext <= 0,
        autoPay: Boolean(liability.autoPay)
      } satisfies PlannedDebtPayment;
    })
    .filter((payment): payment is PlannedDebtPayment => payment !== null)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

/** Total monthly load added by debts (used by the planning summary). */
export function plannedDebtMonthlyTotal(payments: PlannedDebtPayment[]): number {
  return Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
}
