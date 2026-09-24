import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { NamespacedStorageAdapter } from "@/lib/storage/NamespacedStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { HttpSyncTransport } from "@/lib/sync/HttpSyncTransport";
import { mergeBooks } from "@/lib/sync/merge";
import { isOffline } from "@/lib/sync/protocol";
import { createVault } from "@/lib/sync/vault-crypto";
import { AccountService } from "@/lib/vault/account";
import { ServerAccount, SERVER_KEY, probeServer, redeemPairing } from "@/lib/vault/server-account";
import { createApp, type App } from "../server/src/main.ts";

// Настоящее приложение через настоящий провод в настоящую службу.
//
// Это единственное место, где договор проверяется ЦЕЛИКОМ. Служба написана по
// нему, приложение написано по нему, но между собой они до сих пор нигде не
// встречались: у службы свои проверки, у приложения свои, и обе стороны могут
// разойтись, оставаясь честно зелёными. Разойтись им есть где — коды ответов,
// имена полей, форма отказа. Здесь они наконец встречаются.

const FAST = { iterations: 1 };
const ADMIN = "proverochnyy-propusk";

let app: App;
let base: string;

/** Одно устройство: три слоя хранилища, приложение и провод. */
class Device {
  readonly disk = new MemoryStorageAdapter();
  readonly sync = new SyncingStorageAdapter(this.disk);
  readonly vault = new EncryptingStorageAdapter(this.sync);

  constructor(bookKey: CryptoKey) {
    this.vault.unlock(bookKey);
  }

  get app(): LocalApiClient {
    return new LocalApiClient(this.vault);
  }

  merge: Merge = async (_slot, mine, theirs, ancestor) => {
    const ours = mine ? await this.vault.open<Record<string, unknown>>(mine) : {};
    const incoming = await this.vault.open<Record<string, unknown>>(theirs);
    const base = ancestor ? await this.vault.open<Record<string, unknown>>(ancestor) : null;
    const report = mergeBooks(base, ours, incoming);
    return { body: await this.vault.seal(report.state), differs: report.differs };
  };
}

async function callServer(path: string, body: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return (await response.json()) as Record<string, unknown>;
}

/** Заводит человека на службе так, как это сделает приложение. */
async function signUp(login: string) {
  const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
  const { vault, bookKey } = await createVault("пароль", FAST);
  await callServer("/auth/register", { code, login, vault, secret: "секрет-входа" });
  const session = (await callServer("/auth/login", {
    login,
    secret: "секрет-входа",
    device: "проверка"
  })) as { token: string };
  return { token: session.token, bookKey };
}

/**
 * Устройство, которое заводит книгу САМО — паролем, а не готовым ключом.
 *
 * Отличие от Device выше принципиальное, и именно в него всё и упёрлось.
 * Device получает ключ книги в конструкторе, то есть уже минуя вход: так
 * проверка «два устройства сходятся» обходила ровно тот шаг, который сломался.
 * Здесь ключ берётся оттуда, откуда его берёт человек, — из шкатулки, поднятой
 * паролем.
 */
class Owner {
  readonly disk = new MemoryStorageAdapter();
  readonly sync = new SyncingStorageAdapter(this.disk);
  readonly vault = new EncryptingStorageAdapter(this.sync);
  readonly account = new AccountService(this.sync, this.vault);
  readonly server = new ServerAccount(this.sync);

  get app(): LocalApiClient {
    return new LocalApiClient(this.vault);
  }

  merge: Merge = async (_slot, mine, theirs, ancestor) => {
    const ours = mine ? await this.vault.open<Record<string, unknown>>(mine) : {};
    const incoming = await this.vault.open<Record<string, unknown>>(theirs);
    const base = ancestor ? await this.vault.open<Record<string, unknown>>(ancestor) : null;
    const report = mergeBooks(base, ours, incoming);
    return { body: await this.vault.seal(report.state), differs: report.differs };
  };

  /** То же, что делает resumeSync в приложении. */
  async resume(): Promise<boolean> {
    const link = await this.server.link();
    if (!link) return false;
    await this.sync.start(
      new HttpSyncTransport({ base: link.base, token: link.token }),
      this.merge
    );
    await this.sync.flush();
    return true;
  }
}

/**
 * Человек на ОБЩЕМ диске: та же стопка, что в приложении, с разделением внизу.
 *
 * Отличие от Owner ровно одно и оно же — всё содержание этого набора: диск
 * здесь не свой, а общий, и разделяет людей приставка.
 */
