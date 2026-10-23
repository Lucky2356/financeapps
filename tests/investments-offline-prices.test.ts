import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Без биржи — без выдуманных цен.
//
// Живой поставщик при недоступной бирже отдавал учебные котировки
// MockMarketDataProvider, и настоящий портфель оценивался по ним: ВТБ по 90 ₽
// становился ВТБ по 0,0227 ₽ — и это записывалось в цену позиции, в историю
// портфеля и в снимок капитала. Здесь — настоящий MoexMarketDataProvider и
// сеть, которая сначала отвечает, а потом пропадает.

vi.mock("@/services/market/createMarketDataProvider", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/market/createMarketDataProvider")>();
  const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
  return { ...original, createMarketDataProvider: () => new MoexMarketDataProvider() };
});

const sharesJson = {
  securities: { columns: ["SECID", "SHORTNAME", "SECTYPE"], data: [["VTBR", "ВТБ ао", "1"]] },
  marketdata: {
    columns: ["SECID", "LAST", "LCURRENTPRICE", "LASTTOPREVPRICE", "MARKETPRICE"],
    data: [["VTBR", 90, null, 0.5, 89.5]]
  }
};
const historyJson = {
  history: {
    columns: ["TRADEDATE", "CLOSE"],
    data: [
      ["2026-09-25", 85],
      ["2026-10-22", 90]
    ]
  }
};

function exchangeUp() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).includes("/history/") ? historyJson : sharesJson;
      return { ok: true, json: async () => body } as Response;
    })
  );
}

function exchangeDown() {
  const fetch = vi.fn(async () => {
    throw new Error("network down");
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("биржа недоступна", () => {
  it("цены остаются последними сохранёнными, а снимки не пишутся из выдуманных", async () => {
    exchangeUp();
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "1000" });
    await api.post("/investments", { ticker: "VTBR", quantity: "100", averageBuyPrice: "80" });

    // Сеть пропала. «Обновить цены» сбрасывает кэш и спрашивает биржу заново.
    exchangeDown();
    const refreshed = await api.post("/investments", { action: "refreshMarket" });
    expect(refreshed.updated).toBe(0);

    const page = await api.get("/investments");
    const vtbr = page.portfolio.find((row) => row.ticker === "VTBR");
    expect(vtbr?.currentPrice).toBe(90);
    expect(vtbr?.currentValue).toBe(9000);
    // Справочник пуст — учебных бумаг в нём нет.
    expect(page.securities).toEqual([]);
    // Ни одной цены с биржи — снимка портфеля за сегодня нет.
    expect(page.history ?? []).toHaveLength(0);

    // Сохранено то же: цена позиции не подменена.
    const backup = await api.get("/backup");
    expect(backup.investments.portfolio[0]).toMatchObject({ ticker: "VTBR", currentPrice: 90 });
    expect(backup.portfolioSnapshots ?? []).toHaveLength(0);

    // Капитал — по последней цене (100 × 90), а не по учебной.
    const snapshot = await api.post("/networth/snapshot");
    const balances = (await api.get("/accounts")).totalBalance;
    expect(snapshot.value).toBe(balances + 9000);
  });

  it("поиск, бумага по тикеру и история без биржи — пустые, не выдуманные", async () => {
    const fetch = exchangeDown();
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const provider = new MoexMarketDataProvider();
    await provider.updateMarketPrices();

    expect(await provider.getSecurities()).toEqual([]);
    expect(await provider.getSecurityByTicker("SBER")).toBeNull();
    expect(await provider.searchSecurities("SBER")).toEqual([]);
    expect(await provider.getHistoricalPrices("SBER", new Date(2026, 0, 1), new Date())).toEqual(
      []
    );
    expect(await provider.getIndexHistory("IMOEX", new Date(2026, 0, 1), new Date())).toEqual([]);

    // Неудача запомнена ненадолго: следующий вопрос не ждёт биржу снова.
    const asked = fetch.mock.calls.length;
    expect(await provider.getSecurities()).toEqual([]);
    expect(await provider.getHistoricalPrices("SBER", new Date(2026, 0, 1), new Date())).toEqual(
      []
    );
    expect(fetch.mock.calls.length).toBe(asked);
  });
});
