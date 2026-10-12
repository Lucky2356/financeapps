import { isValid } from "date-fns";

export function parseImportedAmount(raw: unknown) {
  // Выписки пишут одно и то же число четырьмя способами: «1 234,56», «1.234,56»,
  // «1,234.56», «-1 234.56 ₽». Замена первой запятой годилась только для первого;
  // остальные становились NaN, и строка молча выпадала. Поэтому: выбросить всё,
  // кроме цифр и разделителей, а потом решить, какой разделитель десятичный —
  // ПОСЛЕДНИЙ, если за ним одна-две цифры; иначе число целое.
  const text = String(raw ?? "");
  // Бухгалтерская запись «(1 200,00)» — это минус: так расход пишут выгрузки
  // из 1С и Excel. Скобки вычищались вместе с прочим мусором, и списание
  // превращалось в доход на ту же сумму.
  const parenthesised = /\(\s*[\d\s.,]*\d[\d\s.,]*\)/.test(text);
  const cleaned = text
    .replace(/\s/g, "")
    // Типографский минус (‒ – — ―, −) — тоже минус.
    .replace(/[‒-―−]/g, "-")
    .replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const negative = parenthesised || cleaned.startsWith("-") || cleaned.endsWith("-");
  const digits = cleaned.replace(/-/g, "");
  const lastSeparator = Math.max(digits.lastIndexOf("."), digits.lastIndexOf(","));
  const decimals = lastSeparator >= 0 ? digits.length - lastSeparator - 1 : 0;
  const normalized =
    lastSeparator >= 0 && decimals >= 1 && decimals <= 2
      ? `${digits.slice(0, lastSeparator).replace(/[.,]/g, "")}.${digits.slice(lastSeparator + 1)}`
      : digits.replace(/[.,]/g, "");

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Время после даты: «05.10.2026 14:35», «2026-10-05T14:35:00Z». Операция
 * принадлежит дню, а не минуте, поэтому время просто отрезается — и день
 * берётся тот, что написан в файле, даже если рядом стоит пояс.
 */
const TRAILING_TIME = /[\sT,]+\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?$/i;

/** «05.10.2026», «5/10/26» — день впереди, как пишут все российские банки. */
const DAY_FIRST = /^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})$/;
/** «2026-10-05» — ISO. */
const YEAR_FIRST = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * Раньше 1970 года в выписке операций не бывает: такой год — признак того,
 * что дату прочли не так (то самое «0026» из «12.10.26»), и лучше показать
 * строку с ошибкой, чем записать покупку в 1926 год.
 */
const MIN_YEAR = 1970;

/** Местная полночь дня, если такой день есть: 31.02 датой не считается. */
function calendarDate(year: number, month: number, day: number): Date | null {
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function parseImportedDate(raw: unknown) {
  const value = String(raw ?? "")
    .trim()
    .replace(TRAILING_TIME, "");

  // Разбираем сами, а не через `new Date(value)`: тот читает «05.10.2026 14:35»
  // по-американски, как 10 мая, а «25.10.2026 14:35:00» не читает вовсе.
  const dayFirst = DAY_FIRST.exec(value);
  if (dayFirst) {
    const rawYear = Number(dayFirst[3]);
    // «12.10.26» — это 2026-й. date-fns по шаблону «yyyy» отдавал 26-й год
    // нашей эры, а в учёт он попадал уже как 1926-й.
    const year = dayFirst[3].length === 2 ? 2000 + rawYear : rawYear;
    return calendarDate(year, Number(dayFirst[2]), Number(dayFirst[1]));
  }

  const yearFirst = YEAR_FIRST.exec(value);
  if (yearFirst) {
    return calendarDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  }

  // Строку с точками или дробями мы уже разобрали бы выше; если не вышло, это не
  // дата — а `new Date` вывернул бы её в американский порядок «месяц/день».
  // Ему остаются только записи словами вроде «5 Oct 2026».
  if (/[./]/.test(value)) return null;
  const native = new Date(value);
  if (!isValid(native)) return null;
  return calendarDate(native.getFullYear(), native.getMonth() + 1, native.getDate());
}
