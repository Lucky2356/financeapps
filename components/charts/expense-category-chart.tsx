"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartDatum } from "@/types/finance";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export function ExpenseCategoryChart({ data }: { data: ChartDatum[] }) {
  const { t } = useI18n();
  return (
    <div className="h-72 w-full sm:h-80" role="img" aria-label={t("chart.aria.expenseCategory")}>
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
              <Cell key={entry.name} fill={entry.fill ?? "#149365"} />
            ))}
          </Pie>
          <Tooltip {...chartTooltipProps} formatter={(value) => formatCurrency(Number(value))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
