"use client";

// «По месяцам» — таблица для телефона. Шестнадцать столбцов в экран шириной в
// ладонь не уместить: их листают вбок и теряют, где какой. Здесь месяц — одна
// карточка со списком статей сверху вниз, а листается месяц стрелками.

import { ChevronLeft, ChevronRight } from "lucide-react";

import { monthLabel } from "@/components/sheet/sheet-text";
import type { DisplayColumn, Position, SheetWords } from "@/components/sheet/sheet-types";
import { isSavingsKind, type ComputedRow } from "@/lib/sheet/model";
import { cn } from "@/lib/utils";

function inSavings(item: DisplayColumn): boolean {
  return (
    item.type === "savingsTotal" || (item.type === "column" && isSavingsKind(item.column.kind))
  );
}

export function SheetMonthView({
  rows,
  display,
  index,
  current,
  words,
  locale,
  plain,
  onIndex,
  onEdit
}: {
  rows: ComputedRow[];
  display: DisplayColumn[];
  index: number;
  current: string;
  words: SheetWords;
  locale: string;
  plain: (value: number) => string;
  onIndex: (index: number) => void;
  onEdit: (position: Position) => void;
}) {
  const row = rows[index];
  if (!row) return null;
  const now = row.month === current;

  return (
    <div className="space-y-3" data-testid="sheet-month-view">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2 py-2">
        <button
          type="button"
          aria-label={words.monthPrev}
          disabled={index === 0}
          className="rounded-md p-2 hover:bg-muted disabled:opacity-30"
          onClick={() => onIndex(index - 1)}
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="text-center">
          <p className="text-base font-semibold" data-testid="month-view-title">
            {monthLabel(row.month, locale, "long")}
          </p>
          {now ? (
            <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-bold text-foreground">
              {words.legendNow}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={words.monthNext}
          disabled={index === rows.length - 1}
          className="rounded-md p-2 hover:bg-muted disabled:opacity-30"
          onClick={() => onIndex(index + 1)}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <ul className="overflow-hidden rounded-lg border bg-card text-sm">
        {display.map((item, col) => {
          const savings = inSavings(item);
          // Заголовок раздела — там, где раздел сменился по сравнению с соседом сверху.
          const header =
            col === 0 || inSavings(display[col - 1]) !== savings ? (
              <li
                key={`h-${savings ? "savings" : "main"}`}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                  savings ? "bg-success/10 text-success" : "bg-muted text-foreground"
                )}
              >
                {savings ? words.savings : words.main}
              </li>
            ) : null;

          if (item.type !== "column") {
            const value = item.type === "total" ? row.total : row.savingsTotal;
            return [
              header,
              <li
                key={item.type}
                className="flex items-center justify-between gap-3 bg-warning/10 px-3 py-3 font-semibold"
              >
                <span>{item.type === "total" ? words.monthTotalRow : words.savingsTotal}</span>
                <span className={cn("tabular-nums", value < 0 && "text-destructive")}>
                  {plain(value)}
                </span>
              </li>
            ];
          }

          const { column } = item;
          const cell = row.cells[column.id];
          const empty = cell?.value === null || cell?.value === undefined;
          return [
            header,
            <li key={column.id} className="border-t first:border-t-0">
              <button
                type="button"
                data-testid="month-cell"
                data-col={column.name}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-muted"
                onClick={() => onEdit({ row: index, col })}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{column.name}</span>
                  {column.kind !== "expense" ? (
                    <span className="block text-xs text-muted-foreground">
                      {words.kinds[column.kind]}
                    </span>
                  ) : null}
                </span>
                {column.kind === "note" ? (
                  <span className="max-w-[55%] truncate text-muted-foreground">
                    {cell?.input || words.monthEmptyCell}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      cell?.auto && "italic text-muted-foreground",
                      empty && "text-muted-foreground/60",
                      cell?.error && "text-destructive",
                      column.kind === "income" && !empty && "text-success"
                    )}
                  >
                    {cell?.error ? "#!" : empty ? "—" : plain(cell!.value as number)}
                  </span>
                )}
              </button>
            </li>
          ];
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{words.monthEditHint}</p>
    </div>
  );
}
