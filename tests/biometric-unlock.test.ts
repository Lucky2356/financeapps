import { beforeEach, describe, expect, it, vi } from "vitest";

// Вход по отпечатку. Сам отпечаток — дело Android; здесь подменён плагин, и
// проверяется то, что делает приложение: что кладёт, что открывает, когда
// выключается само.

const phone = vi.hoisted(() => ({
  answer: "ok" as "ok" | "cancelled" | "invalidated",
  forgotten: 0
}));

vi.mock("@/lib/vault/biometric", () => ({
  sealWithBiometric: async (secret: string) => ({
    ok: true,
    value: { iv: "iv", data: `запечатано:${secret}` }
  }),
  openWithBiometric: async (sealed: { data: string }) =>
    phone.answer === "ok"
      ? { ok: true, value: sealed.data.replace("запечатано:", "") }
      : { ok: false, why: phone.answer },
  forgetBiometric: async () => {
    phone.forgotten += 1;
  }
}));

import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { AccountService, BIOMETRIC_KEY } from "@/lib/vault/account";

const FAST = { iterations: 1 };
const WORDS = { title: "Вход", cancel: "Отмена" };

async function lockedDevice() {
  const plain = new MemoryStorageAdapter();
  const sealed = new EncryptingStorageAdapter(plain);
  const account = new AccountService(plain, sealed);
  await account.create("пароль", FAST);
  await sealed.setItem("проверка", { сумма: 1200 });
  return { plain, sealed, account };
}

beforeEach(() => {
  phone.answer = "ok";
  phone.forgotten = 0;
});

describe("вход по отпечатку", () => {
  it("включается паролем и отпирает данные без пароля", async () => {
    const { account, sealed } = await lockedDevice();
    expect((await account.enableBiometric("пароль", WORDS)).ok).toBe(true);
    expect(await account.biometricEnabled()).toBe(true);

    sealed.lock();
    expect((await account.unlockWithBiometric(WORDS)).ok).toBe(true);
    expect(await sealed.getItem("проверка")).toEqual({ сумма: 1200 });
  });

  it("с неверным паролем не включается", async () => {
    const { account } = await lockedDevice();
    await expect(account.enableBiometric("не тот", WORDS)).rejects.toThrow();
    expect(await account.biometricEnabled()).toBe(false);
  });

  it("отмена — не ошибка, данные остаются запертыми, вход остаётся включённым", async () => {
    const { account, sealed } = await lockedDevice();
    await account.enableBiometric("пароль", WORDS);
    sealed.lock();
    phone.answer = "cancelled";
    expect(await account.unlockWithBiometric(WORDS)).toEqual({ ok: false, why: "cancelled" });
    expect(sealed.unlocked).toBe(false);
    expect(await account.biometricEnabled()).toBe(true);
  });

  it("отпечатки в телефоне поменялись — вход выключается сам", async () => {
    const { account, sealed, plain } = await lockedDevice();
    await account.enableBiometric("пароль", WORDS);
    sealed.lock();
    phone.answer = "invalidated";
    expect((await account.unlockWithBiometric(WORDS)).ok).toBe(false);
    expect(await plain.getItem(BIOMETRIC_KEY)).toBeNull();
    expect(phone.forgotten).toBe(1);
  });

  it("подключение к чужим данным выключает отпечаток: он запечатал прежний ключ", async () => {
    const { account, plain } = await lockedDevice();
    await account.enableBiometric("пароль", WORDS);
    const other = await lockedDevice();
    const pack = await other.account.pairingPackage("пароль");

    await account.adoptPackage(pack);
    expect(await plain.getItem(BIOMETRIC_KEY)).toBeNull();
    expect(phone.forgotten).toBe(1);
  });

  it("запись под отпечатком не шифруется книгой — иначе ею нечего было бы открыть", async () => {
    const { account, plain } = await lockedDevice();
    await account.enableBiometric("пароль", WORDS);
    expect(await plain.getItem(BIOMETRIC_KEY)).toMatchObject({ iv: "iv" });
  });
});
