"use client";

// Сводка над таблицей: что в нынешнем месяце и хватит ли денег дальше. Таблица
// на двадцать столбцов отвечает на эти вопросы только тому, кто умеет её читать;
// здесь ответ — четыре числа и одна строка.

import { CalendarPlus, TriangleAlert } from "lucide-react";

import { monthLabel } from "@/components/sheet/sheet-text";
import type { SheetFormat, SheetWords } from "@/components/sheet/sheet-types";
import { Button } from "@/components/ui/button";
import type { Shortfall } from "@/lib/sheet/insights";
import type { ComputedRow } from "@/lib/sheet/model";
import { cn } from "@/lib/utils";

export function SheetSummary({
  row,
  words,
  format,
  locale,
  money,
  hasSavings,
  shortfall,
  monthsLeft,
  onShowMonth,
  onAddYear
}: {
  row: ComputedRow;
  words: SheetWords;
  format: SheetFormat;
  locale: string;
  money: (value: number) => string;
  hasSavings: boolean;
  shortfall: Shortfall | null;
  /** Сколько месяцев впереди; null — не про это. */
  monthsLeft: number | null;
  onShowMonth: (month: string) => void;
  onAddYear: () => void;
}) {
  const tiles: Array<{ key: string; label: string; value: number; tone?: "bad" | "good" }> = [
    { key: "opening", label: words.sumOpening, value: row.opening },
    { key: "income", label: words.sumIncome, value: row.income, tone: "good" },
    { key: "expense", label: words.sumExpense, value: row.expense },
    {
      key: "total",
      label: words.sumTotal,
      value: row.total,
      tone: row.total < 0 ? "bad" : undefined
    },
    ...(hasSavings ? [{ key: "savings", label: words.sumSavings, value: row.savingsTotal }] : [])
  ];
  return (
    <div className="space-y-2" data-testid="sheet-summary">
      {/* Одной полосой, а не пятью плитками: таблица — главное на экране, и
          всё, что над ней, обязано занимать как можно меньше места. */}
      <div className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-lg border bg-card sm:flex sm:divide-y-0">
        <div className="col-span-2 px-3 py-1.5 sm:col-span-1 sm:min-w-32">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {words.sumNow}
          </p>
          <p className="text-sm font-semibold">{monthLabel(row.month, locale, "long")}</p>
        </div>
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className={cn("px-3 py-1.5 sm:flex-1", tile.key === "total" && "bg-foreground/[0.04]")}
            data-testid={`sum-${tile.key}`}
          >
            <p className="text-[11px] text-muted-foreground">{tile.label}</p>
            <p
              className={cn(
                "text-base font-semibold tabular-nums",
                tile.tone === "bad" && "text-destructive",
                tile.tone === "good" && "text-success"
              )}
            >
              {money(tile.value)}
            </p>
          </div>
        ))}
      </div>

      {shortfall ? (
        <div
          role="status"
          data-testid="sheet-shortfall"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {format(words.shortfall, {
              month: monthLabel(shortfall.month, locale, "long"),
              amount: money(shortfall.total)
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-destructive/40"
            onClick={() => onShowMonth(shortfall.month)}
          >
            {monthLabel(shortfall.month, locale)}
          </Button>
        </div>
      ) : null}

      {monthsLeft !== null && monthsLeft <= 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <CalendarPlus className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">{format(words.runningOut, { count: monthsLeft })}</span>
          <Button type="button" size="sm" variant="outline" onClick={onAddYear}>
            {words.addYear}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
