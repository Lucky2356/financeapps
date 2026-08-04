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
const KEYS: Array<{ label: string; insert?: string; action?: "clear" | "backspace" | "equals" }> = [
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "÷", insert: "÷" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "×", insert: "×" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "−", insert: "−" },
  { label: "0", insert: "0" },
  { label: ",", insert: "," },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "C", action: "clear" },
  { label: "⌫", action: "backspace" },
  { label: "%", insert: "%" },
  { label: "+", insert: "+" }
];

export function CalculatorDialog({
  initialValue,
  onApply
}: {
  /** Current field value, so the user can carry on from it (e.g. add "×3"). */
  initialValue: string;
  onApply: (value: number) => void;
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
    <DialogContent className="sm:max-w-sm">
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
            variant={key.insert && /[0-9,]/.test(key.label) ? "outline" : "secondary"}
            // h-12 keeps every key a comfortable tap target on a phone.
            className="h-12 text-base font-medium"
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
