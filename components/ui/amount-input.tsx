"use client";

import { Calculator } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

import { CalculatorDialog } from "@/components/ui/calculator-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type AmountInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /**
   * Called with the new text whenever the value changes — by typing OR by the
   * calculator. A controlled caller must use this rather than `onChange`,
   * because applying a calculator result is not a DOM event.
   */
  onValueChange?: (value: string) => void;
  /**
   * Told whenever the calculator opens or closes. A caller that commits on blur
   * needs this: opening the calculator moves focus out of the field, and
   * without the warning the field would close under the calculator it just
   * opened (the plan/fact grid, where every cell is edited in place).
   */
  onCalculatorOpenChange?: (open: boolean) => void;
};

/**
 * A money field with a calculator behind a button inside it.
 *
 * Drop-in replacement for `<Input type="number" name="amount" …>`. Works both
 * uncontrolled (`defaultValue`) and controlled (`value` + `onValueChange`);
 * either way `name` is untouched, so every form submits exactly what it did
 * before.
 */
export function AmountInput({
  className,
  value,
  defaultValue,
  onChange,
  onValueChange,
  onCalculatorOpenChange,
  ...props
}: AmountInputProps) {
  const { t } = useI18n();
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue === undefined ? "" : String(defaultValue));
  const [calculatorOpen, setCalculatorOpenState] = useState(false);

  function setCalculatorOpen(open: boolean) {
    setCalculatorOpenState(open);
    onCalculatorOpenChange?.(open);
  }
  const current = controlled ? String(value) : internal;

  function commit(next: string) {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  }

  return (
    // w-full + min-w-0 so the wrapper behaves like the bare Input it replaces,
    // including inside a flex row next to a button.
    <div className="relative w-full min-w-0">
      <Input
        {...props}
        type="number"
        value={current}
        onChange={(event) => {
          commit(event.target.value);
          onChange?.(event);
        }}
        // Room for the button so a long amount never slides under it.
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        aria-label={t("calc.open")}
        title={t("calc.open")}
        onClick={() => setCalculatorOpen(true)}
        className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Calculator className="size-4" />
      </button>

      <Dialog open={calculatorOpen} onOpenChange={setCalculatorOpen}>
        {/* Mounted only while open so each visit starts from the current value. */}
        {calculatorOpen ? (
          <CalculatorDialog
            initialValue={current}
            onApply={(result) => {
              commit(String(result));
              setCalculatorOpen(false);
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
