import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { InvestmentData } from "@/types/finance";

// «В портфель» из подборки докупает, а не переписывает.
//
// Кнопка слала количество и среднюю — и позиция с тем же тикером заменялась
// целиком: 100 купленных акций с их покупками превращались в 5 из подборки.
// Молча и без возврата.

async function portfolio(api: LocalApiClient) {
  return (await api.get<InvestmentData>("/investments")).portfolio;
}

describe("докупка к позиции", () => {
  it("добавляет покупку к уже купленному и пересчитывает среднюю", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", {
      ticker: "SBER",
      lots: JSON.stringify([
        { date: "2024-01-10", quantity: 60, price: 200 },
        { date: "2025-06-01", quantity: 40, price: 325 }
      ])
    });

    await api.post("/investments", {
      action: "addLot",
      ticker: "SBER",
      quantity: "10",
      price: "300",
      date: "2026-09-27"
    });

    const sber = (await portfolio(api)).find((row) => row.ticker === "SBER");
    expect(sber?.quantity).toBe(110);
    expect(sber?.lots).toEqual([
      { date: "2024-01-10", quantity: 60, price: 200 },
      { date: "2025-06-01", quantity: 40, price: 325 },
      { date: "2026-09-27", quantity: 10, price: 300 }
    ]);
    // (60×200 + 40×325 + 10×300) / 110
    expect(sber?.averageBuyPrice).toBeCloseTo(254.5455, 3);
  });

  it("позиция без покупок (средняя вручную) не теряет своё количество", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", { ticker: "GAZP", quantity: "50", averageBuyPrice: "150" });

    await api.post("/investments", {
      action: "addLot",
      ticker: "GAZP",
      quantity: "50",
      price: "170",
      date: "2026-09-27"
    });

    const gazp = (await portfolio(api)).find((row) => row.ticker === "GAZP");
    expect(gazp?.quantity).toBe(100);
    expect(gazp?.averageBuyPrice).toBe(160);
  });

  it("новой бумаги ещё нет — появляется с одной покупкой", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", {
      action: "addLot",
      ticker: "LKOH",
      quantity: "2",
      price: "7000",
      date: "2026-09-27"
    });

    const lkoh = (await portfolio(api)).find((row) => row.ticker === "LKOH");
    expect(lkoh?.quantity).toBe(2);
    expect(lkoh?.lots).toEqual([{ date: "2026-09-27", quantity: 2, price: 7000 }]);
  });
});

// Налог с продажи — с той цены, по которой куплены проданные бумаги.
describe("цена покупки при продаже — по FIFO", () => {
  it("fifoCost берёт самые старые покупки", async () => {
    const { fifoCost } = await import("@/lib/investments/lots");
    const lots = [
      { date: "2025-06-01", quantity: 40, price: 325 },
      { date: "2024-01-10", quantity: 60, price: 200 }
    ];
    expect(fifoCost(lots, 60)).toBe(200);
    // 60 × 200 + 10 × 325 = 15 250 за 70
    expect(fifoCost(lots, 70)).toBeCloseTo(217.8571, 3);
    expect(fifoCost(lots, 101)).toBeNull();
  });

  it("продажа без цены покупки берёт её из ушедших лотов", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", {
      ticker: "SBER",
      lots: JSON.stringify([
        { date: "2024-01-10", quantity: 60, price: 200 },
        { date: "2025-06-01", quantity: 40, price: 325 }
      ])
    });
    const event = await api.post<{ buyPrice: number }>("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "70",
      sellPrice: "300",
      fee: "0",
      date: "2026-08-01"
    });
    expect(event.buyPrice).toBeCloseTo(217.8571, 3);
  });
});
