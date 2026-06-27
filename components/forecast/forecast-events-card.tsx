"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_OPTION,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
          <Select
            value={filter.account || ALL_OPTION}
            onValueChange={(value) =>
              setFilter((prev) => ({ ...prev, account: value === ALL_OPTION ? "" : value }))
            }
          >
            <SelectTrigger className="h-9 w-44" aria-label={t("fc.filterAccount")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION}>{t("tx.allAccounts")}</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account} value={account}>
                  {account}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filter.category || ALL_OPTION}
            onValueChange={(value) =>
              setFilter((prev) => ({ ...prev, category: value === ALL_OPTION ? "" : value }))
            }
          >
            <SelectTrigger className="h-9 w-44" aria-label={t("fc.filterCategory")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION}>{t("tx.allCategories")}</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
