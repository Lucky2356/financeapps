"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MonthlyCashflowDatum } from "@/types/finance";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { chartAxisTick, chartGridProps, chartTokens } from "@/lib/charts/palette";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export function CashflowChart({ data }: { data: MonthlyCashflowDatum[] }) {
  const { t } = useI18n();
  const axisCurrency = (value: number) =>
    Math.abs(value) >= 1000 ? `${Math.round(value / 1000)} ${t("chart.thousand")}` : `${value} ₽`;
  return (
    <div className="h-72 w-full sm:h-80" role="img" aria-label={t("chart.aria.cashflow")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={chartAxisTick} />
          <YAxis
            tickFormatter={(value) => axisCurrency(Number(value))}
            tickLine={false}
            axisLine={false}
            tick={chartAxisTick}
            width={78}
          />
          <Tooltip {...chartTooltipProps} formatter={(value) => formatCurrency(Number(value))} />
          <Bar
            dataKey="income"
            name={t("chart.series.income")}
            fill={chartTokens.income}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="expense"
            name={t("chart.series.expense")}
            fill={chartTokens.expense}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
