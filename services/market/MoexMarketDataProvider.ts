import { format, subDays } from "date-fns";

import type { AssetKind } from "@/types/enums";
import { rankSecurities } from "@/lib/investments/security-match";
import { sectorForTicker } from "@/lib/market/sectors";
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
type StaticMeta = Pick<MarketSecurity, "risk" | "comment"> & { name: string };

const STATIC_META: Record<Ticker, StaticMeta> = {
  SBER: {
    name: "Сбербанк",
    risk: "MEDIUM",
    comment: "Крупная ликвидная бумага, чувствительна к ставкам и качеству кредитного портфеля."
  },
  GAZP: {
    name: "Газпром",
    risk: "HIGH",
    comment: "Высокая зависимость от экспортной конъюнктуры, налоговой нагрузки и капзатрат."
  },
  LKOH: {
    name: "Лукойл",
    risk: "MEDIUM",
    comment: "Нефтегазовый сектор, чувствителен к ценам на сырьё и валютному курсу."
  },
  YDEX: {
    name: "Яндекс",
    risk: "HIGH",
    comment: "Технологическая компания с повышенной волатильностью и регуляторными факторами."
  },
  T: {
    name: "Т-Технологии",
    risk: "HIGH",
    comment: "Финтех-эмитент с быстрым ростом и заметной чувствительностью к ожиданиям рынка."
  },
  VTBR: {
    name: "ВТБ",
    risk: "HIGH",
    comment: "Банковская бумага с высокой волатильностью и зависимостью от макрофакторов."
  },
  MGNT: {
    name: "Магнит",
    risk: "MEDIUM",
    comment: "Защитный сектор, но маржинальность зависит от потребительского спроса и логистики."
  },
  NVTK: {
    name: "Новатэк",
    risk: "MEDIUM",
    comment: "Газовый сектор, важны санкционные ограничения и инвестиционные проекты."
  },
  ROSN: {
    name: "Роснефть",
    risk: "MEDIUM",
    comment: "Зависимость от нефтяных цен, налоговой политики и курса рубля."
  },
  MOEX: {
    name: "Московская биржа",
    risk: "LOW",
    comment: "Инфраструктурная компания, динамика зависит от оборотов торгов и ставок."
  },
  PLZL: {
    name: "Полюс",
    risk: "MEDIUM",
    comment: "Золотодобытчик, чувствителен к ценам на золото и валютному курсу."
  },
  PHOR: {
    name: "ФосАгро",
    risk: "MEDIUM",
    comment: "Производитель удобрений; важны экспортные рынки, цены на сырье и логистика."
  },
  CHMF: {
    name: "Северсталь",
    risk: "MEDIUM",
    comment: "Металлургический сектор, зависит от спроса на сталь и сырьевых циклов."
  },
  SNGS: {
    name: "Сургутнефтегаз",
    risk: "MEDIUM",
    comment: "Нефтегазовая компания с заметной зависимостью от курса рубля и дивидендных ожиданий."
  },
  AFLT: {
    name: "Аэрофлот",
    risk: "HIGH",
    comment:
      "Авиаперевозчик с высокой чувствительностью к топливу, пассажиропотоку и регуляторным факторам."
  }
};

// Where the app looks for a security, and what it finds there.
//
// It used to look at exactly one board — Т+ shares — which is why a bond simply
// could not be found: it is not listed there, and nothing said so. Each board
// below answers for one kind of asset, and the kind travels with the security
// from the search result into the saved position.
type BoardSpec = {
  board: string;
  engine: string;
  market: string;
  /** null means "read it off SECTYPE" — one board can hold several kinds. */
  assetKind: AssetKind | null;
  /** Bonds are quoted as a percentage of face value, not in roubles. */
  quotedInPercent?: boolean;
  securityColumns: string[];
  marketColumns: string[];
  /** When set, only these tickers are taken (the FX board is mostly noise). */
  only?: string[];
};

