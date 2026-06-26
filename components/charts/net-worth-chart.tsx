"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { NetWorthPoint } from "@/types/finance";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export function NetWorthChart({ data }: { data: NetWorthPoint[] }) {
  const { t } = useI18n();
  const axisCurrency = (value: number) =>
    Math.abs(value) >= 1000 ? `${Math.round(value / 1000)} ${t("chart.thousand")}` : `${value} ₽`;
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label={t("chart.aria.netWorth")}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#149365" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#149365" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis
            tickFormatter={(value) => axisCurrency(Number(value))}
            tickLine={false}
            axisLine={false}
            width={78}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value) => formatCurrency(Number(value))}
            labelFormatter={(label) => t("chart.month", { label: String(label) })}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={t("chart.series.netWorth")}
            stroke="#149365"
            strokeWidth={2}
            fill="url(#netWorthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
