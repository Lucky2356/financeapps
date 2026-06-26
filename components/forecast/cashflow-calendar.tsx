"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
  subMonths
} from "date-fns";
import { enUS, ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ForecastEvent } from "@/types/finance";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type DayBucket = { income: number; expense: number; events: ForecastEvent[] };

export function CashflowCalendar({
  events,
  currency
}: {
  events: ForecastEvent[];
  currency: string;
}) {
  const { t, locale } = useI18n();
  const dfLocale = locale === "en" ? enUS : ru;
  const weekdays = t("cal.weekdays").split(",");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);

  // Group planned events by calendar day (YYYY-MM-DD).
  const byDay = useMemo(() => {
    const map = new Map<string, DayBucket>();
    for (const event of events) {
      const key = event.date.slice(0, 10);
      const bucket = map.get(key) ?? { income: 0, expense: 0, events: [] };
      if (event.type === "INCOME") bucket.income += event.amount;
      else bucket.expense += event.amount;
      bucket.events.push(event);
      map.set(key, bucket);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const leadingBlanks = (start.getDay() + 6) % 7; // Monday-first offset
    return [...Array(leadingBlanks).fill(null), ...eachDayOfInterval({ start, end })];
  }, [month]);

  const selectedBucket = selected ? byDay.get(selected) : undefined;
  const todayKey = format(new Date(), "yyyy-MM-dd");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{t("cal.title")}</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("bud.prevMonth")}
            onClick={() => setMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium capitalize">
            {format(month, "LLLL yyyy", { locale: dfLocale })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("bud.nextMonth")}
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {weekdays.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (!day) return <div key={`blank-${index}`} />;
            const key = format(day, "yyyy-MM-dd");
            const bucket = byDay.get(key);
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(isSelected ? null : key)}
                className={cn(
                  "flex min-h-14 flex-col items-stretch gap-0.5 rounded-md border p-1 text-left transition-colors hover:bg-muted/50",
                  !isSameMonth(day, month) && "opacity-40",
                  isSelected && "border-primary ring-1 ring-primary",
                  isToday && !isSelected && "border-primary/60"
                )}
              >
                <span
                  className={cn(
                    "text-[11px]",
                    isToday ? "font-bold text-primary" : "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                {bucket?.income ? (
                  <span className="truncate rounded bg-success/15 px-1 text-[10px] font-medium text-success-foreground">
                    +{compact(bucket.income, t("cal.thousand"))}
                  </span>
                ) : null}
                {bucket?.expense ? (
                  <span className="truncate rounded bg-destructive/12 px-1 text-[10px] font-medium text-destructive">
                    −{compact(bucket.expense, t("cal.thousand"))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {selectedBucket ? (
          <div className="mt-4 space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">
              {format(new Date(`${selected}T00:00:00`), "d MMMM yyyy", { locale: dfLocale })}
            </p>
            {selectedBucket.events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {event.title}
                  <span className="ml-2 text-xs text-muted-foreground">{event.category}</span>
                </span>
                <span
                  className={
                    event.type === "INCOME"
                      ? "shrink-0 font-medium text-success-foreground"
                      : "shrink-0 font-medium text-destructive"
                  }
                >
                  {event.type === "INCOME" ? "+" : "−"}
                  {formatCurrency(event.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t("cal.footer")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function compact(value: number, thousand: string) {
  if (value >= 1000) return `${Math.round(value / 1000)}${thousand}`;
  return String(Math.round(value));
}
