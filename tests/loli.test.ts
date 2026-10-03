import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { BANK_SUGGESTIONS_KEY, parseStored, resolveTarget } from "@/lib/bank/suggestions";
import type { AccountsPageData, ImportPageData, TransactionsPageData } from "@/lib/data";
import { applyLoliItems, type LoliDeps } from "@/lib/loli/apply";
import {
  LOLI_LINKS_KEY,
  loliAccount,
  loliCategory,
  loliSuggestion,
  parseLinks,
  parseLoliQueue,
  withLink,
  type LoliItem
} from "@/lib/loli/inbox";
import { buildLoliSummary } from "@/lib/loli/summary";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Лоли → Финансовый помощник: трата голосом, правка, отмена, повтор, обрыв.

function expense(id: string, amountMinor: number, extra: Partial<LoliItem> = {}): LoliItem {
  return {
    id,
    op: "upsert",
    type: "EXPENSE",
    amountMinor,
    currency: "RUB",
    category: "Продукты",
    description: "Пятёрочка",
    date: "2026-10-03",
    at: Date.now(),
    ...extra
  } as LoliItem;
}

async function setup(auto = true) {
  const client = new LocalApiClient(new MemoryStorageAdapter());
  await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "10000" });
  const memory = new Map<string, string>();
  const deps: LoliDeps = {
    api: client,
    read: (key) => memory.get(key) ?? null,
    write: (key, value) => void memory.set(key, value),
    auto,
    lastAccount: null,
    member: () => ({}),
    now: Date.now()
  };
  const rows = async () =>
    (await client.get<TransactionsPageData>("/transactions?period=all&limit=all")).transactions;
  const balance = async () => (await client.get<AccountsPageData>("/accounts")).accounts[0].balance;
  return { client, memory, deps, rows, balance };
}

describe("очередь от Лоли", () => {
  it("принимает только то, что можно записать", () => {
    const items = parseLoliQueue(
      JSON.stringify([
        {
          id: "a1",
          op: "upsert",
          amountMinor: 85000,
          currency: "RUB",
          category: "Продукты",
          date: "2026-10-03",
          at: 1
        },
        { id: "a2", op: "delete", at: 2 },
        { id: "плохой id", op: "upsert", amountMinor: 100, date: "2026-10-03" },
        { id: "a3", op: "upsert", amountMinor: -5, date: "2026-10-03" },
        { id: "a4", op: "upsert", amountMinor: 100, date: "вчера" },
        "мусор"
      ])
    );
    expect(items.map((item) => item.id)).toEqual(["a1", "a2"]);
    expect(parseLoliQueue("не json")).toEqual([]);
    expect(parseLoliQueue(null)).toEqual([]);
  });

  it("статья — по названию, по началу слова, по прошлым операциям; иначе null", () => {
    const categories = [
      { id: "food", label: "Продукты", kind: "EXPENSE" },
      { id: "taxi", label: "Транспорт и такси", kind: "EXPENSE" },
      { id: "salary", label: "Зарплата", kind: "INCOME" }
    ];
    const history = [
      { description: "Кофейня у дома", type: "EXPENSE" as const, category: { id: "food" } }
    ];
    const ask = (category: string, description = "") =>
      loliCategory({ category, description, type: "EXPENSE" }, categories, history);
    expect(ask("продукты")).toBe("food");
    expect(ask("Транспорт")).toBe("taxi");
    expect(ask("", "Кофейня у дома")).toBe("food");
    expect(ask("Космос")).toBeNull();
    // Названия Лоли — к здешним по общему слову.
    const more = [
      ...categories,
      { id: "rest", label: "Рестораны", kind: "EXPENSE" },
      { id: "home", label: "ЖКХ", kind: "EXPENSE" }
    ];
    const loliAsk = (category: string) =>
      loliCategory({ category, description: "", type: "EXPENSE" }, more, []);
    expect(loliAsk("Кафе и рестораны")).toBe("rest");
    expect(loliAsk("Дом и ЖКХ")).toBe("home");
    expect(loliAsk("Питомцы")).toBeNull();
    // Доходная статья тратой не станет.
    expect(ask("Зарплата")).toBeNull();
    // У Лоли все поступления — «Доходы»; какие именно — по описанию.
    const incomes = [...categories, { id: "other-income", label: "Прочие доходы", kind: "INCOME" }];
    const income = (description: string) =>
      loliCategory({ category: "Доходы", description, type: "INCOME" }, incomes, []);
    expect(income("зарплата пришла")).toBe("salary");
    expect(income("от Саши")).toBe("other-income");
    expect(income("")).toBe("other-income");
  });

  it("счёт — в той же валюте, последний — первым", () => {
    const accounts = [
      { id: "usd", currency: "USD" },
      { id: "card", currency: "RUB" },
      { id: "cash", currency: "RUB" },
      { id: "old", currency: "RUB", isArchived: true }
    ];
    expect(loliAccount("RUB", accounts, "cash")).toBe("cash");
    expect(loliAccount("RUB", accounts, "old")).toBe("card");
    expect(loliAccount("EUR", accounts, null)).toBeNull();
  });

  it("связи помнят последние, забытая — удаляется", () => {
    let links: Record<string, string> = {};
    for (let i = 0; i < 520; i += 1) links = withLink(links, `l${i}`, `t${i}`);
    expect(Object.keys(links)).toHaveLength(500);
    expect(links.l519).toBe("t519");
    expect(withLink(links, "l519", null).l519).toBeUndefined();
    expect(parseLinks('{"a": 1, "b": "t"}')).toEqual({ b: "t" });
  });
});

