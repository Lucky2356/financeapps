import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Разбор копий перед 2.8.3: фото чеков, не возвращавшиеся с копией,
// остатки после «Объединить» с общими счетами и копия от новой версии,
// названная «не копией».

const JPEG = `data:image/jpeg;base64,${"A".repeat(2000)}`;

let clock = new Date(2026, 9, 26, 12).getTime();
/** Шаг часов: местные копии называются по миллисекунде, и двум в одну нельзя. */
function tick(minutes = 1) {
  clock += minutes * 60_000;
  vi.setSystemTime(new Date(clock));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock = new Date(2026, 9, 26, 12).getTime();
  vi.setSystemTime(new Date(clock));
});
afterEach(() => vi.useRealTimers());

async function expenseCategory(client: LocalApiClient) {
  const { categories } = await client.get("/categories");
  return categories.find((item) => item.kind === "EXPENSE")!;
}

async function withPhoto(place: "synced" | "device" = "synced") {
  const storage = new MemoryStorageAdapter();
  const client = new LocalApiClient(storage);
  const account = await client.post("/accounts", { name: "Карта", balance: "10000" });
  const category = await expenseCategory(client);
  const tx = await client.post("/transactions", {
    amount: "1250",
    type: "EXPENSE",
    accountId: account.id,
    categoryId: category.id,
    date: "2026-10-20",
    description: "Пятёрочка"
  });
  await client.post("/photos", { transactionId: tx.id, data: JPEG, place });
  tick();
  return { storage, client, tx, account, category };
}

async function emptyBackup() {
  return new LocalApiClient(new MemoryStorageAdapter()).get("/backup");
}

describe("фото чеков возвращаются вместе с операцией", () => {
  it("«Вернуть» местную копию после восстановления пустой копии", async () => {
    const { client, tx } = await withPhoto();
    const copy = await client.post("/backup/local-copies");
    tick();
    await client.post("/backup", { backup: await emptyBackup() });
    expect(await client.get(`/photos?id=${tx.id}`)).toMatchObject({ photo: null });
    tick();
    await client.post("/backup/local-copies", { action: "restore", id: copy.id });
    expect(await client.get(`/photos?id=${tx.id}`)).toEqual({
      photo: JPEG,
      place: "synced",
      missing: false
    });
  });

  it("«Вернуть» после «Очистить все данные» — и фото «только здесь»", async () => {
    const { client, tx } = await withPhoto("device");
    await client.delete("/storage/clear");
    tick();
    await client.post("/backup/before-clear");
    expect(await client.get(`/photos?id=${tx.id}`)).toEqual({
      photo: JPEG,
      place: "device",
      missing: false
    });
  });

  it("«Вернуть» после очистки — синхронизируемое фото", async () => {
    const { client, tx } = await withPhoto("synced");
    await client.delete("/storage/clear");
    tick();
    await client.post("/backup/before-clear");
    expect(await client.get(`/photos?id=${tx.id}`)).toMatchObject({
      photo: JPEG,
      missing: false
    });
  });

  it("восстановление файла возвращает фото, которое ещё есть на устройстве", async () => {
    const { client, tx } = await withPhoto();
    const file = await client.get("/backup");
    tick();
    await client.delete(`/transactions?id=${tx.id}`);
    tick();
    await client.post("/backup", { backup: file });
    expect(await client.get(`/photos?id=${tx.id}`)).toMatchObject({
      photo: JPEG,
      missing: false
    });
  });

  it("отложенное фото старше месяца без копий, которым оно нужно, убирается", async () => {
    const { storage, client, tx, account, category } = await withPhoto();
    await client.delete(`/transactions?id=${tx.id}`);
    const kept = async () =>
      (await storage.keys()).filter((key) => key.includes(`receiptPhoto_${tx.id}`)).length;
    expect(await kept()).toBe(2); // след удаления и отложенное фото
    tick(31 * 24 * 60);
    // Следующее удалённое фото заодно подметает просроченное.
    const other = await client.post("/transactions", {
      amount: "10",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: category.id,
      date: "2026-11-20"
    });
    await client.post("/photos", { transactionId: other.id, data: JPEG });
    await client.delete(`/transactions?id=${other.id}`);
    expect(await kept()).toBe(1); // остался только след удаления
  });
});

