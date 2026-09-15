import { beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import { localStateSchema } from "@/lib/api/local/schemas";
import { STAMPED, stampRows } from "@/lib/sync/row-stamps";

const NOW = "2026-09-15T12:00:00.000Z";
const EARLIER = "2026-01-01T00:00:00.000Z";

/**
 * Книга для проверок: разделы — просто списки словарей. Настоящий тип строк
 * здесь только мешал бы — проверяется не он, а то, где оказывается отметка.
 */
type Book = Record<string, Array<Record<string, unknown>>>;

const stamp = (next: Book, previous: Book | null, now = NOW): Book =>
  stampRows(next, previous, now);

describe("stampRows", () => {
  it("новая строка получает отметку", () => {
    const next = stamp({ transactions: [{ id: "t1", amount: 100 }] }, null, NOW);
    expect(next.transactions[0]).toMatchObject({ id: "t1", updatedAt: NOW });
  });

  it("изменившаяся строка получает новую отметку", () => {
    const before = { transactions: [{ id: "t1", amount: 100, updatedAt: EARLIER }] };
    const next = stamp({ transactions: [{ id: "t1", amount: 250 }] }, before, NOW);
    expect(next.transactions[0]).toMatchObject({ amount: 250, updatedAt: NOW });
  });

  it("нетронутая строка сохраняет прежнюю отметку", () => {
    // Здесь вся суть: если бы отметка обновлялась у всех при каждом сохранении,
    // она означала бы «книгу сохраняли», а не «строку правили», и слиянию была
    // бы бесполезна.
    const row = { id: "t1", amount: 100, updatedAt: EARLIER };
    const next = stamp({ transactions: [{ ...row }] }, { transactions: [row] }, NOW);
    expect(next.transactions[0].updatedAt).toBe(EARLIER);
  });

  it("правка одной строки не задевает соседнюю", () => {
    const before = {
      transactions: [
        { id: "t1", amount: 100, updatedAt: EARLIER },
        { id: "t2", amount: 200, updatedAt: EARLIER }
      ]
    };
    const next = stamp(
      {
        transactions: [
          { id: "t1", amount: 100 },
          { id: "t2", amount: 999 }
        ]
      },
      before,
      NOW
    );
    expect(next.transactions[0].updatedAt).toBe(EARLIER);
    expect(next.transactions[1].updatedAt).toBe(NOW);
  });

  it("строка без отметки её и не получает, пока её не правили", () => {
    // «Не знаем, когда правили» — не то же, что «правили сейчас». Выдумывать
    // время для строк, доставшихся от версий без отметок, нельзя: слияние потом
    // поверило бы выдумке и выбросило бы чью-то настоящую правку.
    const before = { accounts: [{ id: "a1", name: "Карта" }] };
    const next = stamp({ accounts: [{ id: "a1", name: "Карта" }] }, before, NOW);
    expect(next.accounts[0]).not.toHaveProperty("updatedAt");
  });

  it("принесённая с чужой отметкой, но не правленная строка отметки не получает", () => {
    // Отметку ставит хранение, а не тот, кто подал строку. Иначе её можно было
    // бы приписать строке, которой никто не касался, — и слияние поверило бы.
    const before = { accounts: [{ id: "a1", name: "Карта" }] };
    const next = stamp({ accounts: [{ id: "a1", name: "Карта", updatedAt: NOW }] }, before, NOW);
    expect(next.accounts[0]).not.toHaveProperty("updatedAt");
  });

  it("у нетронутой строки остаётся отметка из хранилища, а не поданная с ней", () => {
    const before = { accounts: [{ id: "a1", name: "Карта", updatedAt: EARLIER }] };
    const next = stamp({ accounts: [{ id: "a1", name: "Карта", updatedAt: NOW }] }, before, NOW);
    expect(next.accounts[0].updatedAt).toBe(EARLIER);
  });

  it("порядок ключей на сравнение не влияет", () => {
    // Строку, пересобранную в другом порядке, нельзя считать изменённой: иначе
    // отметки поехали бы у всей книги на ровном месте.
    const before = { accounts: [{ id: "a1", name: "Карта", type: "CASH", updatedAt: EARLIER }] };
    const next = stamp({ accounts: [{ type: "CASH", name: "Карта", id: "a1" }] }, before, NOW);
    expect(next.accounts[0].updatedAt).toBe(EARLIER);
  });

  it("отсутствующее поле и поле со значением undefined — одно и то же", () => {
    const before = { accounts: [{ id: "a1", name: "Карта", updatedAt: EARLIER }] };
    const next = stamp({ accounts: [{ id: "a1", name: "Карта", icon: undefined }] }, before, NOW);
    expect(next.accounts[0].updatedAt).toBe(EARLIER);
  });

  it("правка в глубине строки замечается", () => {
    const before = { importBatches: [{ id: "b1", transactionIds: ["t1"], updatedAt: EARLIER }] };
    const next = stamp(
      { importBatches: [{ id: "b1", transactionIds: ["t1", "t2"] }] },
      before,
      NOW
    );
    expect(next.importBatches[0].updatedAt).toBe(NOW);
  });

  it("план опознаётся месяцем и статьёй, а не id — его у плана нет", () => {
    const before = {
      plans: [
        { month: "2026-09", categoryId: "food", amount: 100, updatedAt: EARLIER },
        { month: "2026-09", categoryId: "fun", amount: 200, updatedAt: EARLIER }
      ]
    };
    const next = stamp(
      {
        plans: [
          { month: "2026-09", categoryId: "food", amount: 100 },
          { month: "2026-09", categoryId: "fun", amount: 555 }
        ]
      },
      before,
      NOW
    );
    expect(next.plans[0].updatedAt).toBe(EARLIER);
    expect(next.plans[1].updatedAt).toBe(NOW);
  });

  it("котировки не отмечаются — они приходят с биржи, а не от человека", () => {
    // Иначе книга «правилась» бы при каждом обновлении котировок и ездила бы на
    // сервер без причины.
    const next = stampRows(
      { investments: { securities: [{ id: "SBER", price: 300 }] } },
      null,
      NOW
    );
    expect(next.investments.securities[0]).not.toHaveProperty("updatedAt");
  });

  it("не трогает исходную книгу", () => {
    const source = { transactions: [{ id: "t1", amount: 100 }] };
    stamp(source, null);
    expect(source.transactions[0]).not.toHaveProperty("updatedAt");
  });

  it("раздел, в котором ничего не изменилось, остаётся тем же массивом", () => {
    const rows = [{ id: "t1", amount: 100, updatedAt: EARLIER }];
    const book = { transactions: rows, accounts: [{ id: "a1", name: "Карта" }] };
    expect(stamp(book, book).transactions).toBe(rows);
  });
});

describe("отметки в живом клиенте", () => {
  let client: LocalApiClient;

  beforeEach(() => {
    client = new LocalApiClient(new MemoryStorageAdapter());
  });

  async function accounts() {
    const data = await client.get<{ accounts: Array<Record<string, unknown>> }>("/accounts");
    return data.accounts;
  }

  it("счёт, заведённый через обработчик, выходит с отметкой", async () => {
    // Ни один обработчик отметку не ставит — её ставит единственная точка
    // сохранения. Эта проверка и есть доказательство, что шов работает.
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });
    const [account] = await accounts();
    expect(typeof account.updatedAt).toBe("string");
    expect(Date.parse(account.updatedAt as string)).not.toBeNaN();
  });

  it("отметка переживает чтение — Zod её не выбрасывает", async () => {
    // Незаявленные схеме ключи Zod отбрасывает молча. Без поля в схеме отметка
    // стиралась бы при каждом чтении книги, и заметить это было бы нечем.
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });
    const stamped = (await accounts())[0].updatedAt;
    expect(stamped).toBeTruthy();
    expect((await accounts())[0].updatedAt).toBe(stamped);
  });

  it("правка счёта двигает его отметку и не двигает чужую", async () => {
    await client.post("/accounts", { name: "Первый", type: "CASH", balance: 100 });
    await client.post("/accounts", { name: "Второй", type: "CASH", balance: 200 });
    const [before, untouched] = await accounts();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await client.put("/accounts", {
      id: before.id,
      name: "Переименован",
      type: "CASH",
      balance: 100
    });

    const after = await accounts();
    const edited = after.find((row) => row.id === before.id);
    const other = after.find((row) => row.id === untouched.id);
    expect(edited?.updatedAt).not.toBe(before.updatedAt);
    expect(other?.updatedAt).toBe(untouched.updatedAt);
  });

  it("запись операции не переставляет отметки у счетов и статей", async () => {
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 5000 });
    const account = (await accounts())[0];
    const categories = await client.get<{ categories: Array<Record<string, unknown>> }>(
      "/categories"
    );
    const expense = categories.categories.find((row) => row.kind === "EXPENSE");

    await new Promise((resolve) => setTimeout(resolve, 5));
    await client.post("/transactions", {
      amount: 700,
      type: "EXPENSE",
      accountId: account.id,
      categoryId: expense?.id,
      date: "2026-09-15",
      description: "обед"
    });

    // Баланс счёта операция меняет — эта отметка обязана сдвинуться. А вот
    // статья не менялась ничем, и её трогать не за что.
    const after = await client.get<{ categories: Array<Record<string, unknown>> }>("/categories");
    const sameCategory = after.categories.find((row) => row.id === expense?.id);
    expect(sameCategory?.updatedAt).toBe(expense?.updatedAt);
  });

  it("восстановление из копии сохраняет отметки файла, а не ставит «сейчас»", async () => {
    // Трёхлетняя книга, вернувшаяся из копии, не становится свежей оттого, что
    // её сегодня развернули.
    await client.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });
    const backup = await client.get<Record<string, unknown>>("/backup");
    const original = (backup.accounts as Array<Record<string, unknown>>)[0];
    (original as { updatedAt: string }).updatedAt = EARLIER;

    await client.post("/backup", { backup });
    expect((await accounts())[0].updatedAt).toBe(EARLIER);
  });

  it("книга, дожившая до v15, старым строкам времени не сочиняет", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.setItem("localFinanceState_profile-default", {
      schemaVersion: 14,
      accounts: [{ id: "a1", name: "Старый счёт", type: "CASH", balance: 10, currency: "RUB" }],
      categories: [],
      transactions: []
    });
    const upgraded = new LocalApiClient(storage);
    const data = await upgraded.get<{ accounts: Array<Record<string, unknown>> }>("/accounts");

    expect(data.accounts[0]).not.toHaveProperty("updatedAt");
    const stored = await storage.getItem<{ schemaVersion: number }>(
      "localFinanceState_profile-default"
    );
    expect(stored?.schemaVersion).toBe(LATEST_LOCAL_STATE_VERSION);
  });
});

