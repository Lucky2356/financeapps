import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { routeOf } from "@/lib/api/local/helpers";
import { STATE_READS } from "@/lib/api/local/reads";
import { STATE_DELETES, STATE_WRITES } from "@/lib/api/local/writes";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Таблицы маршрутов: путь → обработчик. Тип ответа выводится из обработчика,
// поэтому здесь проверяется и то, что видит компилятор (@ts-expect-error —
// tsc в CI краснеет, если ошибки там больше нет), и то, что делает клиент.

describe("таблица маршрутов", () => {
  it("находит только собственные пути таблицы", () => {
    expect(routeOf(STATE_READS, "/accounts")).toBe(STATE_READS["/accounts"]);
    // Путь приходит строкой: наследство Object не должно сходить за обработчик.
    expect(routeOf(STATE_READS, "constructor")).toBeUndefined();
    expect(routeOf(STATE_READS, "toString")).toBeUndefined();
    expect(routeOf(STATE_READS, "/nope")).toBeUndefined();
  });

  it("путь чтения и путь записи — разные таблицы", () => {
    // «/categories» читается и пишется, а «/month-recap» только читается.
    expect(routeOf(STATE_WRITES, "/categories")).toBeDefined();
    expect(routeOf(STATE_WRITES, "/month-recap")).toBeUndefined();
    expect(routeOf(STATE_DELETES, "/month-recap")).toBeUndefined();
  });

  it("неизвестный путь не компилируется и не находится", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    // @ts-expect-error такого чтения нет
    await expect(client.get("/nope")).rejects.toThrow("not implemented: /nope");
    // @ts-expect-error такой записи нет
    await expect(client.post("/nope", {})).rejects.toThrow("not implemented: /nope");
    // @ts-expect-error такого удаления нет
    await expect(client.delete("/nope")).rejects.toThrow("not implemented: /nope");
  });

  it("удаление без нужного ему ?id= не находится, как неизвестный путь", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await expect(client.delete("/accounts")).rejects.toThrow("not implemented: /accounts");
  });

  it("ответ чтения — тот, что выводит тип пути", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/sample");
    const page = await client.get("/transactions?limit=all");
    // Обращение к полям без приведений — это и есть проверка типа.
    expect(page.transactions.length).toBeGreaterThan(0);
    const accounts = await client.get("/accounts");
    expect(accounts.accounts.length).toBeGreaterThan(0);
  });

  it("запись сохраняет документ после обработчика, а ошибка — нет", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 100 });
    const before = (await client.get("/accounts")).accounts.length;

    // Стандартную категорию удалить нельзя: обработчик бросает, документ цел.
    const standard = (await client.get("/categories")).categories.find((row) => row.isStandard);
    await expect(client.delete(`/categories?id=${standard?.id}`)).rejects.toThrow();
    expect(
      (await client.get("/categories")).categories.some((row) => row.id === standard?.id)
    ).toBe(true);

    // Новый клиент на том же хранилище читает с диска, а не из памяти.
    const reread = new LocalApiClient(storage);
    expect((await reread.get("/accounts")).accounts).toHaveLength(before);
  });
});
