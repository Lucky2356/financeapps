"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatCurrency } from "@/lib/format";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { chartAxisTick, chartGridProps, chartTokens } from "@/lib/charts/palette";
import { useI18n } from "@/lib/i18n/context";
import type { ForecastPoint } from "@/types/finance";

export function ForecastBalanceChart({ data }: { data: ForecastPoint[] }) {
  const { t } = useI18n();
  const axisCurrency = (value: number) =>
    Math.abs(value) >= 1000 ? `${Math.round(value / 1000)} ${t("chart.thousand")}` : `${value} ₽`;
  return (
    <div className="h-72 w-full sm:h-80" role="img" aria-label={t("chart.aria.forecast")}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="forecastBalance" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={chartTokens.primary} stopOpacity={0.35} />
              <stop offset="95%" stopColor={chartTokens.primary} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={chartAxisTick} />
          <YAxis
            tickFormatter={(value) => axisCurrency(Number(value))}
            tickLine={false}
            axisLine={false}
            tick={chartAxisTick}
            width={78}
          />
          <Tooltip {...chartTooltipProps} formatter={(value) => formatCurrency(Number(value))} />
          <ReferenceLine y={0} stroke={chartTokens.danger} strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="balance"
            name={t("chart.series.forecast")}
            stroke={chartTokens.primary}
            strokeWidth={2}
            fill="url(#forecastBalance)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
