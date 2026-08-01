import { describe, expect, it } from "vitest";

import { isUsableLot, sortLots, summarizeLots } from "@/lib/investments/lots";

describe("purchase lots", () => {
  it("averages several purchases by weight, not by count", () => {
    // 10 × 100 + 30 × 200 = 7000 for 40 shares → 175, not the naive (100+200)/2.
    const summary = summarizeLots([
      { date: "2026-01-10", quantity: 10, price: 100 },
      { date: "2026-03-05", quantity: 30, price: 200 }
    ]);

    expect(summary).toEqual({ quantity: 40, averageBuyPrice: 175, totalCost: 7000 });
  });

  it("keeps fractional prices to four decimals", () => {
    const summary = summarizeLots([
      { date: "2026-01-10", quantity: 3, price: 90.15 },
      { date: "2026-02-10", quantity: 4, price: 96.4 }
    ]);

    expect(summary.averageBuyPrice).toBe(93.7214);
    expect(summary.totalCost).toBe(656.05);
  });

  it("ignores half-filled rows instead of skewing the average", () => {
    expect(isUsableLot({ date: "2026-01-10", quantity: 5 })).toBe(false);
    expect(isUsableLot({ date: "2026-01-10", quantity: 0, price: 100 })).toBe(false);
    expect(isUsableLot({ date: "2026-01-10", quantity: 5, price: 100 })).toBe(true);

    const summary = summarizeLots([
      { date: "2026-01-10", quantity: 10, price: 100 },
      { date: "", quantity: Number.NaN, price: 0 }
    ]);
    expect(summary).toEqual({ quantity: 10, averageBuyPrice: 100, totalCost: 1000 });
  });

  it("returns zeros for an empty list", () => {
    expect(summarizeLots([])).toEqual({ quantity: 0, averageBuyPrice: 0, totalCost: 0 });
  });

  it("sorts purchases oldest first", () => {
    const sorted = sortLots([
      { date: "2026-03-05", quantity: 1, price: 1 },
      { date: "2026-01-10", quantity: 1, price: 1 }
    ]);
    expect(sorted.map((lot) => lot.date)).toEqual(["2026-01-10", "2026-03-05"]);
  });
});
