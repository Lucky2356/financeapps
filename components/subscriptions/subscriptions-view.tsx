"use client";

import { CalendarClock, Crown, Repeat, Sparkles } from "lucide-react";
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
import { HeroCard } from "@/components/ui/hero-card";
import { ListRow, ListRows } from "@/components/ui/list-row";
import { SectionCard } from "@/components/ui/section-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";

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

  // The list is already sorted by monthly cost, so the first item is the one
  // that costs the most.
  const priciest = summary.items[0];

  if (summary.items.length === 0 && detected.length === 0) {
    // Same head as the filled screen, reading zero — the layout does not jump
    // when the first subscription appears.
    return (
      <div className="space-y-5">
        <HeroCard
          label={t("sub.perMonth")}
          value={formatCurrency(0, pageData.currency)}
          caption={t("sub.hero.caption", { count: 0 })}
        />
        <EmptyState icon={Repeat} title={t("sub.empty.title")} description={t("sub.empty.desc")} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {summary.items.length > 0 ? (
        <>
          <HeroCard
            label={t("sub.perMonth")}
            value={formatCurrency(summary.totalMonthly, pageData.currency)}
            caption={t("sub.hero.caption", { count: summary.items.length })}
          />
          <StatGrid title={t("dash.widget.overview")}>
            <StatTile
              label={t("sub.perYear")}
              value={formatCurrency(summary.totalAnnual, pageData.currency)}
              caption={t("sub.tile.yearCaption")}
              icon={CalendarClock}
            />
            <StatTile
              label={t("sub.tile.count")}
              value={String(summary.items.length)}
              caption={t("sub.tile.countCaption")}
              icon={Repeat}
            />
            <StatTile
              label={t("sub.tile.priciest")}
              value={priciest ? formatCurrency(priciest.monthlyEquivalent, pageData.currency) : "—"}
              caption={priciest ? priciest.description || priciest.category.label : "—"}
              icon={Crown}
            />
            <StatTile
              label={t("sub.tile.detected")}
              value={String(detected.length)}
              caption={t("sub.tile.detectedCaption")}
              icon={Sparkles}
              tone={detected.length > 0 ? "warning" : "default"}
            />
          </StatGrid>

          <SectionCard
            title={t("sub.list.title")}
            action={t("common.viewAll")}
            actionHref="/recurring"
          >
            <ListRows>
              {summary.items.map((item) => (
                <ListRow
                  key={item.id}
                  href="/recurring"
                  icon={Repeat}
                  title={item.description || item.category.label}
                  subtitle={t("sub.metaLine", {
                    freq: t(`freq.${item.frequency}`),
                    category: item.category.label,
                    date: formatDate(item.nextDate)
                  })}
                  value={t("sub.monthly", {
                    amount: formatCurrency(item.monthlyEquivalent, pageData.currency)
                  })}
                  valueCaption={t("sub.annual", {
                    amount: formatCurrency(item.annualCost, pageData.currency)
                  })}
                />
              ))}
            </ListRows>
          </SectionCard>
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
