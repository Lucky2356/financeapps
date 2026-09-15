import { beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { AccountService, DEVICE_KEY, VAULT_KEY } from "@/lib/vault/account";

const FAST = { iterations: 1 };
const BOOK = "localFinanceState_profile-default";

/**
 * Ключ, который служба положила в хранилище. Заглядывать внутрь нехорошо, но
 * проверяемое свойство — именно свойство этого ключа, и снаружи оно ничем
 * другим не видно.
 */
function keyInside(sealed: EncryptingStorageAdapter): CryptoKey {
  return (sealed as unknown as { bookKey: CryptoKey }).bookKey;
}

/** Устройство: настоящее хранилище, обёртка над ним и служба учётной записи. */
function device(plain = new MemoryStorageAdapter()) {
  const sealed = new EncryptingStorageAdapter(plain);
  return { plain, sealed, account: new AccountService(plain, sealed) };
}

/** То, что лежало бы на устройстве у человека, работавшего до появления замка. */
async function withExistingBook() {
  const plain = new MemoryStorageAdapter();
  const client = new LocalApiClient(plain);
  await client.post("/accounts", { name: "Накопительный", type: "SAVINGS", balance: 385000 });
  await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 12000 });
  return device(plain);
}

describe("первый запуск", () => {
  it("на чистом устройстве это первый запуск", async () => {
    const { account } = device();
    expect(await account.state()).toEqual({ status: "fresh" });
  });

  it("заводит шкатулку и выдаёт код восстановления", async () => {
    const { account, plain } = device();
    const { recoveryCode } = await account.create("пароль", FAST);

    expect(recoveryCode.split(" ")).toHaveLength(12);
    expect(await plain.getItem(VAULT_KEY)).toBeTruthy();
  });

  it("сразу после заведения книга открыта, а не заперта", async () => {
    // Человека, только что задавшего пароль, нельзя тут же спрашивать этот
    // пароль. Состояние читалось с диска, а ключ к этому моменту уже лежит в
    // памяти хранилища — и на экране появлялась форма входа.
    const { account, sealed } = device();
    await account.create("пароль", FAST);

    expect(sealed.unlocked).toBe(true);
    expect((await account.state()).status).toBe("unlocked");
  });

  it("сразу после отпирания паролем — тоже открыта", async () => {
    const d = device();
    await d.account.create("пароль", FAST);

    const sealed = new EncryptingStorageAdapter(d.plain);
    const account = new AccountService(d.plain, sealed);
    expect((await account.state()).status).toBe("locked");
    await account.unlock("пароль");
    expect((await account.state()).status).toBe("unlocked");
  });

  it("дважды завести нельзя", async () => {
    const { account } = device();
    await account.create("пароль", FAST);
    await expect(account.create("другой", FAST)).rejects.toThrow(/уже заведена/);
  });
});

describe("книга, которая уже лежала на устройстве", () => {
  it("переживает заведение замка и читается дальше", async () => {
    // Самая опасная точка во всей затее: у человека три года операций, и он
    // задаёт пароль. Потерять тут — значит потерять всё.
    const { account, plain, sealed } = await withExistingBook();
    await account.create("пароль", FAST);

    const after = await new LocalApiClient(sealed).get<{ accounts: Array<{ name: string }> }>(
      "/accounts"
    );
    expect(after.accounts.map((row) => row.name).sort()).toEqual(["Карта", "Накопительный"]);
    expect(await plain.keys()).not.toContain(`${BOOK}:sealing`);
  });

  it("после заведения замка на диске её открытым текстом уже нет", async () => {
    const { account, plain } = await withExistingBook();
    await account.create("пароль", FAST);

    const disk = JSON.stringify(await plain.getItem(BOOK));
    expect(disk).not.toContain("Накопительный");
    expect(disk).toContain("AES-GCM");
  });

  it("запечатывает всё, что лежит, а не только книгу", async () => {
    // Список профилей — тоже данные владельца. Обход хранилища целиком и нужен
    // ради того, чтобы ничего не осталось лежать открытым по забывчивости.
    const { account, plain } = await withExistingBook();
    await new LocalApiClient(plain).post("/profiles/create", {
      name: "Мамин бюджет",
      color: "#f00"
    });
    await account.create("пароль", FAST);

    expect(JSON.stringify(await plain.getItem("profileList"))).not.toContain("Мамин");
  });

  it("шкатулку кладёт последней — оборвись всё раньше, книга остаётся читаемой", async () => {
    // Порядок тут не косметика. Ляг шкатулка первой, а перевод оборвись —
    // приложение считало бы книгу запертой ключом, которого у него нет.
    const { plain } = await withExistingBook();
    const order: string[] = [];
    const watched = Object.create(plain) as MemoryStorageAdapter;
    watched.setItem = async (key: string, value: unknown) => {
      order.push(key);
      return MemoryStorageAdapter.prototype.setItem.call(plain, key, value);
    };
    const sealed = new EncryptingStorageAdapter(watched);
    await new AccountService(watched, sealed).create("пароль", FAST);

    expect(order.at(-1)).toBe(VAULT_KEY);
    expect(order.indexOf(VAULT_KEY)).toBe(order.length - 1);
  });

  it("если запечатанное не читается обратно — исходное не тронуто", async () => {
    // «Записал и понадеялся» здесь недопустимо: человек узнал бы о поломке при
    // следующем запуске, когда возвращать было бы уже нечего.
    const { plain } = await withExistingBook();
    const broken = Object.create(plain) as MemoryStorageAdapter;
    const original = await plain.getItem(BOOK);
    broken.getItem = async <T>(key: string): Promise<T | null> =>
      key.endsWith(":sealing")
        ? null
        : (MemoryStorageAdapter.prototype.getItem.call(plain, key) as Promise<T | null>);

    const sealed = new EncryptingStorageAdapter(broken);
    await expect(new AccountService(broken, sealed).create("пароль", FAST)).rejects.toThrow(
      /не совпало с исходным/
    );

    expect(await plain.getItem(BOOK)).toEqual(original);
    expect(await plain.getItem(VAULT_KEY)).toBeNull();
  });
});

