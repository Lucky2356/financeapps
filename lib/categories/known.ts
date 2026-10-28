// Категории, которые приложение знает в лицо: стандартные, примерные и те,
// что заводит само («Переводы», «Импорт расходов», «Сверка с банком»).
//
// Прежде логика узнавала их по русскому имени: «Развлечения» и «Рестораны» —
// необязательные траты, «Переводы» — не трата вовсе. Книга, заведённая с
// английским интерфейсом, называет их иначе, и всё это молча переставало
// работать. Теперь категория узнаётся по номеру (у стандартных он постоянный)
// или по имени на ЛЮБОМ из языков — так узнаётся и книга, которую ведут два
// устройства с разными языками.

import type { Locale } from "@/lib/i18n/catalog";
import { dataText, isDataLabel } from "@/lib/i18n/data-text";

/** Номер стандартной или примерной категории → ключ её имени в словаре данных. */
export const KNOWN_CATEGORY_KEYS: Readonly<Record<string, string>> = {
  "cat-salary": "data.cat.salary",
  "cat-other-income": "data.cat.otherIncome",
  "cat-freelance": "data.cat.freelance",
  "cat-food": "data.cat.food",
  "cat-transport": "data.cat.transport",
  "cat-utilities": "data.cat.utilities",
  "cat-subscriptions": "data.cat.subscriptions",
  "cat-entertainment": "data.cat.entertainment",
  "cat-restaurants": "data.cat.restaurants",
  "cat-health": "data.cat.health"
};

/** Имя категории приложения на языке `locale`; незнакомый номер — как было. */
export function knownCategoryLabel(id: string, fallback: string, locale?: Locale): string {
  const key = KNOWN_CATEGORY_KEYS[id];
  return key ? dataText(key, locale) : fallback;
}

/**
 * Это та самая категория: по номеру — если она из стандартных, или по имени на
 * любом языке. Имя, переименованное человеком, номер не меняет: «Рестораны»,
 * ставшие «Кафе», остаются необязательной тратой.
 */
export function isKnownCategory(
  category: { id: string; label: string } | null | undefined,
  key: string
): boolean {
  if (!category) return false;
  return KNOWN_CATEGORY_KEYS[category.id] === key || isDataLabel(category.label, key);
}

/** Необязательные траты, кроме подписок (те отмечены флагом): досуг и рестораны. */
export const DISCRETIONARY_CATEGORY_KEYS = ["data.cat.entertainment", "data.cat.restaurants"];

export function isDiscretionaryCategory(
  category: { id: string; label: string; isSubscription?: boolean } | null | undefined
): boolean {
  if (!category) return false;
  if (category.isSubscription) return true;
  return DISCRETIONARY_CATEGORY_KEYS.some((key) => isKnownCategory(category, key));
}
