/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { flushWhenAppReturns, refreshWhenBooksArrive } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { mergeBooks } from "@/lib/sync/merge";
import { createVault } from "@/lib/sync/vault-crypto";

// Живая синхронизация: приложение открыто на ОБОИХ устройствах.
//
// Всё, что ниже, доезжало и раньше — книга ложилась на диск, journalctl это
// исправно показывал. Не доезжало оно до экрана: слой синхронизации пишет книгу
// ПОД приложением, ниже того места, где приложение объявляет о своих записях.
// Снаружи это неотличимо от «синхронизации нет»: операция с телефона на
// компьютере не появлялась до перезапуска, и наоборот.

const FAST = { iterations: 1 };
const BOOK = "localFinanceState_profile-default";

const teardown: Array<() => void> = [];
afterEach(() => {
  while (teardown.length) teardown.pop()?.();
});

/** Устройство со всеми тремя слоями — так же, как в lib/vault/runtime. */
async function device() {
  const { vault, bookKey } = await createVault("пароль", FAST);
  const disk = new MemoryStorageAdapter();
  const sync = new SyncingStorageAdapter(disk);
  const sealed = new EncryptingStorageAdapter(sync);
  sealed.unlock(bookKey);
  const app = new LocalApiClient(sealed);

  const merge: Merge = async (_slot, mine, theirs, ancestor) => {
    const ours = mine ? await sealed.open<Record<string, unknown>>(mine) : {};
    const incoming = await sealed.open<Record<string, unknown>>(theirs);
    const base = ancestor ? await sealed.open<Record<string, unknown>>(ancestor) : null;
    const report = mergeBooks(base, ours, incoming);
    return { body: await sealed.seal(report.state), differs: report.differs };
  };

  return { vault, bookKey, disk, sync, sealed, app, merge };
}

describe("живая синхронизация", () => {
  it("приезд книги поднимает экраны", async () => {
    // Без этого операция с другого устройства ложится на диск и остаётся там до
    // перезапуска приложения. Ровно это и увидел человек на живой паре.
    const pc = await device();
    const heard: string[] = [];
    teardown.push(onDataChanged(() => heard.push("перечитать")));
    teardown.push(refreshWhenBooksArrive(pc.sync, pc.app, (run) => run()));

    await pc.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });
    heard.length = 0;

    // Так выглядит приехавшая книга: слой синхронизации объявляет о слиянии.
    (pc.sync as unknown as { announce(slot: string): void }).announce("книга");

    expect(heard).toEqual(["перечитать"]);
  });

  it("после записи поверх приехавшего экран читает СЛИТОЕ, а не своё", async () => {
    // Самое тонкое место, и проверять его надо по прочитанному, а не по порядку
    // вызовов. Приложение, сохранив книгу, кладёт её же в память — и делает это
    // СРАЗУ ПОСЛЕ записи. А запись — ровно тот миг, когда слой синхронизации
    // подмешивает строки с другого устройства. Забудь мы память раньше, эта
    // строка вернула бы её обратно: экран честно перечитал бы себя и показал
    // книгу БЕЗ приехавшего счёта.
    const pc = await device();
    await pc.app.get("/accounts");
    teardown.push(refreshWhenBooksArrive(pc.sync, pc.app, (run) => setTimeout(run, 0)));

    // Книга ПОЛНАЯ, а не обрубок из двух полей. Слияние берёт чужую книгу за
    // основу и подмешивает в неё наши строки; подсунь сюда огрызок, на выходе
    // получится книга без половины полей, приложение её не примет — и проверка
    // упадёт, рассказывая совсем не о том, что проверяет.
    const ourBook = await pc.sealed.open<Record<string, unknown>>(
      (await pc.disk.getItem(BOOK)) as never
    );
    const theirs = await pc.sealed.seal({
      ...ourBook,
      accounts: [
        {
          id: "a1",
          name: "Телефонный",
          type: "DEBIT_CARD",
          balance: 500,
          updatedAt: "2026-01-01T00:00:00Z"
        }
      ]
    });
    (pc.sync as unknown as { applied: Map<string, unknown> }).applied.set(BOOK, {
      body: theirs,
      base: null
    });
    (pc.sync as unknown as { merge: Merge }).merge = pc.merge;

    await pc.app.post("/accounts", { name: "Своя", type: "DEBIT_CARD", balance: 100 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const seen = await pc.app.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(seen.accounts.map((row) => row.name).sort()).toEqual(["Своя", "Телефонный"]);
  });

  it("книга, приехавшая посреди записи, доходит до экрана", async () => {
    // Слияние случается и внутри setItem — когда приезд опередил запись
    // человека. Раньше этот путь молчал: объявлялся только приезд, разобранный
    // очередью, а этот — нет.
    const pc = await device();
    const heard: string[] = [];
    teardown.push(refreshWhenBooksArrive(pc.sync, pc.app, (run) => run()));
    teardown.push(onDataChanged(() => heard.push("перечитать")));

    const theirs = await pc.sealed.seal({
      schemaVersion: 16,
      accounts: [{ id: "a1", name: "Телефонный", balance: 500, updatedAt: "2026-01-01T00:00:00Z" }]
    });
    (pc.sync as unknown as { applied: Map<string, unknown> }).applied.set(
      "localFinanceState_profile-default",
      { body: theirs, base: null }
    );
    (pc.sync as unknown as { merge: Merge }).merge = pc.merge;

    heard.length = 0;
    await pc.app.post("/accounts", { name: "Своя", type: "DEBIT_CARD", balance: 100 });

    expect(heard).toContain("перечитать");
  });

  it("возвращение к приложению толкает очередь, а не ждёт подписку", async () => {
    // Подписка переподключается сама, но с паузой до минуты, и на телефоне она
    // успевает вырасти: соединение рвётся каждый уход в фон. Эта минута — ровно
    // то время, за которое человек решит, что синхронизация не работает.
    const flush = vi.fn().mockResolvedValue(undefined);
    teardown.push(flushWhenAppReturns({ flush }));

    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
