"use client";

import { AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { ListRow, ListRows } from "@/components/ui/list-row";
import { SectionCard } from "@/components/ui/section-card";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { ForecastData } from "@/types/finance";

const MAX_ROWS = 5;

// The home screen's list block: what is coming up, with the 30-day totals
// underneath. Replaces the three-column strip — the same numbers are here, but
// the payments themselves lead, which is what the screen is actually asked about.
export function DashboardForecastStrip({ forecast }: { forecast: ForecastData }) {
  const { t } = useI18n();
  const net30 = forecast.plannedIncome30d - forecast.plannedExpense30d;
  const events = forecast.upcomingEvents.slice(0, MAX_ROWS);
  const warning =
    forecast.warnings.find((item) => item.severity === "CRITICAL") ?? forecast.warnings[0];

  return (
    <SectionCard title={t("dfs.upcoming")} action={t("common.viewAll")} actionHref="/forecast">
      {events.length > 0 ? (
        <ListRows>
          {events.map((event) => {
            const income = event.type === "INCOME";
            return (
              <ListRow
                key={event.id}
                href="/forecast"
                icon={income ? ArrowDownLeft : ArrowUpRight}
                title={event.title}
                subtitle={event.category}
                value={`${income ? "+" : "−"}${formatCurrency(Math.abs(event.amount), forecast.currency)}`}
                valueCaption={formatDate(event.date)}
                valueTone={income ? "success" : "default"}
                tone={income ? "success" : "default"}
              />
            );
          })}
        </ListRows>
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
    </SectionCard>
  );
}
