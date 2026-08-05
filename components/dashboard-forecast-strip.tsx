"use client";

import { AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { ForecastData, ForecastEvent } from "@/types/finance";

const MAX_ROWS = 5;

// The home screen's list block: what is coming up, newest first, with the
// 30-day totals underneath. Replaces the three-column strip — the same numbers
// are here, but the payments themselves lead, which is what the screen is
// actually asked about.
export function DashboardForecastStrip({ forecast }: { forecast: ForecastData }) {
  const { t } = useI18n();
  const net30 = forecast.plannedIncome30d - forecast.plannedExpense30d;
  const events = forecast.upcomingEvents.slice(0, MAX_ROWS);
  const warning =
    forecast.warnings.find((item) => item.severity === "CRITICAL") ?? forecast.warnings[0];

  return (
    <section className="rounded-lg border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("dfs.upcoming")}</h2>
        <Link
          href="/forecast"
          className="shrink-0 text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          {t("dfs.viewAll")}
        </Link>
      </div>

      {events.length > 0 ? (
        <ul className="mt-2 divide-y">
          {events.map((event) => (
            <EventRow key={event.id} event={event} currency={forecast.currency} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t("dfs.noUpcoming")}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">{t("dfs.forecast30")}</p>
          <p className="num mt-1 truncate text-base font-semibold">
            {formatCurrency(forecast.forecast30dBalance, forecast.currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("dfs.plannedFlow")}</p>
          <p
            className={cn(
              "num mt-1 truncate text-base font-semibold",
              net30 >= 0 ? "text-success" : "text-destructive"
            )}
          >
            {formatCurrency(net30, forecast.currency)}
          </p>
        </div>
      </div>

      {warning ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle
            className={cn(
              "mt-px size-3.5 shrink-0",
              warning.severity === "CRITICAL" ? "text-destructive" : "text-warning"
            )}
          />
          <span className="line-clamp-2">{warning.title}</span>
        </p>
      ) : null}
    </section>
  );
}

function EventRow({ event, currency }: { event: ForecastEvent; currency: string }) {
  const income = event.type === "INCOME";
  const Icon = income ? ArrowDownLeft : ArrowUpRight;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{event.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{event.category}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cn("num block text-sm font-semibold", income && "text-success")}>
          {income ? "+" : "−"}
          {formatCurrency(Math.abs(event.amount), currency)}
        </span>
        <span className="block text-xs text-muted-foreground">{formatDate(event.date)}</span>
      </span>
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", income ? "bg-success" : "bg-primary")}
      />
    </li>
  );
}
