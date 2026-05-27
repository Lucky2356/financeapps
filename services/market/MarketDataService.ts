import type { SecurityRisk } from "@prisma/client";

export type MarketSecurity = {
  ticker: string;
  name: string;
  sector: string;
  risk: SecurityRisk;
  comment: string;
  price: number;
  changeDay: number;
  change30d: number;
};

export type HistoricalPrice = {
  ticker: string;
  date: Date;
  price: number;
};

export interface MarketDataService {
  getSecurities(): Promise<MarketSecurity[]>;
  getSecurityByTicker(ticker: string): Promise<MarketSecurity | null>;
  getHistoricalPrices(ticker: string, from: Date, to: Date): Promise<HistoricalPrice[]>;
  updateMarketPrices(): Promise<void>;
}
