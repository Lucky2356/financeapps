import { formatCurrency } from "@/lib/format";
import { percent, roundMoney } from "@/lib/utils";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n/catalog";
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
  topExpenseCategories: AnalyticsTopCategory[],
  locale: Locale = DEFAULT_LOCALE
): AnalyticsDerived {
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
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
      title: t("svc.an.empty.title"),
      description: t("svc.an.empty.desc"),
      severity: "INFO"
    });
  } else {
    if (current.savings < 0) {
      insights.push({
        id: "analytics-negative-cashflow",
        title: t("svc.an.negative.title"),
        description: t("svc.an.negative.desc", {
          amount: formatCurrency(Math.abs(current.savings))
        }),
        severity: "CRITICAL"
      });
    } else if (current.savingsRate >= 20) {
      insights.push({
        id: "analytics-healthy-savings",
        title: t("svc.an.healthy.title"),
        description: t("svc.an.healthy.desc", { rate: current.savingsRate.toFixed(1) }),
        severity: "SUCCESS"
      });
    }

    if (expenseChangePct > 15) {
      insights.push({
        id: "analytics-expense-growth",
        title: t("svc.an.growth.title"),
        description: t("svc.an.growth.desc", { pct: expenseChangePct.toFixed(1) }),
        severity: "WARNING"
      });
    }

    const topCategory = topExpenseCategories[0];
    if (topCategory && topCategory.share >= 35) {
      insights.push({
        id: "analytics-category-concentration",
        title: t("svc.an.concentration.title"),
        description: t("svc.an.concentration.desc", {
          category: topCategory.category,
          share: topCategory.share.toFixed(1)
        }),
        severity: "WARNING"
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: "analytics-stable",
        title: t("svc.an.stable.title"),
        description: t("svc.an.stable.desc"),
        severity: "SUCCESS"
      });
    }
  }

  return { expenseChangePct, savingsRateTrend, insights };
}
