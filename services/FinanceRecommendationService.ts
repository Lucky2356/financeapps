import type { HealthScore, MonthlyCashflowDatum, RecommendationView } from "@/types/finance";
import { clamp, percent } from "@/lib/utils";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n/catalog";

type BudgetSignal = {
  category: string;
  limitAmount: number;
  spent: number;
  isExceeded: boolean;
  isSubscription?: boolean;
};

type GoalSignal = {
  title: string;
  progress: number;
  monthlyContribution: number;
};

export type FinanceRecommendationInput = {
  budgets: BudgetSignal[];
  monthlyCashflow: MonthlyCashflowDatum[];
  currentMonthIncome: number;
  currentMonthExpense: number;
  freeCashflow: number;
  savingsRate: number;
  emergencyFundMonths: number;
  emergencyFundTargetMonths: number;
  essentialExpenseShare: number;
  subscriptionAndEntertainmentShare: number;
  /** Sum of minimum monthly debt payments (0 when there are no liabilities). */
  monthlyDebtPayments?: number;
  goals: GoalSignal[];
};

export class FinanceRecommendationService {
  build(input: FinanceRecommendationInput, locale: Locale = DEFAULT_LOCALE): RecommendationView[] {
    const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
    const recommendations: RecommendationView[] = [];

    for (const budget of input.budgets.filter((item) => item.isExceeded)) {
      recommendations.push({
        id: `budget-${budget.category}`,
        title: t("svc.rec.budgetExceeded.title", { category: budget.category }),
        description: t("svc.rec.budgetExceeded.desc", {
          pct: Math.round(percent(budget.spent, budget.limitAmount))
        }),
        severity: "WARNING"
      });
    }

    if (input.emergencyFundMonths < 3) {
      recommendations.push({
        id: "emergency-fund-low",
        title: t("svc.rec.efLow.title"),
        description: t("svc.rec.efLow.desc"),
        severity: "CRITICAL"
      });
    } else if (input.emergencyFundMonths < input.emergencyFundTargetMonths) {
      recommendations.push({
        id: "emergency-fund-target",
        title: t("svc.rec.efTarget.title"),
        description: t("svc.rec.efTarget.desc", {
          months: input.emergencyFundMonths.toFixed(1),
          target: input.emergencyFundTargetMonths
        }),
        severity: "INFO"
      });
    }

    if (input.subscriptionAndEntertainmentShare > 10) {
      recommendations.push({
        id: "subscriptions-entertainment",
        title: t("svc.rec.subs.title"),
        description: t("svc.rec.subs.desc"),
        severity: "INFO"
      });
    }

    if (input.freeCashflow > 0) {
      recommendations.push({
        id: "positive-cashflow",
        title: t("svc.rec.positive.title"),
        description: t("svc.rec.positive.desc"),
        severity: "SUCCESS"
      });
    }

    if (input.essentialExpenseShare > 65) {
      recommendations.push({
        id: "essential-share-high",
        title: t("svc.rec.essential.title"),
        description: t("svc.rec.essential.desc"),
        severity: "WARNING"
      });
    }

    if (this.expensesGrowTwoMonths(input.monthlyCashflow)) {
      recommendations.push({
        id: "expense-growth",
        title: t("svc.rec.expenseGrowth.title"),
        description: t("svc.rec.expenseGrowth.desc"),
        severity: "WARNING"
      });
    }

    const slowGoal = input.goals.find(
      (goal) => goal.progress < 35 && goal.monthlyContribution > input.freeCashflow
    );
    if (slowGoal) {
      recommendations.push({
        id: `goal-${slowGoal.title}`,
        title: t("svc.rec.slowGoal.title", { title: slowGoal.title }),
        description: t("svc.rec.slowGoal.desc"),
        severity: "INFO"
      });
    }

    return recommendations.slice(0, 8);
  }

