import { describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Имя бумаги — на языке экрана для показа и на языке биржи для книги.
//
// Найдено разбором 2.8.1: имя на языке экрана писалось в общую книгу при
// каждом обновлении цен (раз в 45 секунд). Английское устройство писало
// «Sberbank», русское — обратно «Сбербанк», и книга без конца ездила между
// ними, даже когда биржа закрыта и цены стоят.

vi.mock("@/services/market/createMarketDataProvider", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/market/createMarketDataProvider")>();
  const { MockMarketDataProvider } = await import("@/services/market/MockMarketDataProvider");
  class EnglishScreen extends MockMarketDataProvider {
    async getSecurities() {
      const rows = await super.getSecurities();
      return rows.map((row) =>
        row.ticker === "SBER" ? { ...row, name: "Sberbank", storedName: "Сбербанк" } : row
      );
    }
  }
  return { ...original, createMarketDataProvider: () => new EnglishScreen() };
});

const KEY = "localFinanceState_profile-default";

describe("имя бумаги в общей книге", () => {
  it("на экране — язык экрана, в книге — язык биржи", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    await client.post("/investments", { ticker: "SBER", quantity: "10", averageBuyPrice: "250" });

    const page = await client.get("/investments");
    expect(page.portfolio[0].name).toBe("Sberbank");

    const stored = (await storage.getItem<{
      investments: { portfolio: Array<{ ticker: string; name: string }> };
    }>(KEY))!;
    expect(stored.investments.portfolio[0].name).toBe("Сбербанк");
    expect(stored.investments.portfolio[0]).not.toHaveProperty("storedName");
  });
});
