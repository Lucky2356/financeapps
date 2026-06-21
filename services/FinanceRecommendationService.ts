import type { HealthScore, MonthlyCashflowDatum, RecommendationView } from "@/types/finance";
import { clamp, percent } from "@/lib/utils";

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
  build(input: FinanceRecommendationInput): RecommendationView[] {
    const recommendations: RecommendationView[] = [];

    for (const budget of input.budgets.filter((item) => item.isExceeded)) {
      recommendations.push({
        id: `budget-${budget.category}`,
        title: `Лимит по категории «${budget.category}» превышен`,
        description: `Расходы составили ${Math.round(percent(budget.spent, budget.limitAmount))}% от лимита. Проверьте крупные операции и регулярные платежи в этой категории.`,
        severity: "WARNING"
      });
    }

    if (input.emergencyFundMonths < 3) {
      recommendations.push({
        id: "emergency-fund-low",
        title: "Финансовая подушка ниже базового уровня",
        description:
          "Резерв покрывает меньше 3 месяцев расходов. Часть свободного остатка можно направлять на восстановление подушки.",
        severity: "CRITICAL"
      });
    } else if (input.emergencyFundMonths < input.emergencyFundTargetMonths) {
      recommendations.push({
        id: "emergency-fund-target",
        title: "Подушка еще не достигла выбранной цели",
        description: `Текущий запас покрывает ${input.emergencyFundMonths.toFixed(1)} мес. расходов при цели ${input.emergencyFundTargetMonths} мес.`,
        severity: "INFO"
      });
    }

    if (input.subscriptionAndEntertainmentShare > 10) {
      recommendations.push({
        id: "subscriptions-entertainment",
        title: "Необязательные траты выше 10% расходов",
        description:
          "Подписки, развлечения и рестораны занимают заметную долю бюджета. Полезно проверить, какие платежи повторяются автоматически.",
        severity: "INFO"
      });
    }

    if (input.freeCashflow > 0) {
      recommendations.push({
        id: "positive-cashflow",
        title: "Свободный остаток положительный",
        description:
          "Можно распределить свободные деньги между целями, финансовой подушкой и долгосрочным капиталом с учетом риск-профиля.",
        severity: "SUCCESS"
      });
    }

    if (input.essentialExpenseShare > 65) {
      recommendations.push({
        id: "essential-share-high",
        title: "Обязательные платежи занимают большую долю бюджета",
        description:
          "Если обязательные расходы превышают две трети доходов, финансовая гибкость снижается. Проверьте жилье, транспорт и регулярные счета.",
        severity: "WARNING"
      });
    }

    if (this.expensesGrowTwoMonths(input.monthlyCashflow)) {
      recommendations.push({
        id: "expense-growth",
        title: "Расходы растут два месяца подряд",
        description:
          "Рост расходов несколько месяцев подряд может снижать норму накоплений. Сравните категории и выделите источники роста.",
        severity: "WARNING"
      });
    }

    const slowGoal = input.goals.find(
      (goal) => goal.progress < 35 && goal.monthlyContribution > input.freeCashflow
    );
    if (slowGoal) {
      recommendations.push({
        id: `goal-${slowGoal.title}`,
        title: `Цель «${slowGoal.title}» требует внимания`,
        description:
          "Расчетный ежемесячный взнос выше текущего свободного остатка. Можно пересмотреть срок или темп пополнений.",
        severity: "INFO"
      });
    }

    return recommendations.slice(0, 8);
  }

  healthScore(input: FinanceRecommendationInput): HealthScore {
    // Empty state: no income/expense anywhere and no reserve — nothing to
    // assess yet, so don't penalize the user with phantom "problems".
    const hasActivity =
      input.monthlyCashflow.some((month) => month.income > 0 || month.expense > 0) ||
      input.emergencyFundMonths > 0;
    if (!hasActivity) {
      return {
        score: 100,
        summary:
          "Пока нет данных для оценки. Добавьте счета и операции, чтобы увидеть финансовое здоровье.",
        checks: [
          { label: "Свободный остаток", value: "—", status: "good" },
          { label: "Норма накоплений", value: "—", status: "good" },
          { label: "Финансовая подушка", value: "—", status: "good" }
        ],
        factors: []
      };
    }

    // Penalties are modeled as data so the score and its per-factor breakdown
    // (shown on the dashboard) stay in sync — one source of truth.
    const rawFactors = [
      { label: "Отрицательный остаток", deduction: input.freeCashflow < 0 ? 25 : 0 },
      { label: "Низкая норма накоплений", deduction: input.savingsRate < 10 ? 15 : 0 },
      {
        label: "Недостаточная подушка",
        deduction:
          input.emergencyFundMonths < 3
            ? 25
            : input.emergencyFundMonths < input.emergencyFundTargetMonths
              ? 10
              : 0
      },
      {
        label: "Превышены лимиты бюджета",
        deduction: input.budgets.some((budget) => budget.isExceeded) ? 12 : 0
      },
      {
        label: "Расходы растут 2 месяца",
        deduction: this.expensesGrowTwoMonths(input.monthlyCashflow) ? 10 : 0
      },
      {
        label: "Высокая доля необязательных трат",
        deduction: input.subscriptionAndEntertainmentShare > 10 ? 6 : 0
      },
      {
        // Debt-to-income: minimum debt payments above 40% of income is heavy.
        label: "Высокая долговая нагрузка",
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
        ? "Финансы устойчивы, сохраняйте регулярный контроль бюджета."
        : normalized >= 60
          ? "Есть рабочая база, но несколько зон требуют внимания."
          : "Финансовая устойчивость снижена, стоит сфокусироваться на резерве и расходах.";

    return {
      score: normalized,
      summary,
      checks: [
        {
          label: "Свободный остаток",
          value: input.freeCashflow >= 0 ? "Положительный" : "Отрицательный",
          status: input.freeCashflow >= 0 ? "good" : "critical"
        },
        {
          label: "Норма накоплений",
          value: `${input.savingsRate.toFixed(1)}%`,
          status: input.savingsRate >= 15 ? "good" : input.savingsRate >= 5 ? "warning" : "critical"
        },
        {
          label: "Финансовая подушка",
          value: `${input.emergencyFundMonths.toFixed(1)} мес.`,
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
