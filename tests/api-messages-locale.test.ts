import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { serverText } from "@/lib/i18n/api-text";
import { loadLocale } from "@/lib/i18n/catalog";
import { setDisplayLocale } from "@/lib/i18n/display-locale";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { OfflineError } from "@/lib/sync/protocol";
import { createVault, normalizeRecoveryCode, unlockWithPassword } from "@/lib/sync/vault-crypto";
import { redeemPairing } from "@/lib/vault/server-account";
import { transactionSchema } from "@/lib/validations";
import { createApp, type App } from "../server/src/main.ts";

// Отказы слоя данных и синхронизации — на языке экрана. В английском режиме
// тост «Категория с таким именем уже существует.» стоял посреди английского
// экрана, а ответы службы приходили только по-русски. По-русски же каждая
// фраза обязана остаться буква в букву прежней.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function clientWithAccount() {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  const account = await client.post("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "1000"
  });
  return { client, account };
}

/** Трата в свою категорию: возвращает, как удалить категорию. */
async function categoryWithSpending(count: number) {
  const { client, account } = await clientWithAccount();
  const own = await client.post("/categories", { name: "Хобби", kind: "EXPENSE" });
  for (let index = 0; index < count; index += 1) {
    await client.post("/transactions", {
      amount: "100",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: own.id,
      date: today(),
      description: "Краски"
    });
  }
  return () => client.delete(`/categories?id=${own.id}`);
}

beforeAll(async () => {
  await loadLocale("en");
});

afterEach(() => {
  setDisplayLocale("ru");
});

describe("отказы записи (LocalApiClient)", () => {
  it("сумма вне разумного — по-английски", async () => {
    setDisplayLocale("en");
    const { client, account } = await clientWithAccount();
    const own = await client.post("/categories", { name: "Хобби", kind: "EXPENSE" });
    await expect(
      client.post("/transactions", {
        amount: "0",
        type: "EXPENSE",
        accountId: account.id,
        categoryId: own.id,
        date: today()
      })
    ).rejects.toThrow(
      "The amount must be greater than zero and less than 1000 billion — otherwise it's a typo, not money."
    );
  });

  it("сумма вне разумного — по-русски как прежде", async () => {
    const { client, account } = await clientWithAccount();
    const own = await client.post("/categories", { name: "Хобби", kind: "EXPENSE" });
    await expect(
      client.post("/transactions", {
        amount: "0",
        type: "EXPENSE",
        accountId: account.id,
        categoryId: own.id,
        date: today()
      })
    ).rejects.toThrow(
      "Сумма должна быть больше нуля и меньше 1000 млрд — иначе это опечатка, а не деньги."
    );
  });

  it("вторая категория с тем же именем", async () => {
    const { client } = await clientWithAccount();
    await client.post("/categories", { name: "Хобби", kind: "EXPENSE" });

    setDisplayLocale("en");
    await expect(client.post("/categories", { name: "Хобби", kind: "EXPENSE" })).rejects.toThrow(
      "A category with this name already exists."
    );
    setDisplayLocale("ru");
    await expect(client.post("/categories", { name: "Хобби", kind: "EXPENSE" })).rejects.toThrow(
      "Категория с таким именем уже существует."
    );
  });

  it("категория с операциями — число и форма слова по-английски", async () => {
    setDisplayLocale("en");
    await expect((await categoryWithSpending(1))()).rejects.toThrow(
      "Can't delete the category: 1 transaction is linked to it."
    );
    await expect((await categoryWithSpending(2))()).rejects.toThrow(
      "Can't delete the category: 2 transactions are linked to it."
    );
  });

  it("категория с операциями — по-русски прежние формы", async () => {
    await expect((await categoryWithSpending(1))()).rejects.toThrow(
      "Нельзя удалить категорию: к ней привязана 1 операция."
    );
    await expect((await categoryWithSpending(5))()).rejects.toThrow(
      "Нельзя удалить категорию: к ней привязано 5 операций."
    );
  });

  it("стандартную категорию не удалить", async () => {
    const { client } = await clientWithAccount();
    setDisplayLocale("en");
    await expect(client.delete("/categories?id=cat-food")).rejects.toThrow(
      "A default category can't be deleted — you can rename it, recolor it or change its icon."
    );
  });

  it("поле формы: сумма больше нуля", () => {
    const form = {
      amount: "0",
      type: "EXPENSE",
      categoryId: "c",
      accountId: "a",
      date: "2026-06-19"
    };
    const message = () => transactionSchema.safeParse(form).error?.issues[0]?.message;
    expect(message()).toBe("Введите сумму больше нуля");
    setDisplayLocale("en");
    expect(message()).toBe("Enter an amount greater than zero");
  });
});

