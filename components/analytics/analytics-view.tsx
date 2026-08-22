"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Info,
  PiggyBank,
  Printer,
  TrendingDown,
  TrendingUp,
  Trophy
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { addMonths } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { apiClient } from "@/lib/api/client";
import type { AnalyticsData, TransactionsPageData } from "@/lib/data";
import { buildCategoryTrends, type CategoryTrend } from "@/lib/analytics/category-trends";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { chartAxisTick, chartGridProps, chartTokens } from "@/lib/charts/palette";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { axisMoney } from "@/lib/charts/format";
import { useI18n } from "@/lib/i18n/context";
import { PrintHeader } from "@/components/reports/print-header";
import { Button } from "@/components/ui/button";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/ui/collapsible-card";

export function AnalyticsView({
  data,
  transfers
}: {
  data: AnalyticsData;
  /** The "count transfers" checkbox — shown on the same line as the print button. */
  transfers?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const TrendIcon =
    data.savingsRateTrend === "up"
      ? TrendingUp
      : data.savingsRateTrend === "down"
        ? TrendingDown
        : Info;
  const trendLabel =
    data.savingsRateTrend === "up"
      ? t("an.trend.up")
      : data.savingsRateTrend === "down"
        ? t("an.trend.down")
        : t("an.trend.stable");

  return (
    <div className="space-y-4">
      <PrintHeader titleKey="page.analytics.title" />

      {/* The same tiles as every other screen — this card had its own look for
          no reason other than being written earlier. The two controls ride on
          the heading line instead of a strip of their own above it. */}
      <StatGrid
        title={t("dash.widget.overview")}
        actions={
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {transfers}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              {t("an.print")}
            </Button>
          </div>
        }
      >
        <StatTile
          label={t("an.avgIncome")}
          value={formatCurrency(data.avgMonthlyIncome, data.currency)}
          icon={ArrowDownLeft}
          tone="success"
        />
        <StatTile
          label={t("an.avgExpense")}
          value={formatCurrency(data.avgMonthlyExpense, data.currency)}
          icon={ArrowUpRight}
          tone="warning"
        />
        <StatTile
          label={t("an.avgSavings")}
          value={`${data.avgSavingsRate.toFixed(1)}%`}
          icon={PiggyBank}
          tone={data.avgSavingsRate >= 0 ? "success" : "danger"}
        />
        <StatTile label={t("an.bestMonth")} value={data.bestMonth} icon={Trophy} />
      </StatGrid>

      <div className="grid items-start gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("an.monthTrend")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <TrendIcon className="size-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">{t("an.savingsRate")}</p>
                <p className="text-xl font-semibold">{trendLabel}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">{t("an.expenseChange")}</p>
              <p
                className={
                  data.expenseChangePct > 0
                    ? "mt-1 text-2xl font-semibold text-orange-700 dark:text-orange-400"
                    : "mt-1 text-2xl font-semibold text-green-700 dark:text-green-400"
                }
              >
                {data.expenseChangePct > 0 ? "+" : ""}
                {data.expenseChangePct.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("an.insights")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.insights.map((insight) => {
              const Icon =
                insight.severity === "SUCCESS"
                  ? CheckCircle2
                  : insight.severity === "WARNING" || insight.severity === "CRITICAL"
                    ? AlertTriangle
                    : Info;
              return (
                <div key={insight.id} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">{insight.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Cashflow chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("an.cashflow6m")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-60 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.monthlyCashflow}
                margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={chartAxisTick} />
                <YAxis
                  tickFormatter={(v) => axisMoney(Number(v), locale)}
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                  width={72}
                />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      income: t("an.income"),
                      expense: t("an.expense"),
                      savings: t("an.savings")
                    };
                    return [
                      formatCurrency(Number(value), data.currency),
                      labels[String(name)] ?? String(name)
                    ];
                  }}
                />
                {/* The same three meanings carry the same three colours as on
                    the home screen. Hard-coded green/orange/blue here meant
                    income was one colour in one place and another elsewhere. */}
                <Bar
                  dataKey="income"
                  name="income"
                  fill={chartTokens.income}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expense"
                  name="expense"
                  fill={chartTokens.expense}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="savings"
                  name="savings"
                  fill={chartTokens.primary}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Three bars a month need saying which is which without hovering. */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            {(
              [
                ["an.income", chartTokens.income],
                ["an.expense", chartTokens.expense],
                ["an.savings", chartTokens.primary]
              ] as const
            ).map(([key, color]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                {t(key)}
              </span>
            ))}
          </div>

          {/* Savings rate legend row */}
          <div className="mt-4 flex flex-wrap gap-4">
            {data.monthlyCashflow.map((m) => (
              <div key={m.month} className="text-center">
                <div className="text-xs text-muted-foreground">{m.month}</div>
                <div className="text-sm font-medium">{m.savingsRate.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Spending by category, once. The screen used to carry a ranked list and
          a pie of exactly the same numbers side by side; the ranking now lives
          in the pie's own legend, where it says the same thing in one card. */}
      <StructureCard
        title={t("an.structure")}
        slices={data.topExpenseCategories}
        shareLabel={t("an.share")}
        otherLabel={t("section.other")}
        empty={t("an.noData6m")}
        currency={data.currency}
        linkType="EXPENSE"
      />

      {/* The same for money coming in. Spending alone says how it was used;
          this says what there was to use. */}
      <StructureCard
        title={t("an.structureIncome")}
        slices={data.topIncomeCategories}
        shareLabel={t("an.share")}
        otherLabel={t("section.other")}
        empty={t("an.noIncome6m")}
        currency={data.currency}
        linkType="INCOME"
      />

      <CategoryTrendsSection currency={data.currency} />
    </div>
  );
}

// One pie plus its legend. Used twice — for spending and for income — so the
// two structures are read the same way and cannot drift apart visually.
function StructureCard({
  title,
  slices,
  shareLabel,
  otherLabel,
  empty,
  currency,
  linkType
}: {
  title: string;
  slices: AnalyticsData["topExpenseCategories"];
  shareLabel: string;
  otherLabel: string;
  empty: string;
  currency: string;
  /** Rows open the ledger filtered to this category and this side of it. */
  linkType: "INCOME" | "EXPENSE";
}) {
  // The ranking keeps the six biggest categories, so the ring was drawn from a
  // part of the period while its percentages counted the whole of it — the
  // slices looked bigger than they were and the rest of the money was nowhere.
  // Everything outside the top six comes back as one quiet slice, which keeps
  // the ring whole and the legend a complete key to it.
  const listedShare = slices.reduce((sum, item) => sum + item.share, 0);
  const restShare = Math.round((100 - listedShare) * 10) / 10;
  const shown =
    restShare >= 0.5
      ? [
          ...slices,
          {
            categoryId: "__rest__",
            category: otherLabel,
            color: "hsl(var(--muted-foreground))",
            total: 0,
            share: restShare
          }
        ]
      : slices;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {shown.length > 0 ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="mx-auto size-40 shrink-0 sm:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={shown}
                    dataKey="share"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius="52%"
                    outerRadius="88%"
                    strokeWidth={2}
                  >
                    {shown.map((entry) => (
                      <Cell key={entry.category} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, shareLabel]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {shown.map((cat) => {
                const row = (
                  <>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate">{cat.category}</span>
                      <span className="num ml-auto shrink-0 text-muted-foreground">
                        {cat.share.toFixed(0)}%
                      </span>
                      {cat.total > 0 ? (
                        <span className="num shrink-0 whitespace-nowrap font-medium">
                          {formatCurrency(cat.total, currency)}
                        </span>
                      ) : null}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(cat.share, 100)}%`,
                          backgroundColor: cat.color
                        }}
                      />
                    </div>
                  </>
                );
                return cat.categoryId === "__rest__" ? (
                  <div key={cat.category}>{row}</div>
                ) : (
                  <Link
                    key={cat.category}
                    href={`/transactions?categoryId=${encodeURIComponent(cat.categoryId)}&type=${linkType}`}
                    className="block rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50"
                  >
                    {row}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Inline sparkline of monthly totals (no chart lib needed for a tiny mark).
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 88;
  const height = 26;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CategoryTrendsSection({ currency }: { currency: string }) {
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<TransactionsPageData["transactions"]>([]);

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
        /* offline / unavailable — section stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trends = useMemo(() => buildCategoryTrends(transactions).slice(0, 8), [transactions]);

  if (trends.length === 0) return null;

  return (
    // Eight categories with a sparkline each is a screenful on its own, and it
    // is the last thing on the page — folded until it is asked for.
    <CollapsibleCard title={t("an.trends.title")} storageKey="an-trends">
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">{t("an.trends.desc")}</p>
        {trends.map((trend: CategoryTrend) => (
          <div
            key={trend.categoryId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: trend.color }}
              />
              <span className="truncate font-medium">{trend.category}</span>
            </div>
            <div className="flex items-center gap-4">
              <Sparkline values={trend.monthly.map((m) => m.total)} color={trend.color} />
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(trend.currentTotal, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {t("an.trends.avg", { amount: formatCurrency(trend.averageTotal, currency) })}
                </p>
              </div>
              {trend.anomaly === "high" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                  <TrendingUp className="size-3" />
                  {t("an.trends.more", { pct: Math.abs(trend.changePct).toFixed(0) })}
                </span>
              ) : trend.anomaly === "low" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                  <TrendingDown className="size-3" />
                  {t("an.trends.less", { pct: Math.abs(trend.changePct).toFixed(0) })}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}
