import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { mergeBooks } from "@/lib/sync/merge";
import { createVault } from "@/lib/sync/vault-crypto";
import { FakeSyncServer } from "./helpers/fake-sync-server";

// Остаток счёта обязан равняться тому, что по нему прошло.
//
// Это не «ещё одна проверка слияния», а единственная проверка про ДЕНЬГИ:
// строки сливаются по номеру и не задваиваются, поэтому список операций
// выглядит верным всегда. А остаток — поле, которое складывается приращениями
// («было + моё + их»), и посчитаться дважды может только он. Снаружи это ровно
// то, что увидел владелец: операций десять, все на месте, а на счёте больше,
// чем потрачено, — и не на круглую сумму, а на одну из трат.
//
// Проверяется не «слияние сработало», а инвариант: сколько прошло — столько и
// на счёте. Ему нельзя нарушаться ни при каком порядке записей и приездов.

const FAST = { iterations: 1 };
const BOOK = "localFinanceState_profile-default";

type Row = { id: string; balance: number; name: string };

async function device() {
  const { bookKey } = await createVault("пароль", FAST);
  const disk = new MemoryStorageAdapter();
  const sync = new SyncingStorageAdapter(disk);
  const sealed = new EncryptingStorageAdapter(sync);
  sealed.unlock(bookKey);

  const merge: Merge = async (_slot, mine, theirs, ancestor) => {
    const ours = mine ? await sealed.open<Record<string, unknown>>(mine) : {};
    const incoming = await sealed.open<Record<string, unknown>>(theirs);
    const base = ancestor ? await sealed.open<Record<string, unknown>>(ancestor) : null;
    const report = mergeBooks(base, ours, incoming);
    return { body: await sealed.seal(report.state), differs: report.differs };
  };

  return { disk, sync, sealed, bookKey, merge, app: new LocalApiClient(sealed) };
}

/** Сколько прошло по счёту и сколько на нём числится. */
async function money(app: LocalApiClient) {
  const { accounts } = await app.get<{ accounts: Row[] }>("/accounts");
  const { transactions } = await app.get<{
    transactions: Array<{ amount: number; type: string; account: { id: string } }>;
  }>("/transactions?limit=500");

  const card = accounts[0];
  const passed = transactions
    .filter((row) => row.account.id === card.id)
    .reduce((sum, row) => sum + (row.type === "EXPENSE" ? -row.amount : row.amount), 0);

  return { shown: card.balance, passed };
}

describe("остаток счёта равен тому, что по нему прошло", () => {
  it("после приезда чужой книги и новой записи поверх неё", async () => {
    // Последовательность — та, что бывает у человека каждый день: он завёл
    // операцию, в это время приехала операция со второго устройства, и он завёл
    // ещё одну, не уходя с экрана.
    const server = new FakeSyncServer();

    const pc = await device();
    await pc.app.post("/accounts", { name: "Тинька", type: "DEBIT_CARD", balance: 0 });
    const { categories } = await pc.app.get<{ categories: Array<{ id: string; kind: string }> }>(
      "/categories"
    );
    const spend = categories.find((row) => row.kind === "EXPENSE")!;
    const { accounts } = await pc.app.get<{ accounts: Row[] }>("/accounts");
    const card = accounts[0];

    const add = async (app: LocalApiClient, amount: number, what: string) =>
      app.post("/transactions", {
        type: "EXPENSE",
        amount,
        description: what,
        categoryId: spend.id,
        accountId: card.id,
        date: "2026-09-10"
      });

    await pc.sync.start(server, pc.merge);
    await pc.sync.flush();

    // Второе устройство берёт ту же книгу и тот же ключ.
    const phone = await device();
    phone.sealed.unlock(pc.bookKey);
    await phone.disk.setItem(BOOK, await pc.disk.getItem(BOOK));
    await phone.sync.start(server, phone.merge);
    await phone.sync.flush();

    await add(pc.app, 1156, "такси");
    await pc.sync.flush();

    await add(phone.app, 1000, "аптека");
    await phone.sync.flush();

    await pc.sync.flush();
    await add(pc.app, 129000, "ремонт");
    await pc.sync.flush();
    await phone.sync.flush();
    await pc.sync.flush();

    const here = await money(pc.app);
    const there = await money(phone.app);

    expect(here.shown, "на компьютере остаток разошёлся с операциями").toBe(here.passed);
    expect(there.shown, "на телефоне остаток разошёлся с операциями").toBe(there.passed);
  });

  it("при любом чередовании записей и обменов", async () => {
    // Порядок, ломающий инвариант, руками не угадать: их сотни. Поэтому не
    // угадываем, а перебираем — тридцать случайных чередований записей на двух
    // устройствах и обменов между ними. Сид печатается, так что найденное
    // чередование можно повторить дословно.
    //
    // Проверяется одно: сколько прошло по счёту — столько на нём и числится.
    // Строки сливаются по номеру и не задваиваются, поэтому список операций
    // выглядит верным даже когда остаток уже неверен.
    for (let seed = 1; seed <= 30; seed++) {
      let next = seed * 7919;
      const rand = (max: number) => {
        next = (next * 1103515245 + 12345) % 2147483648;
        return next % max;
      };

      const server = new FakeSyncServer();
      const pc = await device();
      await pc.app.post("/accounts", { name: "Тинька", type: "DEBIT_CARD", balance: 0 });
      const { categories } = await pc.app.get<{ categories: Array<{ id: string; kind: string }> }>(
        "/categories"
      );
      const spend = categories.find((row) => row.kind === "EXPENSE")!;
      const { accounts } = await pc.app.get<{ accounts: Row[] }>("/accounts");
      const card = accounts[0];

      await pc.sync.start(server, pc.merge);
      await pc.sync.flush();

      const phone = await device();
      phone.sealed.unlock(pc.bookKey);
      await phone.disk.setItem(BOOK, await pc.disk.getItem(BOOK));
      await phone.sync.start(server, phone.merge);
      await phone.sync.flush();

      const both = [pc, phone];
      for (let step = 0; step < 12; step++) {
        const who = both[rand(2)];
        if (rand(3) === 0) {
          await who.sync.flush();
          continue;
        }
        await who.app.post("/transactions", {
          type: "EXPENSE",
          amount: 100 + rand(2000),
          description: `трата-${step}`,
          categoryId: spend.id,
          accountId: card.id,
          date: "2026-09-10"
        });
      }

      // Дать обмену сойтись: несколько кругов, как в жизни.
      for (let round = 0; round < 4; round++) {
        await pc.sync.flush();
        await phone.sync.flush();
      }

      const here = await money(pc.app);
      const there = await money(phone.app);

      expect(here.shown, `компьютер, чередование ${seed}`).toBe(here.passed);
      expect(there.shown, `телефон, чередование ${seed}`).toBe(there.passed);
    }
  });
});
