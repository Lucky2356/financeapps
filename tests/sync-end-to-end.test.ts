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
  const data = await device.app.get<{ transactions: Array<{ description: string }> }>(
    "/transactions"
  );
  return data.transactions.map((row) => row.description).sort();
}

async function addExpense(device: Device, description: string, amount: number): Promise<void> {
  const app = device.app;
  const { accounts } = await app.get<{ accounts: Array<{ id: string }> }>("/accounts");
  const { categories } = await app.get<{ categories: Array<{ id: string; kind: string }> }>(
    "/categories"
  );
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
      const { accounts } = await device.app.get<{ accounts: Array<{ balance: number }> }>(
        "/accounts"
      );
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

    const { transactions: rows } = await phone.app.get<{ transactions: Array<{ id: string }> }>(
      "/transactions"
    );
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
});
