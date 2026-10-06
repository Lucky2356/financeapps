"use client";

// «Сравнение месяцев»: два месяца бок о бок по статьям (lib/analytics/compare-months.ts).

import { ArrowDownRight, ArrowUpRight, GitCompareArrows } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { MonthComparison } from "@/lib/analytics/compare-months";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

function lastMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, step) => {
    const date = new Date(now.getFullYear(), now.getMonth() - step, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

const EMPTY: MonthComparison = {
  a: "",
  b: "",
  asOfDay: null,
  expense: [],
  income: [],
  totals: { expenseA: 0, expenseB: 0, incomeA: 0, incomeB: 0 }
};

export function CompareMonthsCard({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  const months = useMemo(() => lastMonths(24), []);
  const [a, setA] = useState(months[0]);
  const [b, setB] = useState(months[1]);
  const { data } = useApiPageData(EMPTY, `/compare-months?a=${a}&b=${b}`);
  const money = (value: number) => formatCurrency(value, currency);
  const name = (month: string) =>
    new Date(`${month}-01T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      month: "long",
      year: "numeric"
    });
  const picker = (value: string, onChange: (next: string) => void, label: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44 capitalize" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {months.map((month) => (
          <SelectItem key={month} value={month} className="capitalize">
            {name(month)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const lines = data.expense.filter((line) => line.a > 0 || line.b > 0);

  return (
    <Card data-testid="compare-months">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle className="flex min-w-0 flex-1 items-center gap-2 text-base">
          <GitCompareArrows className="size-4 shrink-0" />
          {t("cmp.title")}
        </CardTitle>
        {picker(a, setA, t("cmp.first"))}
        <span className="text-sm text-muted-foreground">{t("cmp.vs")}</span>
        {picker(b, setB, t("cmp.second"))}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {t("cmp.spent")}: <b className="tabular-nums">{money(data.totals.expenseA)}</b>{" "}
          {t("cmp.against")} <span className="tabular-nums">{money(data.totals.expenseB)}</span>
          {data.asOfDay ? (
            <span className="text-muted-foreground"> · {t("cmp.asOf", { day: data.asOfDay })}</span>
          ) : null}
        </p>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cmp.empty")}</p>
        ) : (
          <ul className="stagger divide-y rounded-lg border text-sm">
            {lines.slice(0, 12).map((line) => (
              <li
                key={line.categoryId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                data-testid="compare-line"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: line.color ?? "#64748b" }}
                />
                <span className="min-w-0 flex-1 truncate">{line.category}</span>
                <span className="tabular-nums text-muted-foreground">
                  {money(line.b)} → <b className="text-foreground">{money(line.a)}</b>
                </span>
                <span
                  className={cn(
                    "flex w-28 items-center justify-end gap-1 font-medium tabular-nums",
                    line.change > 0 ? "text-destructive" : line.change < 0 ? "text-success" : ""
                  )}
                >
                  {line.change > 0 ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : line.change < 0 ? (
                    <ArrowDownRight className="size-3.5" />
                  ) : null}
                  {line.percent !== null
                    ? `${line.percent > 0 ? "+" : ""}${line.percent}%`
                    : t("cmp.new")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
