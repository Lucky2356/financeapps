import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { AccountService } from "@/lib/vault/account";
import { ServerAccount, SERVER_KEY, type ServerLink } from "@/lib/vault/server-account";

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
const FAST = { iterations: 1 };
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
    await phone.account.create("свой-пароль", FAST);
    await new LocalApiClient(phone.sealed).post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: 12000
    });

    await expect(phone.account.adopt(fromServer!, PASSWORD)).rejects.toThrow(/резервную копию/);
  });

  it("книга первого запуска НАСТОЯЩЕГО приложения подключаться не мешает", async () => {
    // Книгу заводит приложение, а не проверка. Разница здесь стоила выпуска.
    //
    // В 1.35.0 эта проверка была написана так: в хранилище руками клалась
    // книга `{ transactions: [], accounts: [] }` — и она, конечно, проходила.
    // Только такой книги в приложении не бывает. Настоящая заводится с набором
    // категорий по умолчанию, а категории считались записями — и отказ
    // срабатывал на каждом свежем устройстве. Подключить второе устройство
    // стало нельзя вовсе, ровно тем способом, который выпуск и чинил.
    //
    // Поэтому книга здесь материализуется через LocalApiClient: что бы
    // приложение ни насеяло при первом запуске, проверка увидит это же.
    const pc = device();
    await pc.account.create(PASSWORD, FAST);
    const fromServer = await pc.account.vault();

    const phone = device();
    await phone.account.create(PASSWORD, FAST);
    await new LocalApiClient(phone.sealed).get("/accounts");

    await expect(phone.account.adopt(fromServer!, PASSWORD)).resolves.toBeUndefined();
  });

  it("категории по умолчанию записями не считаются", async () => {
    // Тот же случай, но названный прямо: книга первого запуска НЕ пуста.
    const phone = device();
    await phone.account.create(PASSWORD, FAST);
    const book = await new LocalApiClient(phone.sealed).get<{
      categories: unknown[];
    }>("/categories");

    expect(book.categories.length).toBeGreaterThan(0);
  });

  it("путь, который советует само сообщение об отказе, работает", async () => {
    // Отказ говорит: выгрузите копию, очистите данные в настройках, подключитесь
    // заново. Это единственное, что человек может сделать, упёршись в него, —
    // и до сих пор эту дорогу не проверял никто. Стоит ей однажды перестать
    // работать, и отказ превращается в тупик: приложение советует то, что не
    // помогает.
    //
    // Переустановка тут НЕ годится и годиться не может: она заводит книгу
    // заново, вместе с категориями по умолчанию. Помогает именно очистка
    // изнутри приложения — она заводит книгу вообще пустой.
    const pc = device();
    await pc.account.create(PASSWORD, FAST);
    const fromServer = await pc.account.vault();

    const phone = device();
    await phone.account.create("свой-пароль", FAST);
    const app = new LocalApiClient(phone.sealed);
    await app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 12000 });

    await expect(phone.account.adopt(fromServer!, PASSWORD)).rejects.toThrow(/резервную копию/);

    await app.delete("/storage/clear");

    await expect(phone.account.adopt(fromServer!, PASSWORD)).resolves.toBeUndefined();
  });

  it("билет сервера переживает подключение — иначе синхронизация не поднимется", async () => {
    // Поломка, найденная на живой паре устройств, и самая обидная из всех:
    // подключение сносило СОБСТВЕННЫЙ билет, записанный секундой раньше.
    //
    // Порядок такой: signIn кладёт билет, adopt зовёт sealed.clear(), чтобы
    // убрать книгу, запечатанную прежним ключом, — а clear() сносит всё, что не
    // объявлено «не книгой». Билет объявлен не был. Дальше resumeSync не
    // находит привязки и молча отвечает «сервера нет».
    //
    // Снаружи это выглядело так: вход проходит, экран говорит «Устройство
    // подключено к серверу», и не происходит ничего. В журнале службы —
    // POST /auth/login → 200 и ни одного обращения за книгой.
    //
    // Устройство, которое РЕГИСТРИРУЕТСЯ, этого не видело никогда: там adopt не
    // зовут вовсе. Поэтому первый компьютер работал, а второе устройство — нет.
    const pc = device();
    await pc.account.create(PASSWORD, FAST);
    const fromServer = await pc.account.vault();

    const phone = device();
    await phone.account.create(PASSWORD, FAST);

    // Ровно то, что кладёт signIn.
    await phone.disk.setItem<ServerLink>(SERVER_KEY, {
      v: 1,
      base: "https://finance.example",
      login: "lucky",
      token: "билет-от-службы",
      device: "телефон"
    });

    await phone.account.adopt(fromServer!, PASSWORD);

    // Спрашиваем тем же способом, каким спрашивает resumeSync.
    expect(await new ServerAccount(phone.disk).link()).not.toBeNull();
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