class Housemate {
  readonly space: NamespacedStorageAdapter;
  readonly sync: SyncingStorageAdapter;
  readonly vault: EncryptingStorageAdapter;
  readonly account: AccountService;
  readonly server: ServerAccount;

  constructor(disk: MemoryStorageAdapter, id: string) {
    this.space = new NamespacedStorageAdapter(disk);
    this.space.bind(id);
    this.sync = new SyncingStorageAdapter(this.space);
    this.vault = new EncryptingStorageAdapter(this.sync);
    this.account = new AccountService(this.sync, this.vault);
    this.server = new ServerAccount(this.sync);
  }

  get app(): LocalApiClient {
    return new LocalApiClient(this.vault);
  }

  merge: Merge = async (_slot, mine, theirs, ancestor) => {
    const ours = mine ? await this.vault.open<Record<string, unknown>>(mine) : {};
    const incoming = await this.vault.open<Record<string, unknown>>(theirs);
    const base = ancestor ? await this.vault.open<Record<string, unknown>>(ancestor) : null;
    const report = mergeBooks(base, ours, incoming);
    return { body: await this.vault.seal(report.state), differs: report.differs };
  };

  async resume(): Promise<boolean> {
    const link = await this.server.link();
    if (!link) return false;
    await this.sync.start(
      new HttpSyncTransport({ base: link.base, token: link.token }),
      this.merge
    );
    await this.sync.flush();
    return true;
  }
}

