import { format } from "date-fns";
import { ru } from "date-fns/locale";

import { areAmountsHidden, areKopecksShown } from "@/lib/preferences";
import { dayAsLocalDate } from "@/lib/transactions/date";

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

export function formatCurrency(value: number, currency = "RUB") {
  if (areAmountsHidden()) return hiddenAmount(currency);
  // Копейки — только там, где они есть: «149,90 ₽», но «150 ₽», а не «150,00 ₽».
  const fraction = areKopecksShown() && Math.round(value * 100) % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction
  }).format(withoutNegativeZero(value, fraction));
}

export function formatCompactCurrency(value: number, currency = "RUB") {
  if (areAmountsHidden()) return hiddenAmount(currency);
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(withoutNegativeZero(value, 1));
}

export function formatPercent(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("ru-RU", {
    style: "percent",
    maximumFractionDigits
  }).format(value / 100);
}

// Даты операций хранятся полночью UTC своего дня (см. storedTransactionDate),
// а показывались в местном времени. В Москве это то же число, а в Нью-Йорке
// «2026-09-01T00:00:00Z» — вечер 31 августа: операция на экране уезжала на день
// назад, а каждое сохранение формы и массовая смена категории записывали её
// уже 31-м. Поэтому строка с днём читается как день, а не как момент.
export function formatDate(date: Date | string) {
  return format(dayAsLocalDate(date), "dd MMM yyyy", { locale: ru });
}

export function formatInputDate(date: Date | string) {
  return format(dayAsLocalDate(date), "yyyy-MM-dd");
}

export function formatMonth(date: Date | string) {
  return format(dayAsLocalDate(date), "LLL yyyy", { locale: ru });
}
