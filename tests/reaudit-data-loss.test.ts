import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { salvageLocalState } from "@/lib/api/local/schemas";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Повторный разбор перед 2.8.0: значения, которые запись принимала, а чтение
// при следующем запуске молча выбрасывало, — и копии, которые из-за одной
// такой строки не возвращались целиком.

async function categoryOf(client: LocalApiClient, kind: "INCOME" | "EXPENSE") {
  const page = await client.get("/categories");
  return page.categories.find((item) => item.kind === kind)!;
}

const KEY = "localFinanceState_profile-default";

/** «Перезапуск»: новый клиент на том же хранилище. */
function restart(storage: MemoryStorageAdapter) {
  return new LocalApiClient(storage);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 26, 12));
});
afterEach(() => vi.useRealTimers());

describe("то, что записано, переживает перезапуск", () => {
  it("длинная метка обрезается, а не уносит операцию", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    const account = await client.post("/accounts", { name: "Карта", balance: "1000" });
    const expense = await categoryOf(client, "EXPENSE");
    await client.post("/transactions", {
      amount: "22",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: expense.id,
      date: "2026-10-20",
      tags: "отпуск-в-турции-с-семьей-лето-2026-июль-август"
    });
    const after = await restart(storage).get("/transactions?limit=all");
    expect(after.transactions).toHaveLength(1);
    expect(after.transactions[0].tags?.[0].length).toBeLessThanOrEqual(40);
  });

  it("цель на 0 и шаблон на 0 не записываются — с ошибкой, а не тихой потерей", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const account = await client.post("/accounts", { name: "Карта", balance: "1000" });
    const expense = await categoryOf(client, "EXPENSE");
    await expect(
      client.post("/goals", { title: "Цель", targetAmount: "0", deadline: "2027-01-01" })
    ).rejects.toThrow();
    await expect(
      client.post("/recurring", {
        amount: "0",
        type: "EXPENSE",
        frequency: "MONTHLY",
        nextDate: "2026-11-01",
        accountId: account.id,
        categoryId: expense.id,
        isActive: "true"
      })
    ).rejects.toThrow();
  });

  it("категория из выписки длиннее 100 знаков обрезается — импорт на месте после запуска", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    const long = "Оплата товаров и услуг в торгово-сервисных предприятиях ".repeat(3);
    await client.post("/import", {
      dateColumn: "date",
      amountColumn: "amount",
      categoryColumn: "category",
      rows: JSON.stringify([{ date: "2026-10-01", amount: "-100", category: long }])
    });
    const after = await restart(storage).get("/transactions?limit=all");
    expect(after.transactions).toHaveLength(1);
  });

  it("длинное имя счёта и долга обрезается", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    await client.post("/accounts", { name: "Счёт ".repeat(40), balance: "500" });
    await client.post("/debts", { name: "Долг ".repeat(40), kind: "LOAN", balance: "100" });
    const fresh = restart(storage);
    expect((await fresh.get("/accounts")).accounts).toHaveLength(1);
    expect((await fresh.get("/debts")).liabilities).toHaveLength(1);
  });
});

describe("копии возвращаются, даже если в них есть кривая строка", () => {
  /** Книга с одной строкой, которую строгая проверка не примет. */
  async function bookWithBadRow() {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    const account = await client.post("/accounts", { name: "Карта", balance: "1000" });
    const expense = await categoryOf(client, "EXPENSE");
    for (const amount of ["10", "20", "30"]) {
      await client.post("/transactions", {
        amount,
        type: "EXPENSE",
        accountId: account.id,
        categoryId: expense.id,
        date: "2026-10-20"
      });
    }
    // Как будто строку записала старая версия, не обрезавшая метку.
    const key = KEY;
    const stored = structuredClone((await storage.getItem<Record<string, unknown>>(key))!);
    const rows = stored.transactions as Array<Record<string, unknown>>;
    rows[0] = { ...rows[0], tags: ["x".repeat(60)] };
    await storage.setItem(key, stored);
    return { storage, client: restart(storage) };
  }

  it("отмена очистки возвращает всё, кроме кривой строки", async () => {
    const { storage, client } = await bookWithBadRow();
    await client.delete("/storage/clear");
    await restart(storage).post("/backup/before-clear");
    const after = await restart(storage).get("/transactions?limit=all");
    expect(after.transactions.length).toBeGreaterThanOrEqual(2);
  });

  it("своя выгрузка восстанавливается, а не «файл не похож на копию»", async () => {
    const { storage } = await bookWithBadRow();
    const raw = await storage.getItem(KEY);
    const fresh = new LocalApiClient(new MemoryStorageAdapter());
    await fresh.post("/backup", { backup: raw });
    expect((await fresh.get("/transactions?limit=all")).transactions.length).toBe(2);
  });

  it("спасение не роняет книгу из-за поля, которого нет в списке", async () => {
    const { storage } = await bookWithBadRow();
    const raw = (await storage.getItem<Record<string, unknown>>(KEY))!;
    const salvaged = salvageLocalState({
      ...raw,
      emergencyFundMonthsTarget: "много",
      members: [{ id: "", name: "" }]
    });
    expect(salvaged).not.toBeNull();
    expect(salvaged!.state.transactions).toHaveLength(2);
  });
});

describe("шаблон после паузы", () => {
  it("включённый снова не проводит платежи за время паузы", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const account = await client.post("/accounts", { name: "Карта", balance: "100000" });
    const expense = await categoryOf(client, "EXPENSE");
    const base = {
      amount: "500",
      type: "EXPENSE",
      frequency: "MONTHLY",
      nextDate: "2026-04-15",
      accountId: account.id,
      categoryId: expense.id
    };
    const template = await client.post("/recurring", { ...base, isActive: "false" });
    await client.put("/recurring", { ...base, id: template.id, isActive: "true" });
    const result = await client.post("/recurring/materialize-all");
    expect(result).toEqual(expect.objectContaining({ created: 0 }));
  });
});

describe("удалённая цель", () => {
  it("не переписывает прошлое: капитал прошлых месяцев тот же", async () => {
    vi.setSystemTime(new Date(2026, 2, 10, 12));
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const account = await client.post("/accounts", { name: "Карта", balance: "100000" });
    const goal = await client.post("/goals", {
      title: "Отпуск",
      targetAmount: "200000",
      deadline: "2027-06-01",
      linkedAccountId: account.id
    });
    await client.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      accountId: account.id,
      amount: "50000"
    });
    vi.setSystemTime(new Date(2026, 9, 10, 12));
    const before = await client.get("/balance-history?months=8");
    await client.delete(`/goals?id=${goal.id}&writeOff=1`);
    const after = await client.get("/balance-history?months=8");
    // Прошлые месяцы — как были; меняется только нынешний.
    expect(after.total.slice(0, -1)).toEqual(before.total.slice(0, -1));
    expect(after.total.at(-1)).toBe(50000);
  });
});
