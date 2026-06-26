import { format, subDays } from "date-fns";

import type { HistoricalPrice, MarketDataService, MarketSecurity } from "./MarketDataService";
import { MockMarketDataProvider } from "./MockMarketDataProvider";

// Curated universe of liquid Russian blue chips. MOEX ISS provides live prices
// and day change; sector/risk/comment are app-curated. (Yandex now trades as
// YDEX on MOEX after the 2024 restructuring.)
const TICKERS = [
  "SBER",
  "GAZP",
  "LKOH",
  "YDEX",
  "T",
  "VTBR",
  "MGNT",
  "NVTK",
  "ROSN",
  "MOEX",
  "PLZL",
  "PHOR",
  "CHMF",
  "SNGS",
  "AFLT"
] as const;

type Ticker = (typeof TICKERS)[number];
type StaticMeta = Pick<MarketSecurity, "sector" | "risk" | "comment"> & { name: string };

const STATIC_META: Record<Ticker, StaticMeta> = {
  SBER: {
    name: "Сбербанк",
    sector: "Финансы",
    risk: "MEDIUM",
    comment: "Крупная ликвидная бумага, чувствительна к ставкам и качеству кредитного портфеля."
  },
  GAZP: {
    name: "Газпром",
    sector: "Энергетика",
    risk: "HIGH",
    comment: "Высокая зависимость от экспортной конъюнктуры, налоговой нагрузки и капзатрат."
  },
  LKOH: {
    name: "Лукойл",
    sector: "Энергетика",
    risk: "MEDIUM",
    comment: "Нефтегазовый сектор, чувствителен к ценам на сырьё и валютному курсу."
  },
  YDEX: {
    name: "Яндекс",
    sector: "Технологии",
    risk: "HIGH",
    comment: "Технологическая компания с повышенной волатильностью и регуляторными факторами."
  },
  T: {
    name: "Т-Технологии",
    sector: "Финтех",
    risk: "HIGH",
    comment: "Финтех-эмитент с быстрым ростом и заметной чувствительностью к ожиданиям рынка."
  },
  VTBR: {
    name: "ВТБ",
    sector: "Финансы",
    risk: "HIGH",
    comment: "Банковская бумага с высокой волатильностью и зависимостью от макрофакторов."
  },
  MGNT: {
    name: "Магнит",
    sector: "Ритейл",
    risk: "MEDIUM",
    comment: "Защитный сектор, но маржинальность зависит от потребительского спроса и логистики."
  },
  NVTK: {
    name: "Новатэк",
    sector: "Энергетика",
    risk: "MEDIUM",
    comment: "Газовый сектор, важны санкционные ограничения и инвестиционные проекты."
  },
  ROSN: {
    name: "Роснефть",
    sector: "Энергетика",
    risk: "MEDIUM",
    comment: "Зависимость от нефтяных цен, налоговой политики и курса рубля."
  },
  MOEX: {
    name: "Московская биржа",
    sector: "Финансовая инфраструктура",
    risk: "LOW",
    comment: "Инфраструктурная компания, динамика зависит от оборотов торгов и ставок."
  },
  PLZL: {
    name: "Полюс",
    sector: "Металлы и добыча",
    risk: "MEDIUM",
    comment: "Золотодобытчик, чувствителен к ценам на золото и валютному курсу."
  },
  PHOR: {
    name: "ФосАгро",
    sector: "Химия",
    risk: "MEDIUM",
    comment: "Производитель удобрений; важны экспортные рынки, цены на сырье и логистика."
  },
  CHMF: {
    name: "Северсталь",
    sector: "Металлы и добыча",
    risk: "MEDIUM",
    comment: "Металлургический сектор, зависит от спроса на сталь и сырьевых циклов."
  },
  SNGS: {
    name: "Сургутнефтегаз",
    sector: "Энергетика",
    risk: "MEDIUM",
    comment: "Нефтегазовая компания с заметной зависимостью от курса рубля и дивидендных ожиданий."
  },
  AFLT: {
    name: "Аэрофлот",
    sector: "Транспорт",
    risk: "HIGH",
    comment:
      "Авиаперевозчик с высокой чувствительностью к топливу, пассажиропотоку и регуляторным факторам."
  }
};

