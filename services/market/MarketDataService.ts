import type { AssetKind, SecurityRisk } from "@/types/enums";

export type MarketSecurity = {
  ticker: string;
  name: string;
  /** Share, bond, fund or metal — see AssetKind. */
  assetKind: AssetKind;
  sector: string;
  risk: SecurityRisk;
  comment: string;
  price: number;
  changeDay: number;
  change30d: number;
  /**
   * How many shares trade as one lot on the exchange. Advice to buy 7 SBER is
   * advice nobody can follow — the lot is 10. Absent means one.
   */
  lotSize?: number;
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
  // Search the full exchange universe by ticker or name (for adding anything
  // listed). `kind` narrows the search to one type of asset.
  searchSecurities(query: string, limit?: number, kind?: AssetKind): Promise<MarketSecurity[]>;
}
