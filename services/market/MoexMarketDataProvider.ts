import { format, subDays } from "date-fns";

import type { HistoricalPrice, MarketDataService, MarketSecurity } from "./MarketDataService";
import { MockMarketDataProvider } from "./MockMarketDataProvider";

const TICKERS = ["SBER", "GAZP", "LKOH", "YNDX", "T", "VTBR", "MGNT", "NVTK", "ROSN", "MOEX"] as const;

type Ticker = (typeof TICKERS)[number];

type StaticMeta = Pick<MarketSecurity, "sector" | "risk" | "comment">;

const STATIC_META: Record<Ticker, StaticMeta> = {
  SBER: {
    sector: "Финансы",
    risk: "MEDIUM",
    comment: "Крупная ликвидная бумага, чувствительна к ставкам и качеству кредитного портфеля."
  },
  GAZP: {
    sector: "Энергетика",
    risk: "HIGH",
    comment: "Высокая зависимость от экспортной конъюнктуры, налоговой нагрузки и капитальных затрат."
  },
  LKOH: {
    sector: "Энергетика",
    risk: "MEDIUM",
    comment: "Нефтегазовый сектор, чувствителен к ценам на сырье и валютному курсу."
  },
  YNDX: {
    sector: "Технологии",
    risk: "HIGH",
    comment: "Технологическая компания с повышенной волатильностью и регуляторными факторами."
  },
  T: {
    sector: "Финтех",
    risk: "HIGH",
    comment: "Финтех-эмитент с быстрым ростом и заметной чувствительностью к ожиданиям рынка."
  },
  VTBR: {
    sector: "Финансы",
    risk: "HIGH",
    comment: "Банковская бумага с высокой волатильностью и зависимостью от макрофакторов."
  },
  MGNT: {
    sector: "Ритейл",
    risk: "MEDIUM",
    comment: "Защитный сектор, но маржинальность зависит от потребительского спроса и логистики."
  },
  NVTK: {
    sector: "Энергетика",
    risk: "MEDIUM",
    comment: "Газовый сектор, важны санкционные ограничения и инвестиционные проекты."
  },
  ROSN: {
    sector: "Энергетика",
    risk: "MEDIUM",
    comment: "Зависимость от нефтяных цен, налоговой политики и курса рубля."
  },
  MOEX: {
    sector: "Финансовая инфраструктура",
    risk: "LOW",
    comment: "Инфраструктурная компания, динамика зависит от оборотов торгов и ставок."
  }
};

const SECURITIES_URL =
  "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json" +
  "?iss.meta=off&iss.only=securities,marketdata" +
  "&securities.columns=SECID,SHORTNAME" +
  "&marketdata.columns=SECID,LAST,CHANGE,MARKETPRICE" +
  "&lang=ru";

function historyUrl(ticker: string, from: string, till: string): string {
  return (
    `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(ticker)}.json` +
    `?iss.meta=off&iss.only=history&history.columns=TRADEDATE,CLOSE&from=${from}&till=${till}&lang=ru`
  );
}

