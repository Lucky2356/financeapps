"use client";

import { AlertTriangle, CheckCircle2, Info, Printer, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
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
import { formatCurrency, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const { t } = useI18n();
  const axisCurrency = (value: number) =>
    Math.abs(value) >= 1000 ? `${Math.round(value / 1000)} ${t("an.thousand")}` : `${value}`;
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
    <div className="space-y-6">
      {/* Print button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="size-4" />
          {t("an.print")}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label={t("an.avgIncome")}
          value={formatCurrency(data.avgMonthlyIncome, data.currency)}
          colorClass="text-green-700 dark:text-green-400"
        />
        <SummaryCard
          label={t("an.avgExpense")}
          value={formatCurrency(data.avgMonthlyExpense, data.currency)}
          colorClass="text-orange-700 dark:text-orange-400"
        />
        <SummaryCard
          label={t("an.avgSavings")}
          value={`${data.avgSavingsRate.toFixed(1)}%`}
          colorClass="text-primary"
        />
        <SummaryCard label={t("an.bestMonth")} value={data.bestMonth} colorClass="text-primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
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
          <div className="h-72 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.monthlyCashflow}
                margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={(v) => axisCurrency(Number(v))}
                  tickLine={false}
                  axisLine={false}
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
                <Bar dataKey="income" name="income" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="expense" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="savings" name="savings" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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

      {/* Category breakdown */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("an.topCategories")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topExpenseCategories.map((cat) => (
                <Link
                  key={cat.category}
                  href={`/transactions?categoryId=${encodeURIComponent(cat.categoryId)}&type=EXPENSE`}
                  className="block rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50"
                  title={t("acc.showTransactions", { name: cat.category })}
                >
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{cat.share.toFixed(1)}%</span>
                      <span className="font-medium">
                        {formatCurrency(cat.total, data.currency)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(cat.share, 100)}%`,
                        backgroundColor: cat.color
                      }}
                    />
                  </div>
                </Link>
              ))}
              {data.topExpenseCategories.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("an.noData6m")}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("an.structure")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topExpenseCategories.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="h-52 w-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.topExpenseCategories}
                        dataKey="share"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={90}
                        strokeWidth={2}
                      >
                        {data.topExpenseCategories.map((entry) => (
                          <Cell key={entry.category} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...chartTooltipProps}
                        formatter={(value) => [`${Number(value).toFixed(1)}%`, t("an.share")]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {data.topExpenseCategories.map((cat) => (
                    <div key={cat.category} className="flex items-center gap-2 text-sm">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate">{cat.category}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        {cat.share.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("an.noData")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <CategoryTrendsSection currency={data.currency} />
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle>{t("an.trends.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("an.trends.desc")}</p>
      </CardHeader>
      <CardContent className="grid gap-2">
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
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  colorClass
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${colorClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
