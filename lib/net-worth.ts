// Shared net-worth helpers used by BOTH the desktop LocalApiClient and the
// web Prisma path, so the dashboard behaves identically in either mode.
//
// The trend prefers persisted daily snapshots (plan B7) — real net worth on a
// given day, incl. portfolio market value — and falls back to flow-reconstruction
// for months before snapshots existed (net worth at a past month-end = current
// net worth minus the net flow after it). So history is accurate going forward
// and still populated retroactively.

import type { NetWorthBreakdown, NetWorthPoint } from "@/types/finance";
import { isoDay, snapshotAsOf, type NetWorthSnapshot } from "@/lib/net-worth-snapshots";
import { roundMoney } from "@/lib/utils";

// Net worth split into its components for the dashboard breakdown. Same inputs
// as computeNetWorth, so the parts always sum to the headline net worth.
export function buildNetWorthBreakdown(parts: {
  totalBalance: number;
  portfolioValue?: number;
  goalSavings?: number;
  liabilitiesTotal?: number;
}): NetWorthBreakdown {
  return {
    liquid: roundMoney(parts.totalBalance),
    portfolio: roundMoney(parts.portfolioValue ?? 0),
    goals: roundMoney(parts.goalSavings ?? 0),
    debts: roundMoney(parts.liabilitiesTotal ?? 0)
  };
}

// Single net-worth formula shared by web (data.ts) and desktop (LocalApiClient):
// liquid balances + portfolio value + money saved in goals − outstanding debts.
export function computeNetWorth(parts: {
  totalBalance: number;
  portfolioValue?: number;
  goalSavings?: number;
  liabilitiesTotal?: number;
}): number {
  return roundMoney(
    parts.totalBalance +
      (parts.portfolioValue ?? 0) +
      (parts.goalSavings ?? 0) -
      (parts.liabilitiesTotal ?? 0)
  );
}

export type NetWorthFlowTx = {
  date: string | Date;
  type: string;
  amount: number;
  category?: { label?: string | null } | null;
};

// Goal deposits are recorded as an expense in this category but do not change
// net worth (money just moves from a balance into a goal), so they are skipped.
const SAVINGS_CATEGORY = "Накопления";

export function buildNetWorthTrend(params: {
  currentNetWorth: number;
  transactions: NetWorthFlowTx[];
  snapshots?: NetWorthSnapshot[];
  now?: Date;
  monthsBack?: number;
}): NetWorthPoint[] {
  const now = params.now ?? new Date();
  const monthsBack = params.monthsBack ?? 6;
  const snapshots = params.snapshots ?? [];

  // Net-worth-affecting flows: income (+) and expense (−). Transfers are stored
  // as paired EXPENSE+INCOME and cancel out; goal-deposit expenses are excluded.
  const flows = params.transactions
    .filter((tx) => tx.type === "INCOME" || tx.type === "EXPENSE")
    .filter((tx) => (tx.category?.label ?? "") !== SAVINGS_CATEGORY)
    .map((tx) => ({
      time: new Date(tx.date).getTime(),
      delta: tx.type === "INCOME" ? tx.amount : -tx.amount
    }));

  const points: NetWorthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthEndDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const monthEnd = monthEndDate.getTime();
    // Prefer a real captured snapshot at/before this month-end; otherwise fall
    // back to the flow-reconstructed value (months before snapshots existed).
    const snapshot = snapshotAsOf(snapshots, isoDay(monthEndDate));
    const flowAfter = flows.reduce(
      (sum, flow) => (flow.time > monthEnd ? sum + flow.delta : sum),
      0
    );
    points.push({
      month: monthEndDate.toLocaleDateString("ru", { month: "short" }),
      value: snapshot
        ? snapshot.value
        : Math.round((params.currentNetWorth - flowAfter) * 100) / 100
    });
  }
  return points;
}
