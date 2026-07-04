"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { projectScenario } from "@/services/ScenarioPlanningService";
import type { AnalyticsData } from "@/lib/data";
import type { ForecastData } from "@/types/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

// "What-if" planner: projects the liquid balance forward for a baseline vs a
// scenario with an extra monthly saving and/or a one-time expense. Baseline
// income/expense come from the analytics averages; the starting balance from
// the forecast. Pure math lives in ScenarioPlanningService.
export function ScenarioPanel() {
  const { t } = useI18n();
  const [base, setBase] = useState<{
    startingBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
    currency: string;
  } | null>(null);

  const [extraSavings, setExtraSavings] = useState(0);
  const [oneTimeExpense, setOneTimeExpense] = useState(0);
  const [oneTimeMonth, setOneTimeMonth] = useState(3);
  const [months, setMonths] = useState(12);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [forecast, analytics] = await Promise.all([
        apiClient.get<ForecastData>("/forecast").catch(() => null),
        apiClient.get<AnalyticsData>("/analytics").catch(() => null)
      ]);
      if (cancelled || !forecast) return;
      setBase({
        startingBalance: forecast.startingBalance,
        monthlyIncome: analytics?.avgMonthlyIncome ?? forecast.plannedIncome30d,
        monthlyExpense: analytics?.avgMonthlyExpense ?? forecast.plannedExpense30d,
        currency: forecast.currency
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => {
    if (!base) return null;
    return projectScenario({
      startingBalance: base.startingBalance,
      monthlyIncome: base.monthlyIncome,
      monthlyExpense: base.monthlyExpense,
      extraSavingsPerMonth: extraSavings,
      oneTimeExpense,
      oneTimeMonth,
      months
    });
  }, [base, extraSavings, oneTimeExpense, oneTimeMonth, months]);

  if (!base) return null;
  const c = base.currency;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {t("scenario.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="sc-extra">{t("scenario.extraSavings")}</Label>
            <Input
              id="sc-extra"
              type="number"
              value={extraSavings}
              onChange={(e) => setExtraSavings(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sc-onetime">{t("scenario.oneTime")}</Label>
            <Input
              id="sc-onetime"
              type="number"
              min={0}
              value={oneTimeExpense}
              onChange={(e) => setOneTimeExpense(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sc-month">{t("scenario.oneTimeMonth")}</Label>
            <Input
              id="sc-month"
              type="number"
              min={1}
              max={months}
              value={oneTimeMonth}
              onChange={(e) => setOneTimeMonth(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("scenario.horizon")}</Label>
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">{t("scenario.months", { n: 6 })}</SelectItem>
                <SelectItem value="12">{t("scenario.months", { n: 12 })}</SelectItem>
                <SelectItem value="24">{t("scenario.months", { n: 24 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {result && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("scenario.baselineEnding")}
              value={formatCurrency(result.baselineEnding, c)}
            />
            <Stat
              label={t("scenario.scenarioEnding")}
              value={formatCurrency(result.scenarioEnding, c)}
              accent
            />
            <Stat
              label={t("scenario.difference")}
              value={`${result.difference >= 0 ? "+" : ""}${formatCurrency(result.difference, c)}`}
              positive={result.difference >= 0}
            />
          </div>
        )}

        {result?.scenarioShortfallMonth != null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {t("scenario.shortfall", { n: result.scenarioShortfallMonth })}
          </p>
        )}

        <p className="text-xs text-muted-foreground">{t("scenario.footer")}</p>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
  positive
}: {
  label: string;
  value: string;
  accent?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          positive === undefined
            ? accent
              ? "text-lg font-semibold text-primary"
              : "text-lg font-semibold"
            : positive
              ? "text-lg font-semibold text-success"
              : "text-lg font-semibold text-destructive"
        }
      >
        {value}
      </p>
    </div>
  );
}
