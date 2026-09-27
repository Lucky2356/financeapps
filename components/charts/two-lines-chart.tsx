"use client";

// Две линии на одной оси: «стоимость и вложено» или «ваши бумаги и индекс».
// Первая — залитая область (главное), вторая — пунктир (с чем сравнивать).

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { chartAxisTick, chartGridProps, chartTokens } from "@/lib/charts/palette";
import { useI18n } from "@/lib/i18n/context";

export type TwoLinesPoint = { date: string; a: number | null; b: number | null };

export function TwoLinesChart({
  data,
  nameA,
  nameB,
  format,
  axis,
  ariaLabel
}: {
  data: TwoLinesPoint[];
  nameA: string;
  nameB: string;
  format: (value: number) => string;
  axis: (value: number) => string;
  ariaLabel: string;
}) {
  const { locale } = useI18n();
  const points = data.map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "short"
    })
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="twoLinesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTokens.primary} stopOpacity={0.28} />
              <stop offset="100%" stopColor={chartTokens.primary} stopOpacity={0.02} />
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
            tickFormatter={(value) => axis(Number(value))}
            tickLine={false}
            axisLine={false}
            tick={chartAxisTick}
            width={52}
            domain={["auto", "auto"]}
          />
          <Tooltip {...chartTooltipProps} formatter={(value) => format(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="a"
            name={nameA}
            stroke={chartTokens.primary}
            strokeWidth={2}
            fill="url(#twoLinesFill)"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="b"
            name={nameB}
            stroke={chartTokens.axis}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
