import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Один чек — несколько категорий.

async function setup() {
  const api = new LocalApiClient(new MemoryStorageAdapter());
  const account = await api.post("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "10000"
  });
  const food = await api.post("/categories", {
    name: "Еда из чека",
    kind: "EXPENSE"
  });
  const home = await api.post("/categories", {
    name: "Дом из чека",
    kind: "EXPENSE"
  });
  return { api, account, food, home };
}

describe("разделить операцию", () => {
  it("пишет части с общей меткой и списывает сумму целиком", async () => {
    const { api, account, food, home } = await setup();
    const parts = await api.post("/transactions", {
      action: "split",
      type: "EXPENSE",
      accountId: account.id,
      date: "2026-09-27",
      description: "Пятёрочка",
      parts: JSON.stringify([
        { categoryId: food.id, amount: "1900" },
        { categoryId: home.id, amount: "440" }
      ])
    });

    expect(parts).toHaveLength(2);
    expect(new Set(parts.map((p) => p.splitGroupId)).size).toBe(1);
    const accounts = await api.get("/accounts");
    expect(accounts.accounts.find((a) => a.id === account.id)?.balance).toBe(10000 - 2340);
  });

  it("удаляется целиком — и деньги возвращаются на счёт", async () => {
    const { api, account, food, home } = await setup();
    const parts = await api.post("/transactions", {
      action: "split",
      type: "EXPENSE",
      accountId: account.id,
      date: "2026-09-27",
      parts: JSON.stringify([
        { categoryId: food.id, amount: "100" },
        { categoryId: home.id, amount: "50" }
      ])
    });
    await api.delete(`/transactions?splitGroupId=${parts[0].splitGroupId}`);

    const list = await api.get("/transactions");
    expect(list.transactions.filter((tx) => tx.splitGroupId)).toHaveLength(0);
    const accounts = await api.get("/accounts");
    expect(accounts.accounts.find((a) => a.id === account.id)?.balance).toBe(10000);
  });

  it("правка одной части не отрывает её от покупки", async () => {
    const { api, account, food, home } = await setup();
    const parts = await api.post("/transactions", {
      action: "split",
      type: "EXPENSE",
      accountId: account.id,
      date: "2026-09-27",
      parts: JSON.stringify([
        { categoryId: food.id, amount: "100" },
        { categoryId: home.id, amount: "50" }
      ])
    });
    // Форма правки группу не присылает — только поля операции.
    await api.put("/transactions", {
      id: parts[1].id,
      type: "EXPENSE",
      accountId: account.id,
      categoryId: home.id,
      amount: "70",
      date: "2026-09-27"
    });

    const list = await api.get("/transactions");
    const edited = list.transactions.find((tx) => tx.id === parts[1].id);
    expect(edited?.amount).toBe(70);
    expect(edited?.splitGroupId).toBe(parts[0].splitGroupId);
  });

  it("часть с чужой категорией — не пишется ни одна", async () => {
    const { api, account, food } = await setup();
    await expect(
      api.post("/transactions", {
        action: "split",
        type: "EXPENSE",
        accountId: account.id,
        date: "2026-09-27",
        parts: JSON.stringify([
          { categoryId: food.id, amount: "100" },
          { categoryId: "нет-такой", amount: "50" }
        ])
      })
    ).rejects.toThrow();
    const list = await api.get("/transactions");
    expect(list.transactions).toHaveLength(0);
  });
});
