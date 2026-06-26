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

export type StockPricePoint = { date: string; price: number };

function axisPrice(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}т`;
  if (Math.abs(value) >= 1) return `${Math.round(value)}`;
  return value.toFixed(2);
}

// Historical close-price chart for a single security (real MOEX data).
export function StockPriceChart({ data, up }: { data: StockPricePoint[]; up: boolean }) {
  const stroke = up ? "#149365" : "#dc2626";
  const points = data.map((p) => ({
    label: new Date(p.date).toLocaleDateString("ru", { day: "numeric", month: "short" }),
    price: p.price
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label="График исторических котировок">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis
            tickFormatter={(v) => axisPrice(Number(v))}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={["auto", "auto"]}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(v) => `${Number(v).toLocaleString("ru-RU")} ₽`}
          />
          <Area
            type="monotone"
            dataKey="price"
            name="Цена"
            stroke={stroke}
            strokeWidth={2}
            fill="url(#stockFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
