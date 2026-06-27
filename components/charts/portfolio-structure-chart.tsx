"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartDatum } from "@/types/finance";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { CHART_PALETTE as colors } from "@/lib/charts/palette";
import { useI18n } from "@/lib/i18n/context";

export function PortfolioStructureChart({ data }: { data: ChartDatum[] }) {
  const { t } = useI18n();
  return (
    <div className="h-72 w-full sm:h-80" role="img" aria-label={t("chart.aria.portfolioStructure")}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="78%"
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip {...chartTooltipProps} formatter={(value) => `${Number(value).toFixed(1)}%`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
