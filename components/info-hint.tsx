"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Plain-language explanations for finance terms used across the app.
export const FINANCE_TERM_HINTS: Record<string, string> = {
  "Чистый капитал":
    "Всё, чем вы владеете: деньги на счетах + текущая стоимость инвестиций + накопления по целям.",
  "Общий баланс": "Сумма средств на всех активных счетах (без инвестиций и целей).",
  "Свободный остаток": "Доходы минус расходы за текущий месяц — сколько можно отложить или инвестировать.",
  "Норма накоплений": "Доля доходов, которую вы сберегаете. Ориентир — от 15%.",
  "Финансовая подушка":
    "Резерв на накопительных счетах в месяцах ваших средних расходов. Цель — 3–6 месяцев на случай форс-мажора.",
  "Риск-профиль": "Ваша готовность к колебаниям стоимости инвестиций. Влияет на анализ рисков и подбор бумаг."
};

// Lightweight "?" hint with a click-to-open popover. No external popover/tooltip
// dependency — closes on outside click or Escape. Used to explain finance terms.
export function InfoHint({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Пояснение"
        aria-expanded={open}
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-6 z-50 w-60 -translate-x-1/2 rounded-md border bg-popover p-3 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-md"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
