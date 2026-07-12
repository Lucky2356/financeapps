"use client";

import { apiClient } from "@/lib/api/client";
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
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_AUTO_BACKUP, ...(JSON.parse(raw) as Partial<AutoBackupConfig>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_AUTO_BACKUP;
}

export function saveAutoBackupConfig(config: AutoBackupConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}

export function getLastBackupRun(): string | null {
  try {
    return localStorage.getItem(LAST_RUN_KEY);
  } catch {
    return null;
  }
}

export function setLastBackupRun(iso: string): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, iso);
  } catch {
    /* ignore */
  }
}

// Desktop file IO for scheduled local backups. Writes a timestamped JSON
// snapshot of the full local state into the configured folder and rotates old
// files so only `keep` remain. Uses the Tauri fs plugin (desktop only).

function joinPath(folder: string, name: string): string {
  return `${folder.replace(/[\\/]+$/, "")}/${name}`;
}

export async function runAutoBackup(config: AutoBackupConfig): Promise<string | null> {
  if (config.frequency === "off" || !config.folder) return null;
  const fs = await import("@tauri-apps/plugin-fs");

  const backup = await apiClient.get<unknown>("/backup");
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), backup }, null, 2);
  const name = backupFileName();
  await fs.writeTextFile(joinPath(config.folder, name), payload);

  // Rotate: list the folder and delete backups beyond the keep count.
  try {
    const entries = await fs.readDir(config.folder);
    const names = entries
      .map((entry) => entry.name)
      .filter((entryName): entryName is string => typeof entryName === "string");
    for (const stale of selectBackupsToDelete(names, config.keep)) {
      await fs.remove(joinPath(config.folder, stale)).catch(() => {
        /* best-effort rotation */
      });
    }
  } catch {
    /* listing/rotation is best-effort; the fresh backup already succeeded */
  }

  return name;
}
