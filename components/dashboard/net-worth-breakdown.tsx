"use client";

import { Banknote, Landmark, LineChart, PiggyBank } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { NetWorthBreakdown } from "@/types/finance";

// Compact breakdown of net worth into its parts (assets minus debts). Helps the
// user see what their capital is actually made of, not just the headline number.
export function NetWorthBreakdownCard({
  breakdown,
  currency
}: {
  breakdown: NetWorthBreakdown;
  currency: string;
}) {
  const { t } = useI18n();
  const items = [
    {
      key: "liquid",
      label: t("nav.accounts"),
      value: breakdown.liquid,
      icon: Banknote,
      negative: false
    },
    {
      key: "portfolio",
      label: t("nav.investments"),
      value: breakdown.portfolio,
      icon: LineChart,
      negative: false
    },
    {
      key: "goals",
      label: t("nav.goals"),
      value: breakdown.goals,
      icon: PiggyBank,
      negative: false
    },
    { key: "debts", label: t("nav.debts"), value: breakdown.debts, icon: Landmark, negative: true }
  ].filter((item) => item.value !== 0);

  if (items.length === 0) return null;

  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.key} className="rounded-lg border bg-muted/20 p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <item.icon className="size-3.5" />
            {item.label}
          </dt>
          <dd
            className={
              item.negative
                ? "mt-1 text-sm font-semibold text-destructive"
                : "mt-1 text-sm font-semibold"
            }
          >
            {item.negative ? "−" : ""}
            {formatCurrency(item.value, currency)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
