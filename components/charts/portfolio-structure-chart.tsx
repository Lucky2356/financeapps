"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartDatum } from "@/types/finance";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";
import { CHART_PALETTE as colors } from "@/lib/charts/palette";
import { useI18n } from "@/lib/i18n/context";

export function PortfolioStructureChart({ data }: { data: ChartDatum[] }) {
  const { t } = useI18n();
  return (
    // The box is the caller's to size: this used to carry a fixed 288/320px of
    // its own, which drew a donut a third taller than the 176px slot it was put
    // in — the ring hung out of the bottom of the card.
    <div className="size-full" role="img" aria-label={t("chart.aria.portfolioStructure")}>
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
              // A slice that carries its own colour keeps it — that is how the
              // kinds of asset stay the same colour wherever they are drawn.
              <Cell key={entry.name} fill={entry.fill ?? colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip {...chartTooltipProps} formatter={(value) => `${Number(value).toFixed(1)}%`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
