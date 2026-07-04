"use client";

import { Receipt } from "lucide-react";

import { computeInvestmentTaxEstimate } from "@/services/InvestmentTaxService";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { InvestmentData } from "@/types/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// "If you sold now" tax estimate for the portfolio's unrealized gains. Renders
// only when there is a positive gain to tax. Clearly labelled as an estimate.
export function TaxEstimateCard({
  positions,
  currency
}: {
  positions: InvestmentData["portfolio"];
  currency: string;
}) {
  const { t } = useI18n();
  const est = computeInvestmentTaxEstimate(positions, currency);
  if (!est.hasGains) return null;

  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: t("inv.tax.gain"), value: formatCurrency(est.totalGain, currency) },
    { label: t("inv.tax.loss"), value: formatCurrency(est.totalLoss, currency) },
    { label: t("inv.tax.base"), value: formatCurrency(est.taxableBase, currency) },
    {
      label: t("inv.tax.estimated"),
      value: `${formatCurrency(est.estimatedTax, currency)} (${Math.round(est.effectiveRate * 100)}%)`,
      strong: true
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="size-4" />
          {t("inv.tax.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className={row.strong ? "font-semibold" : "tabular-nums"}>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
          {t("inv.tax.disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
}
