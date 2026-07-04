"use client";

import { apiClient } from "@/lib/api/client";
import { decryptString, encryptString } from "@/lib/sync/crypto";

// Server-less cross-device sync via a cloud-synced folder (Dropbox / Google
// Drive / OneDrive desktop client). The app writes an encrypted snapshot of the
// full local state into a folder the user picks; the cloud client mirrors it to
// their other machines, which pull it back. Last-write-wins — pull overwrites
// local, push overwrites the cloud copy. Desktop only (needs the Tauri fs API).

const SYNC_FILENAME = "financeapps-sync.enc";

function filePath(folder: string): string {
  return `${folder.replace(/[\\/]+$/, "")}/${SYNC_FILENAME}`;
}

// Opens a native folder picker; returns the chosen path or null if cancelled.
export async function pickSyncFolder(): Promise<string | null> {
  const dialog = await import("@tauri-apps/plugin-dialog");
  const selected = await dialog.open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

// Encrypts the current local state and writes it to the sync folder.
export async function pushToFolder(folder: string, passphrase: string): Promise<void> {
  const backup = await apiClient.get<unknown>("/backup");
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), backup });
  const encrypted = await encryptString(payload, passphrase);
  const fs = await import("@tauri-apps/plugin-fs");
  await fs.writeTextFile(filePath(folder), encrypted);
}

export type PullResult = { exportedAt: string | null };

// Reads and decrypts the snapshot from the sync folder and restores it locally.
export async function pullFromFolder(folder: string, passphrase: string): Promise<PullResult> {
  const fs = await import("@tauri-apps/plugin-fs");
  let encrypted: string;
  try {
    encrypted = await fs.readTextFile(filePath(folder));
  } catch {
    throw new Error(
      "В папке нет файла синхронизации. Сначала выгрузите данные с другого устройства."
    );
  }
  const decoded = await decryptString(encrypted, passphrase);
  const parsed = JSON.parse(decoded) as { exportedAt?: string; backup?: unknown };
  if (!parsed.backup) throw new Error("Файл синхронизации не содержит данных.");
  await apiClient.post("/backup", parsed.backup);
  return { exportedAt: parsed.exportedAt ?? null };
}
