import { roundMoney } from "@/lib/utils";

// "What-if" scenario planning on top of the cashflow model. Pure and unit-
// testable: projects the liquid balance month-by-month for a baseline (current
// average income − expense) and a scenario that adds a monthly savings delta
// and/or a one-time expense, so the user can compare outcomes.

export type ScenarioInput = {
  startingBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  // Scenario levers:
  extraSavingsPerMonth: number; // + saves more / − spends more each month
  oneTimeExpense: number; // a single large outlay
  oneTimeMonth: number; // 1-based month it lands in (ignored if <= 0)
  months: number; // horizon (>= 1)
};

export type ScenarioPoint = { month: number; baseline: number; scenario: number };

export type ScenarioResult = {
  points: ScenarioPoint[];
  baselineEnding: number;
  scenarioEnding: number;
  difference: number;
  // First month (1-based) the scenario balance goes negative, or null if never.
  scenarioShortfallMonth: number | null;
};

export function projectScenario(input: ScenarioInput): ScenarioResult {
  const months = Math.max(1, Math.floor(input.months));
  const baselineNet = input.monthlyIncome - input.monthlyExpense;
  const scenarioNet = baselineNet + input.extraSavingsPerMonth;

  const points: ScenarioPoint[] = [];
  let baseline = input.startingBalance;
  let scenario = input.startingBalance;
  let shortfall: number | null = null;

  for (let month = 1; month <= months; month++) {
    baseline += baselineNet;
    scenario += scenarioNet;
    if (input.oneTimeMonth === month && input.oneTimeExpense > 0) {
      scenario -= input.oneTimeExpense;
    }
    if (shortfall === null && scenario < 0) shortfall = month;
    points.push({ month, baseline: roundMoney(baseline), scenario: roundMoney(scenario) });
  }

  const baselineEnding = roundMoney(baseline);
  const scenarioEnding = roundMoney(scenario);
  return {
    points,
    baselineEnding,
    scenarioEnding,
    difference: roundMoney(scenarioEnding - baselineEnding),
    scenarioShortfallMonth: shortfall
  };
}
