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
