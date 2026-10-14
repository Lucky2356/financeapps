import { beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { mergeBooks, type RowConflict } from "@/lib/sync/merge";
import { createVault } from "@/lib/sync/vault-crypto";
import { FakeSyncServer } from "./helpers/fake-sync-server";

// Вся стопка целиком: LocalApiClient → шифрование → синхронизация → устройство,
// и поддельный сервер между двумя такими стопками.
//
// Отдельно проверены уже все куски. Эта проверка — про то, что они собраны
// правильно: настоящий AES-GCM, настоящее слияние, настоящий договор с отказами.
// Ошибки сборки не видны ни в одной проверке отдельного куска — каждый из них
// при этом честно зелёный.

const FAST = { iterations: 1 };

/** Одно устройство: три слоя хранилища и приложение поверх них. */
class Device {
  readonly disk = new MemoryStorageAdapter();
  readonly sync = new SyncingStorageAdapter(this.disk);
  readonly vault = new EncryptingStorageAdapter(this.sync);
  readonly conflicts: RowConflict[] = [];

  constructor(bookKey: CryptoKey) {
    this.vault.unlock(bookKey);
  }

  /** Приложение. Собирается заново на каждое обращение: своя память у него
   *  прогревается при чтении, а синхронизация меняет книгу у него за спиной —
   *  ровно как перезапуск после прихода чужой правки. */
  get app(): LocalApiClient {
    return new LocalApiClient(this.vault);
  }

  merge: Merge = async (_slot, mine, theirs, base) => {
    const ours = mine ? await this.vault.open<Record<string, unknown>>(mine) : {};
    const incoming = await this.vault.open<Record<string, unknown>>(theirs);
    const ancestor = base ? await this.vault.open<Record<string, unknown>>(base) : null;
    const report = mergeBooks(ancestor, ours, incoming);
    this.conflicts.push(...report.conflicts);
    return { body: await this.vault.seal(report.state), differs: report.differs };
  };
}

async function transactions(device: Device): Promise<string[]> {
  const data = await device.app.get("/transactions");
  return data.transactions.map((row) => row.description ?? "").sort();
}

async function addExpense(device: Device, description: string, amount: number): Promise<void> {
  const app = device.app;
  const { accounts } = await app.get("/accounts");
  const { categories } = await app.get("/categories");
  await app.post("/transactions", {
    amount,
    type: "EXPENSE",
    accountId: accounts[0].id,
    categoryId: categories.find((row) => row.kind === "EXPENSE")?.id,
    date: "2026-09-16",
    description
  });
}

describe("две машины через сервер", () => {
  let server: FakeSyncServer;
  let phone: Device;
  let desktop: Device;

  beforeEach(async () => {
    // Один ключ книги на оба устройства — так и есть в жизни: ключ один, он
    // заперт паролем, и второе устройство достаёт его тем же паролем.
    const { bookKey } = await createVault("пароль", FAST);
    server = new FakeSyncServer();
    phone = new Device(bookKey);
    desktop = new Device(bookKey);

    await phone.app.get("/accounts");
    await desktop.app.get("/accounts");
    await phone.sync.start(server, phone.merge);
    await desktop.sync.start(server, desktop.merge);

    // Счёт заводится один раз и на телефоне, а до компьютера доезжает сам, —
    // заодно это первая настоящая передача книги в этой проверке.
    await phone.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 50000 });
    await phone.sync.flush();
    await desktop.sync.flush();
  });

  it("на сервер уезжает нечитаемое", async () => {
    await addExpense(phone, "обед", 700);
    await phone.sync.flush();

    const body = server.peek("localFinanceState_profile-default")?.body;
    expect(body?.alg).toBe("AES-GCM");
    expect(JSON.stringify(body)).not.toContain("обед");
  });

  it("операция с телефона доезжает до компьютера", async () => {
    await addExpense(phone, "обед", 700);
    await phone.sync.flush();
    await desktop.sync.flush();

    expect(await transactions(desktop)).toContain("обед");
  });

  it("операции, заведённые врозь, сходятся у обоих", async () => {
    await addExpense(phone, "обед", 700);
    await addExpense(desktop, "бензин", 2500);

    await phone.sync.flush();
    await desktop.sync.flush();
    await phone.sync.flush();

    expect(await transactions(phone)).toEqual(["бензин", "обед"]);
    expect(await transactions(desktop)).toEqual(["бензин", "обед"]);
    expect(phone.conflicts).toEqual([]);
    expect(desktop.conflicts).toEqual([]);
  });

  it("остаток сходится арифметически, а не берётся с одной из машин", async () => {
    // Самое важное место всей синхронизации. Остаток на счёте — не свойство
    // счёта, а итог всего, что по нему прошло. Возьми слияние одну из двух
    // версий счёта, остаток оказался бы неверным ровно на одну покупку: не
    // спорным, не подозрительным — просто неверным и молча.
    await addExpense(phone, "обед", 700);
    await addExpense(desktop, "бензин", 2500);

    await phone.sync.flush();
    await desktop.sync.flush();
    await phone.sync.flush();

    const shown = async (device: Device) => {
      const { accounts } = await device.app.get("/accounts");
      return accounts[0].balance;
    };

    expect(await shown(phone)).toBe(50000 - 700 - 2500);
    expect(await shown(desktop)).toBe(50000 - 700 - 2500);
  });

  it("удалённая на телефоне операция исчезает и на компьютере", async () => {
    await addExpense(phone, "обед", 700);
    await phone.sync.flush();
    await desktop.sync.flush();
    expect(await transactions(desktop)).toEqual(["обед"]);

    const { transactions: rows } = await phone.app.get("/transactions");
    await phone.app.delete(`/transactions?id=${rows[0].id}`);
    await phone.sync.flush();
    await desktop.sync.flush();

    expect(await transactions(desktop)).toEqual([]);
    // И не возвращается на следующем круге — самое опасное место.
    await phone.sync.flush();
    await desktop.sync.flush();
    expect(await transactions(phone)).toEqual([]);
  });

  it("книга без связи не пропадает и уезжает, когда связь вернулась", async () => {
    server.online = false;
    await addExpense(phone, "обед", 700);
    await phone.sync.flush();
    expect(phone.sync.status).toBe("offline");
    expect(await transactions(phone)).toEqual(["обед"]);

    server.online = true;
    await phone.sync.flush();
    await desktop.sync.flush();
    expect(await transactions(desktop)).toEqual(["обед"]);
  });

  it("обмен заканчивается, а не ходит по кругу", async () => {
    await addExpense(phone, "обед", 700);
    await phone.sync.flush();
    await desktop.sync.flush();
    await phone.sync.flush();

    const settled = server.peek("localFinanceState_profile-default")?.version ?? 0;
    for (let i = 0; i < 5; i++) {
      await phone.sync.flush();
      await desktop.sync.flush();
    }

    expect(server.peek("localFinanceState_profile-default")?.version).toBe(settled);
  });
  describe("сервер вернули из ночной копии", () => {
    // Хозяин службы восстановил базу из вчерашней копии. Сервер снова на
    // старой версии, а оба устройства помнят более новую — и держат основой
    // книгу, в которой есть всё написанное после копии. Слияние с такой основой
    // сочло бы эти строки удалёнными на сервере и выбросило бы их у всех.
    const balance = async (device: Device) =>
      (await device.app.get("/accounts")).accounts[0].balance;

    beforeEach(async () => {
      await addExpense(phone, "до копии", 700);
      await phone.sync.flush();
      await desktop.sync.flush();
    });

    it("написанное после копии остаётся на устройствах и уезжает обратно", async () => {
      const nightly = server.backup();
      await addExpense(phone, "после копии 1", 300);
      await phone.sync.flush();
      await desktop.sync.flush();
      await addExpense(desktop, "после копии 2", 200);
      await desktop.sync.flush();
      await phone.sync.flush();

      server.restore(nightly);
      for (let i = 0; i < 2; i++) {
        await phone.sync.catchUp();
        await desktop.sync.catchUp();
      }

      const all = ["до копии", "после копии 1", "после копии 2"];
      expect(await transactions(phone)).toEqual(all);
      expect(await transactions(desktop)).toEqual(all);
      // И не только на устройствах: третье, подключённое завтра, возьмёт с сервера.
      const onServer = await phone.vault.open<{ transactions: Array<{ description: string }> }>(
        server.peek("localFinanceState_profile-default")!.body!
      );
      expect(onServer.transactions.map((row) => row.description).sort()).toEqual(all);
      // Остаток — от тех же операций, а не вчерашний с сервера.
      expect(await balance(phone)).toBe(50000 - 700 - 300 - 200);
      expect(await balance(desktop)).toBe(50000 - 700 - 300 - 200);
    });

    it("отказ на запись после возврата тоже не теряет новое", async () => {
      // Устройство узнаёт о возврате не сверкой, а отказом на свою отправку:
      // предъявило номер, которого у сервера больше нет.
      const nightly = server.backup();
      await addExpense(phone, "после копии", 300);
      await phone.sync.flush();

      server.restore(nightly);
      await addExpense(phone, "после возврата", 100);
      await phone.sync.flush();
      await desktop.sync.catchUp();

      const all = ["до копии", "после возврата", "после копии"];
      expect(await transactions(phone)).toEqual(all);
      expect(await transactions(desktop)).toEqual(all);
      expect(await balance(desktop)).toBe(50000 - 700 - 300 - 100);
    });

    describe("а другие устройства успели уйти дальше помнящегося номера", () => {
      // Телефон записал после копии и запомнил свою версию. Службу вернули
      // назад, компьютер (не видевший той записи) дописал дважды — и номер на
      // службе снова БОЛЬШЕ помнящегося телефоном. По номеру возврат не виден:
      // телефон принял бы чужую историю за продолжение своей, слил бы с
      // основой, в которой есть его запись после копии, — и запись сочлась бы
      // удалённой на службе. Узнать это можно только у службы: была ли у неё
      // та версия, которую помнит телефон.
      async function phoneAheadThenRewound() {
        server.events = false;
        const nightly = server.backup();
        await addExpense(phone, "после копии", 300);
        await phone.sync.flush();
        const remembered = server.peek("localFinanceState_profile-default")!.version;

        server.restore(nightly);
        await addExpense(desktop, "компьютер 1", 200);
        await desktop.sync.flush();
        await addExpense(desktop, "компьютер 2", 100);
        await desktop.sync.flush();
        expect(server.peek("localFinanceState_profile-default")!.version).toBeGreaterThan(
          remembered
        );
      }

      const all = ["до копии", "компьютер 1", "компьютер 2", "после копии"];

      it("сверка: запись после копии остаётся и уезжает ко всем", async () => {
        await phoneAheadThenRewound();
        await phone.sync.catchUp();
        await desktop.sync.catchUp();

        expect(await transactions(phone)).toEqual(all);
        expect(await transactions(desktop)).toEqual(all);
        // Остаток без общей основы сложить приращениями не из чего — слияние
        // берёт версию посвежее (известное ограничение того же пути, что и при
        // простом возврате, см. SUMMED в lib/sync/merge.ts). Главное здесь —
        // операции: ни одна не пропала, и устройства сошлись.
        expect(await balance(phone)).toBe(await balance(desktop));
      });

      it("отказ на запись: телефон пишет, не сверившись, — и тоже ничего не теряет", async () => {
        await phoneAheadThenRewound();
        await addExpense(phone, "после возврата", 50);
        await phone.sync.flush();
        await desktop.sync.catchUp();

        const withNew = [...all, "после возврата"].sort();
        expect(await transactions(phone)).toEqual(withNew);
        expect(await transactions(desktop)).toEqual(withNew);
        // И без ложного спора «удалили на службе — держу у себя» про операцию:
        // строку после копии на службе никто не удалял, её там просто не было.
        expect(phone.conflicts.filter((row) => row.collection === "transactions")).toEqual([]);
      });

      it("служба прежней версии (без истории) — всё как раньше, сверка сходится", async () => {
        server.remembers = false;
        await phoneAheadThenRewound();
        await phone.sync.catchUp();
        await desktop.sync.catchUp();
        await phone.sync.catchUp();

        // Чужие записи доезжают; запись телефона после копии старая служба
        // уберечь не может — ради этого история и заведена.
        expect(await transactions(phone)).toEqual(await transactions(desktop));
        expect(await transactions(phone)).toEqual(
          expect.arrayContaining(["до копии", "компьютер 1", "компьютер 2"])
        );
      });
    });
  });
  it("восстановленное из файла копии не удаляется снова первой же синхронизацией", async () => {
    // Копия сделана, когда «обед» был; потом его удалили на телефоне, и след
    // удаления доехал до компьютера. Восстановление возвращает «обед» и
    // остаток счёта из копии. С отметками из файла строка оставалась старше
    // следа удаления, и синхронизация удаляла её опять — а остаток счёта
    // оставался из копии: минус 700 при пустом списке операций.
    await addExpense(phone, "обед", 700);
    await phone.sync.flush();
    await desktop.sync.flush();
    const backup = await phone.app.get("/backup");

    await new Promise((resolve) => setTimeout(resolve, 5));
    const { transactions: rows } = await phone.app.get("/transactions");
    await phone.app.delete(`/transactions?id=${rows[0].id}`);
    await phone.sync.flush();
    await desktop.sync.flush();
    expect(await transactions(desktop)).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await phone.app.post("/backup", { backup });
    for (let i = 0; i < 3; i++) {
      await phone.sync.flush();
      await desktop.sync.flush();
    }

    expect(await transactions(phone)).toEqual(["обед"]);
    expect(await transactions(desktop)).toEqual(["обед"]);
    for (const device of [phone, desktop]) {
      const { accounts } = await device.app.get("/accounts");
      expect(accounts[0].balance).toBe(50000 - 700);
    }
  });
  describe("удалённый профиль", () => {
    // Раньше профиль удалялся только с устройства (removeItem): служба
    // держала книгу целиком, сверка привозила её обратно, «Очистить все
    // данные» её не видело, а новое устройство получало её при подключении.
    async function secretProfile(): Promise<string> {
      const created = await phone.app.post("/profiles/create", { name: "Секрет" });
      const id = (created as { id: string }).id;
      await phone.app.post("/profiles/switch", { profileId: id });
      await phone.app.post("/accounts", { name: "Тайный счёт", type: "DEBIT_CARD", balance: 777 });
      await phone.sync.flush();
      await phone.app.post("/profiles/switch", { profileId: "profile-default" });
      return `localFinanceState_${id}`;
    }

    async function onServer(slot: string): Promise<string> {
      const cell = server.peek(slot);
      return cell?.body ? JSON.stringify(await phone.vault.open(cell.body)) : "";
    }

    it("уходит и со службы, и не возвращается сверкой", async () => {
      const slot = await secretProfile();
      expect(await onServer(slot)).toContain("Тайный счёт");

      const id = slot.slice("localFinanceState_".length);
      await phone.app.delete(`/profiles?id=${id}`);
      await phone.sync.flush();
      await phone.sync.catchUp();
      await desktop.sync.catchUp();

      expect(await onServer(slot)).not.toContain("Тайный счёт");
      expect(JSON.stringify(await phone.vault.getItem(slot))).not.toContain("Тайный счёт");
      expect(JSON.stringify(await desktop.vault.getItem(slot))).not.toContain("Тайный счёт");
    });

    it("«Очистить все данные» стирает и книгу профиля, удалённого прежней версией", async () => {
      const slot = await secretProfile();
      // Так удаляла прежняя версия: из списка и с устройства, но не со службы.
      const list = await phone.app.get("/profiles");
      await phone.vault.setItem("profileList", {
        ...list,
        profiles: list.profiles.filter((profile) => `localFinanceState_${profile.id}` !== slot)
      });
      await phone.vault.removeItem(slot);
      await phone.sync.flush();
      await phone.sync.catchUp();
      expect(JSON.stringify(await phone.vault.getItem(slot))).toContain("Тайный счёт");

      await phone.app.delete("/storage/clear");
      await phone.sync.flush();
      await phone.sync.catchUp();

      expect(await onServer(slot)).not.toContain("Тайный счёт");
      expect(JSON.stringify(await phone.vault.getItem(slot))).not.toContain("Тайный счёт");
    });
  });
});
