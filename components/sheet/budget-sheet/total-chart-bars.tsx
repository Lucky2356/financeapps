"use client";

// Сам график итогов — отдельным файлом: Recharts тяжёлый и грузится, только
// когда график раскрыт (см. sheet-total-chart).

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { monthLabel, monthShort } from "@/components/sheet/sheet-text";
import { axisMoney } from "@/lib/charts/format";
import { chartAxisTick, chartGridProps, chartTokens } from "@/lib/charts/palette";
import type { Locale } from "@/lib/i18n/catalog";
import type { TotalPoint } from "@/lib/sheet/insights";

// Цвет в таблице — только смысловой: обычный месяц серый, нынешний темнее,
// нехватка — цветом нехватки, как минус в клетке Итога.
const BAR = "hsl(var(--foreground) / 0.28)";
const BAR_NOW = "hsl(var(--foreground) / 0.62)";
const TICK = { ...chartAxisTick, fontSize: 11 };

export function TotalChartBars({
  points,
  locale,
  money,
  label,
  onPick
}: {
  points: TotalPoint[];
  locale: string;
  money: (value: number) => string;
  /** Подпись значения в подсказке — «Итог». */
  label: string;
  onPick: (month: string) => void;
}) {
  const data = points.map((point) => ({ ...point, short: monthShort(point.month, locale) }));
  const axisLocale: Locale = locale === "en" ? "en" : "ru";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid {...chartGridProps} />
        <XAxis
          dataKey="short"
          tickLine={false}
          axisLine={false}
          tick={TICK}
          interval="preserveStartEnd"
          minTickGap={6}
        />
        <YAxis
          tickFormatter={(value) => axisMoney(Number(value), axisLocale)}
          tickLine={false}
          axisLine={false}
          tick={TICK}
          width={72}
        />
        <ReferenceLine y={0} stroke={chartTokens.axis} strokeOpacity={0.6} />
        <Tooltip
          {...chartTooltipProps}
          separator=": "
          labelFormatter={(_, payload) => {
            const month = (payload?.[0]?.payload as TotalPoint | undefined)?.month;
            return month ? monthLabel(month, locale, "long") : "";
          }}
          formatter={(value) => [money(Number(value)), label]}
        />
        <Bar
          dataKey="total"
          name={label}
          isAnimationActive={false}
          cursor="pointer"
          onClick={(entry) => {
            const month = (entry as { payload?: TotalPoint }).payload?.month;
            if (month) onPick(month);
          }}
        >
          {data.map((point) => (
            <Cell
              key={point.month}
              data-month={point.month}
              data-negative={point.negative ? "true" : "false"}
              fill={point.negative ? chartTokens.danger : point.now ? BAR_NOW : BAR}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
