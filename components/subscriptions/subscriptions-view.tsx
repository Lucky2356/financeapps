"use client";

import { Repeat } from "lucide-react";
import { useMemo } from "react";

import type { RecurringTransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { summarizeSubscriptions } from "@/lib/subscriptions";
import { useI18n } from "@/lib/i18n/context";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SubscriptionsView({ data }: { data: RecurringTransactionsPageData }) {
  const { t } = useI18n();
  const { data: pageData } = useApiPageData(data, "/recurring");
  const summary = useMemo(
    () => summarizeSubscriptions(pageData.recurringTransactions),
    [pageData.recurringTransactions]
  );

  if (summary.items.length === 0) {
    return (
      <EmptyState icon={Repeat} title={t("sub.empty.title")} description={t("sub.empty.desc")} />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("sub.perMonth")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(summary.totalMonthly, pageData.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("sub.perYear")}</CardTitle>
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
                {t("sub.metaLine", {
                  freq: t(`freq.${item.frequency}`),
                  category: item.category.label,
                  date: formatDate(item.nextDate)
                })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold">
                {t("sub.monthly", {
                  amount: formatCurrency(item.monthlyEquivalent, pageData.currency)
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("sub.annual", { amount: formatCurrency(item.annualCost, pageData.currency) })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
