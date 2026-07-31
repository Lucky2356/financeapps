import { describe, expect, it } from "vitest";

import { compare, evaluateAlerts, tickersToFetch, type MarketAlert } from "@/lib/market/alerts";
import type { SmartLabFundamentals } from "@/lib/market/smartlab";

function fundamentals(ticker: string, metrics: Record<string, number>): SmartLabFundamentals {
  return {
    ticker,
    fetchedAt: new Date().toISOString(),
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([field, latest]) => [field, { field, values: [latest], latest }])
    )
  };
}

const debtFlag: MarketAlert = {
  id: "a1",
  ticker: "ETLN",
  metric: "debt_ebitda",
  op: ">",
  value: 3.5
};

describe("compare", () => {
  it("implements all four operators", () => {
    expect(compare(3.8, ">", 3.5)).toBe(true);
    expect(compare(3.5, ">", 3.5)).toBe(false);
    expect(compare(3.5, ">=", 3.5)).toBe(true);
    expect(compare(1, "<", 3.5)).toBe(true);
    expect(compare(3.5, "<=", 3.5)).toBe(true);
  });
});

describe("evaluateAlerts", () => {
  it("reports a hit with the observed value", () => {
    const hits = evaluateAlerts([debtFlag], { ETLN: fundamentals("ETLN", { debt_ebitda: 3.8 }) });
    expect(hits).toEqual([{ alert: debtFlag, actual: 3.8 }]);
  });

  it("stays quiet when the condition is not met", () => {
    expect(
      evaluateAlerts([debtFlag], { ETLN: fundamentals("ETLN", { debt_ebitda: 2.1 }) })
    ).toEqual([]);
  });

  it("skips tickers with no data or a missing metric", () => {
    expect(evaluateAlerts([debtFlag], {})).toEqual([]);
    expect(evaluateAlerts([debtFlag], { ETLN: null })).toEqual([]);
    expect(evaluateAlerts([debtFlag], { ETLN: fundamentals("ETLN", { p_e: 5 }) })).toEqual([]);
  });
});

describe("tickersToFetch", () => {
  it("dedupes and uppercases", () => {
    const alerts: MarketAlert[] = [
      debtFlag,
      { ...debtFlag, id: "a2", ticker: "etln" },
      { ...debtFlag, id: "a3", ticker: "SBER" }
    ];
    expect(tickersToFetch(alerts)).toEqual(["ETLN", "SBER"]);
  });
});
