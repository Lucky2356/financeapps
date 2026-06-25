import { roundMoney } from "@/lib/utils";

// Budget rollover (single-month carryover): when enabled, the previous month's
// unspent remainder is added to this month's available limit. Only a positive
// remainder carries over (an overspend does not create negative headroom).
// Shared by the web (Prisma) and desktop (LocalApiClient) paths.

export function rolloverCarry(
  enabled: boolean,
  prevLimit: number,
  prevSpent: number
): number {
  if (!enabled) return 0;
  return Math.max(0, roundMoney(prevLimit - prevSpent));
}

export function effectiveLimit(limitAmount: number, carried: number): number {
  return roundMoney(limitAmount + carried);
}
