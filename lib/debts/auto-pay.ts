// Automatic debt payments: which liabilities should be charged today, and how
// much. Pure and deterministic so the rules are unit-testable — the actual
// transaction creation and balance update live in the API client.
//
// Rules:
//   • only liabilities with autoPay enabled, a payment amount and a due day;
//   • the due day must have arrived this month (so a payment set for the 5th is
//     still posted if the app is opened on the 9th);
//   • at most one payment per calendar month (lastPaidMonth guard) — reopening
//     the app must never post the same payment twice;
//   • a short month clamps the due day (31st → last day of February);
//   • the payment never exceeds the remaining balance.

export type AutoPayLiability = {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  dueDay?: number;
  autoPay?: boolean;
  paymentAccountId?: string;
  paymentCategoryId?: string;
  /** YYYY-MM of the last auto-posted payment. */
  lastPaidMonth?: string;
};

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Effective due day for the given month (clamped to the month's length). */
export function effectiveDueDay(dueDay: number, date: Date): number {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(Math.max(1, Math.round(dueDay)), daysInMonth);
}

/** The amount to post — never more than what is still owed. */
export function paymentAmount(liability: AutoPayLiability): number {
  const amount = Math.min(liability.minPayment, liability.balance);
  return Math.round(amount * 100) / 100;
}

export function isDue(liability: AutoPayLiability, today: Date): boolean {
  if (!liability.autoPay) return false;
  if (!liability.dueDay) return false;
  if (liability.minPayment <= 0 || liability.balance <= 0) return false;
  if (liability.lastPaidMonth === monthKey(today)) return false;
  return today.getDate() >= effectiveDueDay(liability.dueDay, today);
}

/** All liabilities whose payment should be posted now. */
export function dueLiabilities(
  liabilities: AutoPayLiability[],
  today: Date = new Date()
): AutoPayLiability[] {
  return liabilities.filter((liability) => isDue(liability, today));
}
