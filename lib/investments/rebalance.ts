// Portfolio rebalancing suggestions. Given the current holdings (with a sector
// and market value) and a target allocation per sector, computes the actual vs
// target weight for each sector and the buy/sell amount needed to close the gap.
// Pure and deterministic.

export type RebalancePosition = {
  sector: string;
  currentValue: number;
};

export type RebalanceTarget = {
  sector: string;
  targetPct: number;
};

export type RebalanceRow = {
  sector: string;
  currentValue: number;
  actualPct: number;
  targetPct: number;
  /** Positive = buy this much; negative = sell this much to hit the target. */
  deltaValue: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeRebalance(
  positions: RebalancePosition[],
  targets: RebalanceTarget[]
): { rows: RebalanceRow[]; totalValue: number } {
  const bySector = new Map<string, number>();
  for (const position of positions) {
    bySector.set(position.sector, (bySector.get(position.sector) ?? 0) + position.currentValue);
  }
  const totalValue = [...bySector.values()].reduce((sum, value) => sum + value, 0);

  const sectors = new Set<string>([...bySector.keys(), ...targets.map((t) => t.sector)]);
  const targetBySector = new Map(targets.map((t) => [t.sector, t.targetPct]));

  const rows: RebalanceRow[] = [...sectors].map((sector) => {
    const currentValue = round2(bySector.get(sector) ?? 0);
    const actualPct = totalValue > 0 ? round2((currentValue / totalValue) * 100) : 0;
    const targetPct = targetBySector.get(sector) ?? 0;
    const deltaValue = round2((targetPct / 100) * totalValue - currentValue);
    return { sector, currentValue, actualPct, targetPct, deltaValue };
  });

  // Largest gaps first (buys and sells by magnitude).
  rows.sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue));
  return { rows, totalValue: round2(totalValue) };
}