describe("«Объединить» с общими счетами", () => {
  async function pairedDevices() {
    const one = new LocalApiClient(new MemoryStorageAdapter());
    const account = await one.post("/accounts", { name: "Карта", balance: "1000" });
    const two = new LocalApiClient(new MemoryStorageAdapter());
    await two.post("/backup", { backup: await one.get("/backup") });
    tick();
    return { one, two, account };
  }

  async function balanceOf(client: LocalApiClient, accountId: string) {
    return (await client.get("/accounts")).accounts.find((item) => item.id === accountId)!.balance;
  }

  it("операция на счёте, который здесь уже есть, двигает его остаток", async () => {
    const { one, two, account } = await pairedDevices();
    await one.post("/transactions", {
      amount: "300",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: (await expenseCategory(one)).id,
      date: "2026-10-25"
    });
    const result = await two.post("/backup/merge", { backup: await one.get("/backup") });
    expect(result).toMatchObject({ merged: 1 });
    expect(await balanceOf(two, account.id)).toBe(700);
    // Повторное объединение той же копией ничего не добавляет и не списывает.
    await two.post("/backup/merge", { backup: await one.get("/backup") });
    expect(await balanceOf(two, account.id)).toBe(700);
  });

  it("новый счёт приезжает со своим остатком — его операции второй раз не проводятся", async () => {
    const one = new LocalApiClient(new MemoryStorageAdapter());
    const account = await one.post("/accounts", { name: "Наличные", balance: "1000" });
    await one.post("/transactions", {
      amount: "300",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: (await expenseCategory(one)).id,
      date: "2026-10-25"
    });
    const two = new LocalApiClient(new MemoryStorageAdapter());
    await two.post("/accounts", { name: "Карта", balance: "50" });
    await two.post("/backup/merge", { backup: await one.get("/backup/profiles") });
    expect(await balanceOf(two, account.id)).toBe(700);
  });

  it("пополнение цели: и цель, и счёт, которые здесь уже есть", async () => {
    const one = new LocalApiClient(new MemoryStorageAdapter());
    const account = await one.post("/accounts", { name: "Карта", balance: "1000" });
    const goal = await one.post("/goals", {
      title: "Отпуск",
      targetAmount: "5000",
      currentAmount: "0",
      deadline: "2027-06-01"
    });
    const two = new LocalApiClient(new MemoryStorageAdapter());
    await two.post("/backup", { backup: await one.get("/backup") });
    tick();
    await one.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      amount: "200",
      accountId: account.id
    });
    await two.post("/backup/merge", { backup: await one.get("/backup") });
    expect(await balanceOf(two, account.id)).toBe(800);
    expect((await two.get("/goals")).goals.find((item) => item.id === goal.id)?.currentAmount).toBe(
      200
    );
  });

  it("платёж по долгу, который здесь уже есть, уменьшает долг", async () => {
    const one = new LocalApiClient(new MemoryStorageAdapter());
    const account = await one.post("/accounts", { name: "Карта", balance: "50000" });
    await one.post("/debts", {
      name: "Кредитка",
      kind: "CREDIT_CARD",
      balance: "30000",
      originalAmount: "30000",
      interestRate: "20",
      minPayment: "3000",
      dueDay: "5"
    });
    const debt = (await one.get("/debts")).liabilities[0];
    const two = new LocalApiClient(new MemoryStorageAdapter());
    await two.post("/backup", { backup: await one.get("/backup") });
    tick();
    await one.post("/debts/pay", { id: debt.id, amount: "5000", accountId: account.id });
    await two.post("/backup/merge", { backup: await one.get("/backup") });
    expect(await balanceOf(two, account.id)).toBe(45000);
    expect((await two.get("/debts")).liabilities[0].balance).toBe(25000);
  });
});

describe("копия от новой версии приложения", () => {
  it("так и называется — а не «файл не похож на копию»", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const file = {
      ...(await client.get("/backup")),
      schemaVersion: LATEST_LOCAL_STATE_VERSION + 1
    };
    await expect(client.post("/backup", { backup: file })).rejects.toThrow(/новой версией/);
    await expect(client.post("/backup/merge", { backup: file })).rejects.toThrow(/новой версией/);
  });
});
