"use client";

import { apiClient } from "@/lib/api/client";
import { listBackupFiles, removeBackupFile, writeBackupFile } from "@/lib/files/app-folder";
import { readMine, writeMine } from "@/lib/storage/mine";
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

// Desktop file IO for scheduled local backups. Writes a timestamped JSON
// snapshot of the full local state into the configured folder and rotates old
// files so only `keep` remain. Files go through the Rust commands in
// lib/files/app-folder.ts, which touch only the app's own backup files.

export async function runAutoBackup(config: AutoBackupConfig): Promise<string | null> {
  if (config.frequency === "off" || !config.folder) return null;
  const backup = await apiClient.get("/backup");
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), backup }, null, 2);
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
