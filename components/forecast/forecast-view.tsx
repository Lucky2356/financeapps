import { AlertTriangle, CalendarClock, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import Link from "next/link";

import { ForecastBalanceChart } from "@/components/charts/forecast-balance-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ForecastData, ForecastWarning } from "@/types/finance";

export function ForecastView({ data }: { data: ForecastData }) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Доступно сейчас" value={formatCurrency(data.startingBalance, data.currency)} icon={WalletCards} />
        <Metric
          label="Прогноз через 30 дней"
          value={formatCurrency(data.forecast30dBalance, data.currency)}
          icon={data.forecast30dBalance >= data.startingBalance ? TrendingUp : TrendingDown}
          tone={data.forecast30dBalance >= 0 ? "default" : "danger"}
        />
        <Metric
          label="Поток за 30 дней"
          value={formatCurrency(data.plannedIncome30d - data.plannedExpense30d, data.currency)}
          icon={CalendarClock}
          tone={data.plannedIncome30d >= data.plannedExpense30d ? "success" : "warning"}
        />
        <Metric
          label="Прогноз через 90 дней"
          value={formatCurrency(data.forecast90dBalance, data.currency)}
          icon={data.forecast90dBalance >= data.startingBalance ? TrendingUp : TrendingDown}
          tone={data.forecast90dBalance >= 0 ? "default" : "danger"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Прогноз остатка</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/recurring">
                <CalendarClock className="size-4" />
                Плановые платежи
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ForecastBalanceChart data={data.points} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Предупреждения</CardTitle>
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
            <CardTitle>Плановые суммы</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <FlowBox label="Доходы 30 дней" value={data.plannedIncome30d} currency={data.currency} tone="success" />
            <FlowBox label="Расходы 30 дней" value={data.plannedExpense30d} currency={data.currency} tone="danger" />
            <FlowBox label="Доходы 90 дней" value={data.plannedIncome90d} currency={data.currency} tone="success" />
            <FlowBox label="Расходы 90 дней" value={data.plannedExpense90d} currency={data.currency} tone="danger" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ближайшие события</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{event.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(event.date)} · {event.category} · {event.account}
                    </p>
                  </div>
                  <p className={event.type === "INCOME" ? "shrink-0 font-semibold text-success-foreground" : "shrink-0 font-semibold text-destructive"}>
                    {event.type === "INCOME" ? "+" : "-"}
                    {formatCurrency(event.amount, data.currency)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = "default"
}: {
  label: string;
  value: string;
  icon: typeof WalletCards;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success-foreground"
      : tone === "warning"
        ? "text-warning-foreground"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className={`mt-3 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function WarningCard({ warning }: { warning: ForecastWarning }) {
  const variant = warning.severity === "CRITICAL" ? "destructive" : warning.severity === "WARNING" ? "warning" : "info";

  return (
    <article className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
        <Badge variant={variant}>{warning.severity === "CRITICAL" ? "Срочно" : warning.severity === "WARNING" ? "Важно" : "Инфо"}</Badge>
      </div>
      <h3 className="mt-3 text-sm font-semibold">{warning.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{warning.description}</p>
    </article>
  );
}

function FlowBox({ label, value, currency, tone }: { label: string; value: number; currency: string; tone: "success" | "danger" }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={tone === "success" ? "mt-2 text-2xl font-semibold text-success-foreground" : "mt-2 text-2xl font-semibold text-destructive"}>
        {formatCurrency(value, currency)}
      </p>
    </div>
  );
}
