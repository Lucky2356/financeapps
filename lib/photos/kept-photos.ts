// Отложенные фото чеков — у операций, которых больше нет.
//
// Фото лежит отдельно от книги (receipt-photo.ts), а копии — местные,
// перед очисткой, файл резервной копии — держат только книгу. Пока фото
// стиралось вместе с операцией, любая копия возвращала операцию со
// скрепкой, но без фото: «Вернуть» местную копию после восстановления
// другой, «Вернуть» после «Очистить все данные» — фото пропадало насовсем.
//
// Класть фото в каждую копию — дорого: четырнадцать ежедневных копий по
// сотне чеков в 200 КБ — это сотни мегабайт одних и тех же снимков. Поэтому
// фото откладывается ОДИН раз — в миг, когда его операция исчезла, — и
// возвращается на место, когда операция с той же отметкой о фото снова
// появилась в книге, каким бы путём она ни вернулась.
//
// Лежит местно (LOCAL_COPY_SUFFIX — служба такие ключи не видит) и не
// дольше, чем нужно: срок, а после него — пока есть копия старше отложенного,
// то есть копия, в которой эта операция ещё жива.

import { LOCAL_COPY_SUFFIX } from "@/lib/storage/SyncingStorageAdapter";
import { isPhotoData, type StoredPhoto } from "@/lib/photos/receipt-photo";

export const KEPT_PHOTO_PREFIX = "financeKeptPhoto_";

/** Сколько отложенное фото ждёт без копии: удалённую операцию, файл копии. */
export const KEPT_PHOTO_DAYS = 30;

type PhotoData = Extract<StoredPhoto, { data: string }>;

export type KeptPhoto = PhotoData & { keptAt: string; until: string };

/** Ключ отложенного фото по ключу самого фото (`photoKey`). */
export function keptPhotoKey(photoKey: string): string {
  return `${KEPT_PHOTO_PREFIX}${photoKey}${LOCAL_COPY_SUFFIX}`;
}

export function keptPhoto(photo: PhotoData, now: Date, days: number): KeptPhoto {
  return {
    data: photo.data,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt,
    keptAt: now.toISOString(),
    until: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  };
}

/** Фото, каким оно лежало до того, как его отложили. */
export function storedPhotoOf(kept: KeptPhoto): PhotoData {
  return { data: kept.data, width: kept.width, height: kept.height, createdAt: kept.createdAt };
}

/**
 * Отложенное больше не нужно: срок вышел и нет копии, снятой раньше, чем
 * его отложили (`oldestCopyAt` — самая старая из живых копий). Копия
 * моложе — уже без этой операции, и фото ей ни к чему.
 */
export function keptPhotoStale(kept: unknown, now: string, oldestCopyAt: string | null): boolean {
  if (!isPhotoData(kept)) return true;
  const { keptAt, until } = kept as Partial<KeptPhoto>;
  if (typeof keptAt !== "string" || typeof until !== "string") return true;
  if (now <= until) return false;
  return !(oldestCopyAt !== null && oldestCopyAt < keptAt);
}
