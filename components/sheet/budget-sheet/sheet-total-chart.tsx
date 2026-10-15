"use client";

// «Итог по месяцам» — маленький график над таблицей. Таблица отвечает, сколько
// останется в каждом месяце, но двадцать чисел столбцом не показывают главного:
// куда всё идёт и где провал. Столбик вниз — месяц, в котором денег не хватит.
//
// Сворачивается, и выбор помнится на устройстве: кому график не нужен, тот
// закрыл его один раз. Recharts грузится, только пока график раскрыт.

import { BarChart3, ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { CHART_KEY, remember } from "@/components/sheet/budget-sheet/helpers";
import type { SheetWords } from "@/components/sheet/sheet-types";
import { Skeleton } from "@/components/ui/skeleton";
import type { TotalPoint } from "@/lib/sheet/insights";
import { cn } from "@/lib/utils";

const TotalChartBars = dynamic(
  () => import("@/components/sheet/budget-sheet/total-chart-bars").then((m) => m.TotalChartBars),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
);

export function SheetTotalChart({
  points,
  words,
  locale,
  money,
  onPick
}: {
  points: TotalPoint[];
  words: SheetWords;
  locale: string;
  money: (value: number) => string;
  onPick: (month: string) => void;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(CHART_KEY) === "0") setOpen(false);
    } catch {
      /* хранилище недоступно — график раскрыт */
    }
  }, []);

  if (points.length === 0) return null;
  const shortfalls = points.filter((point) => point.negative).length;

  return (
    <section className="rounded-lg border bg-card" data-testid="sheet-chart">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? words.chartHide : words.chartShow}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() =>
          setOpen((was) => {
            remember(CHART_KEY, was ? "0" : "1");
            return !was;
          })
        }
      >
        <BarChart3 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{words.chartTitle}</span>
        {shortfalls > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-destructive">
            <span className="size-2 rounded-sm bg-destructive" />
            {words.legendMinus}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div
          className="h-32 px-1 pb-2 sm:h-36"
          role="img"
          aria-label={words.chartAria}
          data-testid="sheet-chart-plot"
        >
          <TotalChartBars
            points={points}
            locale={locale}
            money={money}
            label={words.total}
            onPick={onPick}
          />
        </div>
      ) : null}
    </section>
  );
}
