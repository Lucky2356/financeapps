// Фото чека у операции.
//
// Каждое фото — отдельная запись хранилища, а не поле операции. Книга
// синхронизируется целиком при каждой правке, и десяток чеков по 200 КБ
// превратил бы запись «Кофе 250» в отправку двух мегабайт. Отдельная запись
// уезжает на сервер один раз, когда её сделали, и больше не трогается.
//
// «Только на этом устройстве» — та же запись с приставкой DEVICE_ONLY_SUFFIX:
// слой синхронизации такие ключи не отправляет (см. SyncingStorageAdapter).
// Операция помнит, где её фото, — чтобы на другом устройстве честно сказать
// «фото осталось на телефоне», а не показывать пустую скрепку.

import { DEVICE_ONLY_SUFFIX } from "@/lib/storage/SyncingStorageAdapter";

export type PhotoPlace = "synced" | "device";

/** Что лежит в хранилище. Удалённое — след `removed`, чтобы удаление доехало. */
export type StoredPhoto =
  | { data: string; width: number; height: number; createdAt: string }
  | { removed: true; at: string };

export const PHOTO_PREFIX = "receiptPhoto_";

/** Самая длинная сторона после сжатия. Чек читается, весит 150–250 КБ. */
export const PHOTO_MAX_SIDE = 1280;
export const PHOTO_QUALITY = 0.72;
/** Предел на всякий случай: data-URL больше этого не пишем. */
export const PHOTO_MAX_CHARS = 2_500_000;

export function photoKey(transactionId: string, place: PhotoPlace): string {
  return `${PHOTO_PREFIX}${transactionId}${place === "device" ? DEVICE_ONLY_SUFFIX : ""}`;
}

export function isPhotoData(value: unknown): value is Extract<StoredPhoto, { data: string }> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { data?: unknown }).data === "string" &&
    (value as { data: string }).data.startsWith("data:image/")
  );
}

/** Размер после сжатия: вписать в квадрат PHOTO_MAX_SIDE, не увеличивая. */
export function fitSize(
  width: number,
  height: number,
  max = PHOTO_MAX_SIDE
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Какие фото убрать после записи книги: у операций, которых больше нет.
 * Правка операции (удалить и тут же добавить с тем же id) фото не теряет —
 * сличаются состояния ДО и ПОСЛЕ записи целиком.
 */
export function orphanedPhotos(
  before: ReadonlyArray<{ id: string; photo?: PhotoPlace }> | undefined,
  after: ReadonlyArray<{ id: string }>
): Array<{ id: string; place: PhotoPlace }> {
  if (!before?.length) return [];
  const alive = new Set(after.map((row) => row.id));
  return before
    .filter((row) => row.photo && !alive.has(row.id))
    .map((row) => ({ id: row.id, place: row.photo as PhotoPlace }));
}
