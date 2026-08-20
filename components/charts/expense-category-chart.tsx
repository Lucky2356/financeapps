"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartDatum } from "@/types/finance";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { chartTokens } from "@/lib/charts/palette";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export function ExpenseCategoryChart({ data }: { data: ChartDatum[] }) {
  const { t } = useI18n();
  // The hole in the middle of a ring is where the eye goes first, and it was
  // empty: the sum the slices add up to had to be looked for elsewhere on the
  // card. It belongs here.
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      className="relative h-72 w-full sm:h-80"
      role="img"
      aria-label={t("chart.aria.expenseCategory")}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="48%"
            outerRadius="78%"
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill ?? chartTokens.primary} />
            ))}
          </Pie>
          <Tooltip {...chartTooltipProps} formatter={(value) => formatCurrency(Number(value))} />
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t("chart.total")}
        </span>
        <span className="num text-lg font-semibold">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
