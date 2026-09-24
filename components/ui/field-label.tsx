"use client";

// Подпись поля — и рядом вопросик, если полю есть что объяснить.
//
// Вопросик стоит РЯДОМ с подписью, а не внутри неё. Нажатие внутри <label>
// уходит полю, к которому она привязана: вопросик у «Категории» открывал бы
// заодно и список категорий.

import type { ReactNode } from "react";

import { InfoHint } from "@/components/info-hint";
import { Label } from "@/components/ui/label";

export function FieldLabel({
  htmlFor,
  help,
  children
}: {
  htmlFor?: string;
  /** Зачем это поле и что будет, если его заполнить, — простыми словами. */
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      {help ? <InfoHint text={help} /> : null}
    </div>
  );
}
