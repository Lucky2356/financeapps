"use client";

import { AlertTriangle, CheckCircle2, Info, Printer, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
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

import type { AnalyticsData } from "@/lib/data";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function axisCurrency(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${Math.round(value / 1000)} тыс.`;
  }
  return `${value}`;
}

export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const TrendIcon =
    data.savingsRateTrend === "up"
      ? TrendingUp
      : data.savingsRateTrend === "down"
        ? TrendingDown
        : Info;
  const trendLabel =
    data.savingsRateTrend === "up"
      ? "Растет"
      : data.savingsRateTrend === "down"
        ? "Снижается"
        : "Стабильно";

  return (
    <div className="space-y-6">
      {/* Print button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="size-4" />
          Печать / PDF
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Ср. доходы/мес."
          value={formatCurrency(data.avgMonthlyIncome, data.currency)}
          colorClass="text-green-700 dark:text-green-400"
        />
        <SummaryCard
          label="Ср. расходы/мес."
          value={formatCurrency(data.avgMonthlyExpense, data.currency)}
          colorClass="text-orange-700 dark:text-orange-400"
        />
        <SummaryCard
          label="Ср. норма сбережений"
          value={`${data.avgSavingsRate.toFixed(1)}%`}
          colorClass="text-blue-700 dark:text-blue-400"
        />
        <SummaryCard
          label="Лучший месяц"
          value={data.bestMonth}
          colorClass="text-purple-700 dark:text-purple-400"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Тренд месяца</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <TrendIcon className="size-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Норма сбережений</p>
                <p className="text-xl font-semibold">{trendLabel}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Изменение расходов к прошлому месяцу</p>
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
            <CardTitle>Инсайты</CardTitle>
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
          <CardTitle>Денежные потоки за 6 месяцев</CardTitle>
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
                      income: "Доходы",
                      expense: "Расходы",
                      savings: "Сбережения"
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
            <CardTitle>Топ категорий расходов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topExpenseCategories.map((cat) => (
                <Link
                  key={cat.category}
                  href={`/transactions?categoryId=${encodeURIComponent(cat.categoryId)}&type=EXPENSE`}
                  className="block rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50"
                  title={`Показать операции: ${cat.category}`}
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
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Нет данных за последние 6 месяцев
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Структура расходов</CardTitle>
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
                        formatter={(value) => [`${Number(value).toFixed(1)}%`, "Доля"]}
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
              <p className="py-8 text-center text-sm text-muted-foreground">Нет данных</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
