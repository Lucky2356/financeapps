// Shared net-worth helpers used by BOTH the desktop LocalApiClient and the
// web Prisma path, so the dashboard behaves identically in either mode.
//
// The trend is reconstructed from the current net worth and the transaction
// history rather than persisted snapshots: net worth at the end of a past
// month = current net worth minus the net flow that happened after it. This
// needs no storage, works retroactively, and is deterministic.

import type { NetWorthPoint } from "@/types/finance";

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
  now?: Date;
  monthsBack?: number;
}): NetWorthPoint[] {
  const now = params.now ?? new Date();
  const monthsBack = params.monthsBack ?? 6;

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
    const flowAfter = flows.reduce((sum, flow) => (flow.time > monthEnd ? sum + flow.delta : sum), 0);
    points.push({
      month: monthEndDate.toLocaleDateString("ru", { month: "short" }),
      value: Math.round((params.currentNetWorth - flowAfter) * 100) / 100
    });
  }
  return points;
}
