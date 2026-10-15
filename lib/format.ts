import { format } from "date-fns";
import { enGB, ru } from "date-fns/locale";

import type { Locale } from "@/lib/i18n/catalog";
import { displayLocale, intlLocale } from "@/lib/i18n/display-locale";
import { areAmountsHidden, areKopecksShown } from "@/lib/preferences";
import { dayAsLocalDate } from "@/lib/transactions/date";

// Всё здесь показывается на языке экрана: displayLocale() ведёт I18nProvider
// (см. lib/i18n/display-locale.ts — там же, почему не getClientLocale). Язык
// можно передать и явно — последним аргументом, — когда строка строится не для
// текущего экрана.
//
// По-английски знак валюты — узкий и перед числом: «₽1,234.50», «-$12». Без
// narrowSymbol Intl писал бы «RUB 1,234.50», а русский порядок «1 234,50 ₽»
// англоязычному глазу чужой. Русский вывод остаётся прежним до символа.
function currencyOptions(locale: Locale): Intl.NumberFormatOptions {
  return locale === "en" ? { currencyDisplay: "narrowSymbol" } : {};
}

const DATE_FNS_LOCALES = { ru, en: enGB } as const;

/**
 * Сумма вместо цифр — точками, со знаком валюты. Длина одна на все суммы:
 * «•••• ₽» у зарплаты и у кофе, иначе по длине строки читался бы порядок.
 */
function hiddenAmount(currency: string) {
  return `•••• ${currencySign(currency)}`;
}

/** Знак валюты сам по себе: «₽», «$», «€». */
export function currencySign(currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency })
    .format(0)
    .replace(/[\d\s.,]/g, "");
}

/**
 * Ноль, если на экране число всё равно станет нулём. Intl честно пишет знак у
 * −0 и у −0,004 — и остаток долга после копеечной поправки выглядел как
 * «-0 ₽», будто что-то ещё не сходится.
 */
function withoutNegativeZero(value: number, fractionDigits: number) {
  return Math.abs(value) < 0.5 / 10 ** fractionDigits ? 0 : value;
}

export function formatCurrency(value: number, currency = "RUB", locale: Locale = displayLocale()) {
  if (areAmountsHidden()) return hiddenAmount(currency);
  // Копейки — только там, где они есть: «149,90 ₽», но «150 ₽», а не «150,00 ₽».
  const fraction = areKopecksShown() && Math.round(value * 100) % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    ...currencyOptions(locale),
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction
  }).format(withoutNegativeZero(value, fraction));
}

export function formatCompactCurrency(
  value: number,
  currency = "RUB",
  locale: Locale = displayLocale()
) {
  if (areAmountsHidden()) return hiddenAmount(currency);
  const parts = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    ...currencyOptions(locale),
    notation: "compact",
    maximumFractionDigits: 1
  }).formatToParts(withoutNegativeZero(value, 1));
  // Британские данные локали с CLDR 46 пишут «₽1.2m», прежние — «₽1.2M», и
  // одна и та же сумма выглядела бы по-разному в зависимости от версии
  // WebView. По-английски знак порядка всегда заглавный: K, M, B, T.
  return parts
    .map((part) =>
      locale === "en" && part.type === "compact" ? part.value.toUpperCase() : part.value
    )
    .join("");
}

export function formatPercent(
  value: number,
  maximumFractionDigits = 1,
  locale: Locale = displayLocale()
) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits
  }).format(value / 100);
}

// Даты операций хранятся полночью UTC своего дня (см. storedTransactionDate),
// а показывались в местном времени. В Москве это то же число, а в Нью-Йорке
// «2026-09-01T00:00:00Z» — вечер 31 августа: операция на экране уезжала на день
// назад, а каждое сохранение формы и массовая смена категории записывали её
// уже 31-м. Поэтому строка с днём читается как день, а не как момент.
//
// «05 окт. 2026» / «05 Oct 2026».
export function formatDate(date: Date | string, locale: Locale = displayLocale()) {
  return format(dayAsLocalDate(date), "dd MMM yyyy", { locale: DATE_FNS_LOCALES[locale] });
}

export function formatInputDate(date: Date | string) {
  return format(dayAsLocalDate(date), "yyyy-MM-dd");
}

/** «окт. 2026» / «Oct 2026». */
export function formatMonth(date: Date | string, locale: Locale = displayLocale()) {
  return format(dayAsLocalDate(date), "LLL yyyy", { locale: DATE_FNS_LOCALES[locale] });
}
