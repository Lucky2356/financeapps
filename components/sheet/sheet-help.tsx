"use client";

// «Как это работает» — короткая справка над таблицей. Новичку, открывшему
// таблицу впервые, она открыта сама; закрыл — больше не мешает, а вернуть её
// можно кнопкой в панели.

import { X } from "lucide-react";

import type { SheetWords } from "@/components/sheet/sheet-types";

export function SheetHelp({
  words,
  showKeys,
  onClose
}: {
  words: SheetWords;
  /** Клавиши — только там, где есть клавиатура. */
  showKeys: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
      data-testid="sheet-help"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{words.help}</p>
        <button
          type="button"
          aria-label={words.close}
          className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground lg:columns-2 lg:gap-x-8">
        {words.helpItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {showKeys ? <p className="mt-2 text-xs text-muted-foreground">{words.hint}</p> : null}
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {words.helpLegend}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded border bg-card px-1.5 py-0.5 italic text-muted-foreground tabular-nums">
            52 796
          </span>
          {words.legendAuto}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded border bg-card px-1.5 py-0.5 font-medium text-success tabular-nums">
            175 569
          </span>
          {words.legendIncome}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded border bg-card px-1.5 py-0.5 font-semibold text-destructive tabular-nums">
            −4 200
          </span>
          {words.legendMinus}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">
            Сен 2026
          </span>
          {words.legendNow}
        </span>
      </div>
    </div>
  );
}