describe("замок и ключ", () => {
  let d: ReturnType<typeof device>;

  beforeEach(async () => {
    d = device();
    await d.account.create("правильный", FAST);
    await new LocalApiClient(d.sealed).post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: 1000
    });
  });

  /** Новый запуск приложения: то же хранилище, но ключа в памяти уже нет. */
  function restart() {
    const sealed = new EncryptingStorageAdapter(d.plain);
    return { sealed, account: new AccountService(d.plain, sealed) };
  }

  it("после перезапуска книга заперта", async () => {
    const next = restart();
    expect((await next.account.state()).status).toBe("locked");
    expect(next.sealed.unlocked).toBe(false);
  });

  it("правильный пароль отпирает, и книга на месте", async () => {
    const next = restart();
    await next.account.unlock("правильный");

    const data = await new LocalApiClient(next.sealed).get<{ accounts: Array<{ name: string }> }>(
      "/accounts"
    );
    expect(data.accounts.map((row) => row.name)).toContain("Карта");
  });

  it("неправильный пароль не отпирает", async () => {
    const next = restart();
    await expect(next.account.unlock("неправильный")).rejects.toThrow(/Не подходит/);
    expect(next.sealed.unlocked).toBe(false);
  });

  it("код восстановления отпирает так же", async () => {
    const fresh = device();
    const { recoveryCode } = await fresh.account.create("забудется", FAST);
    await new LocalApiClient(fresh.sealed).post("/accounts", {
      name: "Вклад",
      type: "SAVINGS",
      balance: 5
    });

    const sealed = new EncryptingStorageAdapter(fresh.plain);
    await new AccountService(fresh.plain, sealed).unlockWithCode(recoveryCode);
    const data = await new LocalApiClient(sealed).get<{ accounts: Array<{ name: string }> }>(
      "/accounts"
    );
    expect(data.accounts.map((row) => row.name)).toContain("Вклад");
  });
});

describe("не спрашивать на этом устройстве", () => {
  it("запомненное устройство открывает книгу без пароля", async () => {
    const d = device();
    await d.account.create("пароль", FAST);
    const sealed = new EncryptingStorageAdapter(d.plain);
    await new AccountService(d.plain, sealed).unlock("пароль", { remember: true });

    const next = new EncryptingStorageAdapter(d.plain);
    const state = await new AccountService(d.plain, next).state();
    expect(state.status).toBe("unlocked");
    expect(next.unlocked).toBe(true);
  });

  it("без галки — спрашивает при каждом запуске", async () => {
    const d = device();
    await d.account.create("пароль", FAST);
    const sealed = new EncryptingStorageAdapter(d.plain);
    await new AccountService(d.plain, sealed).unlock("пароль");

    const next = new EncryptingStorageAdapter(d.plain);
    expect((await new AccountService(d.plain, next).state()).status).toBe("locked");
  });

  it("без галки ключ книги из памяти не достать", async () => {
    // Извлекаемость — цена галки «не спрашивать», и платить её надо только
    // когда галку поставили. Смотрим на ТОТ ключ, который служба положила в
    // хранилище, а не на вызов слоем ниже: спрашивать нижний слой значило бы
    // проверять не то место, где ошибку и сделают.
    const withoutTick = device();
    await withoutTick.account.create("пароль", FAST);
    await withoutTick.account.unlock("пароль");
    await expect(crypto.subtle.exportKey("raw", keyInside(withoutTick.sealed))).rejects.toThrow();

    const withTick = device();
    await withTick.account.create("пароль", FAST);
    await withTick.account.unlock("пароль", { remember: true });
    await expect(crypto.subtle.exportKey("raw", keyInside(withTick.sealed))).resolves.toBeDefined();
  });

  it("«выйти» забывает устройство", async () => {
    const d = device();
    await d.account.create("пароль", FAST);
    await d.account.unlock("пароль", { remember: true });
    expect(await d.account.remembered()).toBe(true);

    await d.account.lock();
    expect(await d.account.remembered()).toBe(false);
    expect(d.sealed.unlocked).toBe(false);
  });

  it("испорченная пометка не запирает человека наглухо — просто спросят пароль", async () => {
    const d = device();
    await d.account.create("пароль", FAST);
    await d.plain.setItem(DEVICE_KEY, { v: 1, bookKey: "не base64 вовсе!!!" });

    const next = new EncryptingStorageAdapter(d.plain);
    const state = await new AccountService(d.plain, next).state();
    expect(state.status).toBe("locked");
    expect(await d.plain.getItem(DEVICE_KEY)).toBeNull();
  });
});

