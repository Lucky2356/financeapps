import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { recordPortfolioSnapshot } from "@/lib/investments/snapshots";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

describe("история портфеля", () => {
  it("один снимок в день: повторный за тот же день заменяет", () => {
    const first = recordPortfolioSnapshot([], "2026-09-27", 1000, 900);
    const again = recordPortfolioSnapshot(first, "2026-09-27", 1100, 900);
    const next = recordPortfolioSnapshot(again, "2026-09-28", 1200, 950);
    expect(next).toEqual([
      { date: "2026-09-27", value: 1100, invested: 900 },
      { date: "2026-09-28", value: 1200, invested: 950 }
    ]);
  });

  it("открытие инвестиций записывает стоимость и вложенное", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "200" });
    await api.get("/investments");
    const data = await api.get("/investments");
    expect(data.history).toHaveLength(1);
    expect(data.history?.[0].invested).toBe(2000);
    expect(data.history?.[0].value).toBeGreaterThan(0);
  });

  it("пустой портфель не пишет нулевых снимков", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const data = await api.get("/investments");
    expect(data.history ?? []).toHaveLength(0);
  });

  it("индекс для сравнения отдаётся по дням", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const index = await api.get("/investments/index?range=1m");
    expect(index.index).toBe("IMOEX");
    expect(index.points.length).toBeGreaterThan(20);
  });
});

describe("весь доход от вложений", () => {
  it("бумажный + с продаж + выплаты", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", {
      ticker: "SBER",
      lots: JSON.stringify([{ date: "2025-01-10", quantity: 20, price: 200 }])
    });
    await api.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "10",
      sellPrice: "300",
      fee: "0",
      date: "2026-05-01"
    });
    await api.post("/investments/events", {
      type: "DIVIDEND",
      ticker: "SBER",
      amount: "340",
      date: "2026-07-20"
    });
    const { totals, portfolio } = await api.get("/investments");
    const sber = portfolio.find((row) => row.ticker === "SBER")!;
    expect(totals?.realized).toBe(1000); // 10 × (300 − 200)
    expect(totals?.dividends).toBe(340);
    expect(totals?.invested).toBe(2000);
    expect(totals?.total).toBeCloseTo(sber.pnl + 1000 + 340, 2);
  });
});
