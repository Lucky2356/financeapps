import { CATALOGS, translate } from "@/lib/i18n/catalog";
import { displayLocale, intlLocale } from "@/lib/i18n/display-locale";
import { MAX_MONEY } from "@/lib/utils";

/**
 * Сообщение человеку из слоя данных и синхронизации: отказ записи, ошибка
 * пароля, ответ службы. Строки — в словаре catalog-api.ts, ключи с «api.».
 *
 * Язык — тот, на котором сейчас нарисован экран (displayLocale), а не выбор из
 * localStorage (getClientLocale). Отказ показывается тостом или строкой под
 * полем — посреди того самого экрана, и язык у них обязан совпадать. До того
 * как I18nProvider переключил экран, всё ещё по-русски — и сообщение тоже.
 * Вне провайдера (проверки, код без экрана) — русский, ровно как прежде.
 */
export function apiText(key: string, vars?: Record<string, string | number>): string {
  return translate(displayLocale(), key, vars);
}

/**
 * Число для подстановки в сообщение — с разделителями языка экрана: «1 234»
 * по-русски, "1,234" по-английски. Формы слова при нём ({n:…}) понимают оба.
 */
export function apiCount(value: number): string {
  return value.toLocaleString(intlLocale(displayLocale()));
}

/**
 * Отказ суммы вне разумного — один на все проверки, как и MONEY_RANGE_ERROR в
 * lib/utils (тот остаётся русским первоисточником). Предел в словарь не
 * вписан, а подставляется: поменяется MAX_MONEY — поменяется и фраза.
 */
export function moneyRangeText(): string {
  return apiText("api.money.range", { max: MAX_MONEY / 1e9 });
}

type ServerReply = Record<string, unknown>;

/**
 * Что сказала служба, — на языке экрана.
 *
 * Служба отвечает по-русски (поле `error`) и, начиная с этой версии, ставит
 * рядом постоянный код (`code`) и подстановки (`params`). По-русски берутся её
 * собственные слова: они и есть первоисточник, и экран остаётся ровно таким,
 * каким был. На другом языке — перевод по коду из словаря («api.server.<код>»).
 * Код незнакомый (служба новее приложения) или его нет вовсе (служба старее) —
 * её слова как есть: русская фраза лучше, чем ничего. Служба не сказала ничего —
 * запасная фраза самого приложения.
 */
export function serverText(data: ServerReply, fallback: string): string {
  const said = typeof data.error === "string" && data.error ? data.error : null;
  const locale = displayLocale();
  // Код читается только рядом с фразой отказа: у удачных ответов поле «code»
  // бывает своё — например, код связки из POST /pairing.
  if (said && locale !== "ru" && typeof data.code === "string") {
    const key = `api.server.${data.code}`;
    if (CATALOGS[locale][key] !== undefined) return translate(locale, key, paramsOf(data.params));
  }
  return said ?? fallback;
}

/** Подстановки из ответа службы: только строки и числа, остальное — мимо. */
function paramsOf(value: unknown): Record<string, string | number> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const params: Record<string, string | number> = {};
  for (const [name, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number") params[name] = item;
  }
  return params;
}
