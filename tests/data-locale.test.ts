import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { createInitialState } from "@/lib/api/local/state";
import { isDiscretionaryCategory } from "@/lib/categories/known";
import { suggestIconForName } from "@/lib/categories/suggest-icon";
import { setDisplayLocale } from "@/lib/i18n/display-locale";
import { sectorLabel } from "@/lib/market/sectors";
import { matchCategory, sheetTemplate, SHEET_TEMPLATES } from "@/lib/sheet/templates";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SAMPLE_PROFILE_ID } from "@/types/profiles";

// Данные, которые приложение заводит само, — на языке интерфейса, а логика,
// которая узнаёт свои категории, — на любом. Язык API в приложении берётся из
// localStorage (getClientLocale); здесь он подменяется, чтобы одна проверка
// могла побыть и русским устройством, и английским.

const language = vi.hoisted(() => ({ current: "en" as "ru" | "en" }));
vi.mock("@/lib/i18n/client-locale", () => ({ getClientLocale: () => language.current }));

const CYRILLIC = /[А-Яа-яЁё]/;

function client() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

async function account(api: LocalApiClient, name: string, balance = "0") {
  return api.post("/accounts", { name, type: "DEBIT_CARD", balance, currency: "RUB" });
}

async function transfer(api: LocalApiClient, from: string, to: string, amount: string) {
  await api.post("/transactions/transfer", {
    fromAccountId: from,
    toAccountId: to,
    amount,
    date: new Date().toISOString().slice(0, 10)
  });
}

beforeEach(() => {
  language.current = "en";
});

afterEach(() => {
  setDisplayLocale("ru");
});

describe("свежая установка — на языке интерфейса", () => {
  it("по-английски стандартные категории английские, номера те же", async () => {
    const api = client();
    const { categories } = await api.get("/categories");
    const labels = categories.map((category) => category.name);
    expect(labels).toEqual(expect.arrayContaining(["Salary", "Groceries", "Utilities"]));
    expect(labels.some((label) => CYRILLIC.test(label))).toBe(false);
    expect(categories.find((category) => category.id === "cat-food")?.name).toBe("Groceries");
    expect((await api.get("/profiles")).profiles[0].name).toBe("Main");
  });

  it("по-русски — как и было", () => {
    language.current = "ru";
    const labels = createInitialState().categories.map((category) => category.label);
    expect(labels).toEqual([
      "Зарплата",
      "Прочие доходы",
      "Продукты",
      "Транспорт",
      "ЖКХ",
      "Подписки",
      "Рестораны",
      "Здоровье"
    ]);
  });

  it("книга, заведённая по-русски, при смене языка не переименовывается", async () => {
    language.current = "ru";
    const api = client();
    await api.get("/categories");
    language.current = "en";
    const { categories } = await api.get("/categories");
    expect(categories.find((category) => category.id === "cat-food")?.name).toBe("Продукты");
  });
});

describe("пример по-английски", () => {
  it("счета, категории, операции и цели — английские", async () => {
    const api = client();
    await api.post("/sample", {});

    const accounts = (await api.get("/accounts")).accounts.map((item) => item.name);
    expect(accounts).toEqual(expect.arrayContaining(["Debit card", "Savings account", "Cash"]));
    const rows = (await api.get("/transactions?period=all")).transactions;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.description).not.toMatch(CYRILLIC);
      expect(row.category.label).not.toMatch(CYRILLIC);
    }
    const goals = (await api.get("/goals")).goals.map((goal) => goal.title);
    expect(goals).toEqual(expect.arrayContaining(["Emergency fund", "Holiday"]));
    const profiles = (await api.get("/profiles")).profiles;
    expect(profiles.find((profile) => profile.id === SAMPLE_PROFILE_ID)?.name).toBe("Example");
  });

  it("по-русски пример прежний, слово в слово", async () => {
    language.current = "ru";
    const api = client();
    await api.post("/sample", {});
    const accounts = (await api.get("/accounts")).accounts.map((item) => item.name);
    expect(accounts).toEqual(expect.arrayContaining(["Дебетовая карта", "Накопительный счёт"]));
  });

  it("отрасли бумаг примера переводятся на экране", () => {
    expect(sectorLabel("Финансы", "en")).toBe("Finance");
    expect(sectorLabel("Нефть и газ", "en")).toBe("Oil & Gas");
    expect(sectorLabel("Технологии", "en")).toBe("Technology");
  });
});

