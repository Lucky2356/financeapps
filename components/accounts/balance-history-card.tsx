"use client";

// «История остатка»: сколько лежало в конце каждого месяца — на всех счетах
// вместе, в подушке или на одном счёте (lib/accounts/balance-history.ts).

import { LineChart as LineChartIcon } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { BalanceHistory } from "@/lib/accounts/balance-history";
import { chartAxisTick, chartGridProps, chartTokens } from "@/lib/charts/palette";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

type HistoryPage = BalanceHistory & { currency: string; total: number[]; cushion: number[] };

const EMPTY: HistoryPage = {
  currency: "RUB",
  months: [],
  accounts: [],
  goals: [],
  total: [],
  cushion: []
};

export function BalanceHistoryCard() {
  const { t, locale } = useI18n();
  const [months, setMonths] = useState("12");
  const [pick, setPick] = useState("total");
  const { data } = useApiPageData<HistoryPage>(EMPTY, `/balance-history?months=${months}`);
  if (data.months.length === 0) return null;

  const account = data.accounts.find((item) => item.id === pick);
  const currency = account?.currency ?? data.currency;
  const values = account ? account.values : pick === "cushion" ? data.cushion : data.total;
  const points = data.months.map((month, index) => ({
    label: new Date(`${month}-01T12:00:00`).toLocaleDateString(
      locale === "en" ? "en-GB" : "ru-RU",
      { month: "short", year: "2-digit" }
    ),
    value: values[index] ?? 0
  }));
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const change = last - first;

  return (
    <Card data-testid="balance-history">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle className="flex min-w-0 flex-1 items-center gap-2 text-base">
          <LineChartIcon className="size-4 shrink-0" />
          {t("bh.title")}
        </CardTitle>
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="w-44" aria-label={t("bh.what")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total">{t("bh.total")}</SelectItem>
            <SelectItem value="cushion">{t("bh.cushion")}</SelectItem>
            {data.accounts.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="w-32" aria-label={t("bh.period")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["6", "12", "24"].map((value) => (
              <SelectItem key={value} value={value}>
                {t("bh.months", { count: value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">
          <span className="text-lg font-semibold tabular-nums">
            {formatCurrency(last, currency)}
          </span>{" "}
          <span className={change >= 0 ? "text-success" : "text-destructive"}>
            {change >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(change), currency)}
          </span>{" "}
          <span className="text-muted-foreground">{t("bh.since", { count: months })}</span>
        </p>
        <div className="h-56 w-full" role="img" aria-label={t("bh.title")}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceHistoryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartTokens.primary} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chartTokens.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...chartGridProps} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={chartAxisTick}
              />
              <YAxis
                tickFormatter={(value) => formatCompactCurrency(Number(value), currency)}
                tickLine={false}
                axisLine={false}
                tick={chartAxisTick}
                width={52}
                domain={["auto", "auto"]}
              />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value) => formatCurrency(Number(value), currency)}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={t("bh.balance")}
                stroke={chartTokens.primary}
                strokeWidth={2}
                fill="url(#balanceHistoryFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
