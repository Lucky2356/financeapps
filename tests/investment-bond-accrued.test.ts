import { describe, expect, it, vi } from "vitest";

import type { MarketDataService, MarketSecurity } from "@/services/market/MarketDataService";

// Облигация с биржи стоит «с НКД» — так она и продаётся. Но средняя цена
// покупки у брокера чистая, и считать прибыль от цены с НКД значит записать в
// доход весь накопленный купон, которого никто не заработал сверх уплаченного.

const BOND: MarketSecurity = {
  ticker: "SU26238RMFS4",
  name: "ОФЗ 26238",
  assetKind: "BOND",
  sector: "Облигации",
  risk: "LOW",
  comment: "",
  price: 620, // 600 чистыми + 20 НКД
  changeDay: 0,
  change30d: 0,
  accruedInterest: 20
};

vi.mock("@/services/market/createMarketDataProvider", () => {
  const provider: MarketDataService = {
    getSecurities: async () => [BOND],
    getSecurityByTicker: async (ticker) => (ticker === BOND.ticker ? BOND : null),
    getHistoricalPrices: async () => [],
    getIndexHistory: async () => [],
    getPayouts: async () => [],
    updateMarketPrices: async () => undefined,
    searchSecurities: async () => [BOND]
  } as MarketDataService;
  return { createMarketDataProvider: () => provider, marketDataSource: () => "MOCK" };
});

describe("облигация с НКД", () => {
  it("стоимость — с НКД, прибыль — по чистой цене", async () => {
    const { LocalApiClient } = await import("@/lib/api/LocalApiClient");
    const { MemoryStorageAdapter } = await import("@/lib/storage/MemoryStorageAdapter");
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", {
      ticker: BOND.ticker,
      quantity: "10",
      averageBuyPrice: "590"
    });

    const data = await api.get<{
      portfolio: Array<{
        ticker: string;
        currentValue: number;
        pnl: number;
        accruedInterest?: number;
      }>;
    }>("/investments");
    const bond = data.portfolio.find((row) => row.ticker === BOND.ticker);
    expect(bond?.currentValue).toBe(6200);
    // (600 − 590) × 10, а не (620 − 590) × 10 = 300.
    expect(bond?.pnl).toBe(100);
    expect(bond?.accruedInterest).toBe(20);
  });
});
