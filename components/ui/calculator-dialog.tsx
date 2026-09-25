"use client";

import { Delete } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateExpression } from "@/lib/calculator/evaluate";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

// Keypad laid out like a phone's, so muscle memory works. `label` is what the
// key shows; `insert` is what it appends to the expression.
//
// Both decimal separators are here. Typing has always taken either — the
// evaluator turns a comma into a dot before it reads anything — but the keys
// offered only the comma, so the same field answered differently depending on
// whether the number was typed or tapped. A numeric keypad has a dot on it and
// a Russian layout types a comma; whichever hand the owner reaches with, the
// key is on the board.
//
// `span` marks a key that takes two columns. Four rows of four leave three
// cells over for twenty-one keys, and stretching the three keys that are read
// as one wide button anyway — clear, backspace, zero — fills the grid without
// a hole in it.
const KEYS: Array<{
  label: string;
  insert?: string;
  action?: "clear" | "backspace";
  span?: boolean;
}> = [
  { label: "C", action: "clear", span: true },
  { label: "⌫", action: "backspace", span: true },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "%", insert: "%" },
  { label: "÷", insert: "÷" },
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "×", insert: "×" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "−", insert: "−" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "+", insert: "+" },
  { label: "0", insert: "0", span: true },
  { label: ",", insert: "," },
  { label: ".", insert: "." }
];

/** Digits and the two separators — the keys that spell the number itself. */
const NUMBER_KEY = /^[0-9,.]$/;

export function CalculatorDialog({
  initialValue,
  onApply,
  onClose
}: {
  /** Current field value, so the user can carry on from it (e.g. add "×3"). */
  initialValue: string;
  onApply: (value: number) => void;
  /** Закрыть калькулятор, оставив поле как было. */
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const [expression, setExpression] = useState(initialValue);

  const result = evaluateExpression(expression);
  const value = "value" in result ? result.value : null;
  const errorText =
    "error" in result && result.error !== "empty"
      ? t(result.error === "divide-by-zero" ? "calc.error.divideByZero" : "calc.error.syntax")
      : null;

  function press(key: (typeof KEYS)[number]) {
    if (key.action === "clear") return setExpression("");
    if (key.action === "backspace") return setExpression((prev) => prev.slice(0, -1));
    if (key.insert) setExpression((prev) => prev + key.insert);
  }

  function apply() {
    if (value !== null) onApply(value);
  }

  return (
    <DialogContent
      className="sm:max-w-sm"
      // Escape закрывает калькулятор своими силами, а не только через слои
      // Radix: только что открытый диалог встаёт верхним слоем в эффекте, и
      // клавиша, нажатая раньше, не доставалась никому (форма под ним её
      // пропускает — см. components/ui/dialog.tsx). Здесь она ловится на самом
      // калькуляторе, куда бы ни ушли эффекты.
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("calc.title")}</DialogTitle>
        <DialogDescription>{t("calc.desc")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="calc-expression">{t("calc.expression")}</Label>
        <Input
          id="calc-expression"
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          placeholder={t("calc.placeholder")}
          // Not type="number": the whole point is that an expression goes here.
          inputMode="text"
          autoComplete="off"
          className="text-right text-lg tabular-nums"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
        {/* The running result is the reassurance that the expression parsed. */}
        <p
          className={cn(
            "min-h-5 text-right text-sm tabular-nums",
            errorText ? "text-destructive" : "font-semibold"
          )}
          aria-live="polite"
        >
          {errorText ?? (value !== null ? `= ${value}` : "")}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((key) => (
          <Button
            key={key.label}
            type="button"
            variant={key.insert && NUMBER_KEY.test(key.label) ? "outline" : "secondary"}
            // h-12 keeps every key a comfortable tap target on a phone.
            className={cn("h-12 text-base font-medium", key.span && "col-span-2")}
            aria-label={
              key.action === "backspace"
                ? t("calc.backspace")
                : key.action === "clear"
                  ? t("calc.clear")
                  : undefined
            }
            onClick={() => press(key)}
          >
            {key.label === "⌫" ? <Delete className="size-4" /> : key.label}
          </Button>
        ))}
      </div>

      <DialogFooter>
        <Button type="button" onClick={apply} disabled={value === null}>
          {t("calc.apply")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
