import { describe, expect, it, vi } from "vitest";

import type { MarketDataService, MarketSecurity } from "@/services/market/MarketDataService";

// Биржа отвечает секундами — а то и не отвечает, пока не истечёт срок. Запись,
// ждавшая её внутри очереди, держала за собой все остальные: снимок капитала,
// который фоновый прогон делает при каждой загрузке, держал так «Создать» в
// окне нового счёта. Нашлось на e2e/sync-qr.spec.ts: в CI, где запросы на
// Мосбиржу уходят по-настоящему, окно не закрывалось за пять секунд.

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

// Биржа «молчит», пока проверка не разрешит ей ответить — но только когда
// проверка её об этом попросила (`hold`): подготовка ходит на биржу тоже.
let hold = false;
let answer: (securities: MarketSecurity[]) => void = () => undefined;
let asked = 0;

vi.mock("@/services/market/createMarketDataProvider", () => {
  const provider = {
    getSecurities: () => {
      asked += 1;
      if (!hold) return Promise.resolve([{ ...SBER, price: 250 }]);
      return new Promise<MarketSecurity[]>((resolve) => {
        answer = resolve;
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

async function client() {
  const { LocalApiClient } = await import("@/lib/api/LocalApiClient");
  const { MemoryStorageAdapter } = await import("@/lib/storage/MemoryStorageAdapter");
  return new LocalApiClient(new MemoryStorageAdapter());
}

/** Портфель из десяти SBER — заведён обычной записью, пока биржа отвечает. */
async function withPortfolio() {
  const api = await client();
  await api.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });
  return api;
}

describe("очередь записей не ждёт биржу", () => {
  it("запись счёта проходит, пока снимок капитала ждёт цены", async () => {
    const api = await withPortfolio();
    asked = 0;
    hold = true;

    const snapshot = api.post<{ recorded: boolean; value: number }>("/networth/snapshot");
    // Снимок спросил биржу — и ждёт её.
    await vi.waitFor(() => expect(asked).toBe(1));

    // Счёт записывается, не дожидаясь ответа биржи.
    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: 1000 });
    expect((await api.get("/accounts")).accounts.map((row) => row.name)).toContain("Карта");

    // Биржа ответила — снимок досчитан по её цене (10 × 300), а не по старой.
    answer([SBER]);
    hold = false;
    const recorded = await snapshot;
    expect(recorded.recorded).toBe(true);
    expect(recorded.value).toBeGreaterThanOrEqual(3000);
    const balances = (await api.get("/accounts")).totalBalance;
    expect(recorded.value).toBe(balances + 3000);
  });

  it("с пустым портфелем снимок биржу не спрашивает", async () => {
    const api = await client();
    asked = 0;
    await api.post("/networth/snapshot");
    expect(asked).toBe(0);
  });
});
