import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { MockMarketDataProvider } from "@/services/market/MockMarketDataProvider";

// Копия не ждёт биржу.
//
// «Объединить» при подключении устройства начинается с выгрузки копии, а копия
// пересчитывала портфель по бирже: справочник и история по каждой бумаге, по
// десять секунд на запрос, если биржа молчит. Кнопка висела по полминуты — так
// это и нашлось: в CI биржа недоступна, и проверка «Объединить» падала по
// таймауту через раз.

const market = vi.hoisted(() => ({ silent: false, asked: 0 }));

vi.mock("@/services/market/createMarketDataProvider", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/market/createMarketDataProvider")>();
  return {
    ...original,
    createMarketDataProvider: () =>
      new Proxy(new MockMarketDataProvider(), {
        get(target, name, receiver) {
          const value = Reflect.get(target, name, receiver);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            if (!market.silent) return value.apply(target, args);
            market.asked += 1;
            // Биржа молчит: ответа нет вовсе.
            return new Promise(() => {});
          };
        }
      })
  };
});

afterEach(() => {
  market.silent = false;
  market.asked = 0;
});

describe("резервная копия без связи с биржей", () => {
  it("выгружается сразу и с портфелем, не спрашивая биржу", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });

    market.silent = true;
    const backup = await client.get("/backup");

    expect(market.asked).toBe(0);
    expect(backup.investments.portfolio).toHaveLength(1);
    expect(backup.investments.portfolio[0]).toMatchObject({ ticker: "SBER", quantity: 10 });
  });

  it("копия, снятая без биржи, восстанавливается с тем же портфелем", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });
    market.silent = true;
    const backup = await client.get("/backup");
    market.silent = false;

    const fresh = new LocalApiClient(new MemoryStorageAdapter());
    await fresh.post("/backup", { backup });
    const restored = await fresh.get("/investments");
    expect(restored.portfolio.map((row) => [row.ticker, row.quantity])).toEqual([["SBER", 10]]);
  });
});
