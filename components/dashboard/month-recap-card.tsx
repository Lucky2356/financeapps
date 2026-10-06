"use client";

// «Итоги месяца».
//
// Два входа в одни и те же итоги:
// - кнопка «Итоги месяца» на главной — в любой день: идущий месяц на сегодня
//   (и прошлый для сравнения — к тому же числу), листается назад по месяцам;
// - карточка «Итоги сентября» в первые семь дней нового месяца — напоминание,
//   один раз: закрыл — до следующего месяца.

import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { previousMonth, type MonthRecap } from "@/lib/analytics/month-recap";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";
import { cn } from "@/lib/utils";

export const MONTH_RECAP_KEY = "month-recap-seen";
/** Сколько первых дней месяца карточка ждёт на главной. */
const SHOW_DAYS = 7;

const EMPTY: MonthRecap = {
  month: "",
  income: 0,
  expense: 0,
  saved: 0,
  savedRate: null,
  previous: { income: 0, expense: 0, savedRate: null },
  top: [],
  grew: null,
  overBudget: [],
  operations: 0,
  asOfDay: null
};

/** «сентября» — родительный падеж месяца, как в «Итоги сентября». */
function monthGenitive(month: string, locale: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1, 15);
  if (locale === "en") return date.toLocaleDateString("en-GB", { month: "long" });
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).replace(/^\d+\s*/, "");
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (!(before > 0)) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return null;
  const good = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs",
        good ? "text-success" : "text-destructive"
      )}
    >
      <Icon className="size-3" />
      {change > 0 ? "+" : ""}
      {change}%
    </span>
  );
}

function recapTitle(data: MonthRecap, t: ReturnType<typeof useI18n>["t"], locale: string) {
  const month = monthGenitive(data.month, locale);
  return data.asOfDay
    ? t("recap.titleSoFar", { month, day: data.asOfDay })
    : t("recap.title", { month });
}

/** Сами итоги — одинаковые в карточке и в окне. */
function RecapBody({ data, currency }: { data: MonthRecap; currency: string }) {
  const { t } = useI18n();
  const money = (value: number) => formatCurrency(value, currency);

  if (data.operations === 0) {
    return <p className="text-sm text-muted-foreground">{t("recap.empty")}</p>;
  }

  const [year, index] = data.month.split("-").map(Number);
  const lastDay = data.asOfDay ?? new Date(year, index, 0).getDate();
  const listHref = `/transactions?from=${data.month}-01&to=${data.month}-${String(lastDay).padStart(2, "0")}`;
  const vs = data.asOfDay ? "recap.vsSameDay" : "recap.vsMonth";
  const rateLine =
    data.savedRate === null
      ? null
      : data.previous.savedRate === null
        ? t("recap.rate", { rate: data.savedRate })
        : t("recap.rateCompare", { rate: data.savedRate, before: data.previous.savedRate });

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("recap.income")}</dt>
          <dd className="font-semibold tabular-nums">{money(data.income)}</dd>
          <Delta now={data.income} before={data.previous.income} />
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("recap.expense")}</dt>
          <dd className="font-semibold tabular-nums">{money(data.expense)}</dd>
          <Delta now={data.expense} before={data.previous.expense} invert />
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("recap.saved")}</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              data.saved < 0 ? "text-destructive" : "text-success"
            )}
          >
            {money(data.saved)}
          </dd>
        </div>
      </dl>
      {data.previous.income > 0 || data.previous.expense > 0 ? (
        <p className="text-xs text-muted-foreground">{t("recap.deltaNote", { vs: t(vs) })}</p>
      ) : null}
      {rateLine ? <p className="text-sm">{rateLine}</p> : null}

      {data.top.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t("recap.top")}</p>
          <div className="flex flex-wrap gap-1.5">
            {data.top.map((item) => (
              <span
                key={item.categoryId}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums"
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.category} · {money(item.amount)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {data.grew ? (
        <p className="text-sm text-muted-foreground">
          {t("recap.grew", {
            category: data.grew.category,
            amount: money(data.grew.amount - data.grew.previous)
          })}
        </p>
      ) : null}
      {data.overBudget.map((item) => (
        <p key={item.category} className="text-sm text-destructive">
          {t("recap.over", { category: item.category, amount: money(item.over) })}
        </p>
      ))}

      <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
        <Link href={listHref}>{t("recap.more")}</Link>
      </Button>
    </div>
  );
}

/** Карточка в первые дни месяца — итоги прошлого, один раз. */
export function MonthRecapCard({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  const [visible, setVisible] = useState(false);
  const { data } = useApiPageData(EMPTY, "/month-recap");

  useEffect(() => {
    const day = new Date().getDate();
    let seen: string | null = null;
    try {
      seen = readMine(MONTH_RECAP_KEY);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(day <= SHOW_DAYS && Boolean(data.month) && seen !== data.month);
  }, [data.month]);

  if (!visible || data.operations === 0) return null;

  function dismiss() {
    try {
      writeMine(MONTH_RECAP_KEY, data.month);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <Card data-testid="month-recap" className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-primary" />
          {recapTitle(data, t, locale)}
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2"
          aria-label={t("recap.close")}
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <RecapBody data={data} currency={currency} />
      </CardContent>
    </Card>
  );
}

/** Кнопка «Итоги месяца» и окно с ними — в любой день. */
export function MonthRecapButton({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const { data } = useApiPageData(EMPTY, `/month-recap?month=${month}`);
  const shown = data.month === month ? data : { ...EMPTY, month };
  const atNow = month >= currentMonth();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setMonth(currentMonth());
          setOpen(true);
        }}
      >
        <CalendarCheck className="size-4" />
        {t("recap.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="month-recap-dialog">
          <DialogHeader>
            <DialogTitle>{recapTitle(shown, t, locale)}</DialogTitle>
            <DialogDescription>{t("recap.lead")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMonth(previousMonth(month))}
            >
              <ChevronLeft className="size-4" />
              {t("recap.prev")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={atNow}
              onClick={() => setMonth(nextMonth(month))}
            >
              {t("recap.next")}
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <RecapBody data={shown} currency={currency} />
        </DialogContent>
      </Dialog>
    </>
  );
}
