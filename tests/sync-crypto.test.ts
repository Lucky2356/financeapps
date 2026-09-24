import { describe, expect, it } from "vitest";

import { decryptString, encryptString } from "@/lib/sync/crypto";

describe("sync crypto (AES-GCM + PBKDF2)", () => {
  it("round-trips a string with the correct passphrase", async () => {
    const plaintext = JSON.stringify({ hello: "мир", n: 42 });
    const envelope = await encryptString(plaintext, "correct horse");
    expect(envelope).not.toContain("мир"); // ciphertext, not readable
    const decoded = await decryptString(envelope, "correct horse");
    expect(decoded).toBe(plaintext);
  });

  it("fails to decrypt with a wrong passphrase", async () => {
    const envelope = await encryptString("secret", "right-pass");
    await expect(decryptString(envelope, "wrong-pass")).rejects.toThrow();
  });

  it("rejects a corrupt envelope", async () => {
    await expect(decryptString("not json", "x")).rejects.toThrow();
  });

  it("requires a passphrase to encrypt", async () => {
    await expect(encryptString("x", "")).rejects.toThrow();
  });

  it("шифрует теми же 600 000 прогонов, что и основной замок", async () => {
    const envelope = JSON.parse(await encryptString("x", "пароль")) as { iterations: number };
    expect(envelope.iterations).toBe(600_000);
  });

  // Число прогонов берётся из самого файла, а файл лежит в чужом облаке.
  // Подсунутый с миллиардом прогонов вешал бы приложение на расшифровке.
  it("не принимает из файла безумное число прогонов", async () => {
    const envelope = JSON.parse(await encryptString("x", "пароль")) as Record<string, unknown>;
    for (const iterations of [1_000_000_000, 1, -5, 0.5, "600000"]) {
      await expect(
        decryptString(JSON.stringify({ ...envelope, iterations }), "пароль")
      ).rejects.toThrow("Неизвестный формат");
    }
  });
});
