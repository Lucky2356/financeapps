"use client";

// Недельная сводка — в понедельник и вторник, пока неделя свежая. Один раз:
// закрыл — до следующей недели.

import { CalendarRange, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { WeekRecap } from "@/lib/analytics/week-recap";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";
import { cn } from "@/lib/utils";

export const WEEK_RECAP_KEY = "week-recap-seen";

const EMPTY: WeekRecap = {
  weekStart: "",
  weekEnd: "",
  spent: 0,
  usual: 0,
  change: null,
  top: [],
  grew: null,
  allowance: null,
  operations: 0
};

export function WeekRecapCard({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  const { data } = useApiPageData(EMPTY, "/week-recap");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const weekday = new Date().getDay();
    let seen: string | null = null;
    try {
      seen = readMine(WEEK_RECAP_KEY);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(
      (weekday === 1 || weekday === 2) && Boolean(data.weekStart) && seen !== data.weekStart
    );
  }, [data.weekStart]);

  if (!visible || data.operations === 0) return null;

  const money = (value: number) => formatCurrency(value, currency);
  const date = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "short"
    });
  const up = (data.change ?? 0) > 0;

  function dismiss() {
    try {
      writeMine(WEEK_RECAP_KEY, data.weekStart);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <Card data-testid="week-recap">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="size-4 text-primary" />
          {t("week.title", { from: date(data.weekStart), to: date(data.weekEnd) })}
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2"
          aria-label={t("week.close")}
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <p className="text-lg font-semibold tabular-nums">
          {t("week.spent", { amount: money(data.spent) })}
        </p>
        {data.change !== null ? (
          <p className={cn("flex items-center gap-1", up ? "text-destructive" : "text-success")}>
            {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            {t("week.vsUsual", {
              change: `${up ? "+" : ""}${data.change}%`,
              usual: money(data.usual)
            })}
          </p>
        ) : null}
        {data.grew ? (
          <p className="text-muted-foreground">
            {t("week.grew", {
              category: data.grew.category,
              amount: money(data.grew.amount),
              usual: money(data.grew.usual)
            })}
          </p>
        ) : null}
        {data.allowance !== null ? (
          <p className="text-muted-foreground">
            {t("week.allowance", { amount: money(data.allowance) })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
