import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient, type BeforeClearCopy } from "@/lib/api/LocalApiClient";
import type { AccountsPageData } from "@/lib/data";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// «Очистить все данные» нажимают и по ошибке. Неделю очистку можно отменить.

async function names(client: LocalApiClient): Promise<string[]> {
  const page = await client.get<AccountsPageData>("/accounts");
  return page.accounts.map((account) => account.name).sort();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("копия перед очисткой", () => {
  it("очистка откладывает копию, а «Вернуть» возвращает всё", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "100" });
    await client.post("/accounts", { name: "Наличные", type: "CASH", balance: "5" });

    await client.delete("/storage/clear");
    expect(await names(client)).toEqual([]);
    const copy = await client.get<BeforeClearCopy | null>("/backup/before-clear");
    expect(copy?.savedAt).toBeTruthy();

    await client.post("/backup/before-clear", {});
    expect(await names(client)).toEqual(["Карта", "Наличные"]);
    // Вернули — копия больше не нужна.
    expect(await client.get("/backup/before-clear")).toBeNull();
  });

  it("живёт неделю", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "1" });
    await client.delete("/storage/clear");

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await client.get("/backup/before-clear")).toBeNull();
    await expect(client.post("/backup/before-clear", {})).rejects.toThrow(/неделю/);
  });

  it("без очистки копии нет", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    expect(await client.get("/backup/before-clear")).toBeNull();
  });
});
