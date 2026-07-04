import { describe, expect, it } from "vitest";

import { computeInvestmentTaxEstimate } from "@/services/InvestmentTaxService";

describe("computeInvestmentTaxEstimate", () => {
  it("nets losses against gains and taxes the base at 13% under the threshold", () => {
    const est = computeInvestmentTaxEstimate([{ pnl: 100000 }, { pnl: -40000 }]);
    expect(est.totalGain).toBe(100000);
    expect(est.totalLoss).toBe(40000);
    expect(est.taxableBase).toBe(60000);
    expect(est.estimatedTax).toBe(7800); // 60 000 * 13%
    expect(est.hasGains).toBe(true);
  });

  it("applies 15% to the portion of the base above 2.4M ₽", () => {
    // base 3.4M: 2.4M*13% + 1.0M*15% = 312 000 + 150 000 = 462 000
    const est = computeInvestmentTaxEstimate([{ pnl: 3_400_000 }]);
    expect(est.taxableBase).toBe(3_400_000);
    expect(est.estimatedTax).toBe(462_000);
  });

  it("reports no gains when the portfolio is underwater", () => {
    const est = computeInvestmentTaxEstimate([{ pnl: -5000 }]);
    expect(est.hasGains).toBe(false);
    expect(est.taxableBase).toBe(0);
    expect(est.estimatedTax).toBe(0);
  });
});
