import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// План/факт и переводы между своими счетами, пришедшие выписками.
//
// Найдено владельцем: «план/факт опять берёт переводы, и посчитаны они
// неправильно». Перевод с карты на вклад приходит двумя выписками — списание
// на карте и поступление на вкладе, — и связанным в перевод он не приходит.
// Итоги считали обе половины доходом и тратой (колонка «Переводы» в доходах и
// расходах), а в «В сбережения» был ноль, хотя деньги ушли на вклад. Пока
// проверка повторов ошибочно выбрасывала вторую половину, это было незаметно;
// с 2.8.3 приходят обе.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 20, 12));
});
afterEach(() => vi.useRealTimers());

async function statement(client: LocalApiClient, account: string, rows: object[]) {
  return client.post("/import", {
    dateColumn: "date",
    amountColumn: "amount",
    categoryColumn: "category",
    descriptionColumn: "description",
    accountColumn: "account",
    rows: JSON.stringify(rows.map((row) => ({ account, ...row })))
  });
}

async function october(client: LocalApiClient) {
  const plan = await client.get("/plan");
  const month = plan.months.find((item) => item.month === "2026-10")!;
  return {
    income: month.income.fact,
    expense: month.expense.fact,
    toSavings: month.toSavings.fact,
    columns: plan.columns.map((column) => column.label)
  };
}

describe("перевод на вклад двумя выписками", () => {
  it("связывается при загрузке и считается переводом, а не доходом и тратой", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "100000" });
    await client.post("/accounts", { name: "Вклад", type: "SAVINGS", balance: "0" });

    await statement(client, "Карта", [
      { date: "05.10.2026", amount: "-3000", category: "Супермаркеты", description: "Магнит" },
      {
        date: "07.10.2026",
        amount: "-20000",
        category: "Переводы",
        description: "Перевод между своими счетами"
      }
    ]);
    const second = await statement(client, "Вклад", [
      {
        date: "07.10.2026",
        amount: "20000",
        category: "Переводы",
        description: "Перевод между своими счетами"
      }
    ]);

    expect(second.linkedTransfers).toBe(1);
    const fact = await october(client);
    expect(fact.income).toBe(0);
    expect(fact.expense).toBe(3000);
    expect(fact.toSavings).toBe(20000);
    expect(fact.columns).not.toContain("Переводы");
  });

  it("перевод человеку (одна строка, без пары) остаётся тратой", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "100000" });
    const result = await statement(client, "Карта", [
      { date: "07.10.2026", amount: "-5000", category: "Переводы", description: "Ивану П." }
    ]);
    expect(result.linkedTransfers).toBe(0);
    expect((await october(client)).expense).toBe(5000);
  });
});
