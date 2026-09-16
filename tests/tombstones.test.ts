import { beforeEach, describe, expect, it } from "vitest";

import { localStateSchema } from "@/lib/api/local/schemas";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import { TOMBSTONE_DAYS, trackDeletions, type Tombstone } from "@/lib/sync/row-stamps";

const NOW = "2026-09-15T12:00:00.000Z";
const LONG_AGO = "2025-01-01T00:00:00.000Z";

type Book = Record<string, unknown>;

const track = (next: Book, previous: Book | null, now = NOW): Book =>
  trackDeletions(next, previous, now);

const marks = (book: Book): Tombstone[] => (book.deletions ?? []) as Tombstone[];

describe("следы удалений", () => {
  it("исчезнувшая строка оставляет след", () => {
    const before = { transactions: [{ id: "t1" }, { id: "t2" }] };
    const after = track({ transactions: [{ id: "t1" }] }, before);

    expect(marks(after)).toEqual([{ collection: "transactions", key: "t2", deletedAt: NOW }]);
  });

  it("правка следа не оставляет", () => {
    const before = { transactions: [{ id: "t1", amount: 100 }] };
    const after = track({ transactions: [{ id: "t1", amount: 250 }] }, before);

    expect(marks(after)).toEqual([]);
  });

  it("первое сохранение следов не наводит", () => {
    // Прошлого состояния нет — значит, и сравнивать не с чем. Сочти мы всё
    // отсутствующее удалённым, первая же запись похоронила бы пустую книгу.
    const after = track({ transactions: [{ id: "t1" }] }, null);
    expect(marks(after)).toEqual([]);
  });

  it("заведённая заново строка след снимает", () => {
    // Так выглядит отмена удаления: строка возвращается с тем же номером.
    // Останься след — слияние поверило бы ему и убрало бы строку у всех.
    const deleted = track({ transactions: [] }, { transactions: [{ id: "t1" }] });
    expect(marks(deleted)).toHaveLength(1);

    const restored = track({ ...deleted, transactions: [{ id: "t1" }] }, { transactions: [] });
    expect(marks(restored)).toEqual([]);
  });

  it("след старше срока забывается", () => {
    const old: Tombstone = { collection: "transactions", key: "t1", deletedAt: LONG_AGO };
    const fresh: Tombstone = { collection: "transactions", key: "t2", deletedAt: NOW };
    const after = track({ transactions: [], deletions: [old, fresh] }, null);

    expect(marks(after)).toEqual([fresh]);
  });

  it("срок отсчитывается от сегодняшнего дня, а не от края календаря", () => {
    const day = 24 * 60 * 60 * 1000;
    const inside = new Date(Date.parse(NOW) - (TOMBSTONE_DAYS - 1) * day).toISOString();
    const outside = new Date(Date.parse(NOW) - (TOMBSTONE_DAYS + 1) * day).toISOString();
    const after = track(
      {
        transactions: [],
        deletions: [
          { collection: "transactions", key: "внутри", deletedAt: inside },
          { collection: "transactions", key: "снаружи", deletedAt: outside }
        ]
      },
      null
    );

    expect(marks(after).map((mark) => mark.key)).toEqual(["внутри"]);
  });

  it("план опознаётся месяцем и статьёй, а не номером", () => {
    const before = { plans: [{ month: "2026-01", categoryId: "cat-food", amount: 100 }] };
    const after = track({ plans: [] }, before);

    expect(marks(after)).toEqual([
      { collection: "plans", key: JSON.stringify(["2026-01", "cat-food"]), deletedAt: NOW }
    ]);
  });

  it("одинаковый номер в разных разделах — это два разных следа", () => {
    const before = { transactions: [{ id: "x" }], goals: [{ id: "x" }] };
    const after = track({ transactions: [], goals: [] }, before);

    expect(marks(after).map((mark) => mark.collection).sort()).toEqual(["goals", "transactions"]);
  });
});

describe("след доживает до диска", () => {
  it("разбор схемы его не срезает", () => {
    // z.object без strict молча выкидывает всё, чего не знает. Опиши мы след
    // только в типе — он исчезал бы при каждом разборе книги, и слияние
    // возвращало бы удалённые операции обратно.
    const parsed = localStateSchema.safeParse({
      schemaVersion: 16,
      accounts: [],
      categories: [],
      deletions: [{ collection: "transactions", key: "t1", deletedAt: NOW }]
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.deletions).toEqual([
      { collection: "transactions", key: "t1", deletedAt: NOW }
    ]);
  });
});

describe("удаление через приложение", () => {
  let storage: MemoryStorageAdapter;
  let client: LocalApiClient;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    client = new LocalApiClient(storage);
  });

  const stored = () =>
    storage.getItem<{ deletions?: Tombstone[] }>("localFinanceState_profile-default");

  it("удалённая операция оставляет след в книге", async () => {
    const account = await client.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: 1000
    });
    const { categories } = await client.get<{ categories: Array<{ id: string; kind: string }> }>(
      "/categories"
    );
    const expense = categories.find((row) => row.kind === "EXPENSE");
    const created = await client.post<{ id: string }>("/transactions", {
      amount: 700,
      type: "EXPENSE",
      accountId: account.id,
      categoryId: expense?.id,
      date: "2026-09-15",
      description: "обед"
    });

    await client.delete(`/transactions?id=${created.id}`);

    const book = await stored();
    expect(book?.deletions).toContainEqual(
      expect.objectContaining({ collection: "transactions", key: created.id })
    );
  });

  it("книга, дожившая до v16, чужих удалений не выдумывает", async () => {
    await storage.setItem("localFinanceState_profile-default", {
      schemaVersion: 15,
      accounts: [{ id: "a1", name: "Старый счёт", type: "CASH", balance: 10, currency: "RUB" }],
      categories: [],
      transactions: []
    });
    const upgraded = new LocalApiClient(storage);
    await upgraded.get("/accounts");

    const book = await stored();
    expect(book?.deletions).toEqual([]);
    expect(
      (await storage.getItem<{ schemaVersion: number }>("localFinanceState_profile-default"))
        ?.schemaVersion
    ).toBe(LATEST_LOCAL_STATE_VERSION);
  });
});
