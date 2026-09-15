"use client";

// Замок в собранном виде: одно хранилище устройства, одна обёртка поверх него и
// одна служба учётной записи на всё приложение.
//
// Штуки ровно по одной, и это существенно. Ключ книги живёт в памяти ТОЙ САМОЙ
// обёртки, через которую читает LocalApiClient; заведись их две, экран замка
// отпирал бы одну, а приложение читало бы из другой — и человек, введя верный
// пароль, увидел бы запертую книгу. Поэтому обёртка создаётся здесь и берётся
// отсюда всеми.

import { DesktopStorageAdapter } from "@/lib/storage/DesktopStorageAdapter";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { AccountService } from "@/lib/vault/account";

/** Настоящее хранилище устройства — пишет и читает как есть. */
const device = new DesktopStorageAdapter();

/** Оно же, но сквозь шифрование. Через него ходит всё приложение. */
export const vaultStorage = new EncryptingStorageAdapter(device);

/** Завести, отпереть, сменить пароль, восстановиться. */
export const accountService = new AccountService(device, vaultStorage);
