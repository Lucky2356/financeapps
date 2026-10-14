import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/catalog";

/**
 * Язык, на котором экран показывает даты, суммы и проценты, — тот же, на
 * котором он сейчас нарисован.
 *
 * Почему не getClientLocale(). Тот читает выбор прямо из localStorage, и для
 * строк, которые строит API, это верно. Для отрисовки — нет: статическая
 * сборка рисует страницу заранее, без окна, то есть по-русски, и первый кадр
 * в браузере обязан совпасть с ней. I18nProvider ради этого и начинает с
 * русского, а на английский переходит после монтирования. Дата, которая на
 * первом кадре спросила бы localStorage, вышла бы английской среди русского
 * текста — расхождение гидратации. Поэтому язык форматирования ведёт сам
 * I18nProvider, ровно в тот момент, когда меняет язык текста (см. context.tsx).
 *
 * Вне провайдера (проверки, код без экрана) — русский, как и у словаря.
 */
let active: Locale = DEFAULT_LOCALE;

export function displayLocale(): Locale {
  return active;
}

/** Только для I18nProvider — вызывается перед сменой языка в его состоянии. */
export function setDisplayLocale(locale: Locale): void {
  active = locale;
}

/**
 * Тег для Intl. Английский — британский, как и везде в приложении
 * (`locale === "en" ? "en-GB" : "ru-RU"`): «13 Oct 2026», а не «Oct 13».
 */
export function intlLocale(locale: Locale = active): string {
  return locale === "en" ? "en-GB" : "ru-RU";
}
