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
import type { Locale } from "@/lib/i18n/catalog";
import { displayLocale, intlLocale } from "@/lib/i18n/display-locale";
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

/**
 * Первое число в строке: «−12 396,50 ₽» → −12396.5, «-₽1,234.50» → −1234.5.
 *
 * Разделители — по языку экрана. По-русски тысячи отделяются пробелом, а
 * дробь — запятой; по-английски тысячи — запятой, дробь — точкой. Русское
 * правило на «₽1,234.50» читало «1,234» как одну целую и двести тридцать
 * четыре тысячных. Минус по-английски стоит перед знаком валюты, а не перед
 * цифрами — его ищем и там.
 */
const NUMBER: Record<Locale, RegExp> = {
  ru: /-?−?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?/,
  en: /-?−?\d[\d,]*(?:\.\d+)?/
};

export function parseShownNumber(
  text: string,
  locale: Locale = displayLocale()
): {
  value: number;
  before: string;
  after: string;
  fraction: number;
  /** Минус стоял в самом начале строки, до знака валюты: «-₽1,234». */
  signFirst: boolean;
} | null {
  const match = NUMBER[locale].exec(text);
  if (!match) return null;
  const raw = match[0];
  let before = text.slice(0, match.index);
  // «-₽1,234» — минус отделён от цифр знаком валюты.
  const signFirst = /^[-−]/.test(before) && !/\d/.test(before);
  if (signFirst) before = before.slice(1);
  const negative = signFirst || raw.startsWith("-") || raw.startsWith("−");
  const decimal = locale === "en" ? "." : /[.,]/;
  const digits = raw.replace(locale === "en" ? /[^\d.]/g : /[^\d.,]/g, "");
  const [whole, part = ""] = digits.split(decimal);
  const value = Number(`${whole}.${part || "0"}`) * (negative ? -1 : 1);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    before,
    after: text.slice(match.index + raw.length),
    fraction: part.length,
    signFirst
  };
}

export function AnimatedValue({ text, className }: { text: string; className?: string }) {
  const locale = displayLocale();
  const parsed = parseShownNumber(text, locale);
  const target = parsed?.value ?? Number.NaN;
  const shown = useCountUp(target, 600, { fromZero: true });
  const direction = useChangeDirection(target);
  const done = !parsed || !Number.isFinite(shown) || Math.abs(shown - target) < 1e-9;
  const number = done
    ? ""
    : new Intl.NumberFormat(intlLocale(locale), {
        minimumFractionDigits: parsed.fraction,
        maximumFractionDigits: parsed.fraction
      }).format(Math.abs(shown));
  // Минус — там, где он был: «Итог −12 396 ₽», но «−₽1,234».
  const sign = shown < 0 ? "−" : "";
  const body = done
    ? text
    : parsed.signFirst
      ? `${sign}${parsed.before}${number}${parsed.after}`
      : `${parsed.before}${sign}${number}${parsed.after}`;
  return <span className={cn(tint(direction), className)}>{body}</span>;
}
