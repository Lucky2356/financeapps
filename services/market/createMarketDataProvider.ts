import type { MarketDataService } from "./MarketDataService";
import { MockMarketDataProvider } from "./MockMarketDataProvider";
import { MoexMarketDataProvider } from "./MoexMarketDataProvider";

function mockMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_MARKET_DATA === "mock" ||
    Boolean(process.env.VITEST) ||
    process.env.NODE_ENV === "test"
  );
}

/** Откуда цены — тем же правилом, что выбирает поставщика ниже. */
export function marketDataSource(): "MOEX ISS" | "MOCK" {
  return mockMode() ? "MOCK" : "MOEX ISS";
}

export function createMarketDataProvider(): MarketDataService {
  // Default to REAL MOEX ISS data (live prices, day/30-day change, historical
  // candles). The deterministic mock is used only in tests or when explicitly
  // opted out via NEXT_PUBLIC_MARKET_DATA=mock. On the web the provider runs
  // server-side (no CORS); the desktop webview falls back to the mock if a
  // direct MOEX request is blocked (handled inside MoexMarketDataProvider).
  if (mockMode()) {
    return new MockMarketDataProvider();
  }
  return new MoexMarketDataProvider();
}
