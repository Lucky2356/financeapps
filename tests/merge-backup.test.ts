import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// «Объединить» при подключении: записи этого устройства ложатся к данным
// другого добавкой, ничего не заменяя.

async function device(account: string, category: string, spent: string) {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  const acc = await client.post<{ id: string }>("/accounts", {
    name: account,
    type: "DEBIT_CARD",
    balance: "1000"
  });
  const cat = await client.post<{ id: string }>("/categories", {
    name: category,
    kind: "EXPENSE",
    color: "#64748b",
    isEssential: false,
    isSubscription: false
  });
  await client.post("/transactions", {
    amount: spent,
    type: "EXPENSE",
    date: "2026-09-20",
    accountId: acc.id,
    categoryId: cat.id,
    description: `${category} ${spent}`
  });
  return client;
}

describe("объединение записей", () => {
  it("добавляет чужое к своему: категории склеивает, счета различает", async () => {
    const laptop = await device("Карта", "Кофе", "150");
    const phone = await device("Карта", "Кофе", "300");

    const backup = await laptop.get("/backup");
    const result = await phone.post<{ merged: number }>("/backup/merge", { backup });
    expect(result.merged).toBeGreaterThan(0);

    const accounts = (await phone.get("/accounts")).accounts.map((a) => a.name);
    expect(accounts.sort()).toEqual(["Карта", "Карта (2)"]);

    const coffee = (await phone.get("/categories")).categories.filter((c) => c.name === "Кофе");
    expect(coffee).toHaveLength(1);

    const rows = (await phone.get("/transactions?limit=all")).transactions;
    expect(rows.map((r) => r.description).sort()).toEqual(["Кофе 150", "Кофе 300"]);
    // Обе операции — в одной и той же категории.
    expect(new Set(rows.map((r) => r.category.id)).size).toBe(1);
  });

  it("повторное объединение той же копии ничего не удваивает", async () => {
    const laptop = await device("Наличные", "Такси", "500");
    const phone = await device("Карта", "Кофе", "100");
    const backup = await laptop.get("/backup");
    await phone.post("/backup/merge", { backup });
    await phone.post("/backup/merge", { backup });
    const rows = (await phone.get("/transactions?limit=all")).transactions;
    expect(rows).toHaveLength(2);
  });
});
