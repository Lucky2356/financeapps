"use client";

import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { AnalyticsData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CashflowChart, ExpenseCategoryChart } from "@/components/charts/lazy";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "transactions-analytics-open";

// The numbers people look up while going through their operations — average
// income and spend, savings rate, where the money went — without a round trip
// to the dashboard. Collapsed by default so the operations list stays the
// point of the screen; the choice is remembered per device.
export function TransactionsAnalytics() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === "true") setOpen(true);
    } catch {
      /* storage unavailable — start collapsed */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiClient.get<AnalyticsData>("/analytics"));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Fetch only when the panel is actually opened — a collapsed block should
    // cost nothing on a phone.
    if (next && !data && !loading) void load();
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable — the panel just forgets between visits */
    }
  }

  const currency = data?.currency ?? "RUB";
  const metrics = data
    ? [
        { label: t("txa.avgIncome"), value: formatCurrency(data.avgMonthlyIncome, currency) },
        { label: t("txa.avgExpense"), value: formatCurrency(data.avgMonthlyExpense, currency) },
        { label: t("txa.savingsRate"), value: `${data.avgSavingsRate.toFixed(1)}%` },
        { label: t("txa.bestMonth"), value: data.bestMonth }
      ]
    : [];

  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BarChart3 className="size-4 shrink-0 text-primary" />
          <span className="truncate font-semibold">{t("txa.title")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{open ? t("txa.hide") : t("txa.show")}</span>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>

      {open ? (
        <CardContent className={cn("space-y-5 border-t pt-5")}>
          {loading && !data ? (
            <p className="text-sm text-muted-foreground">{t("txa.loading")}</p>
          ) : !data ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("txa.error")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                {t("txa.retry")}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="num mt-1 text-lg font-semibold">{metric.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium">{t("txa.cashflow")}</p>
                  <CashflowChart data={data.monthlyCashflow} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("txa.byCategory")}</p>
                  <ExpenseCategoryChart
                    data={data.topExpenseCategories.map((item) => ({
                      name: item.category,
                      value: item.total,
                      fill: item.color
                    }))}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
