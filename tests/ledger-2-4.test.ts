import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { groupByDay } from "@/lib/transactions/day-groups";
import { matchesCriteria } from "@/lib/transactions/filter";
import { matchesSearch, parseSearch } from "@/lib/transactions/search";
import { isDateSort, parseSort, sortTransactions } from "@/lib/transactions/sort";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

describe("поиск понимает суммы", () => {
  const ok = (query: string, text: string, amount: number) =>
    matchesSearch(query, text.toLowerCase(), amount);

  it("слово — в тексте, все слова должны найтись", () => {
    expect(ok("кофе", "Кофе шоп Карта Кафе", 250)).toBe(true);
    expect(ok("кофе карта", "Кофе шоп Карта Кафе", 250)).toBe(true);
    expect(ok("кофе наличные", "Кофе шоп Карта Кафе", 250)).toBe(false);
  });

  it("число — сумма ровно такая, даже если в тексте её нет", () => {
    expect(ok("5000", "Такси", 5000)).toBe(true);
    expect(ok("5000", "Такси", 5001)).toBe(false);
    expect(ok("5 000", "Такси", 5000)).toBe(true);
    expect(ok("2,5к", "Такси", 2500)).toBe(true);
    // А если число есть в тексте — находит и по нему.
    expect(ok("15", "iPhone 15", 90000)).toBe(true);
  });

  it("больше, меньше, диапазон", () => {
    expect(ok(">5000", "x", 5001)).toBe(true);
    expect(ok(">5000", "x", 5000)).toBe(false);
    expect(ok(">=5000", "x", 5000)).toBe(true);
    expect(ok("< 300", "x", 299)).toBe(true);
    expect(ok("<=300", "x", 301)).toBe(false);
    expect(ok("1000-3000", "x", 2000)).toBe(true);
    expect(ok("1000 - 3000", "x", 3001)).toBe(false);
    expect(ok("3к-1к", "x", 2000)).toBe(true);
    expect(ok(">5к", "x", 5500)).toBe(true);
  });

  it("слова и условия вместе", () => {
    expect(ok("кофе >200", "Кофе шоп", 250)).toBe(true);
    expect(ok("кофе >200", "Кофе шоп", 150)).toBe(false);
    expect(ok("такси >200", "Кофе шоп", 250)).toBe(false);
  });

  it("дефис внутри слова — не диапазон", () => {
    expect(parseSearch("кафе-бар").tests).toHaveLength(0);
    expect(ok("кафе-бар", "кафе-бар на углу", 100)).toBe(true);
  });

  it("работает в общем фильтре операций", () => {
    const row = {
      date: "2026-09-10",
      type: "EXPENSE",
      amount: 4200,
      description: "Ужин",
      account: { id: "a", label: "Карта" },
      category: { id: "c", label: "Рестораны" }
    };
    expect(matchesCriteria(row, { q: "4200" })).toBe(true);
    expect(matchesCriteria(row, { q: "рестораны >4000" })).toBe(true);
    expect(matchesCriteria(row, { q: "рестораны >5000" })).toBe(false);
  });
});

describe("сортировка", () => {
  const rows = [
    { id: "a", date: "2026-09-10", amount: 500, createdAt: "1" },
    { id: "b", date: "2026-09-12", amount: 100, createdAt: "1" },
    { id: "c", date: "2026-09-12", amount: 900, createdAt: "2" },
    { id: "d", date: "2026-09-01", amount: 300, createdAt: "1" }
  ];
  const ids = (sort: Parameters<typeof sortTransactions>[1]) =>
    sortTransactions(rows, sort).map((row) => row.id);

  it("по дате: новые сверху, в пределах дня — записанные позже", () => {
    expect(ids("date-desc")).toEqual(["c", "b", "a", "d"]);
  });

  it("по дате: старые сверху", () => {
    expect(ids("date-asc")).toEqual(["d", "a", "b", "c"]);
  });

  it("по сумме: крупные и мелкие", () => {
    expect(ids("amount-desc")).toEqual(["c", "a", "d", "b"]);
    expect(ids("amount-asc")).toEqual(["b", "d", "a", "c"]);
  });

  it("сравнивает в основной валюте, если её передали", () => {
    const mixed = [
      { id: "usd", date: "2026-09-01", amount: 10 },
      { id: "rub", date: "2026-09-01", amount: 500 }
    ];
    const base = (row: (typeof mixed)[number]) => (row.id === "usd" ? 900 : row.amount);
    expect(sortTransactions(mixed, "amount-desc", base).map((row) => row.id)).toEqual([
      "usd",
      "rub"
    ]);
  });

  it("неизвестное значение — обычный порядок; по дате делится на дни, по сумме — нет", () => {
    expect(parseSort("что-то")).toBe("date-desc");
    expect(parseSort(null)).toBe("date-desc");
    expect(isDateSort("date-asc")).toBe(true);
    expect(isDateSort("amount-desc")).toBe(false);
  });
});

describe("дни в списке", () => {
  const today = new Date(2026, 8, 30, 12, 0);
  const rows = [
    { date: "2026-09-30T08:00:00.000Z", type: "EXPENSE", amount: 300 },
    { date: "2026-09-30T07:00:00.000Z", type: "EXPENSE", amount: 200 },
    { date: "2026-09-30T06:00:00.000Z", type: "INCOME", amount: 5000 },
    { date: "2026-09-29T10:00:00.000Z", type: "EXPENSE", amount: 90.5 },
    { date: "2026-09-29T09:00:00.000Z", type: "EXPENSE", amount: 9.5, transferId: "t1" },
    { date: "2026-09-10T10:00:00.000Z", type: "EXPENSE", amount: 1 }
  ];

  it("новая группа начинается там, где день сменился", () => {
    const groups = groupByDay(rows, today);
    expect(groups.map((group) => [group.day, group.items.length])).toEqual([
      ["2026-09-30", 3],
      ["2026-09-29", 2],
      ["2026-09-10", 1]
    ]);
  });

  it("сегодня, вчера и остальные", () => {
    expect(groupByDay(rows, today).map((group) => group.when)).toEqual([
      "today",
      "yesterday",
      "other"
    ]);
  });

  it("итог дня: расходы и доходы, а перевод между своими счетами не считается", () => {
    const [first, second] = groupByDay(rows, today);
    expect(first).toMatchObject({ expense: 500, income: 5000 });
    expect(second).toMatchObject({ expense: 90.5, income: 0 });
  });
});

describe("«Учёт» в книге", () => {
  it("sort и поиск по сумме доходят до списка", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "100000" });
    const page = await client.get("/transactions");
    const account = page.accounts[0].id;
    const category = page.categories.find((item) => item.kind === "EXPENSE")!.id;
    for (const [amount, description] of [
      ["300", "мелочь"],
      ["9000", "крупная"],
      ["1500", "средняя"]
    ]) {
      await client.post("/transactions", {
        type: "EXPENSE",
        amount,
        accountId: account,
        categoryId: category,
        description,
        date: new Date().toISOString().slice(0, 10)
      });
    }
    const list = async (query: string) =>
      (await client.get(`/transactions?period=all&${query}`)).transactions.map(
        (row) => row.description
      );
    expect(await list("sort=amount-desc")).toEqual(["крупная", "средняя", "мелочь"]);
    expect(await list("sort=amount-asc")).toEqual(["мелочь", "средняя", "крупная"]);
    expect(await list("q=1500")).toEqual(["средняя"]);
    expect(await list("q=%3E1000&sort=amount-asc")).toEqual(["средняя", "крупная"]);
  });
});
