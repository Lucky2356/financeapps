import { describe, expect, it } from "vitest";

import { projectScenario } from "@/services/ScenarioPlanningService";

describe("projectScenario", () => {
  it("projects baseline and scenario balances month by month", () => {
    const result = projectScenario({
      startingBalance: 100000,
      monthlyIncome: 100000,
      monthlyExpense: 80000, // baseline net +20 000
      extraSavingsPerMonth: 10000, // scenario net +30 000
      oneTimeExpense: 0,
      oneTimeMonth: 0,
      months: 3
    });
    // baseline: 120k, 140k, 160k ; scenario: 130k, 160k, 190k
    expect(result.baselineEnding).toBe(160000);
    expect(result.scenarioEnding).toBe(190000);
    expect(result.difference).toBe(30000);
    expect(result.points).toHaveLength(3);
    expect(result.scenarioShortfallMonth).toBeNull();
  });

  it("subtracts a one-time expense in the chosen month", () => {
    const result = projectScenario({
      startingBalance: 0,
      monthlyIncome: 50000,
      monthlyExpense: 40000, // net +10 000
      extraSavingsPerMonth: 0,
      oneTimeExpense: 25000,
      oneTimeMonth: 2,
      months: 3
    });
    // scenario: m1 +10k=10k ; m2 +10k-25k=-5k (shortfall) ; m3 +10k=5k
    expect(result.scenarioShortfallMonth).toBe(2);
    expect(result.scenarioEnding).toBe(5000);
  });
});
