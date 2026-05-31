"use client";

import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { EmergencyFundStatus } from "@/types/finance";
import { formatCurrency } from "@/lib/format";

export function EmergencyFundCard({ fund, currency }: { fund: EmergencyFundStatus; currency: string }) {
  const reached = fund.progress >= 100;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          Финансовая подушка
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-bold tracking-tight">{formatCurrency(fund.amount, currency)}</p>
          <p className="text-sm text-muted-foreground">
            из {formatCurrency(fund.targetAmount, currency)}
          </p>
        </div>
        <Progress value={fund.progress} />
        <p className="text-sm text-muted-foreground">
          {reached
            ? `Цель достигнута: резерв покрывает ${fund.months.toFixed(1)} мес. расходов.`
            : `Покрывает ${fund.months.toFixed(1)} из ${fund.targetMonths} мес. расходов (${fund.progress}%).`}
        </p>
      </CardContent>
    </Card>
  );
}
