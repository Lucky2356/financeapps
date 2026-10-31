// Scheduled local backups (desktop). On app start the automation runner checks
// whether a backup is due and, if so, writes a timestamped JSON snapshot of the
// full local state into a user-chosen folder, then rotates old files. The pure
// helpers below are unit-tested; the Tauri file IO lives in runAutoBackup.
//
// Папку для копий люди выбирают облачную (Яндекс Диск, Dropbox) — чтобы копия
// пережила компьютер. Поэтому файл можно запереть паролем (`encrypt`), как и
// ручную копию — см. lib/backup/encryption. Имя файла при этом не меняется:
// по нему копии находятся и чистятся. Сам пароль в этих настройках НЕ лежит —
// где он хранится и почему именно там, сказано в AutoBackupService.

export type BackupFrequency = "off" | "daily" | "weekly";

export type AutoBackupConfig = {
  frequency: BackupFrequency;
  folder: string | null;
  keep: number;
  /**
   * Запирать ли файлы паролем. Включается только вместе с сохранённым паролем;
   * у настроек, записанных до появления шифрования, поля нет — это «нет».
   */
  encrypt?: boolean;
};

export const DEFAULT_AUTO_BACKUP: AutoBackupConfig = {
  frequency: "off",
  folder: null,
  keep: 7,
  encrypt: false
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_PREFIX = "financeapps-backup-";
const BACKUP_SUFFIX = ".json";

/** True when a backup is due given the schedule and the last run time. */
export function shouldRunAutoBackup(
  frequency: BackupFrequency,
  lastRunIso: string | null,
  now: Date = new Date()
): boolean {
  if (frequency === "off") return false;
  if (!lastRunIso) return true;
  const last = new Date(lastRunIso).getTime();
  if (Number.isNaN(last)) return true;
  const elapsed = now.getTime() - last;
  return frequency === "daily" ? elapsed >= DAY_MS : elapsed >= 7 * DAY_MS;
}

/** Timestamped, sortable backup file name (YYYY-MM-DD-HHmmss). */
export function backupFileName(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
}

export function isBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX);
}

/**
 * Given the backup file names in the folder, returns the ones to delete so that
 * only the newest `keep` remain. Names sort lexicographically by timestamp.
 */
export function selectBackupsToDelete(fileNames: string[], keep: number): string[] {
  const backups = fileNames.filter(isBackupFile).sort((a, b) => b.localeCompare(a));
  return keep <= 0 ? backups : backups.slice(keep);
}
