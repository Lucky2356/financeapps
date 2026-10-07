import { afterEach, describe, expect, it, vi } from "vitest";

import { LOCAL_COPIES_KEEP, LocalApiClient, type LocalCopy } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { LOCAL_COPY_SUFFIX, SyncingStorageAdapter } from "@/lib/storage/SyncingStorageAdapter";
import { FakeSyncServer } from "./helpers/fake-sync-server";

// Главное устройство и синхронизируется, и держит у себя копии всех данных —
// чтобы вернуть их, если синхронизация однажды привезёт не то.

async function names(client: LocalApiClient): Promise<string[]> {
  const page = await client.get("/accounts");
  return page.accounts.map((account) => account.name).sort();
}

const copies = (client: LocalApiClient) => client.get("/backup/local-copies");

afterEach(() => {
  vi.useRealTimers();
});

describe("копии на этом устройстве", () => {
  it("копия по кнопке — и «Вернуть» возвращает всё, как было", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "100" });
    const copy = await client.post<LocalCopy>("/backup/local-copies", { action: "take" });
    expect(copy.reason).toBe("manual");

    await client.post("/accounts", { name: "Лишний", type: "CASH", balance: "1" });
    expect(await names(client)).toEqual(["Карта", "Лишний"]);

    await client.post("/backup/local-copies", { action: "restore", id: copy.id });
    expect(await names(client)).toEqual(["Карта"]);

    // Нынешнее перед возвратом тоже отложено — передумать можно.
    const list = await copies(client);
    expect(list.map((item) => item.reason)).toEqual(["before-restore", "manual"]);
  });

  it("ежедневная — одна в день", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 29, 10, 0));
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "1" });

    expect(await client.post("/backup/local-copies", { action: "daily" })).not.toBeNull();
    expect(await client.post("/backup/local-copies", { action: "daily" })).toBeNull();
    expect(await copies(client)).toHaveLength(1);

    vi.setSystemTime(new Date(2026, 8, 30, 9, 0));
    expect(await client.post("/backup/local-copies", { action: "daily" })).not.toBeNull();
    expect(await copies(client)).toHaveLength(2);
  });

  it(`хранит ${LOCAL_COPIES_KEEP} последних, старые убирает с диска`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const disk = new MemoryStorageAdapter();
    const client = new LocalApiClient(disk);
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "1" });
    for (let day = 1; day <= LOCAL_COPIES_KEEP + 3; day += 1) {
      vi.setSystemTime(new Date(2026, 8, day, 10, 0));
      await client.post("/backup/local-copies", { action: "daily" });
    }
    const list = await copies(client);
    expect(list).toHaveLength(LOCAL_COPIES_KEEP);
    expect(new Date(list[0].savedAt).getDate()).toBe(LOCAL_COPIES_KEEP + 3);
    const onDisk = (await disk.keys()).filter(
      (key) => key.endsWith(LOCAL_COPY_SUFFIX) && key.startsWith("financeCopy_")
    );
    expect(onDisk).toHaveLength(LOCAL_COPIES_KEEP);
  });

  it("копии не уезжают на сервер", async () => {
    const server = new FakeSyncServer();
    const sync = new SyncingStorageAdapter(new MemoryStorageAdapter(), () => {});
    await sync.start(server, async (_slot, _mine, theirs) => ({ body: theirs, differs: false }));
    // Копия лежит под «своим» ключом; слой синхронизации видит только форму.
    await sync.setItem(`financeCopy_1${LOCAL_COPY_SUFFIX}`, {
      v: 1,
      alg: "AES-GCM",
      iv: "iv",
      ct: "копия"
    });
    await sync.flush();
    expect(await server.list()).toEqual([]);
  });

  it("чужой копии нет — понятный отказ", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await expect(
      client.post("/backup/local-copies", { action: "restore", id: "нет" })
    ).rejects.toThrow(/нет/);
  });
});
