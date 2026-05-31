import type { MarketDataService } from "./MarketDataService";
import { MockMarketDataProvider } from "./MockMarketDataProvider";
import { MoexMarketDataProvider } from "./MoexMarketDataProvider";

export function createMarketDataProvider(): MarketDataService {
  // Real-time MOEX ISS data when enabled (web + desktop builds set
  // NEXT_PUBLIC_MARKET_DATA=moex); the mock provider is used in tests and as an
  // offline fallback inside MoexMarketDataProvider itself.
  if (process.env.NEXT_PUBLIC_MARKET_DATA === "moex") {
    return new MoexMarketDataProvider();
  }
  return new MockMarketDataProvider();
}
