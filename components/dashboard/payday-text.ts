// Слова карточки «До зарплаты»: расписание и заголовок по-человечески.
//
// Отдельно от карточки, чтобы проверки читали ровно то, что видит человек:
// «каждую пятницу», а не «каждый пятница»; «до завтра свободно», а не
// «свободно X — X в день» при одном дне.

import type { PaydayForecast, PaydaySchedule } from "@/lib/analytics/payday";
import { translate, type Locale } from "@/lib/i18n/catalog";
import { countLabel } from "@/lib/i18n/plural";

const tr = (locale: Locale) => (key: string, vars?: Record<string, string | number>) =>
  translate(locale, key, vars);

/** «10-го» / "10th". */
export function paydayOrdinal(day: number, locale: Locale): string {
  const kind = new Intl.PluralRules(locale, { type: "ordinal" }).select(day);
  return tr(locale)(`pay.ord.${kind}`, { n: day });
}

/** «и» между последними — по правилам языка; запятые между прочими. */
function listOf(items: string[], locale: Locale): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
}

/**
 * Расписание словами: «10-го и 25-го числа», «10-го, 20-го числа и в последний
 * день месяца», «каждую пятницу», «каждый день».
 */
export function describePaydaySchedule(schedule: PaydaySchedule, locale: Locale): string {
  const t = tr(locale);
  if (schedule.kind === "daily") return t("pay.everyDay");
  if (schedule.kind === "weekly") return t(`pay.everyWeekday.${schedule.weekday}`);
  const numbers = schedule.days.filter((day): day is number => day !== "last");
  const last = schedule.days.includes("last");
  const ordinals = numbers.map((day) => paydayOrdinal(day, locale));
  if (!last) return t("pay.monthDays", { list: listOf(ordinals, locale) });
  if (numbers.length === 0) return t("pay.lastDay");
  // С последним днём «и» одно — перед ним: «10-го, 25-го числа и в последний».
  return listOf([t("pay.monthDays", { list: ordinals.join(", ") }), t("pay.lastDay")], locale);
}

/**
 * Дата коротко: «9 нояб.», с днём недели — «пт, 16 окт.». Год не нужен —
 * ближайшая зарплата не дальше месяца. День берётся из строки как есть, без
 * часовых поясов.
 */
export function paydayDate(iso: string, locale: Locale, withWeekday = false): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "numeric",
    month: "short",
    ...(withWeekday ? { weekday: "short" as const } : {})
  });
}

/** Сколько дней: «1 день», «22 дня», «30 дней». */
export function paydayDays(count: number, locale: Locale): string {
  const t = tr(locale);
  return countLabel(
    count,
    { one: t("pay.dayWord.one"), few: t("pay.dayWord.few"), many: t("pay.dayWord.many") },
    locale
  );
}

/** Верхняя строка: когда зарплата. */
export function paydayHeadline(
  forecast: Pick<PaydayForecast, "schedule" | "daysLeft">,
  locale: Locale,
  date: string
): string {
  const t = tr(locale);
  if (forecast.schedule.kind === "daily") return t("pay.dailyHead");
  if (forecast.daysLeft === 1) return t("pay.tomorrow", { date });
  return t("pay.until", { days: paydayDays(forecast.daysLeft, locale), date });
}

/**
 * Главная строка: сколько свободно. До зарплаты один день (она завтра или
 * приходит каждый день) — «в день» не пишется: сумма на день и есть вся сумма.
 */
export function paydayMoneyLine(
  forecast: Pick<PaydayForecast, "status" | "free" | "perDay" | "daysLeft">,
  locale: Locale,
  money: (value: number) => string
): string {
  const t = tr(locale);
  const oneDay = forecast.daysLeft === 1;
  if (forecast.status === "short")
    return t(oneDay ? "pay.shortTomorrow" : "pay.short", {
      amount: money(Math.abs(forecast.free))
    });
  return oneDay
    ? t("pay.freeTomorrow", { amount: money(forecast.free) })
    : t("pay.free", { amount: money(forecast.free), perDay: money(forecast.perDay) });
}
