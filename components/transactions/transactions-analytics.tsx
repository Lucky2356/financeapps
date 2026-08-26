"use client";

import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import type { AnalyticsData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CashflowChart, ExpenseCategoryChart } from "@/components/charts/lazy";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "transactions-analytics-open";

// The ranked lists carry a share and an id the pie does not need; this is the
// shape the chart draws.
//
// Every category is drawn, because the number in the middle of the ring says
// «всего»: showing the six biggest made it 102 079 ₽ under a month that had
// spent 111 234 ₽. Past the eighth the slices are thinner than the line around
// them, so the tail is gathered into one — the total stays whole either way.
const RINGED = 8;

function toSlices(items: AnalyticsData["topExpenseCategories"], otherLabel: string) {
  const slices = items
    .slice(0, RINGED)
    .map((item) => ({ name: item.category, value: item.total, fill: item.color }));
  const rest = items.slice(RINGED).reduce((sum, item) => sum + item.total, 0);
  if (rest > 0) {
    slices.push({
      name: otherLabel,
      value: Math.round(rest * 100) / 100,
      fill: "hsl(var(--muted-foreground))"
    });
  }
  return slices;
}

// The numbers people look up while going through their operations — average
// income and spend, savings rate, where the money went — without a round trip
// to the dashboard. Collapsed by default so the operations list stays the
// point of the screen; the choice is remembered per device.
export function TransactionsAnalytics() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  // "idle" is not "failed". The panel used to have only data-or-nothing, so a
  // panel that had never loaded looked exactly like one whose calculation had
  // broken — and it said so, which was simply untrue.
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === "true") setOpen(true);
    } catch {
      /* storage unavailable — start collapsed */
    }
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await apiClient.get<AnalyticsData>("/analytics"));
      setState("ready");
    } catch {
      setData(null);
      setState("error");
    }
  }, []);

  // Load whenever the panel is open and has nothing to show — on the first
  // click, and again after coming back to this screen with the panel remembered
  // as open. Previously only the click loaded, so returning to the screen left
  // the panel open, empty, and blaming a failure that never happened.
  useEffect(() => {
    // Deferred a microtask so the first state change lands after the render
    // that scheduled it, matching how the rest of the app kicks off loads.
    if (open && state === "idle") void Promise.resolve().then(load);
  }, [open, state, load]);

  // Recompute when anything writes: this panel is a summary of the very list
  // being edited above it.
  useEffect(
    () => onDataChanged(() => setState((current) => (current === "loading" ? current : "idle"))),
    []
  );

  function toggle() {
    const next = !open;
    setOpen(next);
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
        {
          label: t("txa.avgExpense"),
          value: formatCurrency(data.avgMonthlyExpense, currency),
          testId: "txa-expense"
        },
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
        <CardContent className={cn("space-y-4 border-t pt-5")}>
          {!data && state !== "error" ? (
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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    data-testid={"testId" in metric ? metric.testId : undefined}
                    className="rounded-lg border bg-muted/20 p-3"
                  >
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="num mt-1 text-lg font-semibold">{metric.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium">{t("txa.cashflow")}</p>
                  <CashflowChart data={data.monthlyCashflow} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("txa.byCategory")}</p>
                  <ExpenseCategoryChart
                    data={toSlices(data.topExpenseCategories, t("section.other"))}
                  />
                </div>
                {data.topIncomeCategories.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-medium">{t("txa.incomeByCategory")}</p>
                    <ExpenseCategoryChart
                      data={toSlices(data.topIncomeCategories, t("section.other"))}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
