import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { HttpSyncTransport } from "@/lib/sync/HttpSyncTransport";
import { mergeBooks } from "@/lib/sync/merge";
import { isOffline } from "@/lib/sync/protocol";
import { createVault } from "@/lib/sync/vault-crypto";
import { ServerAccount, SERVER_KEY } from "@/lib/vault/server-account";
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
