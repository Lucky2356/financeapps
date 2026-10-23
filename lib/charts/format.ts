import { translate, type Locale } from "@/lib/i18n/catalog";

/**
 * A money label short enough for a chart axis.
 *
 * The axis used to print "220 тыс. ₽", which does not fit the width reserved
 * for it and wrapped onto two lines — every tick on the home screen was broken
 * in half. Ticks are read as magnitudes, not as sums: the currency belongs to
 * the card's title and to the tooltip, so it is left out here and the space
 * goes to the chart.
 */
export function axisMoney(value: number, locale: Locale): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) {
    const millions = value / 1_000_000;
    const digits = magnitude >= 10_000_000 ? 0 : 1;
    return `${trimZero(millions.toFixed(digits), locale)} ${translate(locale, "chart.million")}`;
  }
  if (magnitude >= 1000)
    return `${Math.round(value / 1000)} ${translate(locale, "chart.thousand")}`;
  return String(Math.round(value));
}

function trimZero(text: string, locale: Locale): string {
  const trimmed = text.replace(/[.,]0$/, "");
  return locale === "en" ? trimmed : trimmed.replace(".", ",");
}

/**
 * Месяц «2026-10» — подписью оси: «окт.» / «Oct».
 *
 * График доходов и расходов на главной печатал ключи месяцев как есть —
 * «2026-08 2026-09 2026-10», — а соседний график капитала над ним подписывал
 * те же месяцы словами. Всё, что не похоже на ключ месяца, остаётся как было.
 */
export function axisMonth(value: unknown, locale: Locale): string {
  const text = String(value ?? "");
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return text;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
    locale === "en" ? "en-GB" : "ru-RU",
    { month: "short" }
  );
}

/** Тот же месяц — целиком, для подсказки: «октябрь 2026» / «October 2026». */
export function tooltipMonth(value: unknown, locale: Locale): string {
  const text = String(value ?? "");
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return text;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
    locale === "en" ? "en-GB" : "ru-RU",
    { month: "long", year: "numeric" }
  );
}
