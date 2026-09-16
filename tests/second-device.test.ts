import { describe, expect, it } from "vitest";

import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { AccountService } from "@/lib/vault/account";

// Второе устройство: телефон подключается к учётной записи, заведённой на ПК.
//
// Ключ книги придумывается ОДИН раз, на первом устройстве, и лежит в шкатулке,
// завёрнутый паролем. Телефон, пройдя первый запуск, завёл свой собственный —
// и книгой с сервера его не открыть: это разные ключи, и пароль тут ни при чём.
//
// Ровно на этом всё и сломалось вживую: телефон подключался, показывал
// «подключено», а операции с компьютера не появлялись — он скачивал книгу и
// молча не мог её расшифровать. Провод, отдающий шкатулку, был написан; вызвать
// его просто забыли.

const PASSWORD = "общий-пароль-книги";
const BOOK = "localFinanceState_profile-default";

/** Устройство: хранилище, шифрующая обёртка над ним и служба учётной записи. */
function device() {
  const disk = new MemoryStorageAdapter();
  const sealed = new EncryptingStorageAdapter(disk);
  return { disk, sealed, account: new AccountService(disk, sealed) };
}

const operation = { id: "t1", amount: 1250, description: "продукты" };

describe("второе устройство принимает учётную запись", () => {
  it("читает книгу, запечатанную на первом устройстве", async () => {
    // Это и есть та самая проверка: до починки здесь падало расшифрование.
    const pc = device();
    await pc.account.create(PASSWORD);
    await pc.sealed.setItem(BOOK, { schemaVersion: 16, transactions: [operation] });

    // На сервер уезжает запечатанная книга и шкатулка — ровно это служба и хранит.
    const fromServer = await pc.account.vault();
    const onServer = await pc.disk.getItem(BOOK);
    expect(fromServer).not.toBeNull();

    // Телефон: свой первый запуск завёл СВОЙ ключ.
    const phone = device();
    await phone.account.create(PASSWORD);

    await phone.account.adopt(fromServer!, PASSWORD);

    // Книга приезжает с сервера как есть и должна открыться здешним ключом.
    await phone.disk.setItem(BOOK, onServer);
    const read = await phone.sealed.getItem<{ transactions: unknown[] }>(BOOK);

    expect(read?.transactions).toEqual([operation]);
  });

  it("чужой пароль не подходит, и на устройстве не меняется ничего", async () => {
    const pc = device();
    await pc.account.create(PASSWORD);
    const fromServer = await pc.account.vault();

    const phone = device();
    await phone.account.create("свой-пароль");
    const before = await phone.account.vault();

    await expect(phone.account.adopt(fromServer!, "не-тот-пароль")).rejects.toThrow();

    // Шкатулка та же, что была: неудачная попытка не должна ничего портить.
    expect(await phone.account.vault()).toEqual(before);
  });

  it("книгу с записями не затирает, а говорит, что делать", async () => {
    // Приняв шкатулку, устройство теряет прежний ключ — и книга, запечатанная
    // им, становится набором байтов. Поэтому там, где есть что терять, лучше
    // отказать и объяснить, чем сделать молча.
    const pc = device();
    await pc.account.create(PASSWORD);
    const fromServer = await pc.account.vault();

    const phone = device();
    await phone.account.create("свой-пароль");
    await phone.sealed.setItem(BOOK, { schemaVersion: 16, transactions: [operation] });

    await expect(phone.account.adopt(fromServer!, PASSWORD)).rejects.toThrow(/резервную копию/);
  });

  it("пустая книга первого запуска подключаться не мешает", async () => {
    // Она пуста ровно потому, что устройство новое, — то есть именно тогда,
    // когда человек и подключается. Отказывать здесь было бы издевательством.
    const pc = device();
    await pc.account.create(PASSWORD);
    const fromServer = await pc.account.vault();

    const phone = device();
    await phone.account.create(PASSWORD);
    await phone.sealed.setItem(BOOK, { schemaVersion: 16, transactions: [], accounts: [] });

    await expect(phone.account.adopt(fromServer!, PASSWORD)).resolves.toBeUndefined();
  });

  it("прежний ключ с устройства уходит, а не остаётся отпирать пустоту", async () => {
    // Пометка «не спрашивать» помнит ключ. Останься там прежний — следующий
    // запуск отпер бы им книгу с сервера, то есть не отпер бы ничего.
    const pc = device();
    await pc.account.create(PASSWORD);
    const fromServer = await pc.account.vault();

    const phone = device();
    await phone.account.create(PASSWORD);
    await phone.account.unlock(PASSWORD, { remember: true });
    expect(await phone.account.remembered()).toBe(true);

    await phone.account.adopt(fromServer!, PASSWORD);

    expect(await phone.account.remembered()).toBe(false);
  });
});
