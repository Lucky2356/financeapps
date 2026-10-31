// Фото чеков в хранилище: прочитать, прикрепить, убрать, отложить и вернуть
// отложенное. Фото лежит отдельно от операции — под своим ключом (photoKey), а
// в операции только отметка, где оно (`photo: "synced" | "device"`).
// Вынесено из LocalApiClient; зовётся через StoreContext. Уборку отложенных
// фото (pruneKeptPhotos) см. в local-copies.ts — она смотрит на копии.

import type { LocalState } from "@/lib/api/local/state";
import type { StoreContext } from "@/lib/api/local/store-context";
import { apiText } from "@/lib/i18n/api-text";
import { keptPhoto, keptPhotoKey, storedPhotoOf, type KeptPhoto } from "@/lib/photos/kept-photos";
import {
  isPhotoData,
  PHOTO_MAX_CHARS,
  photoKey,
  type PhotoPlace,
  type StoredPhoto
} from "@/lib/photos/receipt-photo";

export async function readPhoto(ctx: StoreContext, state: LocalState, transactionId: string) {
  const row = state.transactions.find((item) => item.id === transactionId);
  if (!row?.photo) return { photo: null, place: null, missing: false };
  const stored = await ctx.storage.getItem<StoredPhoto>(photoKey(transactionId, row.photo));
  return isPhotoData(stored)
    ? { photo: stored.data, place: row.photo, missing: false }
    : // Отметка есть, а фото нет: его сняли «только на этом устройстве» на
      // другом, или оно ещё едет с сервера.
      { photo: null, place: row.photo, missing: true };
}

export async function attachPhoto(ctx: StoreContext, state: LocalState, body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const transactionId = String(input.transactionId ?? "");
  const row = state.transactions.find((item) => item.id === transactionId);
  if (!row) throw new Error(apiText("api.tx.notFound"));
  const data = String(input.data ?? "");
  if (!data.startsWith("data:image/") || data.length > PHOTO_MAX_CHARS)
    throw new Error(apiText("api.photo.unreadableRetake"));
  const place: PhotoPlace = input.place === "device" ? "device" : "synced";
  // Было фото в другом месте — убрать, чтобы не лежало два.
  if (row.photo && row.photo !== place) await dropPhoto(ctx, transactionId, row.photo);
  const stored: StoredPhoto = {
    data,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    createdAt: new Date().toISOString()
  };
  await ctx.storage.setItem(photoKey(transactionId, place), stored);
  state.transactions = state.transactions.map((item) =>
    item.id === transactionId ? { ...item, photo: place } : item
  );
  await ctx.save(state);
  return { transactionId, place };
}

/**
 * Убрать фото. Синхронизируемое — следом «удалено», а не стиранием: стёртое
 * здесь осталось бы на сервере и на других устройствах (слой синхронизации
 * нарочно не передаёт удаление ключа, см. SyncingStorageAdapter.removeItem).
 */
export async function dropPhoto(
  ctx: StoreContext,
  transactionId: string,
  place: PhotoPlace,
  keepDays?: number
) {
  const key = photoKey(transactionId, place);
  try {
    // `keepDays` — операция исчезла, а не фото убрали руками: отложить его
    // до стирания (kept-photos.ts). Убранное руками («Удалить фото») не
    // откладывается — его человек выбросил сам.
    if (keepDays !== undefined) await keepPhoto(ctx, key, keepDays);
    if (place === "device") await ctx.storage.removeItem(key);
    else if (await ctx.storage.getItem<unknown>(key))
      await ctx.storage.setItem<StoredPhoto>(key, {
        removed: true,
        at: new Date().toISOString()
      });
  } catch {
    /* фото не главное — книга уже записана */
  }
}

/** Отложить фото по ключу `key` перед стиранием (kept-photos.ts). */
async function keepPhoto(ctx: StoreContext, key: string, days: number) {
  const stored = await ctx.storage.getItem<unknown>(key);
  if (!isPhotoData(stored)) return;
  await ctx.storage.setItem<KeptPhoto>(keptPhotoKey(key), keptPhoto(stored, new Date(), days));
}

/**
 * Операции, вернувшиеся в книгу с отметкой о фото, — фото обратно на место.
 *
 * Вернуться операция может многими путями: «Вернуть» местную копию, отмена
 * очистки, восстановление из файла. Ловить каждый незачем — как и при
 * удалении, здесь сличается записанное с прежним: строка с фото, которой
 * прежде не было (или было, но без этого фото), ищет своё отложенное.
 * Фото на месте (приехало с другого устройства) — его и оставляем.
 */
export async function returnKeptPhotos(
  ctx: StoreContext,
  before: ReadonlyArray<{ id: string; photo?: PhotoPlace }>,
  after: ReadonlyArray<{ id: string; photo?: PhotoPlace }>
) {
  const had = new Map<string, PhotoPlace>();
  for (const row of before) if (row.photo) had.set(row.id, row.photo);
  for (const row of after) {
    if (!row.photo || had.get(row.id) === row.photo) continue;
    const key = photoKey(row.id, row.photo);
    try {
      const kept = await ctx.storage.getItem<KeptPhoto>(keptPhotoKey(key));
      if (!isPhotoData(kept)) continue;
      if (!isPhotoData(await ctx.storage.getItem<unknown>(key)))
        await ctx.storage.setItem<StoredPhoto>(key, storedPhotoOf(kept));
      await ctx.storage.removeItem(keptPhotoKey(key));
    } catch {
      /* фото не главное — книга уже записана */
    }
  }
}
