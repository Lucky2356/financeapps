"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/lib/format";
import type { ForecastPoint } from "@/types/finance";

function axisCurrency(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)} тыс. ₽`;
  return `${value} ₽`;
}

export function ForecastBalanceChart({ data }: { data: ForecastPoint[] }) {
  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="forecastBalance" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#149365" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#149365" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => axisCurrency(Number(value))} tickLine={false} axisLine={false} width={78} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="balance" name="Прогноз остатка" stroke="#149365" strokeWidth={2} fill="url(#forecastBalance)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
