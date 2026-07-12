import { describe, expect, it } from "vitest";

import {
  backupFileName,
  isBackupFile,
  selectBackupsToDelete,
  shouldRunAutoBackup
} from "@/lib/backup/auto-backup";

describe("shouldRunAutoBackup", () => {
  const now = new Date("2026-07-12T10:00:00.000Z");

  it("never runs when off", () => {
    expect(shouldRunAutoBackup("off", null, now)).toBe(false);
  });

  it("runs when there is no previous backup", () => {
    expect(shouldRunAutoBackup("daily", null, now)).toBe(true);
  });

  it("daily: runs after 24h, not before", () => {
    expect(shouldRunAutoBackup("daily", "2026-07-11T09:00:00.000Z", now)).toBe(true);
    expect(shouldRunAutoBackup("daily", "2026-07-12T02:00:00.000Z", now)).toBe(false);
  });

  it("weekly: runs after 7 days, not before", () => {
    expect(shouldRunAutoBackup("weekly", "2026-07-01T10:00:00.000Z", now)).toBe(true);
    expect(shouldRunAutoBackup("weekly", "2026-07-08T10:00:00.000Z", now)).toBe(false);
  });
});

describe("backupFileName / isBackupFile", () => {
  it("produces a sortable, recognizable name", () => {
    const name = backupFileName(new Date(2026, 6, 12, 9, 5, 3));
    expect(name).toBe("financeapps-backup-2026-07-12-090503.json");
    expect(isBackupFile(name)).toBe(true);
    expect(isBackupFile("something-else.json")).toBe(false);
  });
});

describe("selectBackupsToDelete", () => {
  const files = [
    "financeapps-backup-2026-07-10-100000.json",
    "financeapps-backup-2026-07-11-100000.json",
    "financeapps-backup-2026-07-12-100000.json",
    "unrelated.txt"
  ];

  it("keeps the newest N and deletes the rest", () => {
    expect(selectBackupsToDelete(files, 2)).toEqual(["financeapps-backup-2026-07-10-100000.json"]);
  });

  it("deletes nothing when under the limit", () => {
    expect(selectBackupsToDelete(files, 5)).toEqual([]);
  });

  it("ignores non-backup files", () => {
    const toDelete = selectBackupsToDelete(files, 0);
    expect(toDelete).not.toContain("unrelated.txt");
    expect(toDelete).toHaveLength(3);
  });
});
