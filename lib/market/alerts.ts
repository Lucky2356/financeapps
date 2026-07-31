// User-defined "flags" on company fundamentals: notify me when a metric crosses
// a threshold, e.g. ETLN Debt/EBITDA > 3.5. Pure evaluation — fetching and
// notifying happen elsewhere.

import type { SmartLabFundamentals } from "@/lib/market/smartlab";

export type AlertOperator = ">" | "<" | ">=" | "<=";

export type MarketAlert = {
  id: string;
  ticker: string;
  /** smart-lab machine field id, e.g. "debt_ebitda". */
  metric: string;
  op: AlertOperator;
  value: number;
  /** ISO timestamp of the last time this alert fired (dedupe per day). */
  lastFiredAt?: string;
};

export type AlertHit = {
  alert: MarketAlert;
  /** The observed value that satisfied the condition. */
  actual: number;
};

export function compare(actual: number, op: AlertOperator, threshold: number): boolean {
  switch (op) {
    case ">":
      return actual > threshold;
    case "<":
      return actual < threshold;
    case ">=":
      return actual >= threshold;
    case "<=":
      return actual <= threshold;
    default:
      return false;
  }
}

// Evaluates every alert against the fundamentals fetched for its ticker.
// Alerts whose ticker has no data, or whose metric is missing, are skipped
// silently (the site may not publish that metric for that company).
export function evaluateAlerts(
  alerts: MarketAlert[],
  dataByTicker: Record<string, SmartLabFundamentals | null | undefined>
): AlertHit[] {
  const hits: AlertHit[] = [];
  for (const alert of alerts) {
    const data = dataByTicker[alert.ticker.toUpperCase()];
    const actual = data?.metrics[alert.metric]?.latest;
    if (typeof actual !== "number") continue;
    if (compare(actual, alert.op, alert.value)) hits.push({ alert, actual });
  }
  return hits;
}

/** Tickers that need fetching for the given alert list (deduped, uppercase). */
export function tickersToFetch(alerts: MarketAlert[]): string[] {
  return [...new Set(alerts.map((alert) => alert.ticker.trim().toUpperCase()).filter(Boolean))];
}
