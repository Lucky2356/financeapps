import type { RecurringTransactionRow } from "@/types/finance";

export type SubscriptionItem = RecurringTransactionRow & {
  /** Cost normalized to one month. */
  monthlyEquivalent: number;
  /** Cost over a year. */
  annualCost: number;
};

export type SubscriptionSummary = {
  items: SubscriptionItem[];
  totalMonthly: number;
  totalAnnual: number;
};

function monthlyFactor(frequency: RecurringTransactionRow["frequency"]): number {
  switch (frequency) {
    case "WEEKLY":
      return 52 / 12;
    case "YEARLY":
      return 1 / 12;
    case "MONTHLY":
    default:
      return 1;
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// Treats active recurring EXPENSE templates as recurring subscriptions/payments,
// normalizing each to its monthly-equivalent and annual cost so the user can see
// what regular payments really cost per year. Pure and testable.
export function summarizeSubscriptions(rows: RecurringTransactionRow[]): SubscriptionSummary {
  const items: SubscriptionItem[] = rows
    .filter((row) => row.isActive && row.type === "EXPENSE")
    .map((row) => {
      const monthlyEquivalent = round2(row.amount * monthlyFactor(row.frequency));
      return { ...row, monthlyEquivalent, annualCost: round2(monthlyEquivalent * 12) };
    })
    .sort((left, right) => right.monthlyEquivalent - left.monthlyEquivalent);

  const totalMonthly = round2(items.reduce((sum, item) => sum + item.monthlyEquivalent, 0));
  return { items, totalMonthly, totalAnnual: round2(totalMonthly * 12) };
}
