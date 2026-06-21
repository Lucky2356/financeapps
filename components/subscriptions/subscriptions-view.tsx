"use client";

import { Repeat } from "lucide-react";
import { useMemo } from "react";

import type { RecurringTransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { summarizeSubscriptions } from "@/lib/subscriptions";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "еженедельно",
  MONTHLY: "ежемесячно",
  YEARLY: "ежегодно"
};

export function SubscriptionsView({ data }: { data: RecurringTransactionsPageData }) {
  const { data: pageData } = useApiPageData(data, "/recurring");
  const summary = useMemo(
    () => summarizeSubscriptions(pageData.recurringTransactions),
    [pageData.recurringTransactions]
  );

  if (summary.items.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="Подписок пока нет"
        description="Регулярные расходы (подписки, аренда, кредитные платежи) появятся здесь с пересчётом на месяц и год. Добавьте их на странице «Плановые»."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">В месяц</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.totalMonthly, pageData.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">В год</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.totalAnnual, pageData.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3">
        {summary.items.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4 shadow-soft"
          >
            <div className="min-w-0">
              <p className="font-medium">{item.description || item.category.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {FREQUENCY_LABELS[item.frequency] ?? item.frequency} · {item.category.label} · след.{" "}
                {formatDate(item.nextDate)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold">
                {formatCurrency(item.monthlyEquivalent, pageData.currency)}/мес
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(item.annualCost, pageData.currency)} в год
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
