"use client";

import { useRef, useState, type ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import type { Band } from "@/components/plan/plan-fact-view/helpers";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { PlanFactCell, PlanFactPoolCells } from "@/types/finance";

/**
 * Итог месяца — две клетки, и в плане тоже.
 *
 * Делить план стало чем: владелец пишет, сколько собирается отложить, и обе
 * половины считаются по-честному — основные теряют отложенное, сбережения его
 * получают. Раньше здесь стояла одна цифра на обе колонки, потому что у статьи
 * есть категория и нет счёта; строка «в сбережения» этот пробел и закрывает.
 */
export function ResultCells({
  band,
  cells,
  money,
  className
}: {
  band: Band;
  cells: PlanFactPoolCells;
  money: (value: number) => string;
  className?: string;
}) {
  const pools = [
    { pool: "main", cell: cells.main },
    { pool: "savings", cell: cells.savings }
  ] as const;

  return (
    <>
      {pools.map(({ pool, cell }, index) => (
        <Cell
          key={pool}
          className={cn("font-semibold", index === 0 && className)}
          column={`result-${pool}`}
        >
          <Figure
            value={cell[band]}
            money={money}
            tone={band === "diff" ? diffTone(cell, true) : undefined}
          />
        </Cell>
      ))}
    </>
  );
}

/**
 * Итог доходов или расходов — в двух колонках, в каждой строке.
 *
 * Раньше делился только факт, а план и разница стояли одной цифрой на обе
 * колонки: у плановой статьи нет счёта, и сказать, в какую группу она пойдёт,
 * было нечем. Теперь план статьи идёт туда, куда её деньги ходят на самом деле
 * (см. planFactPage), и итог делится во всех трёх строках — о чём владелец и
 * просил: «в итогах должно быть разделение для Основных и Сбережений».
 */
export function TotalCells({
  band,
  column,
  pools,
  money,
  goodWhenNegative,
  className,
  onDrill
}: {
  band: Band;
  column: string;
  pools: PlanFactPoolCells;
  money: (value: number) => string;
  /** Расход: меньше плана — хорошо. Доход — наоборот. */
  goodWhenNegative: boolean;
  className?: string;
  onDrill?: (pool: "main" | "savings") => void;
}) {
  const halves = [
    { pool: "main", cell: pools.main },
    { pool: "savings", cell: pools.savings }
  ] as const;

  return (
    <>
      {halves.map(({ pool, cell }, index) => (
        <Cell
          key={pool}
          className={cn("font-semibold", index === 0 && className)}
          column={`${column}-${pool}`}
        >
          {band === "fact" && onDrill ? (
            <DrillFigure value={cell.fact} money={money} onOpen={() => onDrill(pool)} />
          ) : (
            <Figure
              value={cell[band]}
              money={money}
              tone={band === "diff" ? diffTone(cell, goodWhenNegative) : undefined}
            />
          )}
        </Cell>
      ))}
    </>
  );
}

/**
 * A fact figure that opens the operations behind it.
 *
 * A zero is left as plain text: there is nothing under it to show, and a button
 * that opens an empty list teaches the owner not to press the others.
 */
export function DrillFigure({
  value,
  money,
  onOpen
}: {
  value: number;
  money: (value: number) => string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  if (value === 0) return <Figure value={value} money={money} />;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={t("drill.open")}
      className="tap-target rounded underline decoration-dotted underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Figure value={value} money={money} />
    </button>
  );
}

export function Cell({
  children,
  className,
  column,
  colSpan,
  title
}: {
  children: ReactNode;
  className?: string;
  column?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      data-column={column}
      colSpan={colSpan}
      title={title}
      className={cn("num whitespace-nowrap border-b px-3 py-1.5 text-right", className)}
    >
      {children}
    </td>
  );
}

// Zeros are kept rather than blanked — in a table this wide an empty cell reads
// as a hole — but they step back so the money stands out.
export function Figure({
  value,
  money,
  tone
}: {
  value: number;
  money: (value: number) => string;
  tone?: string;
}) {
  return (
    <span className={cn(value === 0 ? "text-muted-foreground/50" : tone)}>{money(value)}</span>
  );
}

// A gap only means something when there was a plan to miss; without one the
// figure is just "everything you spent", and colouring it red would be a
// verdict on a decision never made. Earning less than planned is the bad
// direction, so income reads the opposite way to spending.
export function diffTone(cell: PlanFactCell, goodWhenNegative: boolean): string {
  if (cell.plan === 0 || cell.diff === 0) return "text-muted-foreground";
  const good = goodWhenNegative ? cell.diff < 0 : cell.diff > 0;
  return good ? "text-success" : "text-destructive";
}

// A plan cell is a plain number until it is clicked, and a money field with a
// calculator once it is. Keeping hundreds of live fields on screen would cost
// what a grid this wide cannot afford on a phone; one at a time is all the
// typing anyone does anyway.
export function PlanCell({
  value,
  money,
  onSave,
  align = "right"
}: {
  value: number;
  money: (value: number) => string;
  onSave: (amount: number) => void;
  /** В сетке цифры стоят по правому краю, в карточке телефона — у подписи. */
  align?: "left" | "right";
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  // The calculator lives in a dialog, so opening it takes focus out of the
  // field. Without this the cell would close under its own calculator.
  const [calculating, setCalculating] = useState(false);
  // Applying a calculator result changes the draft and closes the dialog in one
  // handler, so the close callback still sees the value from before the sum —
  // and committed that, throwing the result away. The ref always holds what the
  // field holds now.
  const latest = useRef<string | null>(null);

  function edit(next: string) {
    latest.current = next;
    setDraft(next);
  }

  function commit(next: string | null) {
    setDraft(null);
    setCalculating(false);
    latest.current = null;
    if (next === null) return;
    const amount = Number(next.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount === value) return;
    onSave(amount);
  }

  if (draft === null)
    return (
      <button
        type="button"
        onClick={() => edit(value ? String(value) : "")}
        aria-label={t("plan.plan")}
        className={cn(
          "tap-target num w-full rounded px-1 py-0.5 underline decoration-dotted decoration-1 underline-offset-4 hover:bg-accent/10",
          align === "left" ? "text-left" : "text-right",
          value === 0 && "text-muted-foreground/50"
        )}
      >
        {money(value)}
      </button>
    );

  return (
    // The wrapper, not the input, watches focus: the calculator button sits
    // inside it, and tabbing to that button must not count as leaving the cell.
    <div
      className={cn("w-36", align === "right" && "ml-auto")}
      onBlur={(event) => {
        if (calculating) return;
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        commit(latest.current);
      }}
    >
      <AmountInput
        autoFocus
        value={draft}
        onValueChange={edit}
        onCalculatorOpenChange={(open) => {
          setCalculating(open);
          // Closing means the result has been applied (or dismissed); either
          // way the cell is done being edited.
          if (!open) setTimeout(() => commit(latest.current), 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") commit(null);
        }}
        className="h-8 text-right"
        placeholder="0"
        inputMode="decimal"
      />
    </div>
  );
}

export function NoteField({
  initial,
  placeholder,
  onSave,
  className
}: {
  initial: string;
  placeholder: string;
  onSave: (note: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(initial);

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== initial) onSave(draft);
      }}
      placeholder={placeholder}
      maxLength={500}
      className={cn("h-8 w-56 px-2", className)}
    />
  );
}
