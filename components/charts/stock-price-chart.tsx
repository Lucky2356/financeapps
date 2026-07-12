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

import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { chartAxisTick, chartGridProps, chartTokens } from "@/lib/charts/palette";
import { useI18n } from "@/lib/i18n/context";

export type StockPricePoint = { date: string; price: number };

// Historical close-price chart for a single security (real MOEX data).
export function StockPriceChart({ data, up }: { data: StockPricePoint[]; up: boolean }) {
  const { t, locale } = useI18n();
  const stroke = up ? chartTokens.income : chartTokens.danger;
  const axisPrice = (value: number) => {
    if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}${t("chart.thousandShort")}`;
    if (Math.abs(value) >= 1) return `${Math.round(value)}`;
    return value.toFixed(2);
  };
  const points = data.map((p) => ({
    label: new Date(p.date).toLocaleDateString(locale === "en" ? "en-US" : "ru", {
      day: "numeric",
      month: "short"
    }),
    price: p.price
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label={t("chart.aria.stockPrice")}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tick={chartAxisTick}
          />
          <YAxis
            tickFormatter={(v) => axisPrice(Number(v))}
            tickLine={false}
            axisLine={false}
            tick={chartAxisTick}
            width={48}
            domain={["auto", "auto"]}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(v) => `${Number(v).toLocaleString(locale === "en" ? "en-US" : "ru-RU")} ₽`}
          />
          <Area
            type="monotone"
            dataKey="price"
            name={t("chart.series.price")}
            stroke={stroke}
            strokeWidth={2}
            fill="url(#stockFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
