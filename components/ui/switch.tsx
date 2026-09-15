"use client";

// Переключатель.
//
// Внутри — обычный `<input type="checkbox">`, и это не экономия, а расчёт.
// Родной чекбокс уже умеет то, что у самодельного переключателя приходится
// выписывать руками и всё равно забыть: фокус с клавиатуры, пробел, участие в
// форме, объявление состояния программой чтения с экрана. Атрибут role="switch"
// меняет только то, как его назовут вслух, — «включено» вместо «отмечено».
//
// Сам чекбокс сделан прозрачным и растянут на всю рамку: нажимается он, а
// видимые дорожка и кружок рисуются рядом и следуют за ним через peer-checked.
// Поэтому же тут нет ни одного обработчика мыши.

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <span className={cn("relative inline-flex h-6 w-11 shrink-0 items-center", className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className={cn(
          "h-6 w-11 rounded-full border border-border bg-muted transition-colors",
          "peer-checked:border-primary peer-checked:bg-primary",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0.5 size-5 rounded-full bg-background shadow-sm transition-transform",
          "peer-checked:translate-x-5 peer-checked:bg-primary-foreground"
        )}
      />
    </span>
  );
}
