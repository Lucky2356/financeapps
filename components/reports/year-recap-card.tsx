"use client";

// «Итоги года» в «Отчётах»: год одним взглядом (lib/analytics/year-recap.ts).

import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { YearRecap } from "@/lib/analytics/year-recap";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const thisYear = () => new Date().getFullYear();

const EMPTY: YearRecap = {
  year: thisYear(),
  partial: true,
  income: 0,
  expense: 0,
  saved: 0,
  savedRate: null,
  previous: null,
  months: [],
  best: null,
  worst: null,
  top: [],
  biggest: null,
  capital: { start: 0, end: 0 },
  cushion: { start: 0, end: 0 },
  operations: 0
};

function Change({ now, before, goodWhenUp }: { now: number; before: number; goodWhenUp: boolean }) {
  const { t } = useI18n();
  if (before === 0) return null;
  const percent = Math.round(((now - before) / Math.abs(before)) * 100);
  if (percent === 0) return null;
  const good = goodWhenUp ? percent > 0 : percent < 0;
  return (
    <span className={cn("text-xs", good ? "text-success" : "text-destructive")}>
      {t("yr.vsLast", { sign: percent > 0 ? "+" : "−", pct: Math.abs(percent) })}
    </span>
  );
}

export function YearRecapCard({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  const [year, setYear] = useState(thisYear);
  const { data } = useApiPageData<YearRecap>(EMPTY, `/year-recap?year=${year}`);
  const money = (value: number) => formatCurrency(value, currency);
  const monthName = (month: string) =>
    new Date(`${month}-01T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      month: "long"
    });
  const growth = (span: { start: number; end: number }) => span.end - span.start;

  return (
    <Card data-testid="year-recap">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle className="flex min-w-0 flex-1 items-center gap-2 text-base">
          <PartyPopper className="size-4 shrink-0" />
          {t(data.partial ? "yr.titlePartial" : "yr.title", { year })}
        </CardTitle>
        <div className="no-print flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("yr.prev")}
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("yr.next")}
            disabled={year >= thisYear()}
            onClick={() => setYear((value) => value + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.operations === 0 ? (
          <p className="text-sm text-muted-foreground">{t("yr.empty")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">{t("yr.income")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(data.income)}</dd>
                {data.previous ? (
                  <Change now={data.income} before={data.previous.income} goodWhenUp />
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">{t("yr.expense")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(data.expense)}</dd>
                {data.previous ? (
                  <Change now={data.expense} before={data.previous.expense} goodWhenUp={false} />
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">{t("yr.saved")}</dt>
                <dd className="text-lg font-semibold tabular-nums" data-testid="year-saved">
                  {money(data.saved)}
                </dd>
                {data.savedRate !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {t("yr.rate", { pct: data.savedRate })}
                  </span>
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">{t("yr.capital")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(data.capital.end)}</dd>
                <span
                  className={cn(
                    "text-xs",
                    growth(data.capital) >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {growth(data.capital) >= 0 ? "+" : "−"}
                  {money(Math.abs(growth(data.capital)))} {t("yr.sinceStart")}
                </span>
              </div>
            </dl>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("yr.top")}</p>
                <ul className="space-y-1.5 text-sm">
                  {data.top.map((item) => (
                    <li key={item.categoryId} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color ?? "#64748b" }}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.category}</span>
                      <span className="tabular-nums text-muted-foreground">{item.share}%</span>
                      <span className="w-28 text-right font-medium tabular-nums">
                        {money(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="space-y-1.5 text-sm">
                {data.best ? (
                  <li>
                    <span className="text-muted-foreground">{t("yr.best")}: </span>
                    <span className="capitalize">{monthName(data.best.month)}</span> —{" "}
                    {t("yr.savedMonth", { amount: money(data.best.saved) })}
                  </li>
                ) : null}
                {data.worst ? (
                  <li>
                    <span className="text-muted-foreground">{t("yr.worst")}: </span>
                    <span className="capitalize">{monthName(data.worst.month)}</span> —{" "}
                    {t("yr.savedMonth", { amount: money(data.worst.saved) })}
                  </li>
                ) : null}
                {data.biggest ? (
                  <li>
                    <span className="text-muted-foreground">{t("yr.biggest")}: </span>
                    {data.biggest.description} — {money(data.biggest.amount)} (
                    {formatDate(data.biggest.date)})
                  </li>
                ) : null}
                <li>
                  <span className="text-muted-foreground">{t("yr.cushion")}: </span>
                  {money(data.cushion.start)} → {money(data.cushion.end)}
                </li>
                <li className="text-muted-foreground">
                  {t("yr.operations", { count: data.operations })}
                </li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