function parseMoexRows(table: {
  columns: string[];
  data: (string | number | null)[][];
}): Map<string, Record<string, string | number | null>> {
  const map = new Map<string, Record<string, string | number | null>>();
  for (const row of table.data) {
    const obj: Record<string, string | number | null> = {};
    table.columns.forEach((col, i) => {
      obj[col] = row[i] ?? null;
    });
    const secid = String(obj["SECID"] ?? "");
    if (secid) map.set(secid, obj);
  }
  return map;
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class MoexMarketDataProvider implements MarketDataService {
  private readonly fallback = new MockMarketDataProvider();

  async getSecurities(): Promise<MarketSecurity[]> {
    try {
      const response = await fetchWithTimeout(SECURITIES_URL);
      if (!response.ok) throw new Error(`MOEX ISS returned HTTP ${response.status}`);

      const json = (await response.json()) as {
        securities: { columns: string[]; data: (string | number | null)[][] };
        marketdata: { columns: string[]; data: (string | number | null)[][] };
      };

      const secMap = parseMoexRows(json.securities);
      const mdMap = parseMoexRows(json.marketdata);

      // Fetch 30-day history for change30d calculation
      const thirtyDaysAgo = subDays(new Date(), 30);
      const fromStr = format(thirtyDaysAgo, "yyyy-MM-dd");
      const tillStr = format(new Date(), "yyyy-MM-dd");

      const results: MarketSecurity[] = [];

      for (const ticker of TICKERS) {
        const secRow = secMap.get(ticker);
        const mdRow = mdMap.get(ticker);
        const meta = STATIC_META[ticker];

        if (!secRow || !mdRow) continue;

        // Prefer LAST price, fall back to MARKETPRICE
        const rawLast = mdRow["LAST"];
        const rawMarket = mdRow["MARKETPRICE"];
        const price = typeof rawLast === "number" && rawLast > 0 ? rawLast : typeof rawMarket === "number" ? rawMarket : 0;

        const rawChange = mdRow["CHANGE"];
        const changeDay = typeof rawChange === "number" ? Number(rawChange.toFixed(2)) : 0;

        // Calculate change30d from history
        let change30d = 0;
        try {
          const histPrices = await this.fetchHistory(ticker, fromStr, tillStr);
          if (histPrices.length >= 2 && price > 0) {
            const oldest = histPrices[0].price;
            if (oldest > 0) {
              change30d = Number((((price - oldest) / oldest) * 100).toFixed(2));
            }
          }
        } catch {
          // If history fetch fails, leave change30d as 0
        }

        results.push({
          ticker,
          name: String(secRow["SHORTNAME"] ?? ticker),
          sector: meta.sector,
          risk: meta.risk,
          comment: meta.comment,
          price,
          changeDay,
          change30d
        });
      }

      // If we got at least one result, return; otherwise fall back
      if (results.length > 0) return results;
      return this.fallback.getSecurities();
    } catch {
      return this.fallback.getSecurities();
    }
  }

  async getSecurityByTicker(ticker: string): Promise<MarketSecurity | null> {
    try {
      const all = await this.getSecurities();
      return all.find((security) => security.ticker === ticker.toUpperCase()) ?? null;
    } catch {
      return this.fallback.getSecurityByTicker(ticker);
    }
  }

  async getHistoricalPrices(ticker: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    try {
      const fromStr = format(from, "yyyy-MM-dd");
      const tillStr = format(to, "yyyy-MM-dd");
      const prices = await this.fetchHistory(ticker.toUpperCase(), fromStr, tillStr);
      if (prices.length > 0) return prices;
      return this.fallback.getHistoricalPrices(ticker, from, to);
    } catch {
      return this.fallback.getHistoricalPrices(ticker, from, to);
    }
  }

  async updateMarketPrices(): Promise<void> {
    try {
      await this.getSecurities();
    } catch {
      // Silently ignore — this is a side-effect-only call
    }
  }

  private async fetchHistory(ticker: string, from: string, till: string): Promise<HistoricalPrice[]> {
    const url = historyUrl(ticker, from, till);
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`MOEX history returned HTTP ${response.status}`);

    const json = (await response.json()) as {
      history: { columns: string[]; data: (string | number | null)[][] };
    };

    const rows = json.history.data;
    const colDate = json.history.columns.indexOf("TRADEDATE");
    const colClose = json.history.columns.indexOf("CLOSE");

    if (colDate === -1 || colClose === -1) return [];

    const result: HistoricalPrice[] = [];
    for (const row of rows) {
      const rawDate = row[colDate];
      const rawClose = row[colClose];
      if (typeof rawDate !== "string" || typeof rawClose !== "number" || rawClose <= 0) continue;
      result.push({
        ticker,
        date: new Date(rawDate),
        price: rawClose
      });
    }

    // Sort ascending by date
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  }
}
