import { describe, expect, it } from "vitest";

import { buildNetWorthBreakdown, computeNetWorth } from "@/lib/net-worth";

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

describe("buildNetWorthBreakdown", () => {
  it("maps parts to labelled components", () => {
    const parts = {
      totalBalance: 100000,
      portfolioValue: 50000,
      goalSavings: 20000,
      liabilitiesTotal: 30000
    };
    expect(buildNetWorthBreakdown(parts)).toEqual({
      liquid: 100000,
      portfolio: 50000,
      goals: 20000,
      debts: 30000
    });
  });

  it("assets minus debts equals computeNetWorth", () => {
    const parts = {
      totalBalance: 100000,
      portfolioValue: 50000,
      goalSavings: 20000,
      liabilitiesTotal: 30000
    };
    const b = buildNetWorthBreakdown(parts);
    expect(b.liquid + b.portfolio + b.goals - b.debts).toBe(computeNetWorth(parts));
  });

  it("treats missing parts as zero", () => {
    expect(buildNetWorthBreakdown({ totalBalance: 1000 })).toEqual({
      liquid: 1000,
      portfolio: 0,
      goals: 0,
      debts: 0
    });
  });
});
