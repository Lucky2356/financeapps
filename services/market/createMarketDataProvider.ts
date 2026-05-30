import type { MarketDataService } from "./MarketDataService";
import { MockMarketDataProvider } from "./MockMarketDataProvider";
import { MoexMarketDataProvider } from "./MoexMarketDataProvider";

export function createMarketDataProvider(): MarketDataService {
  // Use MOEX in production web mode, mock in test/demo/desktop
  if (process.env.NEXT_PUBLIC_MARKET_DATA === "moex") {
    return new MoexMarketDataProvider();
  }
  return new MockMarketDataProvider();
}
