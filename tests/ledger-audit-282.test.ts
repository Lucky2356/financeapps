import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updatePayload } from "@/components/transactions/transaction-manager/helpers";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { TransactionsPageData } from "@/lib/data";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { matchesCriteria } from "@/lib/transactions/filter";
import { savedFilterParams } from "@/lib/transactions/filter-chips";

// Ошибки «Учёта», найденные разбором 2.8.2. Каждая проверка падала до
// исправления.

const USD_RATE = 90;

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

async function ledger() {
  const client = createClient();
  const roubles = await client.post("/accounts", {
    name: "Рублёвая карта",
    type: "DEBIT_CARD",
    balance: "100000",
    currency: "RUB"
  });
  const dollars = await client.post("/accounts", {
    name: "Долларовая карта",
    type: "DEBIT_CARD",
    balance: "1000",
    currency: "USD"
  });
  const { categories } = await client.get("/categories");
  const food = categories.find((item) => item.name === "Продукты")!;
  const other = categories.find(
    (item) => item.kind === "EXPENSE" && item.id !== food.id && item.name !== "Переводы"
  )!;
  return { client, roubles, dollars, food, other };
}

async function rowsOf(client: LocalApiClient, query = "period=all&limit=all") {
  return (await client.get(`/transactions?${query}`)) as TransactionsPageData;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("массовая смена категории не стирает метки", () => {
  it("PUT без поля tags оставляет прежние метки, пустая строка — снимает", async () => {
    const { client, roubles, food, other } = await ledger();
    const created = await client.post("/transactions", {
      amount: "500",
      type: "EXPENSE",
      accountId: roubles.id,
      categoryId: food.id,
      date: "2026-10-10",
      description: "Кофе",
      tags: "кофе, работа"
    });
    await client.put("/transactions", {
      id: created.id,
      amount: "500",
      type: "EXPENSE",
      accountId: roubles.id,
      categoryId: other.id,
      date: "2026-10-10",
      description: "Кофе"
    });
    let row = (await rowsOf(client)).transactions.find((item) => item.id === created.id)!;
    expect(row.category.id).toBe(other.id);
    expect(row.tags).toEqual(["кофе", "работа"]);

    await client.put("/transactions", {
      id: created.id,
      amount: "500",
      type: "EXPENSE",
      accountId: roubles.id,
      categoryId: other.id,
      date: "2026-10-10",
      description: "Кофе",
      tags: ""
    });
    row = (await rowsOf(client)).transactions.find((item) => item.id === created.id)!;
    expect(row.tags ?? []).toEqual([]);
  });

  it("updatePayload несёт метки строки", () => {
    const payload = updatePayload(
      {
        id: "tx-1",
        amount: 100,
        type: "EXPENSE",
        date: "2026-10-10T00:00:00.000Z",
        description: "Кофе",
        account: { id: "acc", label: "Карта" },
        category: { id: "cat", label: "Еда", color: "#000" },
        tags: ["кофе", "работа"]
      } as TransactionsPageData["transactions"][number],
      "cat-2"
    );
    expect(payload.tags).toBe("кофе, работа");
  });
});

describe("страница за концом списка", () => {
  async function threeRows() {
    const { client, roubles, food } = await ledger();
    for (const amount of ["100", "200", "300"]) {
      await client.post("/transactions", {
        amount,
        type: "EXPENSE",
        accountId: roubles.id,
        categoryId: food.id,
        date: "2026-10-10"
      });
    }
    return client;
  }

  it("номер страницы прижимается к последней", async () => {
    const client = await threeRows();
    const data = await rowsOf(client, "period=all&page=5&limit=10");
    expect(data.pagination.page).toBe(1);
    expect(data.transactions).toHaveLength(3);
    expect(data.pagination.hasPreviousPage).toBe(false);
  });

  it("page=abc и limit=xyz не дают пустой список", async () => {
    const client = await threeRows();
    const data = await rowsOf(client, "period=all&page=abc&limit=xyz");
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(20);
    expect(data.transactions).toHaveLength(3);
  });
});

describe("фильтр по сумме — в основной валюте", () => {
  async function withDollars() {
    const setup = await ledger();
    await setup.client.post("/transactions", {
      amount: "1000",
      type: "EXPENSE",
      accountId: setup.roubles.id,
      categoryId: setup.food.id,
      date: "2026-10-10",
      description: "Рубли"
    });
    await setup.client.post("/transactions", {
      amount: "100",
      type: "EXPENSE",
      accountId: setup.dollars.id,
      categoryId: setup.food.id,
      date: "2026-10-10",
      description: "Доллары"
    });
    return setup;
  }

  it("«от 5 000» находит 100 $ (это 9 000 ₽) и не находит 1 000 ₽", async () => {
    const { client } = await withDollars();
    const data = await rowsOf(client, "period=all&limit=all&minAmount=5000");
    expect(data.transactions.map((row) => row.description)).toEqual(["Доллары"]);
  });

  it("«до 5 000» не берёт 100 $", async () => {
    const { client } = await withDollars();
    const data = await rowsOf(client, "period=all&limit=all&maxAmount=5000");
    expect(data.transactions.map((row) => row.description)).toEqual(["Рубли"]);
  });

  it("поиск суммой находит и по основной, и по записанной", async () => {
    const { client } = await withDollars();
    const byBase = await rowsOf(client, `period=all&limit=all&q=${100 * USD_RATE}`);
    expect(byBase.transactions.map((row) => row.description)).toEqual(["Доллары"]);
    const byOwn = await rowsOf(client, "period=all&limit=all&q=100");
    expect(byOwn.transactions.map((row) => row.description)).toEqual(["Доллары"]);
  });

  it("на клиенте строка с baseAmount сравнивается по нему", () => {
    const row = {
      date: "2026-10-10",
      type: "EXPENSE",
      amount: 100,
      baseAmount: 9000,
      account: { id: "acc-usd", label: "Доллары" },
      category: { id: "cat", label: "Еда" }
    };
    expect(matchesCriteria(row, { minAmount: 5000 })).toBe(true);
    expect(matchesCriteria(row, { maxAmount: 5000 })).toBe(false);
    expect(matchesCriteria(row, { q: ">5000" })).toBe(true);
  });
});

describe("итоги по категории «Переводы» (доход)", () => {
  it("фильтр по входящей категории переводов считает перевод в доход", async () => {
    const { client, roubles, dollars } = await ledger();
    const savings = await client.post("/accounts", {
      name: "Вклад",
      type: "SAVINGS",
      balance: "0",
      currency: "RUB"
    });
    void dollars;
    await client.post("/transactions/transfer", {
      fromAccountId: roubles.id,
      toAccountId: savings.id,
      amount: "5000",
      date: "2026-10-10"
    });
    const { categories } = await client.get("/categories");
    const incoming = categories.find((item) => item.name === "Переводы" && item.kind === "INCOME")!;
    const data = await rowsOf(client, `period=all&limit=all&categoryId=${incoming.id}`);
    expect(data.transactions).toHaveLength(1);
    expect(data.totals?.income).toBe(5000);
  });
});

describe("плитки счетов — в основной валюте", () => {
  it("счёт в долларах несёт baseBalance", async () => {
    const { client } = await ledger();
    const page = await client.get("/accounts");
    const usd = page.accounts.find((item) => item.currency === "USD")!;
    expect(usd.baseBalance).toBe(1000 * USD_RATE);
    const rub = page.accounts.find((item) => item.currency === "RUB")!;
    expect(rub.baseBalance ?? rub.balance).toBe(100000);
  });
});

describe("сохранённый фильтр", () => {
  it("не запоминает страницу и limit=all", () => {
    expect(savedFilterParams("from=2026-10-01&to=2026-10-31&page=4&limit=all&q=кофе")).toBe(
      new URLSearchParams("from=2026-10-01&to=2026-10-31&q=кофе").toString()
    );
    expect(savedFilterParams("type=INCOME&limit=50&page=2")).toBe("type=INCOME&limit=50");
  });
});