// LAST = last trade (live during the session). LCURRENTPRICE = current price
// (populated intraday). MARKETPRICE = weighted average — only a last resort,
// because it is NOT the per-share price a user trades at (when the market is
// closed MOEX zeroes LAST/LCURRENTPRICE and only MARKETPRICE remains, which is
// why holdings used to show a wrong, lower number).
const STOCK_MARKET_COLUMNS = ["SECID", "LAST", "LCURRENTPRICE", "LASTTOPREVPRICE", "MARKETPRICE"];

export const BOARDS: BoardSpec[] = [
  {
    board: "TQBR",
    engine: "stock",
    market: "shares",
    // Shares and exchange-traded funds share this board — SECTYPE tells them
    // apart, so a fund is labelled a fund rather than an odd-looking share.
    assetKind: null,
    securityColumns: ["SECID", "SHORTNAME", "SECTYPE", "LOTSIZE"],
    marketColumns: STOCK_MARKET_COLUMNS
  },
  {
    board: "TQOB",
    engine: "stock",
    market: "bonds",
    assetKind: "BOND",
    quotedInPercent: true,
    securityColumns: ["SECID", "SHORTNAME", "FACEVALUE", "ACCRUEDINT", "FACEUNIT"],
    marketColumns: STOCK_MARKET_COLUMNS
  },
  {
    board: "TQCB",
    engine: "stock",
    market: "bonds",
    assetKind: "BOND",
    quotedInPercent: true,
    securityColumns: ["SECID", "SHORTNAME", "FACEVALUE", "ACCRUEDINT", "FACEUNIT"],
    marketColumns: STOCK_MARKET_COLUMNS
  },
  {
    board: "CETS",
    engine: "currency",
    market: "selt",
    assetKind: "GOLD",
    // The whole FX board is thousands of instruments the app has no business
    // offering; these two are the metals people actually hold.
    only: ["GLDRUB_TOM", "SLVRUB_TOM"],
    securityColumns: ["SECID", "SHORTNAME"],
    marketColumns: ["SECID", "LAST", "LASTTOPREVPRICE", "MARKETPRICE"]
  }
];

// MOEX security types on the shares board. Everything that is not a share or a
// depositary receipt there is some flavour of fund (ETF, БПИФ, ПИФ).
const SHARE_SECTYPES = new Set(["1", "2", "D"]);

function securitiesUrl(spec: BoardSpec): string {
  return (
    `https://iss.moex.com/iss/engines/${spec.engine}/markets/${spec.market}/boards/${spec.board}/securities.json` +
    "?iss.meta=off&iss.only=securities,marketdata" +
    `&securities.columns=${spec.securityColumns.join(",")}` +
    `&marketdata.columns=${spec.marketColumns.join(",")}` +
    "&lang=ru"
  );
}

function historyUrl(spec: BoardSpec, ticker: string, from: string, till: string): string {
  const columns = spec.quotedInPercent ? "TRADEDATE,CLOSE,FACEVALUE,ACCINT" : "TRADEDATE,CLOSE";
  return (
    `https://iss.moex.com/iss/history/engines/${spec.engine}/markets/${spec.market}/boards/${spec.board}/securities/${encodeURIComponent(ticker)}.json` +
    `?iss.meta=off&iss.only=history&history.columns=${columns}&from=${from}&till=${till}&lang=ru`
  );
}

const SHARES_BOARD = BOARDS[0];

// `live` is the trustworthy intraday price (LAST/LCURRENTPRICE), 0 when the market
// is closed; `marketPrice` is the weighted-average last-resort. Callers prefer
// live → last historical close → marketPrice. Both are already in roubles: a
// bond's percentage quote is converted here, once, so nothing downstream has to
// know that bonds are priced differently from everything else.
type SnapshotRow = {
  live: number;
  marketPrice: number;
  changeDay: number;
  name: string;
  assetKind: AssetKind;
  /** Exchange lot: the smallest number of shares that can actually be bought. */
  lotSize: number;
  board: BoardSpec;
};
// Per-ticker daily stats from history: the official last close (what brokers show
// out of hours) and the close-over-close day change.
type HistoryStats = { lastClose: number; change30d: number; changeDay: number };