describe("очистка хранилища", () => {
  it("стирает данные, оставляет замок, и книга остаётся читаемой", async () => {
    // Здесь пряталась настоящая поломка. Очистка сносила и шкатулку; ключ
    // оставался в памяти, пустая книга ложилась на диск запечатанной им, а при
    // следующем запуске шкатулки не находилось — приложение считало это первым
    // запуском и запечатывало заново уже запечатанное. Книга переставала
    // открываться чем бы то ни было.
    const d = device();
    await d.account.create("пароль", FAST);
    const client = new LocalApiClient(d.sealed);
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });

    await client.delete("/storage/clear");

    expect(await d.plain.getItem(VAULT_KEY)).toBeTruthy();

    // Новый запуск: замок на месте, пароль подходит, книга читается и пуста.
    const sealed = new EncryptingStorageAdapter(d.plain);
    const account = new AccountService(d.plain, sealed);
    expect((await account.state()).status).toBe("locked");
    await account.unlock("пароль");

    const after = await new LocalApiClient(sealed).get<{ accounts: unknown[] }>("/accounts");
    expect(after.accounts).toEqual([]);
  });

  it("«стереть всё» уносит и шкатулку — для потерявшего оба ключа", async () => {
    const d = device();
    await d.account.create("пароль", FAST);
    await new LocalApiClient(d.sealed).post("/accounts", {
      name: "Карта",
      type: "CASH",
      balance: 1
    });

    await d.account.forgetEverything();

    expect(await d.plain.keys()).toEqual([]);
    expect(d.sealed.unlocked).toBe(false);
    // Следующий запуск — снова первый: можно завести замок заново.
    const sealed = new EncryptingStorageAdapter(d.plain);
    const account = new AccountService(d.plain, sealed);
    expect((await account.state()).status).toBe("fresh");
    await expect(account.create("новый пароль", FAST)).resolves.toBeDefined();
  });
});

describe("смена пароля и восстановление", () => {
  it("новый пароль отпирает, старый — нет, книга та же", async () => {
    const d = device();
    await d.account.create("старый", FAST);
    await new LocalApiClient(d.sealed).post("/accounts", {
      name: "Копилка",
      type: "CASH",
      balance: 700
    });

    await d.account.changePassword("старый", "новый");

    const sealed = new EncryptingStorageAdapter(d.plain);
    const account = new AccountService(d.plain, sealed);
    await expect(account.unlock("старый")).rejects.toThrow(/Не подходит/);
    await account.unlock("новый");

    const data = await new LocalApiClient(sealed).get<{ accounts: Array<{ name: string }> }>(
      "/accounts"
    );
    expect(data.accounts.map((row) => row.name)).toContain("Копилка");
  });

  it("книга при смене пароля не перешифровывается", async () => {
    // Ради этого ключ книги и заворачивается отдельно: меняются тридцать два
    // байта шкатулки, а сама книга на диске остаётся байт в байт прежней.
    const d = device();
    await d.account.create("старый", FAST);
    await new LocalApiClient(d.sealed).post("/accounts", {
      name: "Карта",
      type: "CASH",
      balance: 1
    });

    const before = JSON.stringify(await d.plain.getItem(BOOK));
    await d.account.changePassword("старый", "новый");
    expect(JSON.stringify(await d.plain.getItem(BOOK))).toBe(before);
  });

  it("забытый пароль чинится кодом, и книга остаётся читаемой", async () => {
    const d = device();
    const { recoveryCode } = await d.account.create("забытый", FAST);
    await new LocalApiClient(d.sealed).post("/accounts", {
      name: "Три года записей",
      type: "CASH",
      balance: 42
    });

    const sealed = new EncryptingStorageAdapter(d.plain);
    const account = new AccountService(d.plain, sealed);
    await account.resetPassword(recoveryCode, "новый");

    const data = await new LocalApiClient(sealed).get<{ accounts: Array<{ name: string }> }>(
      "/accounts"
    );
    expect(data.accounts.map((row) => row.name)).toContain("Три года записей");
    expect(sealed.unlocked).toBe(true);
  });

  it("код восстановления переживает смену пароля", async () => {
    const d = device();
    const { recoveryCode } = await d.account.create("первый", FAST);
    await d.account.changePassword("первый", "второй");
    await d.account.changePassword("второй", "третий");

    const sealed = new EncryptingStorageAdapter(d.plain);
    await expect(
      new AccountService(d.plain, sealed).unlockWithCode(recoveryCode)
    ).resolves.toBeUndefined();
  });
});
