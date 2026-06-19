"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartDatum } from "@/types/finance";
import { chartTooltipProps } from "@/components/charts/chart-tooltip";

const colors = [
  "#149365",
  "#f4b941",
  "#2563eb",
  "#db2777",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#64748b"
];

export function PortfolioStructureChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-72 w-full sm:h-80">
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
