import type { Locale } from "@/lib/i18n/catalog";

/**
 * Формы слова при числе: «1 строка», «2 строки», «5 строк».
 *
 * По-русски форм три (одна, несколько, много), и выбирается не по «больше
 * одного», а по последним цифрам: 21 строка, 22 строки, 11–14 — строк. По-
 * английски две. Правило берётся у Intl.PluralRules — тем же, что знает
 * браузер, а не самописной таблицей.
 */
export type PluralForms = {
  /** 1, 21, 101 — «строка» / "row". */
  one: string;
  /** 2–4, 22–24 — «строки». Для английского не нужна. */
  few?: string;
  /** 0, 5–20, 25… — «строк» / "rows". */
  many: string;
};

const rules = new Map<string, Intl.PluralRules>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let rule = rules.get(locale);
  if (!rule) {
    rule = new Intl.PluralRules(locale);
    rules.set(locale, rule);
  }
  return rule;
}

/** Только слово: plural(5, forms, "ru") → «строк». */
export function plural(count: number, forms: PluralForms, locale: Locale = "ru"): string {
  // Дробное число («1,5 месяца») по-русски берёт форму «few» не всегда —
  // Intl отвечает «other». Для дробей та же форма, что для 2–4.
  if (!Number.isInteger(count)) return forms.few ?? forms.many;
  const kind = rulesFor(locale).select(Math.abs(count));
  if (kind === "one") return forms.one;
  if (kind === "few") return forms.few ?? forms.many;
  return forms.many;
}

/** Число со словом: countLabel(21, forms, "ru") → «21 строка». */
export function countLabel(
  count: number,
  forms: PluralForms,
  locale: Locale = "ru",
  format: (value: number) => string = (value) => value.toLocaleString(locale)
): string {
  return `${format(count)} ${plural(count, forms, locale)}`;
}

/**
 * Число из подстановки: 5, «5», «2.5», «1 234» (как его отдал toLocaleString).
 * Не число — NaN, и тогда выбирается форма «много».
 *
 * Дробь, которую видно на экране, — дробь, даже если она целая: «1.0» из
 * toFixed(1) читается «1,0 месяца» и "1.0 months", а не «1,0 месяц». По-
 * английски запятая — разделитель тысяч («1,234»), по-русски — дробная.
 */
function countOf(value: string | number | undefined, locale: Locale): number {
  if (typeof value === "number") return value;
  if (value === undefined) return Number.NaN;
  let text = value.replace(/[\s  ]/g, "");
  text = locale === "en" ? text.replace(/,/g, "") : text.replace(",", ".");
  const count = Number(text);
  // Любое нецелое — plural() возьмёт форму дроби; само значение дальше не идёт.
  if (/\.\d+$/.test(text) && Number.isInteger(count)) return count + 0.5;
  return count;
}

/**
 * Формы слова прямо в строке словаря: «{n} {n:строка|строки|строк}»,
 * «{n} {n:row|rows}». Перевод держит слово вместе с фразой, а не в коде, — и
 * падеж у каждой фразы свой: «Импортировать {n} {n:строку|строки|строк}»,
 * «из {total} {total:строки|строк|строк}». Две формы — «одна» и «много»
 * (английский); три — «одна», «несколько», «много» (русский).
 */
const PLURAL = /\{(\w+):([^{}|]*(?:\|[^{}|]*)+)\}/g;

export function pluralizeTemplate(
  template: string,
  vars: Record<string, string | number>,
  locale: Locale
): string {
  return template.replace(PLURAL, (whole, name: string, body: string) => {
    if (!(name in vars)) return whole;
    const words = body.split("|");
    const forms: PluralForms =
      words.length >= 3
        ? { one: words[0], few: words[1], many: words[2] }
        : { one: words[0], many: words[1] };
    const count = countOf(vars[name], locale);
    return Number.isNaN(count) ? forms.many : plural(count, forms, locale);
  });
}
