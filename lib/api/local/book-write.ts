// Книга на пути к записи: копия для правки (writableCopy — её получает каждая
// запись из кэша) и проверка перед записью на диск (assertStorable — её
// делает save). Чистые функции; кэш и save — в lib/api/LocalApiClient.ts.
// Вынесено из LocalApiClient.

import { localStateSchema } from "@/lib/api/local/schemas";
import { apiText } from "@/lib/i18n/api-text";

/**
 * Книга для записи — без копирования строк.
 *
 * Запись меняет книгу так: подменяет раздел целиком (`state.accounts =
 * state.accounts.map(…)`), добавляет в него строку или переписывает поле
 * раздела-объекта (`state.investments.watchlist = …`). Для этого достаточно
 * свежих разделов и свежих объектов первого уровня; сами строки, которых
 * запись не касалась, остаются общими с кэшем. Раньше книга копировалась
 * целиком (structuredClone) — на двадцати тысячах операций это ~70 мс на
 * каждое сохранение, и ещё столько же уходило на сличение каждой строки с
 * прежней при отметке времени: копия — всегда «другой» объект. Общие строки
 * отметка узнаёт сразу (row-stamps, decide).
 *
 * Правка строки на месте была бы порчей кэша — вне поставки он заморожен
 * вглубь (freeze-state.ts), и такая правка падает на первом же тесте.
 */
export function writableCopy<T>(state: T): T {
  const copy = { ...(state as Record<string, unknown>) };
  for (const [key, value] of Object.entries(copy)) {
    if (Array.isArray(value)) copy[key] = [...value];
    else if (value !== null && typeof value === "object") copy[key] = { ...value };
  }
  return copy as T;
}

/**
 * Не записывать то, что следующий запуск не прочитает.
 *
 * Запись ничего не проверяла, а чтение проверяет строго — и строку, которую
 * схема не принимает, при следующем запуске молча выбрасывало спасение. Так
 * пропадали операция с меткой длиннее 40 знаков, цель с нулевой суммой,
 * шаблон на «0»: на экране всё было, после перезапуска — нет, а остаток
 * счёта, посчитанный с ними, оставался. Теперь такая запись отвергается
 * сразу, с понятной ошибкой, и в книге остаётся прежнее.
 *
 * Проверяются только строки, правленные этой записью (их отметка — `now`), и
 * всё, что не строки: целиком книга из тысяч операций проверялась бы на
 * каждое нажатие. Без отметок (`now` — null: пример, отмена очистки) —
 * целиком: это редкие записи.
 */
export function assertStorable(next: object, now: string | null): void {
  const probe: Record<string, unknown> = { ...(next as Record<string, unknown>) };
  if (now !== null) {
    for (const [field, value] of Object.entries(probe)) {
      if (!Array.isArray(value)) continue;
      probe[field] = value.filter(
        (row) =>
          typeof row !== "object" ||
          row === null ||
          !("updatedAt" in row) ||
          (row as { updatedAt?: unknown }).updatedAt === now
      );
    }
  }
  const checked = localStateSchema.safeParse(probe);
  if (checked.success) return;
  const where = checked.error.issues[0]?.path.join(".") ?? "";
  throw new Error(apiText("api.save.rejected", { where }));
}
