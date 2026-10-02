"use client";

// «Можно тратить сегодня» — одно число на каждый день.
//
// Одна строка под сводкой: сколько осталось на сегодня (цвет — укладываемся
// или нет) и сколько в день до конца месяца. Нажатие раскрывает расчёт и
// вчерашние траты: число, которому нельзя проверить происхождение, быстро
// перестают слушать.

import { ChevronDown, Wallet } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
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

  // Узкая полоса, а не большая карточка: одно число на каждый день не должно
  // заслонять остальную главную. Всё прочее — по нажатию.
  return (
    <Card data-testid="daily-allowance">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {/* Значок — только там, где есть место: на телефоне он выталкивал
            заголовок на вторую строку. */}
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:flex">
          <Wallet className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium [overflow-wrap:anywhere]">
            {t("allow.title")}
          </span>
          <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {over
              ? t("allow.over")
              : data.spentToday > 0
                ? t("allow.spentOf", {
                    spent: money(data.spentToday),
                    perDay: money(data.perDay)
                  })
                : t("allow.perDayShort")}
          </span>
        </span>
        <span className={cn("shrink-0 text-base font-semibold tabular-nums", TONE[data.status])}>
          {money(Math.max(data.leftToday, 0))}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <CardContent className="space-y-3 border-t pt-3">
          {over ? <p className="text-xs text-muted-foreground">{t("allow.overHint")}</p> : null}
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
          <p className="text-xs font-medium text-muted-foreground">{t("allow.how")}</p>
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
          {data.incomeSource === "average" ? (
            <p className="text-xs text-muted-foreground">{t("allow.byAverage")}</p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
