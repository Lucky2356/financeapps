import { format } from "date-fns";
import { ru } from "date-fns/locale";

export function formatCurrency(value: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCompactCurrency(value: number, currency = "RUB") {
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