describe("состав отмечаемых разделов", () => {
  /** Узел схемы: объект со строками либо обёртка (array / default / optional). */
  type SchemaNode = {
    shape?: Record<string, unknown>;
    _zod?: { def?: { innerType?: SchemaNode; element?: SchemaNode } };
  };

  /** Разворачивает `z.array(...).default([])` и прочие обёртки до строки-объекта. */
  function rowShape(collection: string): Record<string, unknown> | null {
    const book = (localStateSchema as unknown as { shape: Record<string, SchemaNode> }).shape;
    let node: SchemaNode | null | undefined = book[collection];
    for (let depth = 0; node && depth < 8; depth++) {
      if (node.shape) return node.shape;
      node = node._zod?.def?.innerType ?? node._zod?.def?.element;
    }
    return null;
  }

  it("каждый отмечаемый раздел — настоящий раздел книги со строками", () => {
    // Опечатка в названии раздела не сломала бы ничего видимого: строки просто
    // молча остались бы без отметок, и обнаружилось бы это при первом слиянии.
    const missing = STAMPED.map(([name]) => name).filter((name) => rowShape(name) === null);
    expect(missing).toEqual([]);
  });

  it("у каждого отмечаемого раздела схема принимает отметку", () => {
    // Zod молча выбрасывает незаявленные ключи: раздел, которому поле забыли
    // добавить, терял бы отметку при каждом чтении книги — беззвучно. Спрашиваем
    // саму схему, а не примеры строк: примеры устаревают, схема — это и есть
    // определение книги.
    const without = STAMPED.map(([name]) => name).filter(
      (name) => !Object.keys(rowShape(name) ?? {}).includes("updatedAt")
    );
    expect(without).toEqual([]);
  });
});
