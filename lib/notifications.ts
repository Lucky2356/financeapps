// Aggregates actionable notifications for the bell from several sources:
// finance recommendations, the cashflow forecast (upcoming payments + cash-gap
// warnings) and budget overruns. Pure and testable.

import type {
  BudgetRow,
  ForecastEvent,
  ForecastWarning,
  RecommendationView
} from "@/types/finance";
import { formatCurrency } from "@/lib/format";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n/catalog";

export type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  severity: NotificationSeverity;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildNotifications(input: {
  recommendations?: RecommendationView[];
  upcomingEvents?: ForecastEvent[];
  forecastWarnings?: ForecastWarning[];
  budgets?: BudgetRow[];
  currency?: string;
  now?: Date;
  locale?: Locale;
}): NotificationItem[] {
  const currency = input.currency ?? "RUB";
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const now = input.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items: NotificationItem[] = [];

  // Cash-gap and other forecast warnings first — they are the most urgent.
  for (const warning of input.forecastWarnings ?? []) {
    items.push({
      id: `forecast-${warning.id}`,
      title: warning.title,
      description: warning.description,
      severity: warning.severity
    });
  }

  // Budget overruns.
  for (const budget of input.budgets ?? []) {
    if (!budget.isExceeded) continue;
    items.push({
      id: `budget-${budget.categoryId}`,
      title: t("notif.budgetExceeded", { category: budget.category }),
      description: t("notif.budgetSpent", {
        spent: formatCurrency(budget.spent, currency),
        limit: formatCurrency(budget.limitAmount, currency)
      }),
      severity: "WARNING"
    });
  }

  // Upcoming planned expenses within the next 7 days.
  const upcoming = (input.upcomingEvents ?? [])
    .filter((event) => event.type === "EXPENSE")
    .map((event) => ({
      event,
      days: Math.round((new Date(event.date.slice(0, 10)).getTime() - today.getTime()) / DAY_MS)
    }))
    .filter(({ days }) => days >= 0 && days <= 7)
    .sort((left, right) => left.days - right.days)
    .slice(0, 5);
  for (const { event, days } of upcoming) {
    const when =
      days === 0
        ? t("notif.due.today")
        : days === 1
          ? t("notif.due.tomorrow")
          : t("notif.due.inDays", { days });
    items.push({
      id: `due-${event.id}`,
      title: t("notif.duePayment", { when, title: event.title }),
      description: `${formatCurrency(event.amount, currency)} · ${event.account}`,
      severity: days <= 2 ? "WARNING" : "INFO"
    });
  }

  // Finance recommendations last.
  for (const recommendation of input.recommendations ?? []) {
    items.push({
      id: `rec-${recommendation.id}`,
      title: recommendation.title,
      description: recommendation.description,
      severity: recommendation.severity as NotificationSeverity
    });
  }

  return items;
}

export function countUrgent(items: NotificationItem[]): number {
  return items.filter((item) => item.severity === "WARNING" || item.severity === "CRITICAL").length;
}
