"use client";

// Календарь операций: месяц сеткой.
//
// Список отвечает на «что я купил», календарь — на «когда уходят деньги»: видно
// дни, в которые тратится больше всего, выходные и зарплатные дни, и что ещё
// предстоит — плановые платежи бледным в будущих днях. Нажал на день — ниже
// операции этого дня.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { isTransfer } from "@/lib/transactions/transfers";
import { cn } from "@/lib/utils";
import type { ForecastData } from "@/types/finance";

const pad = (value: number) => String(value).padStart(2, "0");
const dayKey = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/** Коротко для клетки: 1 234 → «1,2 т», 15 000 → «15 т». */
function compact(value: number, locale: string): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })} ${locale === "en" ? "M" : "млн"}`;
  if (value >= 1_000)
    return `${(value / 1_000).toLocaleString(locale, { maximumFractionDigits: value >= 10_000 ? 0 : 1 })} ${locale === "en" ? "k" : "т"}`;
  return Math.round(value).toLocaleString(locale);
}

const EMPTY_TX = { transactions: [] } as unknown as TransactionsPageData;
const EMPTY_FORECAST = { events: [] } as unknown as ForecastData;

export function TransactionsCalendar() {
  const { t, locale } = useI18n();
  const now = new Date();
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [picked, setPicked] = useState<string>(todayKey);

  const lastDay = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const from = dayKey(cursor.year, cursor.month, 1);
  const to = dayKey(cursor.year, cursor.month, lastDay);
  const { data } = useApiPageData<TransactionsPageData>(
    EMPTY_TX,
    `/transactions?from=${from}&to=${to}&limit=all`
  );
  const { data: forecast } = useApiPageData<ForecastData>(EMPTY_FORECAST, "/forecast");

  const byDay = useMemo(() => {
    const map = new Map<string, { expense: number; income: number }>();
    for (const row of data.transactions ?? []) {
      if (row.transferId || isTransfer(row)) continue;
      const key = row.date.slice(0, 10);
      const cell = map.get(key) ?? { expense: 0, income: 0 };
      const amount = row.baseAmount ?? row.amount;
      if (row.type === "EXPENSE") cell.expense += amount;
      else if (row.type === "INCOME") cell.income += amount;
      map.set(key, cell);
    }
    return map;
  }, [data.transactions]);

  const planned = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of forecast.events ?? []) {
      const key = event.date.slice(0, 10);
      if (key <= todayKey || !key.startsWith(from.slice(0, 7)) || event.type !== "EXPENSE")
        continue;
      map.set(key, (map.get(key) ?? 0) + event.amount);
    }
    return map;
  }, [forecast.events, from, todayKey]);

  const maxExpense = Math.max(1, ...[...byDay.values()].map((cell) => cell.expense));
  // Неделя с понедельника: так её видят в России, и так её печатают календари.
  const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const monthExpense = [...byDay.values()].reduce((sum, cell) => sum + cell.expense, 0);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, 1 + index).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      weekday: "short"
    })
  );
  // «Сентябрь 2026», а не «сентябрь 2026 г.»: заглавная только первая буква.
  const monthName = new Date(cursor.year, cursor.month, 1)
    .toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", { month: "long", year: "numeric" })
    .replace(/\s*г\.$/, "");
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  function shift(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setPicked(
      next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth()
        ? todayKey
        : dayKey(next.getFullYear(), next.getMonth(), 1)
    );
  }

  const dayRows = (data.transactions ?? []).filter((row) => row.date.slice(0, 10) === picked);
  const dayPlanned = (forecast.events ?? []).filter(
    (event) => event.date.slice(0, 10) === picked && picked > todayKey
  );

  return (
    <Card data-testid="transactions-calendar">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("cal.prev")}
          onClick={() => shift(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("cal.monthSpent", { amount: formatCurrency(monthExpense) })}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("cal.next")}
          onClick={() => shift(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((name) => (
            <div key={name} className="pb-1 text-[11px] uppercase text-muted-foreground">
              {name}
            </div>
          ))}
          {Array.from({ length: firstWeekday }, (_, index) => (
            <div key={`gap-${index}`} />
          ))}
          {Array.from({ length: lastDay }, (_, index) => {
            const day = index + 1;
            const key = dayKey(cursor.year, cursor.month, day);
            const cell = byDay.get(key);
            const plan = planned.get(key);
            const heat = cell ? Math.min(cell.expense / maxExpense, 1) : 0;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={picked === key}
                aria-label={key}
                onClick={() => setPicked(key)}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-start rounded-md border border-transparent px-0.5 py-1 text-xs transition-colors",
                  picked === key ? "border-primary" : "hover:bg-muted/60",
                  key === todayKey && "font-semibold text-primary"
                )}
                style={
                  heat > 0
                    ? {
                        backgroundColor: `hsl(var(--primary) / ${(0.08 + heat * 0.32).toFixed(2)})`
                      }
                    : undefined
                }
              >
                <span>{day}</span>
                {cell && cell.expense > 0 ? (
                  <span className="mt-0.5 text-[10px] leading-none tabular-nums text-foreground">
                    {compact(cell.expense, locale)}
                  </span>
                ) : plan ? (
                  <span className="mt-0.5 text-[10px] leading-none tabular-nums text-muted-foreground/70">
                    {compact(plan, locale)}
                  </span>
                ) : null}
                {cell && cell.income > 0 ? (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 size-1.5 rounded-full bg-success"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">
            {new Date(`${picked}T12:00:00`).toLocaleDateString(
              locale === "en" ? "en-GB" : "ru-RU",
              { day: "numeric", month: "long", weekday: "long" }
            )}
          </p>
          {dayRows.length === 0 && dayPlanned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cal.empty")}</p>
          ) : null}
          <ul className="space-y-1.5">
            {dayRows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span
                    aria-hidden
                    className="mr-2 inline-block size-2 rounded-full align-middle"
                    style={{ backgroundColor: row.category.color }}
                  />
                  {row.category.label}
                  {row.description ? (
                    <span className="text-muted-foreground"> · {row.description}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    row.type === "INCOME" ? "text-success" : ""
                  )}
                >
                  {row.type === "INCOME" ? "+" : "−"}
                  {formatCurrency(row.amount)}
                </span>
              </li>
            ))}
            {dayPlanned.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
              >
                <span className="min-w-0 truncate">
                  {t("cal.planned")} · {event.title}
                </span>
                <span className="shrink-0 tabular-nums">
                  {event.type === "INCOME" ? "+" : "−"}
                  {formatCurrency(event.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
