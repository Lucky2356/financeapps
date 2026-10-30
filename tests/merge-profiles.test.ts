import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { listSheets } from "@/lib/api/local/sheets";
import { UNSEALED_KEYS } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// «Объединить» при подключении — весь путь, а не одно слияние.
//
// Найдено проверкой: копия для объединения брала только ТЕКУЩИЙ профиль, а
// очистка стирала все. Копия перед очисткой подключения не переживает — новый
// ключ сносит всё, что запечатано прежним, — и профиль «Бизнес» со своим
// «Бизнес-счётом» пропадал насовсем. А слияние молча роняло планы, заметки,
// портфель, таблицы, и правило на склеенную категорию показывало в пустоту.

async function account(client: LocalApiClient, name: string) {
  return client.post("/accounts", { name, type: "DEBIT_CARD", balance: "1000" });
}

async function category(client: LocalApiClient, name: string) {
  return client.post("/categories", {
    name,
    kind: "EXPENSE",
    color: "#64748b",
    isEssential: false,
    isSubscription: false
  });
}

async function spend(client: LocalApiClient, accountId: string, categoryId: string, what: string) {
  await client.post("/transactions", {
    amount: "250",
    type: "EXPENSE",
    date: "2026-09-20",
    accountId,
    categoryId,
    description: what
  });
}

async function profileNamed(client: LocalApiClient, name: string) {
  const list = await client.get("/profiles");
  return list.profiles.find((profile) => profile.name === name);
}

async function openProfile(client: LocalApiClient, name: string) {
  const profile = await profileNamed(client, name);
  if (!profile) throw new Error(`Нет профиля «${name}»`);
  await client.post("/profiles/switch", { profileId: profile.id });
}

async function accountNames(client: LocalApiClient) {
  return (await client.get("/accounts")).accounts.map((item) => item.name).sort();
}

/**
 * Подключение глазами хранилища: принятый ключ сносит всё запечатанное прежним
 * (EncryptingStorageAdapter.clear), затем синхронизация привозит книги другого
 * устройства и говорит клиенту забыть прочитанное.
 */
async function join(
  laptop: LocalApiClient,
  storage: MemoryStorageAdapter,
  from: MemoryStorageAdapter
) {
  for (const key of await storage.keys()) {
    if (!UNSEALED_KEYS.includes(key)) await storage.removeItem(key);
  }
  for (const key of await from.keys()) await storage.setItem(key, await from.getItem(key));
  laptop.forgetCachedState();
}

describe("«Объединить»: все профили", () => {
  it("профиль, которого у другого устройства нет, приезжает целиком", async () => {
    const storage = new MemoryStorageAdapter();
    const laptop = new LocalApiClient(storage);
    const card = await account(laptop, "Карта");
    const coffee = await category(laptop, "Кофе");
    await spend(laptop, card.id, coffee.id, "кофе на ноутбуке");
    await laptop.post("/profiles/create", { name: "Бизнес", color: "#f59e0b" });
    await openProfile(laptop, "Бизнес");
    const business = await account(laptop, "Бизнес-счёт");
    const rent = await category(laptop, "Аренда");
    await spend(laptop, business.id, rent.id, "аренда офиса");
    await openProfile(laptop, "Основной");

    const phoneStorage = new MemoryStorageAdapter();
    const phone = new LocalApiClient(phoneStorage);
    await account(phone, "Наличные");

    // replace-local.tsx, merge(): копия всех профилей — и очистка.
    const carried = await laptop.get("/backup/profiles");
    await laptop.delete("/storage/clear");
    await join(laptop, storage, phoneStorage);
    // Копии перед очисткой больше нет — держится только то, что в памяти.
    expect(await laptop.get("/backup/before-clear")).toBeNull();

    // pair-join.tsx, joined().
    await laptop.post("/backup/merge", { backup: carried });

    expect(await accountNames(laptop)).toEqual(["Карта", "Наличные"]);
    await openProfile(laptop, "Бизнес");
    expect(await accountNames(laptop)).toEqual(["Бизнес-счёт"]);
    const rows = (await laptop.get("/transactions?limit=all")).transactions;
    expect(rows.map((row) => row.description)).toEqual(["аренда офиса"]);
  });

  it("открытый на ноутбуке «Бизнес» не вливается в общий «Основной»", async () => {
    // Найдено разбором 2.8.1: открытый профиль копии ложился в открытый
    // профиль здесь, какой бы тот ни был. «Бизнес» исчезал, а его счета
    // оказывались в «Основном» — и уезжали на все устройства семьи.
    const storage = new MemoryStorageAdapter();
    const laptop = new LocalApiClient(storage);
    await account(laptop, "Карта");
    await laptop.post("/profiles/create", { name: "Бизнес", color: "#f59e0b" });
    await openProfile(laptop, "Бизнес");
    await account(laptop, "Бизнес-счёт");

    const phoneStorage = new MemoryStorageAdapter();
    const phone = new LocalApiClient(phoneStorage);
    await account(phone, "Наличные");

    const carried = await laptop.get("/backup/profiles");
    await laptop.delete("/storage/clear");
    await join(laptop, storage, phoneStorage);
    await laptop.post("/backup/merge", { backup: carried });

    expect(await accountNames(laptop)).toEqual(["Карта", "Наличные"]);
    await openProfile(laptop, "Бизнес");
    expect(await accountNames(laptop)).toEqual(["Бизнес-счёт"]);
  });

  it("одноимённый профиль другого устройства получает записи добавкой", async () => {
    const storage = new MemoryStorageAdapter();
    const laptop = new LocalApiClient(storage);
    await account(laptop, "Карта");
    await laptop.post("/profiles/create", { name: "Бизнес", color: "#f59e0b" });
    await openProfile(laptop, "Бизнес");
    await account(laptop, "Бизнес-счёт");
    await openProfile(laptop, "Основной");

    const phoneStorage = new MemoryStorageAdapter();
    const phone = new LocalApiClient(phoneStorage);
    await account(phone, "Наличные");
    await phone.post("/profiles/create", { name: "Бизнес", color: "#0ea5e9" });
    await openProfile(phone, "Бизнес");
    await account(phone, "Касса");
    await openProfile(phone, "Основной");

    const carried = await laptop.get("/backup/profiles");
    await laptop.delete("/storage/clear");
    await join(laptop, storage, phoneStorage);
    await laptop.post("/backup/merge", { backup: carried });
    // Повтор (кнопка «Повторить» после сбоя) ничего не удваивает.
    await laptop.post("/backup/merge", { backup: carried });

    const list = await laptop.get("/profiles");
    expect(list.profiles.filter((profile) => profile.name === "Бизнес")).toHaveLength(1);
    // Текущим остаётся тот, что был, — а не последний, куда писали.
    expect(list.activeProfileId).toBe((await profileNamed(laptop, "Основной"))?.id);
    expect(await accountNames(laptop)).toEqual(["Карта", "Наличные"]);
    await openProfile(laptop, "Бизнес");
    expect(await accountNames(laptop)).toEqual(["Бизнес-счёт", "Касса"]);
  });
});

