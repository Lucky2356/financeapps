import { describe, expect, it } from "vitest";

import { buildRealizedTaxReport, sellGain } from "@/services/InvestmentTaxReportService";
import type { RealizedEvent } from "@/services/InvestmentTaxReportService";

function sell(
  date: string,
  qty: number,
  sellPrice: number,
  buyPrice: number,
  fee = 0
): RealizedEvent {
  return { type: "SELL", date, quantity: qty, sellPrice, buyPrice, amount: 0, fee };
}
function dividend(date: string, amount: number): RealizedEvent {
  return { type: "DIVIDEND", date, quantity: 0, sellPrice: 0, buyPrice: 0, amount, fee: 0 };
}

describe("sellGain", () => {
  it("computes qty*(sell-buy) minus fee", () => {
    expect(sellGain(sell("2026-03-01", 10, 300, 250, 100))).toBe(400);
  });
});

describe("buildRealizedTaxReport", () => {
  it("groups by year and taxes gains + dividends at 13% under the threshold", () => {
    const report = buildRealizedTaxReport([
      sell("2026-02-01", 10, 300, 250), // gain 500
      dividend("2026-05-01", 1000) // +1000
    ]);
    const y = report.years.find((r) => r.year === 2026)!;
    expect(y.realizedGain).toBe(500);
    expect(y.dividends).toBe(1000);
    expect(y.taxableBase).toBe(1500);
    expect(y.estimatedTax).toBe(195); // 1500 * 13%
  });

  it("lets sale losses offset gains within the year (no negative base)", () => {
    const report = buildRealizedTaxReport([
      sell("2026-02-01", 10, 300, 250), // +500
      sell("2026-06-01", 10, 200, 300) // -1000
    ]);
    const y = report.years.find((r) => r.year === 2026)!;
    expect(y.realizedGain).toBe(-500);
    expect(y.taxableBase).toBe(0);
    expect(y.estimatedTax).toBe(0);
  });

  it("sorts years descending and sums total tax", () => {
    const report = buildRealizedTaxReport([
      dividend("2025-01-01", 1000),
      dividend("2026-01-01", 2000)
    ]);
    expect(report.years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(report.totalTax).toBe(390); // (1000+2000)*13%
  });
});