// Module-level caches shared across provider instances (a new instance is
// created per request) to keep MOEX load low while staying near-real-time.
const SNAPSHOT_TTL_MS = 30_000;
const HISTORY_STATS_TTL_MS = 60 * 60 * 1000;
let snapshotCache: { ts: number; rows: Map<string, SnapshotRow> } | null = null;
let historyStatsCache: { ts: number; map: Map<string, HistoryStats> } | null = null;

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

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundKopecks(value: number): number {
  return Math.round(value * 100) / 100;
}

function kindFromSecType(secType: string): AssetKind {
  return SHARE_SECTYPES.has(secType) ? "STOCK" : "FUND";
}

// Price priority: trustworthy live price → official last close (out of hours) →
// weighted-average market price as a final fallback.
function resolvePrice(row: SnapshotRow | undefined, stat: HistoryStats | undefined): number {
  if (row && row.live > 0) return row.live;
  if (stat && stat.lastClose > 0) return stat.lastClose;
  if (row && row.marketPrice > 0) return row.marketPrice;
  return 0;
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
      const [snapshot, stats] = await Promise.all([this.getSnapshot(), this.getHistoryStatsMap()]);

      const results: MarketSecurity[] = [];
      for (const ticker of TICKERS) {
        const row = snapshot.get(ticker);
        const stat = stats.get(ticker);
        const price = resolvePrice(row, stat);
        if (price <= 0) continue;
        const meta = STATIC_META[ticker];
        results.push({
          ticker,
          name: row?.name || meta.name,
          assetKind: "STOCK",
          // One table decides the industry for every security, curated or not,
          // so the sector chart cannot end up speaking two vocabularies at once.
          sector: sectorForTicker(ticker, "STOCK"),
          risk: meta.risk,
          comment: meta.comment,
          price,
          // Use the live intraday change while trading; otherwise the official
          // close-over-close change from history (LASTTOPREVPRICE is 0 off-hours).
          changeDay: row && row.live > 0 ? row.changeDay : (stat?.changeDay ?? row?.changeDay ?? 0),
          change30d: stat?.change30d ?? 0,
          lotSize: row?.lotSize ?? 1
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
      const upper = ticker.toUpperCase();
      const prices = await this.fetchHistory(
        upper,
        format(from, "yyyy-MM-dd"),
        format(to, "yyyy-MM-dd"),
        await this.boardOf(upper)
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

  // Live price + day-change snapshot for every board the app knows, cached
  // briefly. Boards are fetched in parallel and merged into one table, so a
  // search or a price lookup never has to know where a security is listed.
  private async getSnapshot(): Promise<Map<string, SnapshotRow>> {
    if (snapshotCache && Date.now() - snapshotCache.ts < SNAPSHOT_TTL_MS) return snapshotCache.rows;

    const boards = await Promise.all(
      BOARDS.map(async (spec) => {
        try {
          return await this.fetchBoard(spec);
        } catch {
          // One board being unreachable must not blank out the others: a broken
          // bond feed should cost you bonds, not your shares.
          return new Map<string, SnapshotRow>();
        }
      })
    );

    const rows = new Map<string, SnapshotRow>();
    for (const board of boards) for (const [secid, row] of board) rows.set(secid, row);
    if (rows.size === 0) throw new Error("MOEX ISS returned nothing on every board");

    snapshotCache = { ts: Date.now(), rows };
    return rows;
  }

  private async fetchBoard(spec: BoardSpec): Promise<Map<string, SnapshotRow>> {
    const response = await fetchWithTimeout(securitiesUrl(spec));
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
      if (spec.only && !spec.only.includes(secid)) continue;
      const security = secMap.get(secid);
      const faceValue = spec.quotedInPercent ? numberOf(security?.["FACEVALUE"]) : 0;
      // A bond's price is a percentage of its face value, and that face value
      // can be in dollars or yuan. Converting those would need an exchange rate
      // per instrument, so the app offers the rouble ones rather than show a
      // number in the wrong currency.
      if (spec.quotedInPercent) {
        if (String(security?.["FACEUNIT"] ?? "") !== "SUR" || faceValue <= 0) continue;
      }

      const last = md["LAST"];
      const current = md["LCURRENTPRICE"];
      const market = md["MARKETPRICE"];
      const quotedLive =
        typeof last === "number" && last > 0
          ? last
          : typeof current === "number" && current > 0
            ? current
            : 0;
      const quotedMarket = typeof market === "number" && market > 0 ? market : 0;
      // Keep the row if EITHER a live price or a market price exists — a closed
      // market has only marketPrice, and curated tickers will substitute the
      // historical close on top of it.
      if (quotedLive <= 0 && quotedMarket <= 0) continue;

      // Percentage in, roubles out: the conversion happens once, here, so
      // nothing downstream has to know that bonds are quoted differently.
      const accrued = spec.quotedInPercent ? numberOf(security?.["ACCRUEDINT"]) : 0;
      const toRoubles = (quote: number) =>
        quote > 0 && spec.quotedInPercent
          ? roundKopecks((quote / 100) * faceValue + accrued)
          : quote;

      const pct = md["LASTTOPREVPRICE"]; // intraday day change in %
      const lot = numberOf(security?.["LOTSIZE"]);
      rows.set(secid, {
        live: toRoubles(quotedLive),
        marketPrice: toRoubles(quotedMarket),
        changeDay: typeof pct === "number" ? Number(pct.toFixed(2)) : 0,
        lotSize: lot > 0 ? lot : 1,
        name: String(security?.["SHORTNAME"] ?? ""),
        assetKind: spec.assetKind ?? kindFromSecType(String(security?.["SECTYPE"] ?? "")),
        board: spec
      });
    }
    return rows;
  }

  async searchSecurities(query: string, limit = 20, kind?: AssetKind): Promise<MarketSecurity[]> {
    if (!query.trim()) return [];
    try {
      const snapshot = await this.getSnapshot();

      // Сначала оцениваются ВСЕ бумаги доски и только потом список обрезается.
      // Прежний код набирал первые `limit` совпадений и выходил из цикла, а
      // точное совпадение тикера поднимал уже после — так что при большом
      // числе совпадений запрос «SBER» мог не показать SBER вовсе.
      //
      // Цена в отборе не участвует: раньше бумага без сегодняшней сделки
      // отбрасывалась (`price <= 0`), то есть облигацию, которую и искали,
      // чтобы добавить в портфель, найти было нельзя.
      const candidates: Array<{ ticker: string; name: string; row: SnapshotRow }> = [];
      for (const [secid, row] of snapshot) {
        if (kind && row.assetKind !== kind) continue;
        candidates.push({
          ticker: secid,
          name: row.name || STATIC_META[secid as Ticker]?.name || secid,
          row
        });
      }

      const matches = rankSecurities(candidates, query, limit).map(({ ticker, name, row }) => {
        const meta = STATIC_META[ticker as Ticker];
        // Поиск идёт по всей доске, поэтому историю по каждому тикеру здесь не
        // тянем: берём живую цену, а если торгов не было — средневзвешенную.
        // Ноль означает «цены нет», и это честнее, чем спрятать бумагу.
        return {
          ticker,
          name,
          assetKind: row.assetKind,
          sector: sectorForTicker(ticker, row.assetKind),
          risk: meta?.risk ?? "MEDIUM",
          comment:
            meta?.comment ??
            "Цены и изменение — с Московской биржи (MOEX). Не инвестиционный совет.",
          price: row.live > 0 ? row.live : row.marketPrice,
          changeDay: row.changeDay,
          change30d: 0,
          lotSize: row.lotSize
        } satisfies MarketSecurity;
      });

      return matches.length > 0 ? matches : this.fallback.searchSecurities(query, limit, kind);
    } catch {
      return this.fallback.searchSecurities(query, limit, kind);
    }
  }

  // Per-ticker daily stats derived from history (parallel), cached for an hour
  // because they barely move out of hours: the official last close (shown when
  // the market is closed), the close-over-close day change, and the 30-day change.
  private async getHistoryStatsMap(): Promise<Map<string, HistoryStats>> {
    if (historyStatsCache && Date.now() - historyStatsCache.ts < HISTORY_STATS_TTL_MS)
      return historyStatsCache.map;

    const from = format(subDays(new Date(), 35), "yyyy-MM-dd");
    const till = format(new Date(), "yyyy-MM-dd");
    const map = new Map<string, HistoryStats>();

    await Promise.all(
      TICKERS.map(async (ticker) => {
        try {
          const history = await this.fetchHistory(ticker, from, till, SHARES_BOARD);
          if (history.length === 0) return;
          const oldest = history[0].price;
          const lastClose = history[history.length - 1].price;
          const prevClose = history.length >= 2 ? history[history.length - 2].price : 0;
          map.set(ticker, {
            lastClose,
            change30d: oldest > 0 ? Number((((lastClose - oldest) / oldest) * 100).toFixed(2)) : 0,
            changeDay:
              prevClose > 0 ? Number((((lastClose - prevClose) / prevClose) * 100).toFixed(2)) : 0
          });
        } catch {
          /* leave this ticker without history stats */
        }
      })
    );

    historyStatsCache = { ts: Date.now(), map };
    return map;
  }

  // Which board a ticker trades on. An unknown ticker is assumed to be a share,
  // which is what the app did before it knew about any other board.
  private async boardOf(ticker: string): Promise<BoardSpec> {
    try {
      return (await this.getSnapshot()).get(ticker)?.board ?? SHARES_BOARD;
    } catch {
      return SHARES_BOARD;
    }
  }

  private async fetchHistory(
    ticker: string,
    from: string,
    till: string,
    spec: BoardSpec
  ): Promise<HistoricalPrice[]> {
    const response = await fetchWithTimeout(historyUrl(spec, ticker, from, till));
    if (!response.ok) throw new Error(`MOEX history returned HTTP ${response.status}`);
    const json = (await response.json()) as {
      history: { columns: string[]; data: (string | number | null)[][] };
    };

    const colDate = json.history.columns.indexOf("TRADEDATE");
    const colClose = json.history.columns.indexOf("CLOSE");
    if (colDate === -1 || colClose === -1) return [];
    // History quotes a bond the same way the live feed does — as a percentage —
    // so the same conversion happens here, per row, because face value and
    // accrued interest travel with each trading day.
    const colFace = json.history.columns.indexOf("FACEVALUE");
    const colAccrued = json.history.columns.indexOf("ACCINT");

    const result: HistoricalPrice[] = [];
    for (const row of json.history.data) {
      const rawDate = row[colDate];
      const rawClose = row[colClose];
      if (typeof rawDate !== "string" || typeof rawClose !== "number" || rawClose <= 0) continue;
      if (spec.quotedInPercent) {
        const face = colFace === -1 ? 0 : numberOf(row[colFace]);
        if (face <= 0) continue;
        const accrued = colAccrued === -1 ? 0 : numberOf(row[colAccrued]);
        result.push({
          ticker,
          date: new Date(rawDate),
          price: roundKopecks((rawClose / 100) * face + accrued)
        });
        continue;
      }
      result.push({ ticker, date: new Date(rawDate), price: rawClose });
    }
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    return result;
  }
}
