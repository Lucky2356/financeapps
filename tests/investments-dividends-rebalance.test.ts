import { describe, expect, it } from "vitest";

import { summarizeDividendIncome, upcomingDividends } from "@/lib/investments/dividends";
import { computeRebalance } from "@/lib/investments/rebalance";

describe("summarizeDividendIncome", () => {
  const events = [
    { type: "DIVIDEND", date: "2026-03-01", amount: 1000, ticker: "SBER" },
    { type: "DIVIDEND", date: "2026-06-01", amount: 500, ticker: "GAZP" },
    { type: "DIVIDEND", date: "2025-06-01", amount: 800, ticker: "SBER" },
    { type: "SELL", date: "2026-06-01", amount: 9999, ticker: "SBER" } // ignored
  ];

  it("aggregates dividends by year and total", () => {
    const summary = summarizeDividendIncome(events, new Date("2026-07-01"));
    expect(summary.total).toBe(2300);
    expect(summary.byYear).toEqual([
      { year: 2026, total: 1500 },
      { year: 2025, total: 800 }
    ]);
  });

  it("computes trailing twelve months", () => {
    const summary = summarizeDividendIncome(events, new Date("2026-07-01"));
    // last 12 months = since 2025-07-01 → only the 2026 payments (1500)
    expect(summary.lastTwelveMonths).toBe(1500);
  });
});

describe("upcomingDividends", () => {
  it("returns future dividends earliest first", () => {
    const expected = [
      { id: "1", ticker: "SBER", name: "", date: "2026-09-01", amount: 100, currency: "RUB" },
      { id: "2", ticker: "GAZP", name: "", date: "2026-08-01", amount: 200, currency: "RUB" },
      { id: "3", ticker: "LKOH", name: "", date: "2026-01-01", amount: 300, currency: "RUB" } // past
    ];
    const result = upcomingDividends(expected, new Date("2026-07-01"));
    expect(result.map((d) => d.id)).toEqual(["2", "1"]);
  });
});

describe("computeRebalance", () => {
  it("computes buy/sell deltas to reach target weights", () => {
    const { rows, totalValue } = computeRebalance(
      [
        { sector: "Финансы", currentValue: 7000 },
        { sector: "Энергетика", currentValue: 3000 }
      ],
      [
        { sector: "Финансы", targetPct: 50 },
        { sector: "Энергетика", targetPct: 50 }
      ]
    );
    expect(totalValue).toBe(10000);
    const fin = rows.find((r) => r.sector === "Финансы")!;
    const energy = rows.find((r) => r.sector === "Энергетика")!;
    expect(fin.actualPct).toBe(70);
    expect(fin.deltaValue).toBe(-2000); // sell 2000
    expect(energy.deltaValue).toBe(2000); // buy 2000
  });

  it("flags a missing sector as a full buy", () => {
    const { rows } = computeRebalance(
      [{ sector: "Финансы", currentValue: 10000 }],
      [
        { sector: "Финансы", targetPct: 60 },
        { sector: "Технологии", targetPct: 40 }
      ]
    );
    const tech = rows.find((r) => r.sector === "Технологии")!;
    expect(tech.currentValue).toBe(0);
    expect(tech.deltaValue).toBe(4000);
  });
});
