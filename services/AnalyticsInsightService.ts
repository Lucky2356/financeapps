import { formatCurrency } from "@/lib/format";
import { percent, roundMoney } from "@/lib/utils";
import type { RecommendationView } from "@/types/finance";

export type AnalyticsMonth = {
  month: string;
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
};

export type AnalyticsTopCategory = {
  categoryId: string;
  category: string;
  color: string;
  total: number;
  share: number;
};

export type AnalyticsDerived = {
  expenseChangePct: number;
  savingsRateTrend: "up" | "down" | "flat";
  insights: RecommendationView[];
};

export function buildAnalyticsDerived(
  monthlyCashflow: AnalyticsMonth[],
  topExpenseCategories: AnalyticsTopCategory[]
): AnalyticsDerived {
  const current = monthlyCashflow.at(-1);
  const previous = monthlyCashflow.at(-2);
  const expenseChangePct =
    previous && previous.expense > 0 && current
      ? roundMoney(percent(current.expense - previous.expense, previous.expense))
      : 0;
  const savingsRateDelta = current && previous ? current.savingsRate - previous.savingsRate : 0;
  const savingsRateTrend = savingsRateDelta > 2 ? "up" : savingsRateDelta < -2 ? "down" : "flat";
  const insights: RecommendationView[] = [];

  if (!current || monthlyCashflow.every((month) => month.income === 0 && month.expense === 0)) {
    insights.push({
      id: "analytics-empty",
      title: "Нужно больше данных",
      description:
        "Добавьте операции или импортируйте CSV, чтобы увидеть персональные выводы по расходам.",
      severity: "INFO"
    });
  } else {
    if (current.savings < 0) {
      insights.push({
        id: "analytics-negative-cashflow",
        title: "Месяц закрывается в минус",
        description: `Расходы выше доходов на ${formatCurrency(Math.abs(current.savings))}. Проверьте крупные списания и обязательные платежи.`,
        severity: "CRITICAL"
      });
    } else if (current.savingsRate >= 20) {
      insights.push({
        id: "analytics-healthy-savings",
        title: "Хороший запас для накоплений",
        description: `Текущая норма сбережений ${current.savingsRate.toFixed(1)}%. Часть свободного остатка можно направить на цель или подушку.`,
        severity: "SUCCESS"
      });
    }

    if (expenseChangePct > 15) {
      insights.push({
        id: "analytics-expense-growth",
        title: "Расходы заметно выросли",
        description: `По сравнению с прошлым месяцем расходы выше на ${expenseChangePct.toFixed(1)}%. Посмотрите топ категорий ниже.`,
        severity: "WARNING"
      });
    }

    const topCategory = topExpenseCategories[0];
    if (topCategory && topCategory.share >= 35) {
      insights.push({
        id: "analytics-category-concentration",
        title: "Одна категория забирает большую долю",
        description: `«${topCategory.category}» занимает ${topCategory.share.toFixed(1)}% расходов за период. Стоит проверить, нет ли разовых трат.`,
        severity: "WARNING"
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: "analytics-stable",
        title: "Финансовый ритм выглядит стабильным",
        description: "Резких скачков расходов и отрицательного cashflow за текущий месяц не видно.",
        severity: "SUCCESS"
      });
    }
  }

  return { expenseChangePct, savingsRateTrend, insights };
}
