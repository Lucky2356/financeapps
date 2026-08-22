"use client";

import { Eye, EyeOff, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CashflowChart, ExpenseCategoryChart, NetWorthChart } from "@/components/charts/lazy";
import { DashboardForecastStrip } from "@/components/dashboard-forecast-strip";
import { DashboardOverview } from "@/components/dashboard-overview";
import { DistributeCashflow } from "@/components/dashboard/distribute-cashflow";
import { EmergencyFundCard } from "@/components/dashboard/emergency-fund-card";
import { NetWorthBreakdownCard } from "@/components/dashboard/net-worth-breakdown";
import { MetricCard } from "@/components/metric-card";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { transfersQuery, useIncludeTransfers } from "@/hooks/use-include-transfers";
import {
  DEFAULT_LAYOUT,
  isHidden,
  moveWidget,
  normalizeLayout,
  toggleWidget,
  type DashboardLayout,
  type DashboardWidget
} from "@/lib/dashboard/layout";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { DashboardData, ForecastData } from "@/types/finance";

const LAYOUT_KEY = "dashboard-layout";

// Client wrapper: re-fetches dashboard + forecast from the active API client
// (LocalApiClient on desktop) so the page shows real data instead of the empty
// snapshot baked into the static export. Widgets render in a user-configurable
// order with show/hide, persisted per device in localStorage.
export function DashboardClient({
  initialData,
  initialForecast
}: {
  initialData: DashboardData;
  initialForecast: ForecastData;
}) {
  const { t } = useI18n();
  // The home screen follows the same choice as the reports: a transfer between
  // own accounts is not income and not spending, so it does not get to be the
  // largest slice of both rings at once. The checkbox itself lives in the
  // analytics section — this screen is a summary, not a place to fiddle.
  const [includeTransfers] = useIncludeTransfers();
  const { data } = useApiPageData(initialData, `/dashboard${transfersQuery(includeTransfers)}`);
  const { data: forecast } = useApiPageData(initialForecast, "/forecast");
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    let saved: DashboardLayout | null = null;
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) saved = normalizeLayout(JSON.parse(raw));
    } catch {
      saved = null;
    }
    if (saved) void Promise.resolve().then(() => setLayout(saved));
  }, []);

  function persist(next: DashboardLayout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }

  const freeCash = data.metrics.find((metric) => metric.key === "freeCash");
  const showDistribute = freeCash?.tone === "success";

  // Each widget's rendered content; null when its own precondition isn't met.
  const widgets = useMemo<Record<DashboardWidget, ReactNode>>(
    () => ({
      overview: <DashboardOverview data={data} />,
      forecast: <DashboardForecastStrip forecast={forecast} />,
      emergencyFund: <EmergencyFundCard fund={data.emergencyFund} currency={data.currency} />,
      netWorth:
        data.netWorthTrend.length >= 2 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("dash.netWorthTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              <NetWorthChart data={data.netWorthTrend} />
              <NetWorthBreakdownCard breakdown={data.netWorthBreakdown} currency={data.currency} />
            </CardContent>
          </Card>
        ) : null,
      metrics: (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.metrics.map((metric) => (
            <MetricCard key={metric.title} metric={metric} />
          ))}
        </section>
      ),
      charts: (
        <section className="space-y-4">
          {/* Two halves of the same month, side by side: what came in and what
              went out. Reading one without the other only tells half a story. */}
          <div className="grid gap-4 xl:grid-cols-2">
            <CategoryBreakdownCard
              title={t("dash.categoryIncome")}
              empty={t("dash.categoryIncome.empty")}
              data={data.categoryIncome}
              currency={data.currency}
            />
            <CategoryBreakdownCard
              title={t("dash.categoryExpenses")}
              empty={t("dash.categoryExpenses.empty")}
              data={data.categoryExpenses}
              currency={data.currency}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("dash.incomeExpenseByMonth")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CashflowChart data={data.monthlyCashflow} />
            </CardContent>
          </Card>
        </section>
      )
    }),
    [data, forecast, t]
  );

  return (
    <>
      {layout.order.map((widget) => {
        if (isHidden(layout, widget)) return null;
        const content = widgets[widget];
        if (!content) return null;
        return <div key={widget}>{content}</div>;
      })}

      {showDistribute && freeCash && !isHidden(layout, "overview") ? (
        <DistributeCashflow freeCashflowLabel={freeCash.value} />
      ) : null}

      {/* Setup hints and layout controls sit after the content: the top of the
          screen belongs to the money, not to a checklist. */}
      <SetupChecklist />

      <div className="flex justify-end">
        <CustomizeDialog layout={layout} onChange={persist} />
      </div>
    </>
  );
}

// A pie plus its legend — the same block for income and for spending, so the
// two read as one comparison rather than two unrelated charts.
function CategoryBreakdownCard({
  title,
  empty,
  data,
  currency
}: {
  title: string;
  empty: string;
  data: DashboardData["categoryExpenses"];
  currency: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card data-testid="breakdown-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <>
            <ExpenseCategoryChart data={data} />
            {/* Every slice drawn gets a line here. The legend used to stop at
                six, so a category could sit in the ring — with its own colour
                and its own share of the money — and be nowhere in the list
                explaining what the colours mean. */}
            <div className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="breakdown-legend">
              {data.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    <span className="num font-medium">{formatCurrency(item.value, currency)}</span>
                    {/* The share is the thing the ring is drawn to show; without
                        it the legend only repeats what the tooltip says. */}
                    <span className="num w-9 text-right text-xs text-muted-foreground">
                      {total > 0 ? `${Math.round((item.value / total) * 100)}%` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CustomizeDialog({
  layout,
  onChange
}: {
  layout: DashboardLayout;
  onChange: (next: DashboardLayout) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="size-4" />
          {t("dash.customize")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dash.customize.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {layout.order.map((widget, index) => {
            const hidden = isHidden(layout, widget);
            return (
              <div
                key={widget}
                className="flex items-center justify-between gap-2 rounded-lg border p-2"
              >
                <span className={hidden ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
                  {t(`dash.widget.${widget}`)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === 0}
                    aria-label={t("dash.moveUp")}
                    onClick={() => onChange(moveWidget(layout, widget, -1))}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === layout.order.length - 1}
                    aria-label={t("dash.moveDown")}
                    onClick={() => onChange(moveWidget(layout, widget, 1))}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={hidden ? t("dash.show") : t("dash.hide")}
                    onClick={() => onChange(toggleWidget(layout, widget))}
                  >
                    {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
