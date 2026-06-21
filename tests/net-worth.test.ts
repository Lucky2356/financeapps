import { describe, expect, it } from "vitest";

import { computeNetWorth } from "@/lib/net-worth";

describe("computeNetWorth", () => {
  it("sums assets and subtracts liabilities", () => {
    expect(
      computeNetWorth({
        totalBalance: 100000,
        portfolioValue: 50000,
        goalSavings: 20000,
        liabilitiesTotal: 30000
      })
    ).toBe(140000);
  });

  it("treats missing parts as zero", () => {
    expect(computeNetWorth({ totalBalance: 1000 })).toBe(1000);
  });

  it("can go negative when debts exceed assets", () => {
    expect(computeNetWorth({ totalBalance: 1000, liabilitiesTotal: 5000 })).toBe(-4000);
  });
});