describe("«Объединить»: всё содержимое книги", () => {
  it("планы, заметки, портфель, таблица и правило на склеенную категорию — на месте", async () => {
    const laptop = new LocalApiClient(new MemoryStorageAdapter());
    const laptopCoffee = await category(laptop, "Кофе");
    await laptop.post("/sheet", { action: "start", from: "2026-10" });
    const base = await laptop.get("/backup");
    const laptopColumn = base.sheetColumns?.find((column) => column.kind === "income");
    expect(laptopColumn).toBeDefined();
    const carried = {
      ...base,
      rules: [{ id: "rule-starbucks", match: "Старбакс", categoryId: laptopCoffee.id }],
      plans: [{ month: "2026-10", categoryId: laptopCoffee.id, amount: 5000 }],
      planNotes: [{ month: "2026-10", note: "Копим на отпуск", factNote: "" }],
      planMonths: ["2026-11"],
      members: [{ id: "member-masha", name: "Маша", color: "#ec4899" }],
      sheetCells: [
        ...(base.sheetCells ?? []),
        {
          id: `2026-10|${laptopColumn!.id}`,
          month: "2026-10",
          columnId: laptopColumn!.id,
          input: "90000"
        }
      ],
      investments: {
        ...base.investments,
        portfolio: [
          {
            ticker: "SBER",
            name: "Сбербанк",
            sector: "Финансы",
            quantity: 10,
            averageBuyPrice: 250,
            currentPrice: 300,
            currentValue: 3000,
            pnl: 500,
            share: 100,
            risk: "MEDIUM" as const
          }
        ]
      }
    };

    const phone = new LocalApiClient(new MemoryStorageAdapter());
    const phoneCoffee = await category(phone, "Кофе");
    expect(phoneCoffee.id).not.toBe(laptopCoffee.id);
    await phone.post("/sheet", { action: "start", from: "2026-10" });

    await phone.post("/backup/merge", { backup: carried });
    await phone.post("/backup/merge", { backup: carried });
    const after = await phone.get("/backup");
    const categoryIds = new Set(after.categories.map((item) => item.id));

    expect(after.rules).toHaveLength(1);
    expect(after.rules[0].categoryId).toBe(phoneCoffee.id);
    expect(categoryIds.has(after.rules[0].categoryId)).toBe(true);

    expect(after.plans).toEqual([
      expect.objectContaining({ month: "2026-10", categoryId: phoneCoffee.id, amount: 5000 })
    ]);
    expect(after.planNotes.map((note) => note.note)).toEqual(["Копим на отпуск"]);
    expect(after.planMonths).toContain("2026-11");
    expect(after.members?.map((member) => member.name)).toEqual(["Маша"]);
    expect(after.investments.portfolio.map((row) => row.ticker)).toEqual(["SBER"]);

    // Своя главная таблица — отдельным листом: здешняя уже заполнена.
    const tabs = listSheets(after);
    expect(tabs.map((tab) => tab.name)).toEqual(["Бюджет", "Бюджет (2)"]);
    const moved = after.sheetColumns?.find((column) => column.id === laptopColumn!.id);
    expect((moved as { sheetId?: string } | undefined)?.sheetId).toBe(tabs[1].id);
    expect(after.sheetCells?.some((cell) => cell.input === "90000")).toBe(true);
  });
});