describe("приложение через службу", () => {
  beforeEach(async () => {
    app = createApp({ dbPath: ":memory:", adminToken: ADMIN });
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  it("книга уезжает на службу нечитаемой", async () => {
    const { token, bookKey } = await signUp("петя");
    const phone = new Device(bookKey);
    await phone.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
    await phone.sync.start(new HttpSyncTransport({ base, token }), phone.merge);
    await phone.sync.flush();

    const row = app.db.prepare("select body from books").get<{ body: string }>();
    expect(row?.body).toContain("AES-GCM");
    expect(row?.body).not.toContain("Карта");
  });

  it("два устройства одного человека сходятся через службу", async () => {
    const { token, bookKey } = await signUp("петя");
    const phone = new Device(bookKey);
    const desktop = new Device(bookKey);

    await phone.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
    await phone.sync.start(new HttpSyncTransport({ base, token }), phone.merge);
    await phone.sync.flush();

    await desktop.sync.start(new HttpSyncTransport({ base, token }), desktop.merge);
    await desktop.sync.flush();

    const seen = await desktop.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(seen.accounts.map((row) => row.name)).toContain("Карта");
  });

  it("второе устройство входит паролем и получает книгу первого", async () => {
    // Дорога целиком и ровно та, по которой идёт человек: первый компьютер
    // регистрируется по приглашению и пишет операцию, второе устройство входит
    // ТЕМ ЖЕ именем и паролем с пустым приглашением — и должно увидеть её.
    //
    // Проверка «два устройства сходятся» выше этого не ловит и поймать не может:
    // она выдаёт второму устройству готовый ключ книги, то есть начинает с того
    // места, до которого человек как раз и не доходил.
    //
    // Так на живой паре устройств и вышло. Сначала второе устройство выбрасывало
    // шкатулку со службы и не могло расшифровать книгу. Потом — отказывалось
    // подключаться, считая записями категории по умолчанию. Потом — сносило
    // собственный билет, записанный секундой раньше, и синхронизация не
    // поднималась вовсе. Каждый раз экран говорил «подключено», и каждый раз не
    // происходило ничего. Все три ломают эту проверку.
    const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
    const password = "пароль-книги";

    const pc = new Owner();
    await pc.account.create(password, FAST);
    await pc.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });

    const vault = await pc.account.vault();
    await pc.server.register({
      base,
      code,
      login: "lucky",
      password,
      vault: vault!,
      device: "компьютер"
    });
    expect(await pc.resume()).toBe(true);

    // Второе устройство: свой первый запуск завёл СВОЙ ключ книги.
    const phone = new Owner();
    await phone.account.create(password, FAST);
    // Первый запуск ОТКРЫВАЕТ приложение — и оно заводит книгу с категориями по
    // умолчанию. Без этой строки телефон в проверке чище любого настоящего, и
    // сторож «на устройстве уже есть книга» здесь не срабатывает никогда: ровно
    // так 1.35.0 и уехала зелёной.
    await phone.app.get("/accounts");

    const joined = await phone.server.signIn({
      base,
      login: "lucky",
      password,
      device: "телефон"
    });
    await phone.account.adopt(joined.vault, password);

    // Билет обязан пережить приём шкатулки — иначе поднимать синхронизацию нечем.
    expect(await phone.server.link()).not.toBeNull();

    expect(await phone.resume()).toBe(true);

    const seen = await phone.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(seen.accounts.map((row) => row.name)).toContain("Карта");
  });

  it("на втором устройстве КАЖДЫЙ экран показывает то же, что на первом", async () => {
    // Проверка, которой не хватало всё это время, и просил её владелец своими
    // словами: «чтобы я открыл приложение и всё работало так, будто я работаю
    // на любом устройстве».
    //
    // Все прежние проверки синхронизации смотрели на одну-две величины — счёт,
    // операцию, остаток. Экранов же полтора десятка, и каждый считает своё:
    // аналитика — средние, прогноз — будущий остаток, планы — план и факт.
    // Разойтись они могут поодиночке и молча, а человек увидит два разных
    // ответа на один вопрос и не поймёт, какому верить.
    //
    // Поэтому сравниваются ВСЕ разделы целиком, а не выборочные числа: любое
    // расхождение, даже в разделе, о котором эта проверка не думала, покажет
    // себя здесь, а не на живой паре устройств.
    const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
    const password = "пароль-книги";

    const pc = new Owner();
    await pc.account.create(password, FAST);

    // Книга с содержимым: счета, операции разных видов, долг, цель, лимит.
    await pc.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
    await pc.app.post("/accounts", { name: "Копилка", type: "SAVINGS", balance: 120000 });
    const { categories } = await pc.app.get<{ categories: Array<{ id: string; kind: string }> }>(
      "/categories"
    );
    const expense = categories.find((row) => row.kind === "EXPENSE")!;
    const { accounts } = await pc.app.get<{ accounts: Array<{ id: string; name: string }> }>(
      "/accounts"
    );
    const card = accounts.find((row) => row.name === "Карта")!;

    for (const [description, amount] of [
      ["продукты", 2500],
      ["бензин", 3200],
      ["аптека", 990]
    ] as Array<[string, number]>) {
      await pc.app.post("/transactions", {
        type: "EXPENSE",
        amount,
        description,
        categoryId: expense.id,
        accountId: card.id,
        date: "2026-09-10"
      });
    }
    await pc.app.post("/goals", {
      name: "Отпуск",
      targetAmount: 200000,
      currentAmount: 15000,
      deadline: "2027-06-01",
      linkedAccountId: accounts.find((row) => row.name === "Копилка")!.id
    });

    const vault = await pc.account.vault();
    await pc.server.register({
      base,
      code,
      login: "lucky",
      password,
      vault: vault!,
      device: "компьютер"
    });
    expect(await pc.resume()).toBe(true);

    // Второе устройство приходит тем же путём, что человек.
    const phone = new Owner();
    await phone.account.create(password, FAST);
    await phone.app.get("/accounts");
    const joined = await phone.server.signIn({ base, login: "lucky", password, device: "телефон" });
    await phone.account.adopt(joined.vault, password);
    expect(await phone.resume()).toBe(true);

    // Разделы, которые читает приложение. Все, какие есть, кроме тех, что не о
    // книге: выгрузка копии, курсы валют, ввоз, образец, профили.
    //
    // Без «/investments», и это единственное исключение по существу. Оно не
    // просто читает: оно ходит за котировками и записывает полученные цены
    // обратно в книгу. Два устройства, открывшие его в разные секунды, честно
    // покажут разные цены — биржа за это время сдвинулась. Сверять тут нечего:
    // расхождение означало бы не поломку синхронизации, а работающий рынок.
    // Бумаги, которыми человек владеет, лежат в книге и приезжают как всё
    // остальное.
    const SCREENS = [
      "/accounts",
      "/analytics",
      "/budgets",
      "/categories",
      "/dashboard",
      "/debts",
      "/forecast",
      "/goals",
      "/plan",
      "/recurring",
      "/rules",
      "/settings",
      "/transactions"
    ];

    const different: string[] = [];
    for (const screen of SCREENS) {
      const here = await pc.app.get<unknown>(screen);
      const there = await phone.app.get<unknown>(screen);
      if (JSON.stringify(here) !== JSON.stringify(there)) different.push(screen);
    }

    expect(different, "разделы, расходящиеся между устройствами").toEqual([]);
  });

  it("отказ «вас обогнали» доходит до приложения как отказ, а не как успех", async () => {
    // Здесь и встречаются две стороны договора: служба отвечает 409, провод
    // обязан прочитать это как второй законный исход, а не как ошибку и не как
    // принятую запись. Спутай их — приложение потеряет чужую работу молча.
    const { token } = await signUp("петя");
    const transport = new HttpSyncTransport({ base, token });
    const sealed = { v: 1 as const, alg: "AES-GCM" as const, iv: "iv", ct: "первое" };

    const first = await transport.push("ячейка", { baseVersion: 0, body: sealed });
    expect(first.ok).toBe(true);

    const second = await transport.push("ячейка", {
      baseVersion: 0,
      body: { ...sealed, ct: "второе" }
    });
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe("stale");
    expect(second.ok === false && second.current.version).toBe(1);
  });

  it("пустая ячейка приезжает нулевой версией, а не ошибкой", async () => {
    const { token } = await signUp("петя");
    const snapshot = await new HttpSyncTransport({ base, token }).pull("пусто");
    expect(snapshot).toMatchObject({ slot: "пусто", version: 0, body: null });
  });

  it("чужой человек не видит нашу книгу", async () => {
    const petya = await signUp("петя");
    const vasya = await signUp("вася");
    const sealed = { v: 1 as const, alg: "AES-GCM" as const, iv: "iv", ct: "петино" };

    await new HttpSyncTransport({ base, token: petya.token }).push("книга", {
      baseVersion: 0,
      body: sealed
    });

    const theirs = await new HttpSyncTransport({ base, token: vasya.token }).pull("книга");
    expect(theirs.version).toBe(0);
    expect(theirs.body).toBeNull();
  });

  it("недоступная служба — это «нет связи», а не ошибка", async () => {
    // Для местного приложения обрыв связи не поломка, а обычное состояние.
    // Спутай провод одно с другим — приложение показало бы красное там, где
    // достаточно было сложить работу в очередь.
    const transport = new HttpSyncTransport({ base: "http://127.0.0.1:1", token: "bilet" });
    await expect(transport.pull("книга")).rejects.toSatisfy(isOffline);
  });

  it("негодный билет — это отказ службы, а не обрыв связи: повторять бесполезно", async () => {
    const transport = new HttpSyncTransport({ base, token: "ne-bilet" });
    await expect(transport.pull("книга")).rejects.toSatisfy((error) => !isOffline(error));
  });

  it("испорченный билет не выдаёт себя за «нет связи»", async () => {
    // Заголовки HTTP не переносят ничего сверх Latin-1, и такой билет роняет
    // сам вызов fetch — тем же способом, что и обрыв связи. Прими провод это за
    // обрыв, приложение повторяло бы попытку вечно вместо того, чтобы попросить
    // войти заново.
    const transport = new HttpSyncTransport({ base, token: "билет-с-кириллицей" });
    await expect(transport.pull("книга")).rejects.toSatisfy((error) => !isOffline(error));
  });

  describe("привязка устройства", () => {
    it("заводит запись по приглашению и запоминает билет", async () => {
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      const { vault } = await createVault("пароль", FAST);
      const disk = new MemoryStorageAdapter();
      const account = new ServerAccount(disk);

      await account.register({
        base,
        code,
        login: "петя",
        password: "пароль",
        vault,
        device: "проверка"
      });

      const link = await account.link();
      expect(link).toMatchObject({ base, login: "петя" });
      expect(link?.token).toBeTruthy();
    });

    it("на второе устройство шкатулка приезжает со службы", async () => {
      // Это и есть смысл того, что шкатулка лежит на сервере: на новом телефоне
      // взять её больше неоткуда, а без неё книга не откроется ничем.
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      const { vault } = await createVault("пароль", FAST);
      const first = new ServerAccount(new MemoryStorageAdapter());
      await first.register({
        base,
        code,
        login: "петя",
        password: "пароль",
        vault,
        device: "первое"
      });

      const second = new ServerAccount(new MemoryStorageAdapter());
      const entered = await second.signIn({
        base,
        login: "петя",
        password: "пароль",
        device: "второе"
      });

      expect(entered.vault).toEqual(vault);
    });

    it("неверный пароль не привязывает и билета не оставляет", async () => {
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      const { vault } = await createVault("пароль", FAST);
      const disk = new MemoryStorageAdapter();
      const account = new ServerAccount(disk);
      await account.register({
        base,
        code,
        login: "петя",
        password: "пароль",
        vault,
        device: "первое"
      });

      const other = new ServerAccount(new MemoryStorageAdapter());
      await expect(
        other.signIn({ base, login: "петя", password: "не тот", device: "второе" })
      ).rejects.toThrow();
      expect(await other.link()).toBeNull();
    });

    it("отвязка гасит билет на службе, а не только забывает его здесь", async () => {
      // Забудь мы билет только у себя, он остался бы годным на сервере ещё
      // месяц — и потерянный телефон продолжал бы иметь доступ к книге.
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      const { vault } = await createVault("пароль", FAST);
      const disk = new MemoryStorageAdapter();
      const account = new ServerAccount(disk);
      await account.register({
        base,
        code,
        login: "петя",
        password: "пароль",
        vault,
        device: "проверка"
      });
      const token = (await account.link())?.token ?? "";

      await account.signOut();

      expect(await account.link()).toBeNull();
      expect(await disk.getItem(SERVER_KEY)).toBeNull();
      // И билет больше не годен.
      const after = await fetch(`${base}/vault/книга`, {
        headers: { authorization: `Bearer ${token}` }
      });
      expect(after.status).toBe(401);
      await after.text();
    });
  });

  it("событие о чужой записи доходит по потоку", async () => {
    const { token } = await signUp("петя");
    const listener = new HttpSyncTransport({ base, token });
    const heard: Array<{ slot: string; version: number }> = [];
    const unwatch = listener.watch((event) => heard.push(event));

    // Дать потоку открыться: без этого запись случится раньше подписки.
    await new Promise((resolve) => setTimeout(resolve, 150));

    await new HttpSyncTransport({ base, token }).push("книга", {
      baseVersion: 0,
      body: { v: 1, alg: "AES-GCM", iv: "iv", ct: "что-то" }
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    unwatch();

    expect(heard).toContainEqual({ slot: "книга", version: 1 });
  });
});

describe("двое на одном устройстве — через настоящую службу", () => {
  beforeEach(async () => {
    app = createApp({ dbPath: ":memory:", adminToken: ADMIN });
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  it("имена ячеек на службе БЕЗ приставки — иначе второе устройство не нашло бы их никогда", async () => {
    // Самое дорогое свойство всего разделения, и проверить его можно только
    // здесь: приставка живёт НИЖЕ отправки, значит на службу уходят обычные
    // имена. Уйди она наверх — и человек, подключивший второе устройство,
    // увидел бы пустоту, а понял бы это как «синхронизация не работает».
    //
    // Доказывается не заглядыванием в базу, а последствием: второе устройство
    // БЕЗ приставки вообще забирает данные человека С приставкой.
    const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
    const password = "пароль-маши";
    const disk = new MemoryStorageAdapter();

    const masha = new Housemate(disk, "маша");
    await masha.account.create(password, FAST);
    await masha.app.post("/accounts", { name: "Её карта", type: "DEBIT_CARD", balance: 50000 });
    await masha.server.register({
      base,
      code,
      login: "masha",
      password,
      vault: (await masha.account.vault())!,
      device: "общий компьютер"
    });
    expect(await masha.resume()).toBe(true);

    // Её телефон — отдельное устройство, разделения там нет вовсе.
    const phone = new Owner();
    await phone.account.create(password, FAST);
    await phone.app.get("/accounts");
    const joined = await phone.server.signIn({ base, login: "masha", password, device: "телефон" });
    await phone.account.adopt(joined.vault, password);
    expect(await phone.resume()).toBe(true);

    const seen = await phone.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(seen.accounts.map((row) => row.name)).toContain("Её карта");
  });

  it("двое с разными записями на службе не пересекаются", async () => {
    // Диск один, служба одна, записи разные — и каждый видит только своё. Тут
    // сходятся оба разделения сразу: приставка внизу и отдельная учётная
    // запись наверху.
    const disk = new MemoryStorageAdapter();
    const password = "пароль";

    const vasya = new Housemate(disk, "");
    const masha = new Housemate(disk, "маша");

    for (const [who, login, card] of [
      [vasya, "vasya", "Его карта"],
      [masha, "masha", "Её карта"]
    ] as const) {
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      await who.account.create(password, FAST);
      await who.app.post("/accounts", { name: card, type: "DEBIT_CARD", balance: 1000 });
      await who.server.register({
        base,
        code,
        login,
        password,
        vault: (await who.account.vault())!,
        device: "общий компьютер"
      });
      expect(await who.resume()).toBe(true);
    }

    const his = await vasya.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    const hers = await masha.app.get<{ accounts: Array<{ name: string }> }>("/accounts");

    expect(his.accounts.map((row) => row.name)).toContain("Его карта");
    expect(his.accounts.map((row) => row.name)).not.toContain("Её карта");
    expect(hers.accounts.map((row) => row.name)).toContain("Её карта");
    expect(hers.accounts.map((row) => row.name)).not.toContain("Его карта");
  });

  it("связь со службой у каждого своя", async () => {
    // financeServer лежит в пространстве человека, а не устройства. Лежи он
    // общим — второй, подключившись, забрал бы чужой билет, и его данные
    // поехали бы в чужую учётную запись.
    const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
    const disk = new MemoryStorageAdapter();
    const password = "пароль";

    const vasya = new Housemate(disk, "");
    await vasya.account.create(password, FAST);
    await vasya.server.register({
      base,
      code,
      login: "vasya",
      password,
      vault: (await vasya.account.vault())!,
      device: "общий компьютер"
    });

    const masha = new Housemate(disk, "маша");
    expect(await masha.server.link()).toBeNull();
    expect(await vasya.server.link()).not.toBeNull();
  });

  describe("связка второго устройства", () => {
    // Здесь проверяется шов между приложением и службой, а не каждая из
    // сторон. У обеих свои проверки, и обе могут остаться честно зелёными,
    // разойдясь в коде ответа, имени поля или форме отказа. Код связки — самый
    // свежий из таких швов и единственный, который зовут ДО всякого входа.

    it("второе устройство узнаёт адрес и имя, не зная ничего", async () => {
      // Весь смысл кода: у второго устройства нет ни адреса, ни имени входа, и
      // предъявить службе ему нечего.
      const password = "пароль";
      const first = new Owner();
      await first.account.create(password, FAST);
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      await first.server.register({
        base,
        code,
        login: "petya",
        password,
        vault: (await first.account.vault())!,
        device: "компьютер"
      });

      const pairing = await first.server.issuePairing();
      const answer = await redeemPairing(base, pairing.code);

      expect(answer.login).toBe("petya");
      expect(answer.base).toBe(base);
    });

    it("код не везёт пароля — и без него данные не открываются", async () => {
      // Решение владельца, и оно правильное: пароль — единственное, чем
      // завёрнут ключ. Поехав в коде (а значит и в картинке QR, которую
      // снимают из-за плеча), он сделал бы бессмысленным всё шифрование разом.
      const password = "пароль";
      const first = new Owner();
      await first.account.create(password, FAST);
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      await first.server.register({
        base,
        code,
        login: "petya",
        password,
        vault: (await first.account.vault())!,
        device: "компьютер"
      });

      const pairing = await first.server.issuePairing();
      const answer = (await redeemPairing(base, pairing.code)) as unknown as Record<
        string,
        unknown
      >;

      expect(Object.keys(answer).sort()).toEqual(["base", "login"]);
      // А со ВТОРЫМ устройством, знающим только это, вход без пароля не
      // проходит: служба отвечает одинаково на чужое имя и на чужой секрет.
      const second = new Owner();
      await second.account.create("своя жизнь", FAST);
      await expect(
        second.server.signIn({
          base: answer.base as string,
          login: answer.login as string,
          password: "не тот пароль",
          device: "телефон"
        })
      ).rejects.toThrow();
    });

    it("написанное ПОСЛЕ подключения доезжает до второго устройства", async () => {
      // Самый обычный порядок на свете: человек пользуется приложением, а
      // телефон подключает потом. Все прежние проверки этого набора пишут ДО
      // подключения — и ровно поэтому поломка прожила незамеченной.
      //
      // Выглядела она так: на компьютере всё на месте, значок говорит «Всё на
      // сервере», а телефон приезжает ПУСТЫМ. Причина лежала в очереди
      // отправки (см. lib/storage/SyncingStorageAdapter): запись, сделанная
      // пока шла отправка, вылетала из очереди вместе с отправленной.
      const password = "пароль";
      const pc = new Owner();
      await pc.account.create(password, FAST);
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      await pc.server.register({
        base,
        code,
        login: "petya",
        password,
        vault: (await pc.account.vault())!,
        device: "компьютер"
      });
      expect(await pc.resume()).toBe(true);

      // И только ТЕПЕРЬ — работа в приложении.
      await pc.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
      await pc.sync.flush();

      const phone = new Owner();
      await phone.account.create("свой первый запуск", FAST);
      await phone.app.get("/accounts");
      const joined = await phone.server.signIn({
        base,
        login: "petya",
        password,
        device: "телефон"
      });
      await phone.account.adopt(joined.vault, password);
      expect(await phone.resume()).toBe(true);

      const seen = await phone.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
      expect(seen.accounts.map((row) => row.name)).toContain("Карта");
    });

    it("своим кодом второе устройство доезжает до тех же данных", async () => {
      // Путь целиком, как его пройдёт человек: код → адрес и имя → пароль →
      // шкатулка со службы → те же записи.
      const password = "пароль";
      const first = new Owner();
      await first.account.create(password, FAST);
      await first.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      await first.server.register({
        base,
        code,
        login: "petya",
        password,
        vault: (await first.account.vault())!,
        device: "компьютер"
      });
      expect(await first.resume()).toBe(true);

      const pairing = await first.server.issuePairing();
      const answer = await redeemPairing(base, pairing.code);

      const second = new Owner();
      await second.account.create("свой первый запуск", FAST);
      // Первый запуск ОТКРЫВАЕТ приложение — и оно заводит данные с
      // категориями по умолчанию. Без этой строки телефон в проверке чище
      // любого настоящего.
      await second.app.get("/accounts");
      const joined = await second.server.signIn({
        base: answer.base,
        login: answer.login,
        password,
        device: "телефон"
      });
      await second.account.adopt(joined.vault, password);
      await second.resume();

      const there = await second.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
      expect(there.accounts.map((row) => row.name)).toContain("Карта");
    });

    it("код срабатывает один раз — и второй раз это видно приложению", async () => {
      const password = "пароль";
      const first = new Owner();
      await first.account.create(password, FAST);
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      await first.server.register({
        base,
        code,
        login: "petya",
        password,
        vault: (await first.account.vault())!,
        device: "компьютер"
      });

      const pairing = await first.server.issuePairing();
      await redeemPairing(base, pairing.code);

      await expect(redeemPairing(base, pairing.code)).rejects.toThrow(/использован/);
    });

    it("устройства видны, переименовываются и выкидываются", async () => {
      // Ручка была с самого начала, а экрана не было, и в server/README.md об
      // этом было написано прямо. Человек, потерявший телефон, не мог выкинуть
      // его билет иначе как через curl — а билет живёт месяц.
      const password = "пароль";
      const first = new Owner();
      await first.account.create(password, FAST);
      const { code } = (await callServer("/admin/invite", {}, ADMIN)) as { code: string };
      await first.server.register({
        base,
        code,
        login: "petya",
        password,
        vault: (await first.account.vault())!,
        device: "Компьютер (Windows)"
      });

      const mine = await first.server.devices();
      expect(mine.devices).toHaveLength(1);
      expect(mine.current).toBe(mine.devices[0].id);

      await first.server.renameDevice(mine.devices[0].id, "Ноутбук на кухне");
      expect((await first.server.devices()).devices[0].name).toBe("Ноутбук на кухне");

      await first.server.forgetDevice(mine.devices[0].id);
      // Выкинутое устройство теряет билет — в этом весь смысл.
      await expect(first.server.devices()).rejects.toThrow();
    });

    it("неподключённое устройство отказывает внятно, а не падает", async () => {
      // «Cannot read properties of null» — это не сообщение человеку.
      const alone = new Owner();
      await expect(alone.server.issuePairing()).rejects.toThrow(/не подключено/);
    });

    it("служба сама говорит, нужно ли ей приглашение", async () => {
      // Спросить это можно только ДО входа, ничего не предъявив, — то есть
      // только так. Без ответа приложение либо прячет поле там, где без него
      // не пускают, либо спрашивает его там, где оно не нужно.
      expect(await probeServer(base)).toEqual({ open: false, reachable: true });
    });

    it("недоступная служба считается закрытой, а не открытой", async () => {
      // Умолчание то же, что и на самой службе. Лишнее поле, которое человек
      // оставит пустым, стоит ему одной попытки; спрятанное поле, без которого
      // не пускают, стоит ему всего подключения.
      expect(await probeServer("http://127.0.0.1:1")).toEqual({
        open: false,
        reachable: false
      });
    });
  });
});

describe("«Очистить все данные» при подключённой службе", () => {
  beforeEach(async () => {
    app = createApp({ dbPath: ":memory:", adminToken: ADMIN });
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  // Кнопка обещала «удалит всё, необратимо», а делала перезалив: стирала диск,
  // забывала номер версии — и первый же обмен со службой возвращал всё обратно.
  // Человек нажимал, видел пустой экран, а через секунду — свои данные. Ровно
  // так владелец это и описал: «по факту не очищаются».
  it("очищенное не возвращается со службы на том же устройстве", async () => {
    const { token, bookKey } = await signUp("петя");
    const phone = new Device(bookKey);
    await phone.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
    await phone.sync.start(new HttpSyncTransport({ base, token }), phone.merge);
    await phone.sync.flush();

    await phone.app.delete("/storage/clear");
    await phone.sync.flush();

    const accounts = await phone.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(accounts.accounts.map((account) => account.name)).not.toContain("Карта");
  });

  it("и после перезапуска приложения тоже", async () => {
    const { token, bookKey } = await signUp("петя");
    const phone = new Device(bookKey);
    await phone.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
    await phone.sync.start(new HttpSyncTransport({ base, token }), phone.merge);
    await phone.sync.flush();
    await phone.app.delete("/storage/clear");
    await phone.sync.flush();

    // Перезапуск: та же стопка заново над тем же диском.
    const again = new SyncingStorageAdapter(phone.disk);
    const vault = new EncryptingStorageAdapter(again);
    vault.unlock(bookKey);
    await again.start(new HttpSyncTransport({ base, token }), phone.merge);
    await again.flush();

    const accounts = await new LocalApiClient(vault).get<{ accounts: Array<{ name: string }> }>(
      "/accounts"
    );
    expect(accounts.accounts.map((account) => account.name)).not.toContain("Карта");
  });

  it("второе устройство получает пустоту, а не возвращает старое", async () => {
    const { token, bookKey } = await signUp("петя");
    const phone = new Device(bookKey);
    const desktop = new Device(bookKey);
    await phone.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
    await phone.sync.start(new HttpSyncTransport({ base, token }), phone.merge);
    await phone.sync.flush();
    await desktop.sync.start(new HttpSyncTransport({ base, token }), desktop.merge);
    await desktop.sync.flush();
    expect(
      (await desktop.app.get<{ accounts: Array<{ name: string }> }>("/accounts")).accounts.map(
        (a) => a.name
      )
    ).toContain("Карта");

    await phone.app.delete("/storage/clear");
    await phone.sync.flush();
    await desktop.sync.flush();

    const onDesktop = await desktop.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(onDesktop.accounts.map((account) => account.name)).not.toContain("Карта");
    // И обратно не приезжает: компьютер не переотправил старое на телефон.
    await phone.sync.flush();
    const onPhone = await phone.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(onPhone.accounts.map((account) => account.name)).not.toContain("Карта");
  });
});

describe("начал без пароля — и подключил телефон", () => {
  beforeEach(async () => {
    app = createApp({ dbPath: ":memory:", adminToken: ADMIN, openRegistration: true });
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  // Нашлось прогоном «как новичок». Шкатулка человека, выбравшего «пока без
  // пароля», завёрнута случайным паролем, которого не знает никто. Экран
  // подключения просил «пароль от ваших данных» — человек вводил что-то своё,
  // служба принимала, вход по нему на телефоне проходил… а данные не
  // открывались никогда: шкатулка этим паролем не завёрнута.
  it("шкатулку без пароля на службу не отправить", async () => {
    const pc = new Owner();
    await pc.account.createWithoutPassword();
    await expect(
      pc.server.register({
        base,
        code: "",
        login: "masha",
        password: "придумала-сейчас",
        vault: (await pc.account.vault())!,
        device: "компьютер"
      })
    ).rejects.toThrow("Пароль не подходит");
  });

  it("пароль, заданный перед подключением, открывает данные на телефоне", async () => {
    const password = "пароль-маши-123";
    const pc = new Owner();
    await pc.account.createWithoutPassword();
    await pc.app.post("/accounts", { name: "Карта Маши", type: "DEBIT_CARD", balance: 1000 });

    // То, что теперь делает экран подключения: сперва пароль данным…
    await pc.account.setPassword(password);
    // …и только потом — шкатулку на службу.
    await pc.server.register({
      base,
      code: "",
      login: "masha",
      password,
      vault: (await pc.account.vault())!,
      device: "компьютер"
    });
    expect(await pc.resume()).toBe(true);

    const phone = new Owner();
    const joined = await phone.server.signIn({ base, login: "masha", password, device: "телефон" });
    await phone.account.adopt(joined.vault, password);
    expect(await phone.resume()).toBe(true);

    const seen = await phone.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(seen.accounts.map((row) => row.name)).toContain("Карта Маши");
  });
});
