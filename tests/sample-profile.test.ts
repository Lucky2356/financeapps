import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SAMPLE_PROFILE_ID } from "@/types/profiles";

// Пример — в своём профиле. Раньше он ложился поверх текущих данных, и
// человек, успевший завести свой счёт, получал его вперемешку с выдуманными —
// а потом чистил всё, своё тоже.

async function names(client: LocalApiClient): Promise<string[]> {
  const page = await client.get("/accounts");
  return page.accounts.map((account) => account.name);
}

describe("пример в своём профиле", () => {
  it("не смешивается со своими данными, и к ним можно вернуться", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Моя карта", type: "DEBIT_CARD", balance: "10" });

    await client.post("/sample", {});
    const list = await client.get("/profiles");
    expect(list.activeProfileId).toBe(SAMPLE_PROFILE_ID);
    expect(await names(client)).not.toContain("Моя карта");
    expect((await names(client)).length).toBeGreaterThan(0);

    await client.post("/sample/leave", { remove: "false" });
    expect(await names(client)).toEqual(["Моя карта"]);
    // Пример остался — к нему можно вернуться из переключателя профилей.
    const kept = await client.get("/profiles");
    expect(kept.profiles.some((p) => p.id === SAMPLE_PROFILE_ID)).toBe(true);
  });

  it("«Удалить пример» убирает профиль и возвращает к своим", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Наличка", type: "CASH", balance: "1" });
    await client.post("/sample", {});

    await client.post("/sample/leave", { remove: "true" });

    const list = await client.get("/profiles");
    expect(list.profiles.map((p) => p.id)).not.toContain(SAMPLE_PROFILE_ID);
    expect(await names(client)).toEqual(["Наличка"]);
  });

  it("повторная загрузка примера не плодит профили", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/sample", {});
    await client.post("/sample", {});
    const list = await client.get("/profiles");
    expect(list.profiles.filter((p) => p.id === SAMPLE_PROFILE_ID)).toHaveLength(1);
  });
});
