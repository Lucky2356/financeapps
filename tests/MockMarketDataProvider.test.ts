import { describe, expect, it } from "vitest";

import { MockMarketDataProvider } from "@/services/market/MockMarketDataProvider";

describe("MockMarketDataProvider", () => {
  const provider = new MockMarketDataProvider();

  it("returns the expected Russian securities universe", async () => {
    const securities = await provider.getSecurities();

    expect(securities).toHaveLength(10);
    expect(securities.map((security) => security.ticker)).toEqual(
      expect.arrayContaining(["SBER", "GAZP", "LKOH", "YDEX", "T", "VTBR", "MGNT", "NVTK", "ROSN", "MOEX"])
    );
  });

  it("finds a security by ticker case-insensitively", async () => {
    const security = await provider.getSecurityByTicker("sber");

    expect(security?.ticker).toBe("SBER");
    expect(security?.price).toBeGreaterThan(0);
  });

  it("builds a historical price range including both boundaries", async () => {
    const from = new Date("2026-05-01T00:00:00.000Z");
    const to = new Date("2026-05-05T00:00:00.000Z");
    const prices = await provider.getHistoricalPrices("MOEX", from, to);

    expect(prices).toHaveLength(5);
    expect(prices[0].ticker).toBe("MOEX");
    expect(prices.every((item) => item.price > 0)).toBe(true);
  });
});
