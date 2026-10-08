import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Сверка с банком: в банке другой остаток — разница записывается операцией.

describe("сверка с банком", () => {
  async function setup() {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "10000"
    });
    const balance = async () =>
      (await api.get("/accounts")).accounts.find((a) => a.id === card.id)!.balance;
    return { api, card, balance };
  }

  it("в банке меньше — записывается трата «Сверка с банком», остаток становится банковским", async () => {
    const { api, card, balance } = await setup();
    const result = await api.post("/accounts", {
      action: "reconcile",
      id: card.id,
      balance: "9 250,50"
    });
    expect(result).toMatchObject({ recorded: true, difference: -749.5 });
    expect(await balance()).toBe(9250.5);
    const [row] = (await api.get("/transactions?period=all")).transactions;
    expect(row).toMatchObject({ type: "EXPENSE", amount: 749.5, description: "Сверка с банком" });
    expect(row.category.label).toBe("Сверка с банком");
  });

  it("в банке больше — доход; сходится — ничего не пишется", async () => {
    const { api, card, balance } = await setup();
    await api.post("/accounts", { action: "reconcile", id: card.id, balance: "10500" });
    expect(await balance()).toBe(10500);
    const again = await api.post("/accounts", {
      action: "reconcile",
      id: card.id,
      balance: "10500"
    });
    expect(again.recorded).toBe(false);
    const rows = (await api.get("/transactions?period=all")).transactions;
    expect(rows.map((row) => row.type)).toEqual(["INCOME"]);
  });
});
