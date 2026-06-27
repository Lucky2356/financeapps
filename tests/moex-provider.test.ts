import { afterEach, describe, expect, it, vi } from "vitest";

const securitiesJson = {
  securities: { columns: ["SECID", "SHORTNAME"], data: [["SBER", "Сбербанк"]] },
  marketdata: {
    columns: ["SECID", "LAST", "LASTTOPREVPRICE", "MARKETPRICE"],
    data: [["SBER", 320, 1.5, 319]]
  }
};
const historyJson = {
  history: {
    columns: ["TRADEDATE", "CLOSE"],
    data: [
      ["2026-05-01", 300],
      ["2026-05-31", 330]
    ]
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules(); // fresh module-level caches per test
});

describe("MoexMarketDataProvider", () => {
  it("parses live price, day change (LASTTOPREVPRICE) and 30d change from history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = String(url).includes("/history/") ? historyJson : securitiesJson;
        return { ok: true, json: async () => body } as Response;
      })
    );
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const securities = await new MoexMarketDataProvider().getSecurities();
    const sber = securities.find((s) => s.ticker === "SBER");
    expect(sber).toBeDefined();
    expect(sber?.price).toBe(320);
    expect(sber?.changeDay).toBe(1.5);
    expect(sber?.change30d).toBe(10); // (330 - 300) / 300 * 100
  });

  it("uses the official last close (not the weighted-average market price) when the market is closed", async () => {
    // Market closed: MOEX zeroes LAST/LCURRENTPRICE and only MARKETPRICE (a
    // weighted average, here 319) remains. The shown price must be the last
    // history CLOSE (330) — the per-share price a broker shows — not 319.
    const closedJson = {
      securities: { columns: ["SECID", "SHORTNAME"], data: [["SBER", "Сбербанк"]] },
      marketdata: {
        columns: [
          "SECID",
          "LAST",
          "LCURRENTPRICE",
          "LASTTOPREVPRICE",
          "MARKETPRICE",
          "TRADINGSTATUS"
        ],
        data: [["SBER", null, null, 0, 319, "N"]]
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = String(url).includes("/history/") ? historyJson : closedJson;
        return { ok: true, json: async () => body } as Response;
      })
    );
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const sber = (await new MoexMarketDataProvider().getSecurities()).find(
      (s) => s.ticker === "SBER"
    );
    expect(sber?.price).toBe(330); // last CLOSE, not 319 (MARKETPRICE)
    expect(sber?.changeDay).toBe(10); // close-over-close (330 vs 300), not 0
  });

  it("falls back to mock data when MOEX is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const securities = await new MoexMarketDataProvider().getSecurities();
    expect(securities.length).toBeGreaterThan(0); // mock universe
    expect(securities.some((s) => s.ticker === "SBER")).toBe(true);
  });
});
