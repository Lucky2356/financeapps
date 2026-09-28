"use client";

// «Можно тратить сегодня» — одно число на каждый день.
//
// Цифра крупно, цвет — укладываемся или нет, под ней — сколько в день до конца
// месяца и сколько потратили вчера. «Из чего складывается» раскрывает расчёт:
// число, которому нельзя проверить происхождение, быстро перестают слушать.

import { ChevronDown, Wallet } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { Allowance } from "@/lib/analytics/daily-allowance";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const EMPTY: Allowance = {
  perDay: 0,
  leftToday: 0,
  daysLeft: 1,
  budget: 0,
  incomeSource: "actual",
  status: "ok",
  spentToday: 0,
  spentYesterday: 0,
  spentBeforeToday: 0,
  upcoming: 0,
  income: 0
};

const TONE: Record<Allowance["status"], string> = {
  ok: "text-success",
  tight: "text-warning",
  over: "text-destructive"
};

export function DailyAllowanceCard({ currency }: { currency: string }) {
  const { t } = useI18n();
  const { data } = useApiPageData<Allowance>(EMPTY, "/allowance");
  const [open, setOpen] = useState(false);

  // Ни доходов, ни трат — считать нечего; пустая карточка с нулём только пугает.
  if (!(data.income > 0) && !(data.spentToday > 0) && data.budget === 0) return null;

  const money = (value: number) => formatCurrency(value, currency);
  const minus = (value: number) => (value > 0 ? `−${money(value)}` : money(0));
  const over = data.status === "over";

  return (
    <Card data-testid="daily-allowance">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" />
          {t("allow.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className={cn("text-3xl font-bold tracking-tight tabular-nums", TONE[data.status])}>
            {money(Math.max(data.leftToday, 0))}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {over
              ? t("allow.over")
              : data.spentToday > 0
                ? t("allow.perDay", { amount: money(data.perDay) })
                : t("allow.perDayFresh")}
          </p>
          {over ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("allow.overHint")}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {data.spentToday > 0 ? (
            <span className="rounded-full bg-muted px-2.5 py-1 tabular-nums">
              {t("allow.todaySpent", { amount: money(data.spentToday) })}
            </span>
          ) : null}
          <span className="rounded-full bg-muted px-2.5 py-1 tabular-nums">
            {t("allow.yesterday", { amount: money(data.spentYesterday) })}
          </span>
        </div>
        {data.incomeSource === "average" ? (
          <p className="text-xs text-muted-foreground">{t("allow.byAverage")}</p>
        ) : null}

        <button
          type="button"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {t("allow.how")}
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">
              {data.incomeSource === "average" ? t("allow.incomeAverage") : t("allow.income")}
            </dt>
            <dd className="text-right">{money(data.income)}</dd>
            <dt className="text-muted-foreground">{t("allow.spent")}</dt>
            <dd className="text-right">{minus(data.spentBeforeToday)}</dd>
            <dt className="text-muted-foreground">{t("allow.upcoming")}</dt>
            <dd className="text-right">{minus(data.upcoming)}</dd>
            <dt className="text-muted-foreground">{t("allow.left")}</dt>
            <dd className="text-right font-medium">{money(data.budget)}</dd>
            <dt className="text-muted-foreground">{t("allow.days")}</dt>
            <dd className="text-right">{data.daysLeft}</dd>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