describe("«Переводы» узнаются на любом языке", () => {
  it("английское устройство кладёт перевод в русские «Переводы», а не заводит вторую", async () => {
    language.current = "ru";
    const api = client();
    const card = await account(api, "Карта", "50000");
    const deposit = await account(api, "Вклад");
    await transfer(api, card.id, deposit.id, "1000");

    language.current = "en";
    await transfer(api, card.id, deposit.id, "2000");

    const { categories } = await api.get("/categories");
    const transferish = categories.filter((category) =>
      ["Переводы", "Transfers"].includes(category.name)
    );
    expect(transferish.map((category) => category.name).sort()).toEqual(["Переводы", "Переводы"]);
    expect(transferish.map((category) => category.kind).sort()).toEqual(["EXPENSE", "INCOME"]);
  });

  it("с английского устройства перевод заводит «Transfers» с английским описанием", async () => {
    const api = client();
    const card = await account(api, "Card", "50000");
    const deposit = await account(api, "Deposit");
    await transfer(api, card.id, deposit.id, "1000");
    const rows = (await api.get("/transactions?period=all")).transactions;
    expect(rows.map((row) => row.category.label)).toEqual(["Transfers", "Transfers"]);
    expect(rows[0].description).toContain("Transfer Card -> Deposit");
  });

  it("план/факт прячет категорию переводов под любым из имён", async () => {
    const api = client();
    await api.post("/categories", { name: "Transfers", kind: "EXPENSE", color: "#123456" });
    await api.post("/categories", { name: "Переводы", kind: "INCOME", color: "#123456" });
    const page = await api.get("/plan");
    const names = page.columns.map((column) => column.label);
    expect(names).not.toContain("Transfers");
    expect(names).not.toContain("Переводы");
    expect(names).toContain("Groceries");
  });

  it("импорт без счёта и категории находит русские «Импорт» и «Импорт расходов»", async () => {
    language.current = "ru";
    const api = client();
    const body = (amount: string, date: string) => ({
      dateColumn: "date",
      amountColumn: "amount",
      descriptionColumn: "description",
      rows: JSON.stringify([{ date, amount, description: `строка ${date}` }])
    });
    await api.post("/import", body("-100", "2026-08-23"));
    language.current = "en";
    await api.post("/import", body("-200", "2026-08-24"));

    const accounts = (await api.get("/accounts")).accounts.map((item) => item.name);
    expect(accounts).toEqual(["Импорт"]);
    const labels = (await api.get("/categories")).categories.map((category) => category.name);
    expect(labels.filter((label) => label === "Импорт расходов")).toHaveLength(1);
    expect(labels).not.toContain("Imported expenses");
  });
});

describe("необязательные траты — не по русскому слову", () => {
  it("узнаются по номеру стандартной категории и по имени на любом языке", () => {
    expect(isDiscretionaryCategory({ id: "c1", label: "Restaurants" })).toBe(true);
    expect(isDiscretionaryCategory({ id: "c2", label: "entertainment" })).toBe(true);
    expect(isDiscretionaryCategory({ id: "c3", label: "Рестораны" })).toBe(true);
    // Переименованная стандартная категория остаётся собой.
    expect(isDiscretionaryCategory({ id: "cat-restaurants", label: "Кафе" })).toBe(true);
    expect(isDiscretionaryCategory({ id: "c4", label: "Streaming", isSubscription: true })).toBe(
      true
    );
    expect(isDiscretionaryCategory({ id: "cat-food", label: "Groceries" })).toBe(false);
  });
});

describe("таблица по-английски", () => {
  it("главный лист — «Budget», и для книги, заведённой по-русски, тоже", async () => {
    const api = client();
    await api.post("/sheet", { action: "start", from: "2026-10" });
    expect((await api.get("/workbook")).sheets.map((sheet) => sheet.name)).toEqual(["Budget"]);

    language.current = "ru";
    const russian = client();
    await russian.post("/sheets", { action: "create", name: "Отпуск", kind: "budget" });
    expect((await russian.get("/workbook")).sheets.map((sheet) => sheet.name)).toEqual([
      "Бюджет",
      "Отпуск"
    ]);
    language.current = "en";
    expect((await russian.get("/workbook")).sheets.map((sheet) => sheet.name)).toEqual([
      "Budget",
      "Отпуск"
    ]);
  });

  it("новая таблица и шаблоны — с английскими столбцами", async () => {
    const api = client();
    await api.post("/sheet", { action: "start", from: "2026-10" });
    const names = (await api.get("/sheet")).columns.map((column) => column.name);
    expect(names).toEqual(expect.arrayContaining(["Balance", "Income"]));

    const family = sheetTemplate("family", "en")!;
    expect(family.articles).toContain("Groceries");
    expect(family.lead.map((column) => column.name)).toContain("Salary");
    expect(sheetTemplate("family", "ru")!.articles).toContain("Продукты");

    setDisplayLocale("en");
    expect(SHEET_TEMPLATES.vacation.articles).toContain("Tickets");
    setDisplayLocale("ru");
    expect(SHEET_TEMPLATES.vacation.articles).toContain("Билеты");
  });

  it("статья английского шаблона находит русскую категорию", () => {
    const categories = [
      { id: "1", label: "Продукты" },
      { id: "2", label: "Здоровье" }
    ];
    expect(matchCategory("Groceries", categories)?.id).toBe("1");
    expect(matchCategory("Health", categories)?.id).toBe("2");
    expect(matchCategory("Children", categories)).toBeNull();
  });
});

describe("значки для английских имён категорий", () => {
  it.each([
    ["Groceries", "ShoppingCart"],
    ["Eating out", "Utensils"],
    ["Utilities", "Receipt"],
    ["Side income", "Briefcase"],
    ["Training", "Dumbbell"],
    ["Mortgage", "Landmark"],
    ["Transfers", "ArrowRightLeft"]
  ])("%s → %s", (name, icon) => {
    expect(suggestIconForName(name)).toBe(icon);
  });
});
