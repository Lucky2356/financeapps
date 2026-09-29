import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { fitSize, orphanedPhotos, photoKey } from "@/lib/photos/receipt-photo";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

const JPEG = `data:image/jpeg;base64,${"A".repeat(2000)}`;

async function setup() {
  const storage = new MemoryStorageAdapter();
  const client = new LocalApiClient(storage);
  const account = await client.post<{ id: string }>("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "10000"
  });
  const { categories } = await client.get<{
    categories: Array<{ id: string; name: string }>;
  }>("/categories");
  const food = categories.find((category) => category.name === "Продукты");
  const tx = await client.post<{ id: string }>("/transactions", {
    amount: "1250",
    type: "EXPENSE",
    accountId: account.id,
    categoryId: food?.id,
    date: "2026-09-27",
    description: "Пятёрочка"
  });
  return { storage, client, tx, account, food };
}

describe("фото чека: чистые правила", () => {
  it("вписывается в 1280 по длинной стороне и не растягивается", () => {
    expect(fitSize(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("«только здесь» — ключ, который синхронизация не отправляет", () => {
    expect(photoKey("tx-1", "synced")).toBe("receiptPhoto_tx-1");
    expect(photoKey("tx-1", "device")).toBe("receiptPhoto_tx-1:device");
  });

  it("сиротой становится фото только пропавшей операции", () => {
    expect(
      orphanedPhotos(
        [{ id: "a", photo: "synced" }, { id: "b", photo: "device" }, { id: "c" }],
        [{ id: "a" }]
      )
    ).toEqual([{ id: "b", place: "device" }]);
  });
});

describe("фото чека у операции", () => {
  it("прикрепляется отдельной записью, операция помнит, где оно", async () => {
    const { storage, client, tx } = await setup();
    await client.post("/photos", { transactionId: tx.id, data: JPEG, width: 10, height: 20 });

    expect(await storage.getItem(photoKey(tx.id, "synced"))).toMatchObject({ data: JPEG });
    const { transactions } = await client.get<{
      transactions: Array<{ id: string; photo?: string }>;
    }>("/transactions");
    expect(transactions.find((row) => row.id === tx.id)?.photo).toBe("synced");
    expect(await client.get(`/photos?id=${tx.id}`)).toEqual({
      photo: JPEG,
      place: "synced",
      missing: false
    });
  });

  it("правка операции фото не теряет", async () => {
    const { client, tx, account, food } = await setup();
    await client.post("/photos", { transactionId: tx.id, data: JPEG });
    await client.put("/transactions", {
      id: tx.id,
      amount: "1300",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: food?.id,
      date: "2026-09-27",
      description: "Пятёрочка"
    });
    expect(await client.get(`/photos?id=${tx.id}`)).toMatchObject({ photo: JPEG });
  });

  it("удалили операцию — фото гасится следом, чтобы исчезло и на других устройствах", async () => {
    const { storage, client, tx } = await setup();
    await client.post("/photos", { transactionId: tx.id, data: JPEG });
    await client.delete(`/transactions?id=${tx.id}`);
    expect(await storage.getItem(photoKey(tx.id, "synced"))).toMatchObject({ removed: true });
  });

  it("«только на этом устройстве» — удаляется совсем, при переносе старое место чистится", async () => {
    const { storage, client, tx } = await setup();
    await client.post("/photos", { transactionId: tx.id, data: JPEG });
    await client.post("/photos", { transactionId: tx.id, data: JPEG, place: "device" });
    expect(await storage.getItem(photoKey(tx.id, "synced"))).toMatchObject({ removed: true });
    expect(await storage.getItem(photoKey(tx.id, "device"))).toMatchObject({ data: JPEG });

    await client.delete(`/photos?id=${tx.id}`);
    expect(await storage.getItem(photoKey(tx.id, "device"))).toBeNull();
    expect(await client.get(`/photos?id=${tx.id}`)).toEqual({
      photo: null,
      place: null,
      missing: false
    });
  });

  it("отметка есть, фото нет — честно говорит, что оно на другом устройстве", async () => {
    const { storage, client, tx } = await setup();
    await client.post("/photos", { transactionId: tx.id, data: JPEG, place: "device" });
    await storage.removeItem(photoKey(tx.id, "device"));
    expect(await client.get(`/photos?id=${tx.id}`)).toEqual({
      photo: null,
      place: "device",
      missing: true
    });
  });

  it("не картинку не принимает", async () => {
    const { client, tx } = await setup();
    await expect(
      client.post("/photos", { transactionId: tx.id, data: "javascript:alert(1)" })
    ).rejects.toThrow(/фото/);
  });
});
