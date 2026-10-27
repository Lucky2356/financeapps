"use client";

import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint, METRIC_HINT_KEY } from "@/components/info-hint";
import { Progress } from "@/components/ui/progress";
import type { EmergencyFundStatus } from "@/types/finance";
import { formatCurrency, formatDecimal } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export function EmergencyFundCard({
  fund,
  currency
}: {
  fund: EmergencyFundStatus;
  currency: string;
}) {
  const { t } = useI18n();
  const reached = fund.progress >= 100;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          {t("ef.title")}
          <InfoHint text={METRIC_HINT_KEY.emergencyFund} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-bold tracking-tight">
            {formatCurrency(fund.amount, currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("ef.of", { amount: formatCurrency(fund.targetAmount, currency) })}
          </p>
        </div>
        <Progress value={fund.progress} />
        <p className="text-sm text-muted-foreground">
          {reached
            ? t("ef.reached", { months: formatDecimal(fund.months, 1) })
            : t("ef.covers", {
                months: formatDecimal(fund.months, 1),
                target: fund.targetMonths,
                pct: fund.progress
              })}
        </p>
      </CardContent>
    </Card>
  );
}
