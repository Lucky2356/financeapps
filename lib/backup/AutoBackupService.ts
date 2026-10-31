"use client";

import { apiClient } from "@/lib/api/client";
import { listBackupFiles, removeBackupFile, writeBackupFile } from "@/lib/files/app-folder";
import { readMine, writeMine } from "@/lib/storage/mine";
import { DEVICE_ONLY_SUFFIX } from "@/lib/storage/SyncingStorageAdapter";
import { encryptBackupText } from "@/lib/backup/encryption";
import { apiText } from "@/lib/i18n/api-text";
import {
  backupFileName,
  DEFAULT_AUTO_BACKUP,
  selectBackupsToDelete,
  type AutoBackupConfig
} from "@/lib/backup/auto-backup";

const CONFIG_KEY = "auto-backup-config";
const LAST_RUN_KEY = "auto-backup-last-run";

export function loadAutoBackupConfig(): AutoBackupConfig {
  try {
    const raw = readMine(CONFIG_KEY);
    if (raw) return { ...DEFAULT_AUTO_BACKUP, ...(JSON.parse(raw) as Partial<AutoBackupConfig>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_AUTO_BACKUP;
}

export function saveAutoBackupConfig(config: AutoBackupConfig): void {
  try {
    writeMine(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}

export function getLastBackupRun(): string | null {
  try {
    return readMine(LAST_RUN_KEY);
  } catch {
    return null;
  }
}

export function setLastBackupRun(iso: string): void {
  try {
    writeMine(LAST_RUN_KEY, iso);
  } catch {
    /* ignore */
  }
}

/**
 * Пароль к копиям по расписанию — где он лежит и от чего это защищает.
 *
 * Копия по расписанию пишется без человека: при запуске приложения, когда
 * подошёл срок. Спросить пароль в этот момент не у кого, значит, он обязан
 * лежать на устройстве. Лежит он так:
 *
 *   — в хранилище приложения, а не в общих мелочах (readMine): хранилище
 *     запечатано ключом книги, и пароль на диске так же нечитаем, как сами
 *     счета, пока книга заперта;
 *   — под приставкой DEVICE_ONLY_SUFFIX: слой синхронизации такие ключи не
 *     отправляет, на службу и на другие устройства пароль не уезжает;
 *   — у каждого человека свой (хранилище разделено по людям ниже).
 *
 * В резервную копию он тоже не попадает: /backup выгружает документ книги, а
 * не всё хранилище. Копию по-прежнему открывает ТОЛЬКО пароль — на новом
 * устройстве его вводят руками, ключ книги для этого не нужен.
 *
 * ЦЕНА, сказанная честно. Шифрование защищает копию там, куда она уехала: в
 * облачной папке, в переписке, на флешке. От того, кто сидит за ЭТИМ
 * устройством с отпертым приложением, оно не защищает — у него и так все
 * данные на экране, а пароль к копиям лежит рядом. Это то же, что сказано
 * человеку под переключателем.
 */
const PASSWORD_KEY = `autoBackupPassword${DEVICE_ONLY_SUFFIX}`;

// Хранилище берётся при обращении, а не при загрузке модуля — как в
// local-copies.ts: настройки и планировщик тянут этот файл рано, а замку
// незачем собираться ради того, кто копий не шифрует.
async function deviceVault() {
  const { vaultStorage } = await import("@/lib/vault/runtime");
  return vaultStorage;
}

/** Сохранённый на этом устройстве пароль к копиям по расписанию, если он есть. */
export async function loadAutoBackupPassword(): Promise<string | null> {
  const stored = await (await deviceVault()).getItem<string>(PASSWORD_KEY);
  return typeof stored === "string" && stored ? stored : null;
}

/** Запомнить пароль на этом устройстве; null — забыть. */
export async function saveAutoBackupPassword(password: string | null): Promise<void> {
  const vault = await deviceVault();
  if (password) await vault.setItem(PASSWORD_KEY, password);
  else await vault.removeItem(PASSWORD_KEY);
}

// Desktop file IO for scheduled local backups. Writes a timestamped JSON
// snapshot of the full local state into the configured folder and rotates old
// files so only `keep` remain. Files go through the Rust commands in
// lib/files/app-folder.ts, which touch only the app's own backup files.

export async function runAutoBackup(config: AutoBackupConfig): Promise<string | null> {
  if (config.frequency === "off" || !config.folder) return null;
  // Пароль — до выгрузки книги и до записи. Шифрование включено, а пароля нет
  // (стёрли данные, устройство подключили к чужой книге) — копия НЕ пишется
  // открытой молча: человек выбрал, чтобы в папке открытых копий не было.
  const password = config.encrypt ? await loadAutoBackupPassword() : null;
  if (config.encrypt && !password) throw new Error(apiText("api.backup.autoNoPassword"));
  const backup = await apiClient.get("/backup");
  const plain = JSON.stringify({ exportedAt: new Date().toISOString(), backup }, null, 2);
  const payload = password ? await encryptBackupText(plain, password) : plain;
  const name = backupFileName();
  await writeBackupFile(config.folder, name, payload);

  // Rotate: list the folder and delete backups beyond the keep count.
  try {
    const names = await listBackupFiles(config.folder);
    for (const stale of selectBackupsToDelete(names, config.keep)) {
      await removeBackupFile(config.folder, stale).catch(() => {
        /* best-effort rotation */
      });
    }
  } catch {
    /* listing/rotation is best-effort; the fresh backup already succeeded */
  }

  return name;
}