  healthScore(input: FinanceRecommendationInput, locale: Locale = DEFAULT_LOCALE): HealthScore {
    const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
    // Empty state: no income/expense anywhere and no reserve — nothing to
    // assess yet, so don't penalize the user with phantom "problems".
    const hasActivity =
      input.monthlyCashflow.some((month) => month.income > 0 || month.expense > 0) ||
      input.emergencyFundMonths > 0;
    if (!hasActivity) {
      return {
        score: 100,
        summary: t("svc.health.noData"),
        checks: [
          { label: t("svc.health.check.freeCash"), value: "—", status: "good" },
          { label: t("svc.health.check.savingsRate"), value: "—", status: "good" },
          { label: t("svc.health.check.cushion"), value: "—", status: "good" }
        ],
        factors: []
      };
    }

    // Penalties are modeled as data so the score and its per-factor breakdown
    // (shown on the dashboard) stay in sync — one source of truth.
    const rawFactors = [
      { label: t("svc.health.factor.negBalance"), deduction: input.freeCashflow < 0 ? 25 : 0 },
      { label: t("svc.health.factor.lowSavings"), deduction: input.savingsRate < 10 ? 15 : 0 },
      {
        label: t("svc.health.factor.lowCushion"),
        deduction:
          input.emergencyFundMonths < 3
            ? 25
            : input.emergencyFundMonths < input.emergencyFundTargetMonths
              ? 10
              : 0
      },
      {
        label: t("svc.health.factor.budgetExceeded"),
        deduction: input.budgets.some((budget) => budget.isExceeded) ? 12 : 0
      },
      {
        label: t("svc.health.factor.expenseGrowth"),
        deduction: this.expensesGrowTwoMonths(input.monthlyCashflow) ? 10 : 0
      },
      {
        label: t("svc.health.factor.highDiscretionary"),
        deduction: input.subscriptionAndEntertainmentShare > 10 ? 6 : 0
      },
      {
        // Debt-to-income: minimum debt payments above 40% of income is heavy.
        label: t("svc.health.factor.highDebt"),
        deduction:
          input.currentMonthIncome > 0 &&
          (input.monthlyDebtPayments ?? 0) / input.currentMonthIncome > 0.4
            ? 12
            : 0
      }
    ];
    const factors = rawFactors.map((factor) => ({ ...factor, applied: factor.deduction > 0 }));

    const score = 100 - factors.reduce((sum, factor) => sum + factor.deduction, 0);
    const normalized = clamp(Math.round(score), 0, 100);
    const summary =
      normalized >= 80
        ? t("svc.health.summary.good")
        : normalized >= 60
          ? t("svc.health.summary.mid")
          : t("svc.health.summary.low");

    return {
      score: normalized,
      summary,
      checks: [
        {
          label: t("svc.health.check.freeCash"),
          value:
            input.freeCashflow >= 0
              ? t("svc.health.value.positive")
              : t("svc.health.value.negative"),
          status: input.freeCashflow >= 0 ? "good" : "critical"
        },
        {
          label: t("svc.health.check.savingsRate"),
          value: `${input.savingsRate.toFixed(1)}%`,
          status: input.savingsRate >= 15 ? "good" : input.savingsRate >= 5 ? "warning" : "critical"
        },
        {
          label: t("svc.health.check.cushion"),
          value: t("svc.value.months", { months: input.emergencyFundMonths.toFixed(1) }),
          status:
            input.emergencyFundMonths >= input.emergencyFundTargetMonths
              ? "good"
              : input.emergencyFundMonths >= 3
                ? "warning"
                : "critical"
        }
      ],
      factors
    };
  }

  private expensesGrowTwoMonths(monthlyCashflow: MonthlyCashflowDatum[]) {
    if (monthlyCashflow.length < 3) return false;

    const lastThree = monthlyCashflow.slice(-3);
    return (
      lastThree[0].expense < lastThree[1].expense && lastThree[1].expense < lastThree[2].expense
    );
  }
}
