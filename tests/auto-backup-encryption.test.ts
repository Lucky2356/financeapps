import { beforeEach, describe, expect, it, vi } from "vitest";

// Копии по расписанию под паролем. Пишутся без человека — значит, пароль лежит
// на устройстве; здесь — что он лежит там, где синхронизация его не берёт,
// что файл действительно заперт, и что без пароля копия не пишется открытой.

const { stored, written, apiClientMock } = vi.hoisted(() => ({
  stored: new Map<string, unknown>(),
  written: [] as Array<{ folder: string; name: string; content: string }>,
  apiClientMock: { get: vi.fn() }
}));

vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("@/lib/files/app-folder", () => ({
  writeBackupFile: async (folder: string, name: string, content: string) => {
    written.push({ folder, name, content });
  },
  listBackupFiles: async () => [],
  removeBackupFile: async () => undefined
}));
vi.mock("@/lib/vault/runtime", () => ({
  vaultStorage: {
    getItem: async (key: string) => stored.get(key) ?? null,
    setItem: async (key: string, value: unknown) => void stored.set(key, value),
    removeItem: async (key: string) => void stored.delete(key)
  }
}));

import {
  loadAutoBackupPassword,
  runAutoBackup,
  saveAutoBackupPassword
} from "@/lib/backup/AutoBackupService";
import { isBackupFile, type AutoBackupConfig } from "@/lib/backup/auto-backup";
import { isEncryptedBackup, readBackupFileText } from "@/lib/backup/encryption";
import { DEVICE_ONLY_SUFFIX } from "@/lib/storage/SyncingStorageAdapter";

const book = { schemaVersion: 7, transactions: [{ id: "t1", description: "Кофе" }] };
const config: AutoBackupConfig = { frequency: "daily", folder: "/cloud/Backups", keep: 7 };

beforeEach(() => {
  stored.clear();
  written.length = 0;
  apiClientMock.get.mockReset();
  apiClientMock.get.mockResolvedValue(book);
});

describe("копии по расписанию под паролем", () => {
  it("пароль хранится только на устройстве — под приставкой, которую не синхронизируют", async () => {
    await saveAutoBackupPassword("correct horse");
    const keys = [...stored.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0].endsWith(DEVICE_ONLY_SUFFIX)).toBe(true);
    await expect(loadAutoBackupPassword()).resolves.toBe("correct horse");

    await saveAutoBackupPassword(null);
    expect(stored.size).toBe(0);
    await expect(loadAutoBackupPassword()).resolves.toBeNull();
  });

  it("с шифрованием файл заперт и открывается тем же паролем", async () => {
    await saveAutoBackupPassword("correct horse");
    const name = await runAutoBackup({ ...config, encrypt: true });

    expect(written).toHaveLength(1);
    // Имя прежнее — по нему копии находятся и чистятся.
    expect(isBackupFile(written[0].name)).toBe(true);
    expect(written[0].name).toBe(name);
    expect(written[0].content).not.toContain("Кофе");
    expect(isEncryptedBackup(JSON.parse(written[0].content))).toBe(true);
    const opened = (await readBackupFileText(written[0].content, "correct horse")) as {
      backup: unknown;
    };
    expect(opened.backup).toEqual(book);
  });

  it("шифрование включено, а пароля нет — копия не пишется открытой", async () => {
    await expect(runAutoBackup({ ...config, encrypt: true })).rejects.toThrow();
    expect(written).toHaveLength(0);
    expect(apiClientMock.get).not.toHaveBeenCalled();
  });

  it("без шифрования — открытый JSON, как прежде", async () => {
    await runAutoBackup(config);
    expect(written).toHaveLength(1);
    expect((JSON.parse(written[0].content) as { backup: unknown }).backup).toEqual(book);
  });
});
