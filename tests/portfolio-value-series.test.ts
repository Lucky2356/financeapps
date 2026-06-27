import { describe, expect, it } from "vitest";

import { combinePortfolioValue } from "@/lib/market/portfolio-value-series";

describe("combinePortfolioValue", () => {
  it("returns an empty series for no holdings", () => {
    expect(combinePortfolioValue([])).toEqual([]);
  });

  it("values a single holding as quantity × price per day", () => {
    const series = combinePortfolioValue([
      {
        quantity: 2,
        points: [
          { date: "2026-06-01", price: 100 },
          { date: "2026-06-02", price: 110 }
        ]
      }
    ]);
    expect(series).toEqual([
      { date: "2026-06-01", price: 200 },
      { date: "2026-06-02", price: 220 }
    ]);
  });

  it("sums multiple holdings and carries forward a missing day's price", () => {
    const series = combinePortfolioValue([
      {
        quantity: 1,
        points: [
          { date: "2026-06-01", price: 100 },
          { date: "2026-06-02", price: 120 }
        ]
      },
      {
        // No trade on 2026-06-02 — last known price (50) is carried forward.
        quantity: 3,
        points: [{ date: "2026-06-01", price: 50 }]
      }
    ]);
    expect(series).toEqual([
      { date: "2026-06-01", price: 100 + 150 }, // 100×1 + 50×3
      { date: "2026-06-02", price: 120 + 150 } // 120×1 + carried 50×3
    ]);
  });

  it("normalizes ISO timestamps to the trading day", () => {
    const series = combinePortfolioValue([
      { quantity: 1, points: [{ date: "2026-06-01T00:00:00.000Z", price: 42 }] }
    ]);
    expect(series).toEqual([{ date: "2026-06-01", price: 42 }]);
  });
});
