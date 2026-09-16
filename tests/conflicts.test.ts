import { beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { LOCAL_ONLY_KEYS } from "@/lib/storage/SyncingStorageAdapter";
import type { RowConflict } from "@/lib/sync/merge";
import { CONFLICTS_KEY, ConflictStore } from "@/lib/vault/conflicts";

const NOW = "2026-09-16T12:00:00.000Z";
const LATER = "2026-09-16T13:00:00.000Z";

const conflict = (key: string, amount: number): RowConflict => ({
  collection: "transactions",
  key,
  mine: { id: key, amount },
  theirs: { id: key, amount: amount * 2 },
  chosen: "theirs"
});

describe("хранилище спорных строк", () => {
  let storage: MemoryStorageAdapter;
  let store: ConflictStore;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    store = new ConflictStore(storage);
  });

  it("не уезжает на сервер", () => {
    // Спор разбирает тот, кто его увидел; решение уедет обычной правкой. Если
    // имена разойдутся, спорные строки поедут на сервер, и никто не заметит —
    // работать будет ровно так же.
    expect(LOCAL_ONLY_KEYS).toContain(CONFLICTS_KEY);
  });

  it("запоминает и отдаёт обратно", async () => {
    await store.add("слот", [conflict("t1", 100)], NOW);
    expect(await store.list()).toHaveLength(1);
    expect((await store.list())[0]).toMatchObject({ slot: "слот", key: "t1", noticedAt: NOW });
  });

  it("повторный спор о той же строке замещает прежний, а не ложится рядом", async () => {
    // Книга с тех пор ушла вперёд; показывать позавчерашние версии значило бы
    // предлагать выбрать из того, чего уже нет.
    await store.add("слот", [conflict("t1", 100)], NOW);
    await store.add("слот", [conflict("t1", 500)], LATER);

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].mine).toMatchObject({ amount: 500 });
    expect(list[0].noticedAt).toBe(LATER);
  });

  it("одна и та же строка в разных ячейках — это два разных спора", async () => {
    await store.add("первый", [conflict("t1", 100)], NOW);
    await store.add("второй", [conflict("t1", 100)], NOW);
    expect(await store.list()).toHaveLength(2);
  });

  it("разобранный спор уходит", async () => {
    await store.add("слот", [conflict("t1", 100), conflict("t2", 200)], NOW);
    const [first] = await store.list();
    await store.resolve(first);

    expect((await store.list()).map((item) => item.key)).toEqual(["t2"]);
  });

  it("подписчику сообщают об изменениях", async () => {
    const seen: number[] = [];
    store.onChange((list) => seen.push(list.length));

    await store.add("слот", [conflict("t1", 100)], NOW);
    await store.resolve((await store.list())[0]);

    expect(seen).toEqual([1, 0]);
  });

  it("пустой список ничего не пишет и не будит подписчиков", async () => {
    let woken = 0;
    store.onChange(() => {
      woken += 1;
    });
    await store.add("слот", [], NOW);
    expect(woken).toBe(0);
  });
});

describe("решение по спорной строке", () => {
  let storage: MemoryStorageAdapter;
  let client: LocalApiClient;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();
    client = new LocalApiClient(storage);
    await client.get("/accounts");
  });

  const stored = async () =>
    storage.getItem<{ transactions: Array<Record<string, unknown>>; deletions?: unknown[] }>(
      "localFinanceState_profile-default"
    );

  async function seedTransaction(): Promise<string> {
    const account = await client.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: 1000
    });
    const { categories } = await client.get<{ categories: Array<{ id: string; kind: string }> }>(
      "/categories"
    );
    const created = await client.post<{ id: string }>("/transactions", {
      amount: 700,
      type: "EXPENSE",
      accountId: account.id,
      categoryId: categories.find((row) => row.kind === "EXPENSE")?.id,
      date: "2026-09-16",
      description: "обед"
    });
    return created.id;
  }

  it("выбранная версия ложится в книгу", async () => {
    const id = await seedTransaction();
    const before = await stored();
    const row = before?.transactions.find((item) => item.id === id);

    await client.post("/sync/resolve", {
      collection: "transactions",
      key: id,
      row: { ...row, description: "ужин" }
    });

    const after = await stored();
    expect(after?.transactions.find((item) => item.id === id)?.description).toBe("ужин");
  });

  it("выбор «удалено» убирает строку и оставляет след", async () => {
    const id = await seedTransaction();

    await client.post("/sync/resolve", { collection: "transactions", key: id, row: null });

    const after = await stored();
    expect(after?.transactions.find((item) => item.id === id)).toBeUndefined();
    expect(after?.deletions).toContainEqual(
      expect.objectContaining({ collection: "transactions", key: id })
    );
  });

  it("решение проходит обычным сохранением — со свежей отметкой времени", async () => {
    const id = await seedTransaction();
    const before = (await stored())?.transactions.find((item) => item.id === id);

    await new Promise((resolve) => setTimeout(resolve, 2));
    await client.post("/sync/resolve", {
      collection: "transactions",
      key: id,
      row: { ...before, amount: 999 }
    });

    const after = (await stored())?.transactions.find((item) => item.id === id);
    expect(after?.updatedAt).not.toBe(before?.updatedAt);
  });

  it("несуществующий раздел — это ошибка, а не тихая порча книги", async () => {
    await expect(
      client.post("/sync/resolve", { collection: "выдумка", key: "x", row: {} })
    ).rejects.toThrow(/выдумка/);
  });
});
