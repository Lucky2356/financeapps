import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// GUARD: то, что экран получил из чтения, не должно быть книгой.
//
// Соседний tests/read-paths.test.ts проверяет другую половину договора — что
// обработчик чтения не портит книгу, пока её обрабатывает. Здесь про то, что
// будет ПОСЛЕ: чтения намеренно не копируют книгу (это измеренная
// оптимизация, копия съедала половину времени открытия экрана), поэтому
// возвращённое разделяло с ней объекты. Один `.sort()` по такому массиву на
// экране переставил бы книгу, и следующая же запись увезла бы перестановку на
// диск — молча, без ошибки, до перезапуска незаметно.
//
// Сегодня так никто не делает: проверено по всему коду. Но держалось это на
// внимательности, а не на устройстве, — и вот на чём держится теперь.
const STATE_KEY = "localFinanceState_profile-default";

async function seeded() {
  const storage = new MemoryStorageAdapter();
  const client = new LocalApiClient(storage);
  await client.post("/sample");
  return { storage, client };
}

const stored = (storage: MemoryStorageAdapter) =>
  storage.getItem<Record<string, unknown>>(STATE_KEY);

describe("ответ чтения отвязан от книги", () => {
  it("списки можно переставлять — на диске порядок не меняется", async () => {
    const { storage, client } = await seeded();
    const ids = (book: Record<string, unknown> | null | undefined, field: string) =>
      (book?.[field] as Array<{ id: string }>).map((row) => row.id);

    const disk = await stored(storage);
    const categoriesBefore = ids(disk, "categories");
    const rulesBefore = ids(disk, "rules");

    // Именно /transactions отдаёт справочники вместе со списком операций, и
    // именно они раньше были массивами самой книги.
    const page = await client.get<{
      categories: Array<{ id: string }>;
      rules: Array<{ id: string }>;
    }>("/transactions");
    // Ровно то, что делает любой экран, которому нужен свой порядок.
    page.categories.reverse();
    page.rules.reverse();

    // Запись сохраняет то, что лежит в кэше: перестановка, дошедшая до книги,
    // проявилась бы здесь — в файле, где она бы и навредила.
    await client.post("/settings", { theme: "dark" });
    const afterDisk = await stored(storage);

    expect(ids(afterDisk, "categories")).toEqual(categoriesBefore);
    expect(ids(afterDisk, "rules")).toEqual(rulesBefore);
  });

  it("то же для событий, оповещений и снимков капитала", async () => {
    const { storage, client } = await seeded();
    const before = structuredClone(await stored(storage));

    const alerts = await client.get<{ alerts: unknown[] }>("/market/alerts");
    alerts.alerts.push({ id: "подделка" });
    const tax = await client.get<{ events: unknown[] }>("/investments/events");
    tax.events.push({ id: "подделка" });

    await client.post("/settings", { theme: "dark" });
    const after = await stored(storage);

    expect(after?.marketAlerts).toEqual(before?.marketAlerts);
    expect(after?.realizedInvestmentEvents).toEqual(before?.realizedInvestmentEvents);
  });

  it("строку из ответа нельзя испортить молча", async () => {
    const { client } = await seeded();
    const page = await client.get<{ accounts: Array<{ name: string }> }>("/accounts");
    const account = page.accounts[0];
    expect(account).toBeDefined();

    // Строки книги остаются общими с кэшем — копировать их на каждом чтении
    // дорого. Вместо этого вне поставки книга заморожена: попытка переписать
    // поле не проходит тихо, а падает здесь и сейчас.
    expect(() => {
      account.name = "испорчено";
    }).toThrow();
  });
});
