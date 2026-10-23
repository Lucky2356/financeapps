import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { MarketDataService, MarketSecurity } from "@/services/market/MarketDataService";

// Портфель и очередь записей.
//
// GET /investments считал страницу по документу, прочитанному ДО ожидания
// биржи, и потом записывал эти строки в документ: продажа, записанная за эти
// секунды, отменялась — проданные бумаги возвращались. А каждое дело в
// `/investments` ждало биржу внутри очереди, и пока она молчала (по десять
// секунд на запрос), не записывалось ничего — даже новый счёт.

const SBER: MarketSecurity = {
  ticker: "SBER",
  name: "Сбербанк",
  assetKind: "STOCK",
  sector: "Финансы",
  risk: "MEDIUM",
  comment: "",
  price: 300,
  changeDay: 0,
  change30d: 0
};

// Биржа «молчит», пока проверка не ответит за неё, — но только после `hold`:
// подготовка ходит на биржу тоже. Каждый вопрос ждёт своего ответа.
const market = vi.hoisted(() => ({
  hold: false,
  waiting: [] as Array<(securities: unknown[]) => void>
}));

vi.mock("@/services/market/createMarketDataProvider", () => {
  const provider = {
    getSecurities: () => {
      if (!market.hold) return Promise.resolve([{ ...SBER, price: 250 }]);
      return new Promise((resolve) => {
        market.waiting.push(resolve);
      });
    },
    getSecurityByTicker: async (ticker: string) => (ticker === SBER.ticker ? SBER : null),
    getHistoricalPrices: async () => [],
    getIndexHistory: async () => [],
    getPayouts: async () => [],
    updateMarketPrices: async () => undefined,
    searchSecurities: async () => [SBER]
  } as unknown as MarketDataService;
  return { createMarketDataProvider: () => provider, marketDataSource: () => "MOCK" };
});

afterEach(() => {
  market.hold = false;
  market.waiting = [];
});

/** Ответить на все вопросы, которые ждут биржу. */
function answerAll(securities: MarketSecurity[]) {
  for (const resolve of market.waiting.splice(0)) resolve(securities);
}

/** Портфель из десяти SBER — заведён, пока биржа отвечает. */
async function withPortfolio() {
  const api = new LocalApiClient(new MemoryStorageAdapter());
  await api.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "200" });
  return api;
}

describe("GET /investments и записи, сделанные, пока ждём биржу", () => {
  it("продажа, записанная за время ожидания, не отменяется", async () => {
    const api = await withPortfolio();
    market.hold = true;

    const page = api.get("/investments");
    await vi.waitFor(() => expect(market.waiting).toHaveLength(1));

    // Пока биржа молчит, продали четыре из десяти.
    await api.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "4",
      sellPrice: "280",
      fee: "0",
      date: "2026-10-20"
    });

    answerAll([SBER]);
    const data = await page;
    // Ответ — по документу после продажи, с ценой с биржи.
    expect(data.portfolio).toHaveLength(1);
    expect(data.portfolio[0]).toMatchObject({ ticker: "SBER", quantity: 6, currentPrice: 300 });
    expect(data.portfolio[0].currentValue).toBe(1800);

    // И сохранено то же: проданное не вернулось.
    market.hold = false;
    const backup = await api.get("/backup");
    expect(backup.investments.portfolio[0]).toMatchObject({
      quantity: 6,
      currentPrice: 300
    });
    expect((await api.get("/investments")).portfolio[0].quantity).toBe(6);
  });

  it("бумага, удалённая за время ожидания, не возвращается", async () => {
    const api = await withPortfolio();
    market.hold = true;

    const page = api.get("/investments");
    await vi.waitFor(() => expect(market.waiting).toHaveLength(1));

    // Удаление тоже спрашивает биржу — до очереди — и ждёт вместе с чтением.
    const removed = api.post("/investments", { action: "delete", ticker: "SBER" });
    await vi.waitFor(() => expect(market.waiting).toHaveLength(2));
    // Биржа ответила удалению раньше, чем чтению.
    market.waiting.splice(1, 1)[0]([SBER]);
    await removed;

    answerAll([SBER]);
    expect((await page).portfolio).toEqual([]);
    market.hold = false;
    expect((await api.get("/backup")).investments.portfolio).toEqual([]);
  });
});

describe("дела с портфелем не держат очередь записей", () => {
  it("счёт записывается, пока «Докупить» ждёт биржу", async () => {
    const api = await withPortfolio();
    market.hold = true;

    const addLot = api.post("/investments", {
      action: "addLot",
      ticker: "SBER",
      quantity: "5",
      price: "260",
      date: "2026-10-21"
    });
    await vi.waitFor(() => expect(market.waiting).toHaveLength(1));

    // Ни ответа биржи, ни таймаута: счёт записывается сразу.
    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });
    expect((await api.get("/accounts")).accounts.map((row) => row.name)).toContain("Карта");

    // И продажа, записанная тем временем, учтена докупкой: она считает по
    // документу, прочитанному уже в очереди.
    await api.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "4",
      sellPrice: "280",
      fee: "0",
      date: "2026-10-20"
    });

    answerAll([SBER]);
    const position = await addLot;
    expect(position).toMatchObject({ ticker: "SBER", quantity: 11, currentPrice: 300 });
  });

  it("«Обновить цены» не держит запись операции", async () => {
    const api = await withPortfolio();
    market.hold = true;

    const refresh = api.post("/investments", { action: "refreshMarket" });
    await vi.waitFor(() => expect(market.waiting).toHaveLength(1));

    await api.post("/accounts", { name: "Наличные", type: "CASH", balance: 500 });
    expect((await api.get("/accounts")).accounts.map((row) => row.name)).toContain("Наличные");

    answerAll([SBER]);
    expect((await refresh).updated).toBe(1);
  });
});
