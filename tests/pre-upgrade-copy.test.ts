import { describe, expect, it } from "vitest";

import { LocalApiClient, type PreUpgradeBackup } from "@/lib/api/LocalApiClient";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { PRE_UPGRADE_SUFFIX } from "@/lib/storage/SyncingStorageAdapter";

// Копия книги перед переводом на новую схему.
//
// Схемы едут только вперёд, миграции необратимы, и единственный способ
// вернуться — сохранить прежнюю книгу, пока она ещё существует. Нужно это в
// одном случае, зато в важном: человек поставил себе пробную сборку раньше
// остальных, и она оказалась плохой.

const BOOK = "localFinanceState_profile-default";
const COPY = `${BOOK}${PRE_UPGRADE_SUFFIX}`;

/** Книга старой схемы — ровно то, что лежало бы на диске до обновления. */
function oldBook(schemaVersion: number, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion,
    accounts: [{ id: "acc-1", name: "Карта", type: "DEBIT_CARD", balance: 1000, currency: "RUB" }],
    transactions: [],
    categories: [],
    ...extra
  };
}

async function openWith(stored: Record<string, unknown>) {
  const storage = new MemoryStorageAdapter();
  await storage.setItem(BOOK, stored);
  const client = new LocalApiClient(storage);
  // Любое чтение книги проходит через ту самую точку, где снимается копия.
  await client.get("/settings");
  return { storage, client };
}

describe("копия книги до перевода на новую схему", () => {
  it("снимается, когда схему действительно поднимают", async () => {
    const { storage } = await openWith(oldBook(15));

    const copy = (await storage.getItem(COPY)) as {
      fromVersion: number;
      toVersion: number;
      document: { schemaVersion: number };
    } | null;

    expect(copy, "копии нет — откатываться будет не с чего").not.toBeNull();
    expect(copy?.fromVersion).toBe(15);
    expect(copy?.toVersion).toBe(LATEST_LOCAL_STATE_VERSION);
    // В копии лежит СТАРАЯ схема — иначе прежняя версия её не примет, и вся
    // затея бессмысленна.
    expect(copy?.document.schemaVersion).toBe(15);
  });

  it("не снимается, когда переводить нечего", async () => {
    // Обновление, не трогающее схему, — самый частый случай. Копировать книгу
    // на каждом запуске значило бы удваивать её без всякой причины.
    const { storage } = await openWith(oldBook(LATEST_LOCAL_STATE_VERSION));

    expect(await storage.getItem(COPY)).toBeNull();
  });

  it("книга в копии остаётся прежней, а не переведённой", async () => {
    const { storage } = await openWith(oldBook(15));

    const copy = (await storage.getItem(COPY)) as { document: Record<string, unknown> };
    const live = (await storage.getItem(BOOK)) as { schemaVersion: number };

    expect(live.schemaVersion).toBe(LATEST_LOCAL_STATE_VERSION);
    expect(copy.document.schemaVersion).toBe(15);
    expect((copy.document.accounts as Array<{ id: string }>)[0].id).toBe("acc-1");
  });

  it("отдаётся наружу готовой к развёртыванию прежней версией", async () => {
    const { client } = await openWith(oldBook(15));

    const copy = await client.get<PreUpgradeBackup | null>("/backup/before-upgrade");

    expect(copy).not.toBeNull();
    expect(copy?.fromVersion).toBe(15);
    expect(copy?.backup.schemaVersion).toBe(15);
    expect(typeof copy?.savedAt).toBe("string");
  });

  it("ключ помощника в файл не уезжает", async () => {
    // Та же причина, что и в обычной выгрузке: файл уходит с машины — в облако,
    // в мессенджер, на флешку, — а ключ принадлежит машине. И восстанавливать
    // его из копии никому не нужно.
    const { client } = await openWith(oldBook(15, { aiApiKey: "секретный-ключ" }));

    const copy = await client.get<PreUpgradeBackup | null>("/backup/before-upgrade");

    expect(copy?.backup.aiApiKey).toBeUndefined();
    expect(JSON.stringify(copy)).not.toContain("секретный-ключ");
  });

  it("обычная жизнь книги копий не плодит", async () => {
    // Здесь проверяется не миграция, а её ОТСУТСТВИЕ на самом частом пути:
    // книга заводится, наполняется примером, читается снова. Появись копия
    // здесь — она снималась бы при каждом запуске, удваивая книгу на диске и
    // добавляя лишнюю запись туда, где её никто не ждёт.
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);

    await client.post("/sample", {});
    await client.get("/settings");

    expect(await storage.getItem(COPY)).toBeNull();
  });

  it("копии нет — отдаётся пустота, а не поломка", async () => {
    const { client } = await openWith(oldBook(LATEST_LOCAL_STATE_VERSION));

    expect(await client.get<PreUpgradeBackup | null>("/backup/before-upgrade")).toBeNull();
  });

  it("следующий перевод заменяет копию, а не копит их рядом", async () => {
    // Вернуться можно на шаг назад, а не на пять: приложения, читающего схему
    // пятилетней давности, всё равно уже нет. Ряд копий рос бы без конца.
    const storage = new MemoryStorageAdapter();
    await storage.setItem(BOOK, oldBook(14));
    await new LocalApiClient(storage).get("/settings");

    const first = (await storage.getItem(COPY)) as { fromVersion: number };
    expect(first.fromVersion).toBe(14);

    // Книгу вернули на промежуточную схему и открыли снова.
    await storage.setItem(BOOK, oldBook(15));
    await new LocalApiClient(storage).get("/settings");

    const second = (await storage.getItem(COPY)) as { fromVersion: number };
    expect(second.fromVersion).toBe(15);

    const keys = await storage.keys();
    expect(keys.filter((key) => key.endsWith(PRE_UPGRADE_SUFFIX))).toHaveLength(1);
  });
});
