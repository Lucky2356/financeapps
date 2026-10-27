// Строки, которые приложение само кладёт в данные человека: стандартные
// категории, «Переводы», имя главной таблицы, профиль «Основной», пример.
//
// Чем они отличаются от строк экрана. Подпись кнопки переводится при каждой
// отрисовке; имя категории — один раз, когда категория заводится, и дальше оно
// принадлежит человеку: он его переименовывает, оно уезжает на другие
// устройства. Поэтому тут два вопроса, а не один:
//
//  • на каком языке завести — на языке интерфейса в эту минуту (dataText);
//  • как потом узнать своё — по ЛЮБОМУ из языков (dataVariants, isDataLabel).
//    Телефон по-английски и ноутбук по-русски ведут одну книгу: «Переводы»,
//    заведённые ноутбуком, телефон обязан найти, а не завести рядом «Transfers».
//
// Почему словарь подключён напрямую, а не через CATALOGS. Английский основной
// словарь подгружается лениво (loadLocale), и первая книга на свежей установке
// может завестись раньше, чем он приедет: категории легли бы по-русски у
// человека с английским интерфейсом — навсегда. Словарь данных маленький, и
// держать его под рукой дешевле, чем зависеть от того, кто успел первым.

import type { Locale, Messages } from "@/lib/i18n/catalog";
import { ru } from "@/lib/i18n/catalog-data";
import { en } from "@/lib/i18n/catalog-data-en";
import { getClientLocale } from "@/lib/i18n/client-locale";

const BOOKS: Record<Locale, Messages> = { ru, en };

/**
 * Строка данных на нужном языке; по умолчанию — на языке интерфейса (тот же
 * выбор, по которому API строит остальные свои строки). Нет перевода — русская,
 * нет и её — сам ключ. `{name}` подставляется из `vars`.
 */
export function dataText(
  key: string,
  locale: Locale = getClientLocale(),
  vars?: Record<string, string | number>
): string {
  const template = BOOKS[locale]?.[key] ?? ru[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

/** Все написания строки данных — по одному на язык, без повторов. */
export function dataVariants(key: string): string[] {
  const variants = Object.values(BOOKS)
    .map((book) => book[key])
    .filter((value): value is string => typeof value === "string" && value !== "");
  return [...new Set(variants)];
}

/** Сравнение имён так, как их сравнивает человек: без регистра, ё = е, без краёв. */
export function labelKey(label: string): string {
  return label.trim().toLowerCase().replace(/ё/g, "е");
}

/** Имя — одно из написаний строки данных, на любом языке. */
export function isDataLabel(label: string | null | undefined, key: string): boolean {
  if (!label) return false;
  const wanted = labelKey(label);
  return dataVariants(key).some((variant) => labelKey(variant) === wanted);
}

/**
 * Ключ строки данных, одно из написаний которой — это имя. Ищется среди ключей
 * с приставкой `prefix` (например, «data.cat.»): «Продукты» и «Groceries» дают
 * один и тот же ключ, и по нему два языка узнают одну категорию.
 */
export function dataKeyOf(label: string | null | undefined, prefix: string): string | null {
  if (!label) return null;
  const wanted = labelKey(label);
  for (const book of Object.values(BOOKS)) {
    for (const [key, value] of Object.entries(book)) {
      if (key.startsWith(prefix) && labelKey(value) === wanted) return key;
    }
  }
  return null;
}
