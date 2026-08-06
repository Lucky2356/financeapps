"use client";

import { AlertTriangle, CalendarClock, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import Link from "next/link";

import { ForecastBalanceChart } from "@/components/charts/lazy";
import { ForecastEventsCard } from "@/components/forecast/forecast-events-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { ForecastData, ForecastWarning } from "@/types/finance";

export function ForecastView({ data }: { data: ForecastData }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      {/* Same head as every other screen: the number the screen is about, then
          the four supporting ones. */}
      <HeroCard
        label={t("fc.forecast30")}
        value={formatCurrency(data.forecast30dBalance, data.currency)}
        caption={t("fc.hero.caption")}
        changePercent={
          data.startingBalance > 0
            ? ((data.forecast30dBalance - data.startingBalance) / data.startingBalance) * 100
            : null
        }
        trend={data.points.map((point) => point.balance)}
      />
      <StatGrid title={t("dash.widget.overview")}>
        <StatTile
          label={t("fc.availableNow")}
          value={formatCurrency(data.startingBalance, data.currency)}
          caption={t("fc.tile.nowCaption")}
          icon={WalletCards}
        />
        <StatTile
          label={t("fc.flow30")}
          value={formatCurrency(data.plannedIncome30d - data.plannedExpense30d, data.currency)}
          caption={t("fc.tile.flowCaption")}
          icon={CalendarClock}
          tone={data.plannedIncome30d >= data.plannedExpense30d ? "success" : "warning"}
        />
        <StatTile
          label={t("fc.forecast90")}
          value={formatCurrency(data.forecast90dBalance, data.currency)}
          caption={t("fc.tile.horizonCaption")}
          icon={data.forecast90dBalance >= data.startingBalance ? TrendingUp : TrendingDown}
          tone={data.forecast90dBalance >= 0 ? "default" : "danger"}
        />
        <StatTile
          label={t("fc.warnings")}
          value={String(data.warnings.length)}
          caption={data.warnings[0]?.title ?? t("dfs.noWarnings")}
          icon={AlertTriangle}
          tone={
            data.warnings.some((warning) => warning.severity === "CRITICAL") ? "danger" : "default"
          }
        />
      </StatGrid>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("fc.balanceForecast")}</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/recurring">
                <CalendarClock className="size-4" />
                {t("page.recurring.title")}
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ForecastBalanceChart data={data.points} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("fc.warnings")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.warnings.map((warning) => (
              <WarningCard key={warning.id} warning={warning} />
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("fc.plannedAmounts")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <FlowBox
              label={t("fc.income30")}
              value={data.plannedIncome30d}
              currency={data.currency}
              tone="success"
            />
            <FlowBox
              label={t("fc.expense30")}
              value={data.plannedExpense30d}
              currency={data.currency}
              tone="danger"
            />
            <FlowBox
              label={t("fc.income90")}
              value={data.plannedIncome90d}
              currency={data.currency}
              tone="success"
            />
            <FlowBox
              label={t("fc.expense90")}
              value={data.plannedExpense90d}
              currency={data.currency}
              tone="danger"
            />
          </CardContent>
        </Card>

        <ForecastEventsCard
          events={data.events.length > 0 ? data.events : data.upcomingEvents}
          currency={data.currency}
        />
      </section>
    </div>
  );
}

function WarningCard({ warning }: { warning: ForecastWarning }) {
  const { t } = useI18n();
  const variant =
    warning.severity === "CRITICAL"
      ? "destructive"
      : warning.severity === "WARNING"
        ? "warning"
        : "info";

  return (
    <article className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
        <Badge variant={variant}>{t(`notifSev.${warning.severity}`)}</Badge>
      </div>
      <h3 className="mt-3 text-sm font-semibold">{warning.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{warning.description}</p>
    </article>
  );
}

function FlowBox({
  label,
  value,
  currency,
  tone
}: {
  label: string;
  value: number;
  currency: string;
  tone: "success" | "danger";
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={
          tone === "success"
            ? "mt-2 text-2xl font-semibold text-success-foreground"
            : "mt-2 text-2xl font-semibold text-destructive"
        }
      >
        {formatCurrency(value, currency)}
      </p>
    </div>
  );
}
