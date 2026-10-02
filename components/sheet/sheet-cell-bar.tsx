"use client";

// Строка выбранной клетки — как строка формул в Excel, только словами: чья это
// клетка, что в ней, сколько на самом деле ушло по учёту и что с ней можно
// сделать. Здесь же можно вписать число: полю с подписью новичок доверяет
// больше, чем клетке, которая «вдруг» превращается в поле.

import { ArrowRightToLine, ArrowUpRight, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import type { KeyboardEvent, RefObject } from "react";

import { QUIET_BUTTON } from "@/components/sheet/sheet-types";
import type { SheetFormat, SheetWords } from "@/components/sheet/sheet-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CellBarInfo = {
  /** «Продукты · Сен 2026». */
  title: string;
  /** Итоги считаются сами — вписать в них нельзя. */
  editable: boolean;
  /** Что вписано в клетку сейчас. */
  value: string;
  /** Посчитано само (Остаток из прошлого Итога): число для подсказки. */
  auto: string | null;
  error: string | null;
  /** «= 30 000», если вписана формула. */
  preview: string | null;
  fact: { text: string; delta: string | null; over: boolean } | null;
  href: string | null;
  /** Число итога, когда выбран он. */
  totalValue: string | null;
  /** Текстовый столбец: вписывается слово, а не сумма. */
  text: boolean;
};

export function SheetCellBar({
  words,
  format,
  info,
  draft,
  inputRef,
  onFocus,
  onChange,
  onKeyDown,
  onBlur,
  onFillDown,
  onNextMonth,
  onClear
}: {
  words: SheetWords;
  format: SheetFormat;
  info: CellBarInfo | null;
  draft: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onFocus: () => void;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFillDown: () => void;
  onNextMonth: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2"
      data-testid="sheet-cell-bar"
    >
      {!info ? (
        <p className="text-sm text-muted-foreground">{words.barEmpty}</p>
      ) : (
        <>
          <span className="text-sm font-semibold" data-testid="sheet-cell-title">
            {info.title}
          </span>
          {info.editable ? (
            <Input
              ref={inputRef}
              aria-label={words.barInputLabel}
              className={cn("h-9 w-48", info.text ? "text-left" : "text-right tabular-nums")}
              placeholder={info.auto ?? words.barPlaceholder}
              value={draft ?? info.value}
              onFocus={onFocus}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
            />
          ) : (
            <span className="text-base font-semibold tabular-nums">{info.totalValue}</span>
          )}
          {info.preview ? (
            <span className="text-sm text-muted-foreground tabular-nums">{info.preview}</span>
          ) : null}
          {info.error ? (
            <span className="text-sm text-destructive">
              {format(words.cellError, { error: info.error })}
            </span>
          ) : null}
          {info.auto && !info.value ? (
            <span className="text-xs text-muted-foreground">
              {format(words.barAuto, { value: info.auto })}
            </span>
          ) : null}
          {info.fact ? (
            <span className="text-sm" data-testid="sheet-cell-fact">
              {format(words.barFact, { fact: info.fact.text })}
              {info.fact.delta ? (
                <span
                  className={cn(
                    "ml-1.5 font-medium",
                    info.fact.over ? "text-destructive" : "text-success"
                  )}
                >
                  · {info.fact.delta}
                </span>
              ) : null}
            </span>
          ) : null}
          {info.editable ? (
            <div className="ml-auto flex flex-wrap gap-1">
              {info.href ? (
                <Button asChild size="sm" variant="ghost" className={QUIET_BUTTON}>
                  <Link href={info.href}>
                    <ArrowUpRight className="size-4" />
                    {words.operations}
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={QUIET_BUTTON}
                onClick={onFillDown}
              >
                <ChevronDown className="size-4" />
                {words.fillDown}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={QUIET_BUTTON}
                onClick={onNextMonth}
              >
                <ArrowRightToLine className="size-4" />
                {words.barNextMonth}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={QUIET_BUTTON}
                onClick={onClear}
              >
                <X className="size-4" />
                {words.clear}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
