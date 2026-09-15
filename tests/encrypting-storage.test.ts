import { beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import {
  BookLockedError,
  EncryptingStorageAdapter,
  isBookLocked
} from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { createVault } from "@/lib/sync/vault-crypto";

const FAST = { iterations: 1 };

async function bookKey() {
  return (await createVault("пароль", FAST)).bookKey;
}

describe("запираемое хранилище", () => {
  let inner: MemoryStorageAdapter;
  let storage: EncryptingStorageAdapter;

  beforeEach(() => {
    inner = new MemoryStorageAdapter();
    storage = new EncryptingStorageAdapter(inner);
  });

  it("отпертое кладёт и отдаёт то же самое", async () => {
    storage.unlock(await bookKey());
    const book = { accounts: [{ id: "a1", name: "Карта", balance: 1000 }], schemaVersion: 15 };
    await storage.setItem("localFinanceState_profile-default", book);
    expect(await storage.getItem("localFinanceState_profile-default")).toEqual(book);
  });

  it("на диск ложится шифротекст, а не книга", async () => {
    storage.unlock(await bookKey());
    await storage.setItem("localFinanceState_profile-default", {
      accounts: [{ name: "Накопительный счёт", balance: 385000 }]
    });

    const raw = JSON.stringify(await inner.getItem("localFinanceState_profile-default"));
    expect(raw).not.toContain("Накопительный");
    expect(raw).not.toContain("385000");
    expect(raw).toContain("AES-GCM");
  });

  it("запертое отвечает ошибкой, а не пустотой", async () => {
    // Самое важное во всём файле. Пустота значила бы «книги нет» — и приложение
    // завело бы поверх запертой книги новую, пустую. Человек открыл бы его и
    // увидел, что все его счета и операции исчезли.
    storage.unlock(await bookKey());
    await storage.setItem("localFinanceState_profile-default", { accounts: [{ id: "a1" }] });

    storage.lock();
    await expect(storage.getItem("localFinanceState_profile-default")).rejects.toThrow(
      BookLockedError
    );
  });

  it("запертое не даёт и записать", async () => {
    await expect(storage.setItem("localFinanceState_profile-default", { a: 1 })).rejects.toThrow(
      BookLockedError
    );
  });

  it("«заперто» отличимо от «сломалось»", async () => {
    try {
      await storage.getItem("localFinanceState_profile-default");
      expect.unreachable("должно было бросить");
    } catch (error) {
      expect(isBookLocked(error)).toBe(true);
      expect(isBookLocked(new Error("что-то другое"))).toBe(false);
    }
  });

  it("шкатулка читается и запертым — иначе отпирать было бы нечем", async () => {
    await storage.setItem("financeVault", { v: 1, iterations: 600000 });
    expect(await storage.getItem("financeVault")).toEqual({ v: 1, iterations: 600000 });
    expect(await inner.getItem("financeVault")).toEqual({ v: 1, iterations: 600000 });
  });

  it("всё, что не в списке исключений, шифруется само — даже незнакомый ключ", async () => {
    // Правило «шифруем всё, кроме списка» и держится на этом: новый ключ,
    // заведённый когда-нибудь потом, ляжет зашифрованным, даже если про него
    // забудут.
    storage.unlock(await bookKey());
    await storage.setItem("совершенно новый ключ", { тайна: "в кармане" });
    expect(JSON.stringify(await inner.getItem("совершенно новый ключ"))).not.toContain("кармане");
  });

  it("книга, лежавшая открытой, читается как есть", async () => {
    // Так выглядит книга до перевода в запечатанный вид — и так же, если
    // перевод оборвался на полпути. Читать её надо, а не терять.
    await inner.setItem("localFinanceState_profile-default", { accounts: [{ id: "старый" }] });
    storage.unlock(await bookKey());
    expect(await storage.getItem("localFinanceState_profile-default")).toEqual({
      accounts: [{ id: "старый" }]
    });
  });

  it("чужим ключом не открывается", async () => {
    storage.unlock(await bookKey());
    await storage.setItem("localFinanceState_profile-default", { accounts: [] });

    storage.unlock(await bookKey()); // другая книга — другой случайный ключ
    await expect(storage.getItem("localFinanceState_profile-default")).rejects.toThrow(
      /не удалось прочитать/
    );
  });

  it("убрать можно и запертым", async () => {
    storage.unlock(await bookKey());
    await storage.setItem("localFinanceState_profile-default", { accounts: [] });
    storage.lock();

    await expect(storage.removeItem("localFinanceState_profile-default")).resolves.toBeUndefined();
    expect(await inner.getItem("localFinanceState_profile-default")).toBeNull();
  });

  it("очистка стирает книгу, но не шкатулку", async () => {
    // Книга и шкатулка живут и умирают вместе. Снеси очистка заодно и шкатулку,
    // пустая книга легла бы на диск запечатанной ключом, которого при следующем
    // запуске уже не найдут, — и не открылась бы ничем.
    storage.unlock(await bookKey());
    await storage.setItem("financeVault", { v: 1 });
    await storage.setItem("localFinanceState_profile-default", { accounts: [{ id: "a1" }] });
    await storage.setItem("profileList", { profiles: [] });

    await storage.clear();

    expect(await inner.getItem("financeVault")).toEqual({ v: 1 });
    expect(await inner.getItem("localFinanceState_profile-default")).toBeNull();
    expect(await inner.getItem("profileList")).toBeNull();
  });

  it("пустое место остаётся пустым, а не ошибкой", async () => {
    storage.unlock(await bookKey());
    expect(await storage.getItem("чего тут нет")).toBeNull();
  });
});

describe("книга через запертое хранилище", () => {
  it("живой клиент работает поверх шифрования и не замечает его", async () => {
    // Весь смысл этого шва: LocalApiClient не меняется ни на строку.
    const inner = new MemoryStorageAdapter();
    const storage = new EncryptingStorageAdapter(inner);
    storage.unlock(await bookKey());

    const client = new LocalApiClient(storage);
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });
    await client.post("/accounts", { name: "Наличные", type: "CASH", balance: 500 });

    const data = await client.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(data.accounts.map((row) => row.name).sort()).toEqual(["Карта", "Наличные"]);

    // И при этом на диске — шифротекст.
    const onDisk = JSON.stringify(await inner.getItem("localFinanceState_profile-default"));
    expect(onDisk).not.toContain("Наличные");
  });

  it("книга переживает запирание и отпирание тем же ключом", async () => {
    const inner = new MemoryStorageAdapter();
    const storage = new EncryptingStorageAdapter(inner);
    const key = await bookKey();
    storage.unlock(key);

    await new LocalApiClient(storage).post("/accounts", {
      name: "Вклад",
      type: "SAVINGS",
      balance: 250000
    });

    storage.lock();
    storage.unlock(key);

    const after = await new LocalApiClient(storage).get<{ accounts: Array<{ name: string }> }>(
      "/accounts"
    );
    expect(after.accounts.map((row) => row.name)).toContain("Вклад");
  });

  it("имена профилей тоже не лежат открытыми", async () => {
    // Список профилей — это «Личное», «Работа», «Мамин бюджет». Данные
    // владельца, и на диске им открытыми делать нечего.
    const inner = new MemoryStorageAdapter();
    const storage = new EncryptingStorageAdapter(inner);
    storage.unlock(await bookKey());

    const client = new LocalApiClient(storage);
    await client.post("/profiles/create", { name: "Мамин бюджет", color: "#ff0000" });

    expect(JSON.stringify(await inner.getItem("profileList"))).not.toContain("Мамин");
  });
});
