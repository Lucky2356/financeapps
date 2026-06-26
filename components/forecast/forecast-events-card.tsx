"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import {
  EMPTY_FORECAST_FILTER,
  filterForecastEvents,
  forecastFilterOptions
} from "@/lib/forecast-filter";
import type { ForecastEvent } from "@/types/finance";

// Planned forecast events with account/category drill-down (plan C2). The whole
// horizon is filterable so users can answer "what's driving the forecast for
// this account / category?".
export function ForecastEventsCard({
  events,
  currency
}: {
  events: ForecastEvent[];
  currency: string;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState(EMPTY_FORECAST_FILTER);
  const { accounts, categories } = useMemo(() => forecastFilterOptions(events), [events]);
  const filtered = useMemo(() => filterForecastEvents(events, filter), [events, filter]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{t("fc.events")}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label={t("fc.filterAccount")}
            value={filter.account}
            onChange={(event) => setFilter((prev) => ({ ...prev, account: event.target.value }))}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t("tx.allAccounts")}</option>
            {accounts.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
          <select
            aria-label={t("fc.filterCategory")}
            value={filter.category}
            onChange={(event) => setFilter((prev) => ({ ...prev, category: event.target.value }))}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t("tx.allCategories")}</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("fc.noEvents")}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(event.date)} · {event.category} · {event.account}
                  </p>
                </div>
                <p
                  className={
                    event.type === "INCOME"
                      ? "shrink-0 font-semibold text-success-foreground"
                      : "shrink-0 font-semibold text-destructive"
                  }
                >
                  {event.type === "INCOME" ? "+" : "-"}
                  {formatCurrency(event.amount, currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
