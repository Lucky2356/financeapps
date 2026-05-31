"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { NetWorthPoint } from "@/types/finance";
import { formatCurrency } from "@/lib/format";

function axisCurrency(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${Math.round(value / 1000)} тыс. ₽`;
  }

  return `${value} ₽`;
}

export function NetWorthChart({ data }: { data: NetWorthPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#149365" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#149365" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => axisCurrency(Number(value))} tickLine={false} axisLine={false} width={78} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(label) => `Месяц: ${label}`} />
          <Area
            type="monotone"
            dataKey="value"
            name="Чистый капитал"
            stroke="#149365"
            strokeWidth={2}
            fill="url(#netWorthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
