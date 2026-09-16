"use client";

// Замок и синхронизация в собранном виде: одно хранилище устройства, слой
// синхронизации над ним, шифрование над ним и одна служба учётной записи на всё
// приложение.
//
// Штуки ровно по одной, и это существенно. Ключ книги живёт в памяти ТОЙ САМОЙ
// обёртки, через которую читает LocalApiClient; заведись их две, экран замка
// отпирал бы одну, а приложение читало бы из другой — и человек, введя верный
// пароль, увидел бы запертую книгу. Поэтому всё создаётся здесь и берётся
// отсюда всеми.
//
// ПОРЯДОК СЛОЁВ — не вкусовщина:
//
//     LocalApiClient
//       └─ EncryptingStorageAdapter   книга шифруется здесь
//            └─ SyncingStorageAdapter и только потом уезжает на сервер
//                 └─ DesktopStorageAdapter
//
// Синхронизация ниже шифрования, поэтому отправить открытую книгу она не может
// физически: открытой книги в том слое нет.

import { DesktopStorageAdapter } from "@/lib/storage/DesktopStorageAdapter";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { HttpSyncTransport } from "@/lib/sync/HttpSyncTransport";
import { mergeBooks } from "@/lib/sync/merge";
import type { SyncTransport } from "@/lib/sync/protocol";
import { AccountService } from "@/lib/vault/account";
import { ConflictStore } from "@/lib/vault/conflicts";
import { ServerAccount } from "@/lib/vault/server-account";

/** Настоящее хранилище устройства — пишет и читает как есть. */
const device = new DesktopStorageAdapter();

/** Оно же, но с отправкой на сервер. Пока не запущено — просто хранилище. */
export const syncStorage = new SyncingStorageAdapter(device);

/** Оно же, но сквозь шифрование. Через него ходит всё приложение. */
export const vaultStorage = new EncryptingStorageAdapter(syncStorage);

/** Завести, отпереть, сменить пароль, восстановиться. */
export const accountService = new AccountService(syncStorage, vaultStorage);

/** Спорные строки, которые ждут решения человека. */
export const conflictStore = new ConflictStore(vaultStorage);

/**
 * Слияние для слоя синхронизации.
 *
 * Живёт здесь, а не внутри слоя, по одной причине: слить две книги можно только
 * открыв их, а ключа в том слое нет и быть не должно. Здесь ключ есть — точнее,
 * есть обёртка, которая умеет открыть и запечатать, не отдавая ключ наружу.
 */
const merge: Merge = async (slot, mine, theirs, base) => {
  const ours = mine ? await vaultStorage.open<Record<string, unknown>>(mine) : {};
  const incoming = await vaultStorage.open<Record<string, unknown>>(theirs);
  const ancestor = base ? await vaultStorage.open<Record<string, unknown>>(base) : null;

  const report = mergeBooks(ancestor, ours, incoming);
  await conflictStore.add(slot, report.conflicts, new Date().toISOString());

  return { body: await vaultStorage.seal(report.state), differs: report.differs };
};

/** Завести запись на своём сервере, войти, выйти. */
export const serverAccount = new ServerAccount(syncStorage);

/**
 * Включает синхронизацию.
 *
 * Отдельным вызовом, а не само собой: без входа синхронизировать не с кем, и
 * приложение обязано работать ровно так же, как работало, — местно и без сети.
 * Пока этот вызов никто не делает, слой синхронизации остаётся обычным
 * хранилищем.
 */
export async function startSync(transport: SyncTransport): Promise<void> {
  await syncStorage.start(transport, merge);
}

/**
 * Поднять синхронизацию, если устройство уже привязано к службе.
 *
 * Возвращает `false`, когда привязки нет, — и это НЕ ошибка, а обычное
 * положение дел у человека, который сервером не пользуется. Приложение местное:
 * отсутствие сервера не должно ни мешать открытию, ни попадать в журнал как
 * сбой.
 */
export async function resumeSync(): Promise<boolean> {
  const link = await serverAccount.link();
  if (!link) return false;
  await startSync(new HttpSyncTransport({ base: link.base, token: link.token }));
  return true;
}

export function stopSync(): void {
  syncStorage.stop();
}
