import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// GUARD: то, что приложение показывает, обязано совпадать с тем, что лежит на
// диске.
//
// LocalApiClient держит книгу в памяти, чтобы не читать хранилище на каждый
// запрос, и кладёт в кэш отдельную копию при каждом сохранении. Разойтись они
// не должны никогда: расхождение показало бы человеку остаток, которого на
// диске нет, — и до перезапуска он выглядел бы настоящим.
//
// Проверяется не устройство кэша, а само свойство, поэтому тест переживёт любую
// его переделку.
// Ключ книги основного профиля — см. profileStateKey и DEFAULT_PROFILE.
const STATE_KEY = "localFinanceState_profile-default";

const stored = (storage: MemoryStorageAdapter) =>
  storage.getItem<Record<string, unknown>>(STATE_KEY);

describe("кэш книги не расходится с хранилищем", () => {
  it("после добавления счёта", async () => {
    const storage = new MemoryStorageAdapter();
    const api = new LocalApiClient(storage);

    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "1000" });

    const shown = await api.get<{ accounts: Array<{ name: string }> }>("/accounts");
    const disk = (await stored(storage)) as { accounts: Array<{ name: string }> } | null;

    expect(shown.accounts.map((a) => a.name)).toEqual(["Карта"]);
    expect(disk?.accounts.map((a) => a.name)).toEqual(shown.accounts.map((a) => a.name));
  });

  it("после добавления операции и её правки", async () => {
    const storage = new MemoryStorageAdapter();
    const api = new LocalApiClient(storage);
    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "10000" });
    const accounts = await api.get<{ accounts: Array<{ id: string }> }>("/accounts");
    const categories = await api.get<{ categories: Array<{ id: string; kind: string }> }>(
      "/categories"
    );
    const accountId = accounts.accounts[0].id;
    const categoryId = categories.categories.find((c) => c.kind === "EXPENSE")!.id;

    const created = await api.post<{ id: string }>("/transactions", {
      amount: "500",
      type: "EXPENSE",
      accountId,
      categoryId,
      date: "2026-09-01",
      description: "Продукты"
    });
    await api.put("/transactions", {
      id: created.id,
      amount: "700",
      type: "EXPENSE",
      accountId,
      categoryId,
      date: "2026-09-01",
      description: "Продукты подороже"
    });

    const shown = await api.get<{ transactions: Array<{ amount: number; description: string }> }>(
      "/transactions?limit=all"
    );
    const disk = (await stored(storage)) as {
      transactions: Array<{ amount: number; description: string }>;
    } | null;

    expect(shown.transactions[0].amount).toBe(700);
    expect(disk?.transactions.map((t) => [t.description, t.amount])).toEqual(
      shown.transactions.map((t) => [t.description, t.amount])
    );
  });
});
