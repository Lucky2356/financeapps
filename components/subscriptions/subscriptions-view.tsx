"use client";

import { Repeat, Sparkles } from "lucide-react";
import { addDays, addMonths, addYears } from "date-fns";
import { useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { RecurringTransactionsPageData, TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { summarizeSubscriptions } from "@/lib/subscriptions";
import {
  detectSubscriptions,
  normalizeMerchant,
  type DetectedSubscription
} from "@/lib/subscriptions/detect";
import { useI18n } from "@/lib/i18n/context";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function nextDateAfter(lastIso: string, frequency: DetectedSubscription["frequency"]): string {
  const last = new Date(lastIso);
  const next =
    frequency === "WEEKLY"
      ? addDays(last, 7)
      : frequency === "YEARLY"
        ? addYears(last, 1)
        : addMonths(last, 1);
  return formatInputDate(next);
}

export function SubscriptionsView({ data }: { data: RecurringTransactionsPageData }) {
  const { t } = useI18n();
  const { data: pageData, reload } = useApiPageData(data, "/recurring");
  const { run, pending } = useApiMutation();
  const [transactions, setTransactions] = useState<TransactionsPageData["transactions"]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const summary = useMemo(
    () => summarizeSubscriptions(pageData.recurringTransactions),
    [pageData.recurringTransactions]
  );

  // Pull recent history and look for regular charges not already tracked as a
  // manual recurring template.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const from = formatInputDate(addMonths(new Date(), -13));
        const result = await apiClient.get<TransactionsPageData>(
          `/transactions?limit=100&from=${from}`
        );
        if (!cancelled) setTransactions(result.transactions);
      } catch {
        /* offline / unavailable — detection just stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const detected = useMemo(() => {
    const tracked = new Set(
      pageData.recurringTransactions
        .filter((row) => row.isActive)
        .map((row) => normalizeMerchant(row.description))
        .filter(Boolean)
    );
    return detectSubscriptions(transactions).filter(
      (item) => !tracked.has(item.key) && !dismissed.has(item.key)
    );
  }, [transactions, pageData.recurringTransactions, dismissed]);

  async function createRecurring(item: DetectedSubscription) {
    const categoryId =
      (item.categoryId &&
        pageData.categories.find((category) => category.id === item.categoryId)?.id) ||
      pageData.categories.find((category) => category.kind === "EXPENSE")?.id;
    const accountId = pageData.accounts[0]?.id;
    if (!categoryId || !accountId) {
      return;
    }
    await run(
      () =>
        apiClient.post("/recurring", {
          amount: String(item.averageAmount),
          type: "EXPENSE",
          categoryId,
          accountId,
          frequency: item.frequency,
          nextDate: nextDateAfter(item.lastDate, item.frequency),
          description: item.merchant,
          isActive: "true"
        }),
      {
        success: t("sub.detect.created"),
        error: t("sub.detect.createError"),
        onSuccess: async () => {
          setDismissed((prev) => new Set(prev).add(item.key));
          await reload();
        }
      }
    );
  }

  if (summary.items.length === 0 && detected.length === 0) {
    return (
      <EmptyState icon={Repeat} title={t("sub.empty.title")} description={t("sub.empty.desc")} />
    );
  }

  return (
    <div className="space-y-5">
      {summary.items.length > 0 ? (
        <>
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
                    {t("sub.annual", {
                      amount: formatCurrency(item.annualCost, pageData.currency)
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {detected.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              {t("sub.detect.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("sub.detect.desc")}</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {detected.map((item) => (
              <div
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{item.merchant}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("sub.detect.meta", {
                      freq: t(`freq.${item.frequency}`),
                      count: item.occurrences,
                      date: formatDate(item.lastDate)
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">
                    {formatCurrency(item.averageAmount, pageData.currency)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void createRecurring(item)}
                  >
                    {t("sub.detect.add")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDismissed((prev) => new Set(prev).add(item.key))}
                  >
                    {t("sub.detect.ignore")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