describe("сразу в учёт", () => {
  it("записывает, правит той же операцией и отменяет", async () => {
    const { deps, rows, balance, memory } = await setup();
    const first = await applyLoliItems([expense("x1", 85000)], deps);
    expect(first.recorded).toEqual([{ amount: 850, currency: "RUB", category: "Продукты" }]);
    let ledger = await rows();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ amount: 850, type: "EXPENSE", description: "Пятёрочка" });
    expect(ledger[0].category.label).toBe("Продукты");
    expect(await balance()).toBe(9150);

    // «Не 850, а 950» — та же операция, не вторая.
    const edit = await applyLoliItems([expense("x1", 95000)], deps);
    expect(edit.updated).toBe(1);
    ledger = await rows();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(950);
    expect(await balance()).toBe(9050);

    // «Отмени последнее».
    const undo = await applyLoliItems([{ id: "x1", op: "delete", at: Date.now() }], deps);
    expect(undo.removed).toBe(1);
    expect(await rows()).toHaveLength(0);
    expect(await balance()).toBe(10000);
    expect(parseLinks(memory.get(LOLI_LINKS_KEY) ?? null).x1).toBeUndefined();
  });

  it("оборвался посередине — тот же пакет второй раз ничего не задваивает", async () => {
    const { deps, rows } = await setup();
    const batch = [
      expense("y1", 10000),
      expense("y2", 20000, { category: "Кафе и рестораны", description: "" })
    ];
    await applyLoliItems(batch, deps);
    await applyLoliItems(batch, deps);
    const ledger = await rows();
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => row.amount).sort()).toEqual([100, 200]);
  });

  it("удалили здесь руками — правка из Лоли её не возвращает", async () => {
    const { client, deps, rows } = await setup();
    await applyLoliItems([expense("z1", 30000)], deps);
    const [row] = await rows();
    await client.delete(`/transactions?id=${row.id}`);
    const again = await applyLoliItems([expense("z1", 40000)], deps);
    expect(again.updated).toBe(0);
    expect(await rows()).toHaveLength(0);
  });

  it("незнакомая статья или нет счёта в валюте — в «Подсказки», а не наугад", async () => {
    const { deps, rows, memory } = await setup();
    const result = await applyLoliItems(
      [
        expense("q1", 5000, { category: "Космос", description: "" }),
        expense("q2", 5000, { currency: "EUR" })
      ],
      deps
    );
    expect(result.suggested).toBe(2);
    expect(await rows()).toHaveLength(0);
    const stored = parseStored(memory.get(BANK_SUGGESTIONS_KEY) ?? null);
    expect(stored.map((item) => item.id).sort()).toEqual(["loli:q1", "loli:q2"]);
  });
});

describe("в «Подсказки»", () => {
  it("правка ждущей подсказки обновляет её, отмена — убирает", async () => {
    const { deps, rows, memory } = await setup(false);
    await applyLoliItems([expense("s1", 85000)], deps);
    await applyLoliItems([expense("s1", 95000)], deps);
    let stored = parseStored(memory.get(BANK_SUGGESTIONS_KEY) ?? null);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: "loli:s1",
      amount: 950,
      app: "Лоли",
      category: "Продукты"
    });
    expect(await rows()).toHaveLength(0);

    await applyLoliItems([{ id: "s1", op: "delete", at: Date.now() }], deps);
    stored = parseStored(memory.get(BANK_SUGGESTIONS_KEY) ?? null);
    expect(stored).toHaveLength(0);
  });

  it("«Записать» в подсказке выбирает статью, названную Лоли", async () => {
    const { client } = await setup(false);
    const refs = await client.get<ImportPageData>("/import");
    const suggestion = loliSuggestion(
      expense("r1", 12000, { description: "что-то новое" }) as never
    );
    const target = resolveTarget(suggestion, {
      accounts: refs.accounts as never,
      categories: refs.categories,
      rules: [],
      history: [],
      lastAccount: null
    });
    expect(refs.categories.find((category) => category.id === target.categoryId)?.label).toBe(
      "Продукты"
    );
    expect(target.accountId).toBeTruthy();
  });
});

describe("сводка для Лоли", () => {
  it("только итоги, суммы округлены, статьи по тратам", () => {
    const summary = buildLoliSummary({
      now: new Date(2026, 9, 3, 12),
      currency: "RUB",
      allowance: {
        perDay: 1500.555,
        leftToday: -20,
        daysLeft: 29,
        budget: 40000,
        incomeSource: "actual",
        status: "over",
        spentToday: 1520,
        spentYesterday: 0,
        spentBeforeToday: 0,
        upcoming: 0,
        income: 100000
      },
      recap: null,
      budgets: [
        { category: "Кафе", spent: 300, limitAmount: 0, rolloverAmount: 0 },
        { category: "Продукты", spent: 12000, limitAmount: 20000, rolloverAmount: 1000 },
        { category: "Пусто", spent: 0, limitAmount: 0, rolloverAmount: 0 }
      ] as never,
      accounts: [{ name: "Карта", balance: 5000.123, currency: "RUB" }],
      totalBalance: 5000.123,
      payday: null
    });
    expect(summary).toMatchObject({
      v: 1,
      currency: "RUB",
      today: { canSpend: 0, perDay: 1500.56, spent: 1520, status: "over" },
      month: { month: "2026-10", income: 0, expense: 0, daysLeft: 29 },
      balance: { total: 5000.12 },
      payday: null
    });
    expect(summary.categories).toEqual([
      { name: "Продукты", spent: 12000, limit: 21000 },
      { name: "Кафе", spent: 300, limit: null }
    ]);
    expect(JSON.stringify(summary)).not.toContain("Пятёрочка");
  });
});
