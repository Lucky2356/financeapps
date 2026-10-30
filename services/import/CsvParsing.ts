import { isValid } from "date-fns";

/**
 * Снять защиту от формул, которую ставит своя же выгрузка (escapeCsvField):
 * «'=…», «'-5% скидка». Апостроф впереди убирается, только если за ним идёт
 * один из знаков, ради которых он и ставился. Без этого выгрузка, загруженная
 * обратно, меняла описания («'-5% скидка») и не узнавала ни одного повтора.
 */
export function unescapeCsvField(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** Целая часть «1», «12», «123» — похожа на первую группу разрядов «1,234». */
const GROUP_HEAD = /^[1-9]\d{0,2}$/;

export function parseImportedAmount(raw: unknown) {
  // Выписки пишут одно и то же число четырьмя способами: «1 234,56», «1.234,56»,
  // «1,234.56», «-1 234.56 ₽». Замена первой запятой годилась только для первого;
  // остальные становились NaN, и строка молча выпадала. Поэтому: выбросить всё,
  // кроме цифр и разделителей, а потом решить, какой разделитель десятичный.
  const text = String(raw ?? "");
  // Бухгалтерская запись «(1 200,00)» — это минус: так расход пишут выгрузки
  // из 1С и Excel. Скобки вычищались вместе с прочим мусором, и списание
  // превращалось в доход на ту же сумму.
  const parenthesised = /\(\s*[\d\s.,]*\d[\d\s.,]*\)/.test(text);
  const compact = text
    .replace(/\s/g, "")
    // Типографский минус и дефисы (‐ ‑ ‒ – — ―, −) — тоже минус.
    .replace(/[‐-―−]/g, "-");
  // «1.2E+3» — так Excel пишет большие и очень малые числа. Буква и плюс
  // вычищались как мусор, и выходило 1,23.
  const exponent = /^([-+]?\d+(?:[.,]\d+)?[eE][-+]?\d+)[^\d]*$/.exec(compact);
  if (exponent) {
    const value = Number(exponent[1].replace(",", "."));
    if (!Number.isFinite(value)) return null;
    return parenthesised ? -Math.abs(value) : value;
  }
  const cleaned = compact.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const negative = parenthesised || cleaned.startsWith("-") || cleaned.endsWith("-");
  // Разделитель по краю — не разделитель: точка из «руб.» и «р.» оставалась
  // последней, за ней ноль цифр, и «1 234,56 руб.» читалось как 123 456.
  const digits = cleaned.replace(/-/g, "").replace(/^[.,]+|[.,]+$/g, "");
  const value = Number(normalizeSeparators(digits));
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Какой разделитель десятичный. Раньше — последний, если за ним одна-две
 * цифры, иначе число целое: «1234.5678» становилось 12 345 678, а
 * «1,234.567» — 1 234 567. Теперь:
 *   * два разных разделителя — десятичный последний («1.234,56», «1,234.567»);
 *   * один и тот же несколько раз — это разряды («1.234.567»), если последняя
 *     группа из трёх цифр; иначе последний — дробь, как и прежде;
 *   * один раз и ровно три цифры за ним — разряды, только если целая часть
 *     похожа на группу разрядов («1,234», «12.500»); «1234.567» и «0,500» — дробь.
 */
function normalizeSeparators(digits: string): string {
  const dot = digits.lastIndexOf(".");
  const comma = digits.lastIndexOf(",");
  if (dot < 0 && comma < 0) return digits;
  const last = Math.max(dot, comma);
  const whole = digits.slice(0, last).replace(/[.,]/g, "");
  const fraction = digits.slice(last + 1);
  const asDecimal = `${whole}.${fraction}`;
  if (dot >= 0 && comma >= 0) return asDecimal;
  const parts = digits.split(digits[last]);
  if (fraction.length !== 3) return asDecimal;
  if (parts.length > 2) return digits.replace(/[.,]/g, "");
  return GROUP_HEAD.test(parts[0]) ? digits.replace(/[.,]/g, "") : asDecimal;
}

/**
 * Время после даты: «05.10.2026 14:35», «2026-10-05T14:35:00Z». Операция
 * принадлежит дню, а не минуте, поэтому время просто отрезается — и день
 * берётся тот, что написан в файле, даже если рядом стоит пояс.
 */
const TRAILING_TIME = /[\sT,]+\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?$/i;

/**
 * «05.10.2026», «5/10/26», «05-10-2026» — день впереди, как пишут все
 * российские банки. Дефис раньше не допускался, и «05-10-2026» уходил в
 * `new Date` — тот читал его по-американски, 10 мая, а «25-10-2026» не читал.
 */
const DAY_FIRST = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/;
/** «2026-10-05» — ISO; «2026/10/05» и «2026.10.05» — так же, год впереди. */
const YEAR_FIRST = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/;
/** «46300» — дата из Excel числом дней (см. parseMonth в lib/sheet/import). */
const EXCEL_SERIAL = /^\d{5}(?:[.,]\d+)?$/;

/**
 * Раньше 1970 года в выписке операций не бывает: такой год — признак того,
 * что дату прочли не так (то самое «0026» из «12.10.26»), и лучше показать
 * строку с ошибкой, чем записать покупку в 1926 год.
 */
const MIN_YEAR = 1970;
/** И позже 2100-го — тоже: «01.01.2150» опечатка, а не будущий платёж. */
const MAX_YEAR = 2100;

/** Местная полночь дня, если такой день есть: 31.02 датой не считается. */
function calendarDate(year: number, month: number, day: number): Date | null {
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31)
    return null;
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

  // Excel отдаёт дату числом дней с 30.12.1899 — `new Date` читал «46300» как
  // 46300-й год. Дробная часть — время, её отбрасываем.
  if (EXCEL_SERIAL.test(value)) {
    const serial = new Date(
      Date.UTC(1899, 11, 30) + Math.trunc(Number(value.replace(",", "."))) * 86_400_000
    );
    return calendarDate(serial.getUTCFullYear(), serial.getUTCMonth() + 1, serial.getUTCDate());
  }
  // Другое голое число — не дата: «12» `new Date` читал как декабрь 2001-го.
  if (/^[-+]?\d+$/.test(value)) return null;

  // Строку с точками или дробями мы уже разобрали бы выше; если не вышло, это не
  // дата — а `new Date` вывернул бы её в американский порядок «месяц/день».
  // Ему остаются только записи словами вроде «5 Oct 2026».
  if (/[./]/.test(value)) return null;
  const native = new Date(value);
  if (!isValid(native)) return null;
  return calendarDate(native.getFullYear(), native.getMonth() + 1, native.getDate());
}
