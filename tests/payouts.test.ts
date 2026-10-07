import { describe, expect, it } from "vitest";

import { parseCoupons, parseDividends } from "@/lib/market/payouts";

describe("выплаты с биржи", () => {
  it("дивиденды: столбцы по имени, SUR — это рубли", () => {
    expect(
      parseDividends("SBER", {
        dividends: {
          columns: ["secid", "isin", "registryclosedate", "value", "currencyid"],
          data: [
            ["SBER", "RU0009029540", "2025-07-18", 34.84, "SUR"],
            ["SBER", "RU0009029540", "2026-07-17", 37.5, "RUB"],
            ["SBER", "RU0009029540", null, 10, "RUB"]
          ]
        }
      })
    ).toEqual([
      { ticker: "SBER", kind: "DIVIDEND", date: "2025-07-18", perShare: 34.84, currency: "RUB" },
      { ticker: "SBER", kind: "DIVIDEND", date: "2026-07-17", perShare: 37.5, currency: "RUB" }
    ]);
  });

  it("купоны: сумма в рублях, пустые пропускаются", () => {
    expect(
      parseCoupons("SU26238RMFS4", {
        coupons: {
          columns: ["isin", "name", "coupondate", "recorddate", "facevalue", "value", "value_rub"],
          data: [
            ["RU000A1038V6", "ОФЗ 26238", "2026-12-02", "2026-12-01", 1000, 35.4, 35.4],
            ["RU000A1038V6", "ОФЗ 26238", "2027-06-02", "2027-06-01", 1000, null, null]
          ]
        }
      })
    ).toEqual([
      {
        ticker: "SU26238RMFS4",
        kind: "COUPON",
        date: "2026-12-02",
        perShare: 35.4,
        currency: "RUB"
      }
    ]);
  });

  it("незнакомый ответ — пусто, а не ошибка", () => {
    expect(parseDividends("X", {})).toEqual([]);
    expect(parseCoupons("X", { coupons: { columns: ["a"], data: [[1]] } })).toEqual([]);
  });
});

describe("ручка /investments/payouts", () => {
  it("ближайшие — с суммой на количество; недавние — пока не отмечены полученными", async () => {
    const { LocalApiClient } = await import("@/lib/api/LocalApiClient");
    const { MemoryStorageAdapter } = await import("@/lib/storage/MemoryStorageAdapter");
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });

    const first = await api.get("/investments/payouts");
    expect(first.upcoming).toHaveLength(1);
    expect(first.upcoming[0].amount).toBeCloseTo(first.upcoming[0].perShare * 10, 2);
    expect(first.recent).toHaveLength(1);

    // «Получено» — запись дивиденда: недавняя выплата больше не просится.
    await api.post("/investments/events", {
      type: "DIVIDEND",
      ticker: "SBER",
      amount: String(first.recent[0].amount),
      date: new Date().toISOString().slice(0, 10)
    });
    const second = await api.get("/investments/payouts");
    expect(second.recent).toHaveLength(0);
  });
});
