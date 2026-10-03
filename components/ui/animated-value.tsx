"use client";

// Числа, которые меняются у человека на глазах: сумма съезжает к новому
// значению, а не перескакивает, и на миг окрашивается — зелёным, если выросла,
// красным, если уменьшилась. Видно не только «что-то поменялось», но и куда.
//
// AnimatedMoney — для суммы числом. AnimatedValue — для уже готовой строки
// («1 234 ₽», «12 %»): число из неё вынимается, едет, а в конце показывается
// ровно исходная строка — до последнего знака так, как её отформатировал
// хозяин. Спрятанные суммы («•••• ₽») цифр не содержат и показываются как есть.

import { useChangeDirection, useCountUp } from "@/hooks/use-count-up";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

function tint(direction: "up" | "down" | null) {
  return direction === "up" ? "value-up" : direction === "down" ? "value-down" : undefined;
}

export function AnimatedMoney({
  value,
  currency = "RUB",
  className,
  fromZero = false,
  "data-testid": testId
}: {
  value: number;
  currency?: string;
  className?: string;
  fromZero?: boolean;
  "data-testid"?: string;
}) {
  const shown = useCountUp(value, 600, { fromZero });
  const direction = useChangeDirection(value);
  return (
    <span className={cn("tabular-nums", tint(direction), className)} data-testid={testId}>
      {formatCurrency(shown === value ? value : Math.round(shown), currency)}
    </span>
  );
}

/** Первое число в строке: «−12 396,50 ₽» → −12396.5. */
const NUMBER = /-?−?\d[\d\s  ]*(?:[.,]\d+)?/;

export function parseShownNumber(text: string): {
  value: number;
  before: string;
  after: string;
  fraction: number;
} | null {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const raw = match[0];
  const negative = raw.startsWith("-") || raw.startsWith("−");
  const digits = raw.replace(/[^\d.,]/g, "");
  const [whole, part = ""] = digits.split(/[.,]/);
  const value = Number(`${whole}.${part || "0"}`) * (negative ? -1 : 1);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    before: text.slice(0, match.index),
    after: text.slice(match.index + raw.length),
    fraction: part.length
  };
}

export function AnimatedValue({ text, className }: { text: string; className?: string }) {
  const parsed = parseShownNumber(text);
  const target = parsed?.value ?? Number.NaN;
  const shown = useCountUp(target, 600, { fromZero: true });
  const direction = useChangeDirection(target);
  const done = !parsed || !Number.isFinite(shown) || Math.abs(shown - target) < 1e-9;
  const body = done
    ? text
    : `${parsed.before}${new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: parsed.fraction,
        maximumFractionDigits: parsed.fraction
      })
        .format(Math.abs(shown))
        .replace(/^/, shown < 0 ? "−" : "")}${parsed.after}`;
  return <span className={cn(tint(direction), className)}>{body}</span>;
}