const SECURITIES_URL =
  "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json" +
  "?iss.meta=off&iss.only=securities,marketdata" +
  "&securities.columns=SECID,SHORTNAME" +
  "&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,MARKETPRICE" +
  "&lang=ru";

function historyUrl(ticker: string, from: string, till: string): string {
  return (
    `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(ticker)}.json` +
    `?iss.meta=off&iss.only=history&history.columns=TRADEDATE,CLOSE&from=${from}&till=${till}&lang=ru`
  );
}

type SnapshotRow = { price: number; changeDay: number; name: string };

// Module-level caches shared across provider instances (a new instance is
// created per request) to keep MOEX load low while staying near-real-time.
const SNAPSHOT_TTL_MS = 30_000;
const CHANGE30D_TTL_MS = 60 * 60 * 1000;
let snapshotCache: { ts: number; rows: Map<string, SnapshotRow> } | null = null;
let change30dCache: { ts: number; map: Map<string, number> } | null = null;

function parseMoexRows(table: { columns: string[]; data: (string | number | null)[][] }) {
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
      const [snapshot, change30d] = await Promise.all([this.getSnapshot(), this.getChange30dMap()]);

      const results: MarketSecurity[] = [];
      for (const ticker of TICKERS) {
        const row = snapshot.get(ticker);
        if (!row || row.price <= 0) continue;
        const meta = STATIC_META[ticker];
        results.push({
          ticker,
          name: row.name || meta.name,
          sector: meta.sector,
          risk: meta.risk,
          comment: meta.comment,
          price: row.price,
          changeDay: row.changeDay,
          change30d: change30d.get(ticker) ?? 0
        });
      }

      if (results.length > 0) return results;
      return this.fallback.getSecurities();
    } catch {
      return this.fallback.getSecurities();
    }
  }

  async getSecurityByTicker(ticker: string): Promise<MarketSecurity | null> {
    const t = ticker.toUpperCase();
    try {
      // Curated first (has sector/risk/comment), then the full board.
      const curated = (await this.getSecurities()).find((security) => security.ticker === t);
      if (curated) return curated;
      const matches = await this.searchSecurities(t, 1);
      return matches.find((security) => security.ticker === t) ?? null;
    } catch {
      return this.fallback.getSecurityByTicker(ticker);
    }
  }

  async getHistoricalPrices(ticker: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    try {
      const prices = await this.fetchHistory(
        ticker.toUpperCase(),
        format(from, "yyyy-MM-dd"),
        format(to, "yyyy-MM-dd")
      );
      if (prices.length > 0) return prices;
      return this.fallback.getHistoricalPrices(ticker, from, to);
    } catch {
      return this.fallback.getHistoricalPrices(ticker, from, to);
    }
  }

  async updateMarketPrices(): Promise<void> {
    // Force a fresh snapshot on the next read.
    snapshotCache = null;
    try {
      await this.getSnapshot();
    } catch {
      /* offline — readers fall back to mock/cache */
    }
  }

  // Live price + day-change snapshot (one request), cached briefly.
  private async getSnapshot(): Promise<Map<string, SnapshotRow>> {
    if (snapshotCache && Date.now() - snapshotCache.ts < SNAPSHOT_TTL_MS) return snapshotCache.rows;

    const response = await fetchWithTimeout(SECURITIES_URL);
    if (!response.ok) throw new Error(`MOEX ISS returned HTTP ${response.status}`);
    const json = (await response.json()) as {
      securities: { columns: string[]; data: (string | number | null)[][] };
      marketdata: { columns: string[]; data: (string | number | null)[][] };
    };
    const secMap = parseMoexRows(json.securities);
    const mdMap = parseMoexRows(json.marketdata);

    // Build rows for the WHOLE board (not just the curated tickers) so the same
    // fetch backs both the curated list and full-universe search.
    const rows = new Map<string, SnapshotRow>();
    for (const [secid, md] of mdMap) {
      const last = md["LAST"];
      const market = md["MARKETPRICE"];
      const price =
        typeof last === "number" && last > 0 ? last : typeof market === "number" ? market : 0;
      if (price <= 0) continue;
      const pct = md["LASTTOPREVPRICE"]; // day change in %
      rows.set(secid, {
        price,
        changeDay: typeof pct === "number" ? Number(pct.toFixed(2)) : 0,
        name: String(secMap.get(secid)?.["SHORTNAME"] ?? "")
      });
    }
    snapshotCache = { ts: Date.now(), rows };
    return rows;
  }

  async searchSecurities(query: string, limit = 20): Promise<MarketSecurity[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    try {
      const snapshot = await this.getSnapshot();
      const matches: MarketSecurity[] = [];
      for (const [secid, row] of snapshot) {
        if (!secid.includes(q) && !row.name.toUpperCase().includes(q)) continue;
        const meta = STATIC_META[secid as Ticker];
        matches.push({
          ticker: secid,
          name: row.name || meta?.name || secid,
          sector: meta?.sector ?? "Прочее",
          risk: meta?.risk ?? "MEDIUM",
          comment:
            meta?.comment ?? "Цены и изменение — с Московской биржи (MOEX). Не инвестиционный совет.",
          price: row.price,
          changeDay: row.changeDay,
          change30d: 0
        });
        if (matches.length >= limit) break;
      }
      // Exact-ticker matches first, then alphabetical.
      matches.sort((a, b) => {
        if (a.ticker === q) return -1;
        if (b.ticker === q) return 1;
        return a.ticker.localeCompare(b.ticker);
      });
      return matches.length > 0 ? matches : this.fallback.searchSecurities(query, limit);
    } catch {
      return this.fallback.searchSecurities(query, limit);
    }
  }

  // 30-day % change per ticker, derived from history (parallel), cached for an
  // hour because it barely moves intraday.
  private async getChange30dMap(): Promise<Map<string, number>> {
    if (change30dCache && Date.now() - change30dCache.ts < CHANGE30D_TTL_MS)
      return change30dCache.map;

    const from = format(subDays(new Date(), 35), "yyyy-MM-dd");
    const till = format(new Date(), "yyyy-MM-dd");
    const map = new Map<string, number>();

    await Promise.all(
      TICKERS.map(async (ticker) => {
        try {
          const history = await this.fetchHistory(ticker, from, till);
          if (history.length >= 2) {
            const oldest = history[0].price;
            const latest = history[history.length - 1].price;
            if (oldest > 0)
              map.set(ticker, Number((((latest - oldest) / oldest) * 100).toFixed(2)));
          }
        } catch {
          /* leave this ticker without a 30d value */
        }
      })
    );

    change30dCache = { ts: Date.now(), map };
    return map;
  }

  private async fetchHistory(
    ticker: string,
    from: string,
    till: string
  ): Promise<HistoricalPrice[]> {
    const response = await fetchWithTimeout(historyUrl(ticker, from, till));
    if (!response.ok) throw new Error(`MOEX history returned HTTP ${response.status}`);
    const json = (await response.json()) as {
      history: { columns: string[]; data: (string | number | null)[][] };
    };

    const colDate = json.history.columns.indexOf("TRADEDATE");
    const colClose = json.history.columns.indexOf("CLOSE");
    if (colDate === -1 || colClose === -1) return [];

    const result: HistoricalPrice[] = [];
    for (const row of json.history.data) {
      const rawDate = row[colDate];
      const rawClose = row[colClose];
      if (typeof rawDate !== "string" || typeof rawClose !== "number" || rawClose <= 0) continue;
      result.push({ ticker, date: new Date(rawDate), price: rawClose });
    }
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  }
}
