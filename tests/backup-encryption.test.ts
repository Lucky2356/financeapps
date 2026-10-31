import { describe, expect, it } from "vitest";

import {
  BackupPasswordRequiredError,
  BackupWrongPasswordError,
  ENCRYPTED_BACKUP_FORMAT,
  decryptBackupFile,
  encryptBackupText,
  isEncryptedBackup,
  readBackupFileText
} from "@/lib/backup/encryption";
import { unwrapBackup } from "@/lib/backup/unwrap";

// Файл копии под паролем. Копия лежит в облачной папке или в переписке «самому
// себе», и открытым JSON её прочтёт любой, кто туда доберётся. Здесь — что
// запертый файл узнаётся по обёртке, отпирается только своим паролем и после
// этого ничем не отличается от открытого; и что открытые файлы читаются ровно
// как прежде.

const backup = {
  schemaVersion: 7,
  appVersion: "2.9.0",
  accounts: [{ id: "a1", name: "Карта", balance: 125_000 }],
  transactions: [{ id: "t1", amount: -350, description: "Кофе" }]
};
const plainFile = JSON.stringify({ exportedAt: "2026-10-31T10:00:00.000Z", backup }, null, 2);

describe("копия под паролем", () => {
  it("зашифровать → узнать → расшифровать: тот же документ", async () => {
    const text = await encryptBackupText(plainFile, "correct horse");
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expect(parsed.format).toBe(ENCRYPTED_BACKUP_FORMAT);
    expect(parsed.v).toBe(1);
    expect(isEncryptedBackup(parsed)).toBe(true);
    // В файле не должно остаться ни слова из книги.
    expect(text).not.toContain("Кофе");
    expect(text).not.toContain("125000");

    const opened = await readBackupFileText(text, "correct horse");
    expect(opened).toEqual(JSON.parse(plainFile));
    expect(unwrapBackup(opened)).toEqual(backup);
  });

  it("неверный пароль — внятная ошибка, а не мусор", async () => {
    const text = await encryptBackupText(plainFile, "correct horse");
    await expect(readBackupFileText(text, "wrong horse")).rejects.toBeInstanceOf(
      BackupWrongPasswordError
    );
    // Тот же файл после неудачи открывается верным паролем: повторить можно.
    await expect(readBackupFileText(text, "correct horse")).resolves.toEqual(JSON.parse(plainFile));
  });

  it("запертый файл без пароля — просьба ввести пароль", async () => {
    const text = await encryptBackupText(plainFile, "correct horse");
    await expect(readBackupFileText(text)).rejects.toBeInstanceOf(BackupPasswordRequiredError);
  });

  it("открытый файл читается как прежде, пароль ему не нужен", async () => {
    expect(isEncryptedBackup(JSON.parse(plainFile))).toBe(false);
    await expect(readBackupFileText(plainFile)).resolves.toEqual(JSON.parse(plainFile));
    // Пароль, введённый к открытому файлу, ничего не ломает.
    await expect(readBackupFileText(plainFile, "anything")).resolves.toEqual(JSON.parse(plainFile));
    // Голый документ (кнопка «Скачать копию» без пароля) — тоже.
    await expect(readBackupFileText(JSON.stringify(backup))).resolves.toEqual(backup);
  });

  it("битый JSON — та же SyntaxError, что и раньше", async () => {
    await expect(readBackupFileText("{not json")).rejects.toBeInstanceOf(SyntaxError);
  });

  it("испорченная обёртка — «файл повреждён», а не «неверный пароль»", async () => {
    const broken = {
      format: ENCRYPTED_BACKUP_FORMAT,
      v: 1,
      payload: "not an envelope"
    } as const;
    const failure = await decryptBackupFile(broken, "correct horse").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(BackupWrongPasswordError);
  });

  it("файл более новой версии не принимается за неверный пароль", async () => {
    const text = await encryptBackupText(plainFile, "correct horse");
    const newer = { ...(JSON.parse(text) as Record<string, unknown>), v: 2 };
    const failure = await readBackupFileText(JSON.stringify(newer), "correct horse").catch(
      (e: unknown) => e
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(BackupWrongPasswordError);
  });

  it("без пароля не шифрует", async () => {
    await expect(encryptBackupText(plainFile, "")).rejects.toThrow();
  });
});
