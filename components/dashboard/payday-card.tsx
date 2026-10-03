"use client";

// «Хватит ли до зарплаты» на главной (lib/analytics/payday.ts).

import { CalendarClock, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { PaydayForecast } from "@/lib/analytics/payday";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";
import { cn } from "@/lib/utils";

/** День зарплаты, указанный человеком, — на этом устройстве. */
export const PAYDAY_KEY = "payday-day";

export function PaydayCard({ currency }: { currency: string }) {
  const { t } = useI18n();
  const [manual, setManual] = useState<string>(() => readMine(PAYDAY_KEY) ?? "");
  const [open, setOpen] = useState(false);
  const { data } = useApiPageData<{ forecast: PaydayForecast | null }>(
    { forecast: null },
    `/payday${manual ? `?day=${manual}` : ""}`
  );
  const forecast = data.forecast;
  if (!forecast) return null;
  const money = (value: number) => formatCurrency(value, currency);

  function choose(value: string) {
    const next = value === "auto" ? "" : value;
    writeMine(PAYDAY_KEY, next);
    setManual(next);
  }

  return (
    <Card
      data-testid="payday"
      className={cn(
        forecast.status === "short" && "border-destructive/50",
        forecast.status === "tight" && "border-warning/50"
      )}
    >
      <CardContent className="space-y-2 p-4">
        <button
          type="button"
          className="flex w-full items-start gap-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted-foreground">
              {t("pay.until", { days: forecast.daysLeft, date: formatDate(forecast.nextDate) })}
            </span>
            {forecast.status === "short" ? (
              <span className="block font-semibold text-destructive" data-testid="payday-short">
                {t("pay.short", { amount: money(Math.abs(forecast.free)) })}
              </span>
            ) : (
              <span className="block font-semibold">
                {t("pay.free", { amount: money(forecast.free), perDay: money(forecast.perDay) })}
              </span>
            )}
            {forecast.status === "tight" ? (
              <span className="block text-xs text-muted-foreground">
                {t("pay.tight", { usual: money(forecast.usualPerDay) })}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn("mt-1 size-4 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
        {open ? (
          <div className="space-y-2 border-t pt-2 text-sm">
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("pay.liquid")}</span>
              <span className="tabular-nums">{money(forecast.liquid)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("pay.upcoming")}</span>
              <span className="tabular-nums">−{money(forecast.upcoming)}</span>
            </p>
            {forecast.payments.length > 0 ? (
              <ul className="space-y-0.5 pl-3 text-xs text-muted-foreground">
                {forecast.payments.map((item, index) => (
                  <li key={`${item.date}-${index}`} className="flex justify-between gap-2">
                    <span className="truncate">
                      {formatDate(item.date)} · {item.title}
                    </span>
                    <span className="tabular-nums">{money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-muted-foreground">{t("pay.day")}</span>
              <Select value={manual || "auto"} onValueChange={choose}>
                <SelectTrigger className="h-8 w-44" aria-label={t("pay.day")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {t("pay.auto", { day: forecast.source === "history" ? forecast.payday : "—" })}
                  </SelectItem>
                  {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                    <SelectItem key={day} value={day}>
                      {t("pay.dayN", { day })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
