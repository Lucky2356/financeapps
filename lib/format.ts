import { format } from "date-fns";
import { ru } from "date-fns/locale";

import { areAmountsHidden, areKopecksShown } from "@/lib/preferences";

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

export function formatCurrency(value: number, currency = "RUB") {
  if (areAmountsHidden()) return hiddenAmount(currency);
  // Копейки — только там, где они есть: «149,90 ₽», но «150 ₽», а не «150,00 ₽».
  const fraction = areKopecksShown() && Math.round(value * 100) % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction
  }).format(value);
}

export function formatCompactCurrency(value: number, currency = "RUB") {
  if (areAmountsHidden()) return hiddenAmount(currency);
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatPercent(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("ru-RU", {
    style: "percent",
    maximumFractionDigits
  }).format(value / 100);
}

export function formatDate(date: Date | string) {
  return format(new Date(date), "dd MMM yyyy", { locale: ru });
}

export function formatInputDate(date: Date | string) {
  return format(new Date(date), "yyyy-MM-dd");
}

export function formatMonth(date: Date | string) {
  return format(new Date(date), "LLL yyyy", { locale: ru });
}
