import type { HistoricalPrice, MarketDataService, MarketSecurity } from "./MarketDataService";

export class MoexMarketDataProvider implements MarketDataService {
  async getSecurities(): Promise<MarketSecurity[]> {
    // TODO: Connect MOEX ISS securities endpoint after choosing board and instrument filters.
    // Banking and brokerage integrations must rely on official APIs and explicit user consent.
    throw new Error("MOEX ISS provider is not implemented in MVP.");
  }

  async getSecurityByTicker(ticker: string): Promise<MarketSecurity | null> {
    // TODO: Query MOEX ISS by SECID and normalize response to MarketSecurity.
    void ticker;
    throw new Error("MOEX ISS provider is not implemented in MVP.");
  }

  async getHistoricalPrices(ticker: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    // TODO: Use MOEX ISS history endpoint, cache responses, and validate date ranges.
    void ticker;
    void from;
    void to;
    throw new Error("MOEX ISS provider is not implemented in MVP.");
  }

  async updateMarketPrices(): Promise<void> {
    // TODO: Add background job with rate limits, retries, and audit logging.
    throw new Error("MOEX ISS provider is not implemented in MVP.");
  }
}