describe("пароль и синхронизация", () => {
  it("неверный пароль", async () => {
    const { vault } = await createVault("пароль", { iterations: 1 });
    await expect(unlockWithPassword(vault, "не тот")).rejects.toThrow(
      "Не подходит — проверьте пароль или код восстановления."
    );
    setDisplayLocale("en");
    await expect(unlockWithPassword(vault, "не тот")).rejects.toThrow(
      "That doesn't work — check the password or recovery code."
    );
  });

  it("код восстановления не той длины", () => {
    setDisplayLocale("en");
    expect(() => normalizeRecoveryCode("один два")).toThrow(/has 2\.$/);
  });

  it("нет связи", () => {
    expect(new OfflineError().message).toBe("Нет связи с сервером.");
    setDisplayLocale("en");
    expect(new OfflineError().message).toBe("No connection to the server.");
  });
});

describe("ответ службы — по коду", () => {
  it("по-русски — слова самой службы, даже если код знаком", () => {
    const said = { error: "Слишком много попыток. Подождите минуту.", code: "too_many_attempts" };
    expect(serverText(said, "запасная")).toBe("Слишком много попыток. Подождите минуту.");
  });

  it("по-английски — перевод по коду, с подстановками и формой слова", () => {
    setDisplayLocale("en");
    expect(
      serverText({ error: "Слишком много попыток.", code: "too_many_attempts" }, "fallback")
    ).toBe("Too many attempts. Wait a minute.");
    expect(
      serverText({ error: "…", code: "quota_slots", params: { limit: 1, used: 1 } }, "fallback")
    ).toBe("This service allows 1 book per person, and you already have 1.");
    expect(
      serverText({ error: "…", code: "primary_only_named", params: { name: "Ноутбук" } }, "x")
    ).toBe("Other devices can only be removed from the primary one — “Ноутбук”.");
  });

  it("незнакомый код или служба без кода — её слова; молчание — запасная фраза", () => {
    setDisplayLocale("en");
    expect(serverText({ error: "Новая фраза службы.", code: "from_the_future" }, "fb")).toBe(
      "Новая фраза службы."
    );
    expect(serverText({ error: "Старая служба." }, "fb")).toBe("Старая служба.");
    expect(serverText({}, "Fallback.")).toBe("Fallback.");
    // Поле «code» у удачного ответа — код связки, а не отказ.
    expect(serverText({ code: "ABCD2345" }, "Fallback.")).toBe("Fallback.");
  });

  describe("через настоящую службу", () => {
    let app: App;
    let base: string;

    beforeAll(async () => {
      app = createApp({ dbPath: ":memory:", adminToken: "propusk" });
      await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
      base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await app.stop();
    });

    it("незнакомый код связки: по-русски — как говорит служба, по-английски — перевод", async () => {
      await expect(redeemPairing(base, "ABCD2345")).rejects.toThrow(
        "Код не найден. Он живёт пять минут — попросите новый."
      );
      setDisplayLocale("en");
      await expect(redeemPairing(base, "ABCD2345")).rejects.toThrow(
        "Code not found. It lasts five minutes — ask for a new one."
      );
    });
  });
});
