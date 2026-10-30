// Портфель: бумаги и лоты, продажи и дивиденды, целевые доли, рыночные
// сигналы, выплаты и стоимость портфеля.

import { subMonths } from "date-fns";
import { id, routeOf, toFormObject } from "@/lib/api/local/helpers";
import { isUsableLot, parsePurchaseLots, sortLots, summarizeLots } from "@/lib/investments/lots";
import type { MarketAlert } from "@/lib/market/alerts";
import { buildAssetKindStructure, buildSectorStructure } from "@/lib/data/derive";
import { convert, isSupportedCurrency, type CurrencyRates } from "@/lib/currency";
import { percent, roundMoney } from "@/lib/utils";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { InvestmentAnalysisService } from "@/services/InvestmentAnalysisService";
import {
  createMarketDataProvider,
  marketDataSource
} from "@/services/market/createMarketDataProvider";
import type { MarketSecurity } from "@/services/market/MarketDataService";
import { sectorForTicker } from "@/lib/market/sectors";
import { isoDay } from "@/lib/net-worth-snapshots";
import { sellGain } from "@/services/InvestmentTaxReportService";
import type {
  ExpectedDividend,
  InvestmentData,
  PurchaseLot,
  RealizedInvestmentEvent,
  TargetAllocation
} from "@/types/finance";
import type { LocalState } from "@/lib/api/local/state";
import { findOrCreateAppCategory, ratesOf } from "@/lib/api/local/money";
import { dataText } from "@/lib/i18n/data-text";
import { upsertTransaction, deleteTransaction } from "@/lib/api/local/ledger";
import { apiText } from "@/lib/i18n/api-text";

/**
 * Что портфель берёт с биржи. Запрашивается ДО очереди записей, как и
 * marketPricesFor: биржа отвечает секундами, а то и не отвечает, пока не
 * истечёт срок, и дело с портфелем, ждавшее её внутри очереди, держало за
 * собой все остальные записи — операция не добавлялась, пока молчит биржа.
 * Само дело потом только меняет документ, уже прочитанный в очереди.
 *
 * Чего биржа не дала, того здесь просто нет: бумага без цены остаётся при
 * своей последней, а не получает выдуманную.
 */
export type InvestmentMarket = {
  /** Справочник биржи (ликвидные бумаги); пуст, если биржа не ответила. */
  securities: MarketSecurity[];
  /** Бумаги по тикеру: справочник и найденные по всей доске. */
  byTicker: ReadonlyMap<string, MarketSecurity>;
  /** Цены за месяц по бумагам — для разбора рисков. */
  history: Readonly<Record<string, number[]>>;
};

/** Биржа ничего не дала: всё — по сохранённому. */
export const NO_MARKET: InvestmentMarket = { securities: [], byTicker: new Map(), history: {} };

/**
 * Справочник, цены и история для портфеля — по сети.
 *
 * `tickers` — бумаги, которые нужны делу сверх портфеля (добавляемая
 * позиция, бумага в «Слежу»): их ищут по всей доске, если в справочнике нет.
 * `historyFor` — бумаги сверх портфеля, по которым нужна история.
 */
export async function investmentMarketFor(
  state: LocalState,
  options: { refresh?: boolean; tickers?: readonly string[]; historyFor?: readonly string[] } = {}
): Promise<InvestmentMarket> {
  const provider = createMarketDataProvider();
  // An explicit refresh should bypass the cache for genuinely fresh quotes.
  if (options.refresh) await provider.updateMarketPrices();
  const securities = await provider.getSecurities().catch(() => []);
  const byTicker = new Map(securities.map((security) => [security.ticker, security]));
  const held = state.investments.portfolio.map((position) => position.ticker);

  // A position may hold a security outside the curated board — the "add
  // position" dialog searches the WHOLE MOEX board. Resolve those tickers
  // live (the board snapshot is shared and cached, so this is cheap) so their
  // price stays fresh; if the market is unreachable we keep the stored
  // snapshot. Dropping unknown tickers here used to make a just-saved
  // position disappear the moment it was written.
  const unresolved = [...new Set([...held, ...(options.tickers ?? [])])].filter(
    (ticker) => !byTicker.has(ticker)
  );
  await Promise.all(
    unresolved.map(async (ticker) => {
      const resolved = await provider.getSecurityByTicker(ticker).catch(() => null);
      if (resolved) byTicker.set(resolved.ticker, resolved);
    })
  );

  // История за месяц по каждой бумаге — по четыре разом, а не по одной: этот
  // расчёт идёт на каждое открытие и раз в 45 секунд, и портфель из десяти
  // бумаг ждал десять запросов подряд. Бумага без истории не роняет всё.
  const history: Record<string, number[]> = {};
  const from = subMonths(new Date(), 1);
  const withHistory = [...new Set([...held, ...(options.historyFor ?? [])])];
  for (let start = 0; start < withHistory.length; start += 4) {
    await Promise.all(
      withHistory.slice(start, start + 4).map(async (ticker) => {
        const points = await provider.getHistoricalPrices(ticker, from, new Date()).catch(() => []);
        history[ticker] = points.map((item) => item.price);
      })
    );
  }
  return { securities, byTicker, history };
}

/**
 * Что взять с биржи для записи в `/investments` — по телу запроса, до
 * очереди. «Обновить цены» сначала сбрасывает кэш; позиции (новой, правке,
 * «Докупить») нужна её бумага и её история, «Следить» — только бумага.
 */
export function investmentWriteMarket(state: LocalState, body: unknown): Promise<InvestmentMarket> {
  const input = toFormObject(body);
  const action = input.action ?? "";
  const ticker = input.ticker?.toUpperCase();
  // Дело не из таблицы — запись позиции (см. byAction в writes.ts).
  const saving = !routeOf(INVESTMENT_ACTIONS, action);
  return investmentMarketFor(state, {
    refresh: action === "refreshMarket",
    tickers: ticker && (saving || action === "addWatchlist") ? [ticker] : [],
    historyFor: ticker && saving ? [ticker] : []
  });
}

/**
 * Дела с портфелем по полю `action`; без него (и «Докупить») — позиция
 * записывается. Биржу каждое дело получает готовой (investmentWriteMarket) и
 * само по сети не ходит: оно идёт в очереди записей.
 */
export const INVESTMENT_ACTIONS = {
  refreshMarket: (state: LocalState, _body: unknown, market: InvestmentMarket) => {
    state.investments = buildInvestmentsPage(state, market);
    // Раньше «MOCK» писалось всегда, когда переменная не равна "moex", — хотя
    // по умолчанию цены живые. Правило теперь одно с выбором поставщика.
    return { updated: market.securities.length, source: marketDataSource() };
  },

  addWatchlist: (state: LocalState, body: unknown, market: InvestmentMarket) => {
    const ticker = toFormObject(body).ticker?.toUpperCase();
    if (!ticker) throw new Error(apiText("api.inv.tickerRequired"));
    // The search spans the whole MOEX board, so a picked ticker may be outside
    // the curated list — it was resolved live before the queue (see
    // investmentWriteMarket).
    const security = market.byTicker.get(ticker);
    if (!security) throw new Error(apiText("api.inv.securityNotFound"));
    const exists = state.investments.watchlist.some((item) => item.ticker === ticker);
    state.investments.watchlist = exists
      ? state.investments.watchlist
      : [...state.investments.watchlist, security];
    state.investments = buildInvestmentsPage(state, market);
    return state.investments.watchlist.find((item) => item.ticker === ticker);
  },

  removeWatchlist: (state: LocalState, body: unknown, market: InvestmentMarket) => {
    const ticker = toFormObject(body).ticker?.toUpperCase();
    if (!ticker) throw new Error(apiText("api.inv.tickerRequired"));
    state.investments.watchlist = state.investments.watchlist.filter(
      (item) => item.ticker !== ticker
    );
    state.investments = buildInvestmentsPage(state, market);
    return undefined;
  },

  delete: (state: LocalState, body: unknown, market: InvestmentMarket) => {
    const ticker = toFormObject(body).ticker?.toUpperCase();
    if (!ticker) throw new Error(apiText("api.inv.tickerRequired"));
    state.investments.portfolio = state.investments.portfolio.filter(
      (item) => item.ticker !== ticker
    );
    state.investments = buildInvestmentsPage(state, market);
    return undefined;
  }
};

/**
 * Бумага, которой нет в ответе биржи, но которая уже в портфеле, — по тому,
 * что о ней сохранено. Без этого «Докупить» и правка позиции не работали бы,
 * пока биржа недоступна. Отрасль — как её назвал бы справочник, чтобы
 * отрасль, заданная вручную, так и осталась ручной.
 */
function storedSecurity(position: InvestmentData["portfolio"][number]): MarketSecurity {
  const assetKind = position.assetKind ?? "STOCK";
  return {
    ticker: position.ticker,
    name: position.name,
    assetKind,
    sector: sectorForTicker(position.ticker, assetKind),
    risk: position.risk,
    comment: "",
    price: position.currentPrice,
    changeDay: 0,
    change30d: 0,
    ...(position.accruedInterest ? { accruedInterest: position.accruedInterest } : {})
  };
}

/** Позиция портфеля: новая, правка или «Докупить» (action addLot). */
export function savePosition(state: LocalState, body: unknown, market: InvestmentMarket) {
  const input = toFormObject(body);
  const action = input.action ?? "";
  const ticker = input.ticker?.toUpperCase();
  if (!ticker) throw new Error(apiText("api.inv.tickerRequired"));
  // Бумага вне справочника найдена по всей доске ещё до очереди
  // (investmentWriteMarket); биржа молчит — бумага из портфеля идёт по своей
  // последней цене.
  const held = state.investments.portfolio.find((item) => item.ticker === ticker);
  const security = market.byTicker.get(ticker) ?? (held ? storedSecurity(held) : undefined);
  if (!security) throw new Error(apiText("api.inv.securityNotFound"));

  // «Докупить» — одна покупка к тому, что уже есть. Раньше подборка слала
  // количество и среднюю, и позиция с тем же тикером заменялась целиком:
  // купленное пропадало. Теперь покупка добавляется к лотам; позиция со
  // средней, введённой вручную, становится первым лотом — количество и
  // средняя сохраняются, дата у него сегодняшняя, другой нет.
  if (action === "addLot") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? ""))
      ? String(input.date)
      : isoDay(new Date());
    const lot = { date, quantity: Number(input.quantity), price: Number(input.price) };
    if (!isUsableLot(lot)) throw new Error(apiText("api.inv.lotPositive"));
    const before: PurchaseLot[] =
      held?.lots && held.lots.length > 0
        ? held.lots
        : held && held.quantity > 0 && held.averageBuyPrice > 0
          ? [{ date, quantity: held.quantity, price: held.averageBuyPrice }]
          : [];
    input.lots = JSON.stringify([...before, lot]);
  }

  // The form sends EITHER a list of purchases (the app works out the weighted
  // average) OR a quantity and an average typed in by hand. Lots win when both
  // arrive, because they are the source the average is derived from.
  const lots = parsePurchaseLots(input.lots);
  const fromLots = lots.length > 0 ? summarizeLots(lots) : null;
  const quantity = fromLots ? fromLots.quantity : Number(input.quantity);
  const averageBuyPrice = fromLots ? fromLots.averageBuyPrice : Number(input.averageBuyPrice);
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error(apiText("api.inv.quantityPositive"));
  if (!Number.isFinite(averageBuyPrice) || averageBuyPrice <= 0)
    throw new Error(apiText("api.inv.pricePositive"));

  // The industry can be corrected by hand: the market directory knows the
  // liquid names, and a bond or a fresh listing is nobody's to classify but
  // the owner's. Choosing what the directory already says stores nothing.
  const typedSector = String(input.sector ?? "").trim();
  const sectorOverride =
    typedSector && typedSector !== security.sector
      ? typedSector
      : typedSector
        ? undefined
        : held?.sectorOverride;

  const position = {
    ticker: security.ticker,
    name: security.name,
    assetKind: security.assetKind,
    sector: sectorOverride ?? security.sector,
    ...(sectorOverride ? { sectorOverride } : {}),
    quantity,
    averageBuyPrice,
    ...(fromLots ? { lots: sortLots(lots) } : {}),
    currentPrice: security.price,
    currentValue: roundMoney(security.price * quantity),
    pnl: roundMoney((security.price - averageBuyPrice) * quantity),
    share: 0,
    risk: security.risk
  };
  state.investments.portfolio = [
    position,
    ...state.investments.portfolio.filter((item) => item.ticker !== ticker)
  ];
  state.investments = buildInvestmentsPage(state, market);
  return state.investments.portfolio.find((item) => item.ticker === ticker);
}

// Realized investment events (desktop tax ledger): sells and dividends.
export function investmentEventsPage(state: LocalState): {
  events: RealizedInvestmentEvent[];
  currency: string;
  rates: CurrencyRates;
} {
  // The rates travel with the events: a sale booked in dollars has to be
  // brought to the app's currency before the tax scale means anything.
  return {
    events: [...(state.realizedInvestmentEvents ?? [])],
    currency: state.currency,
    rates: ratesOf(state)
  };
}

export function addRealizedEvent(state: LocalState, body: unknown): RealizedInvestmentEvent {
  const input = toFormObject(body);
  const requestedCurrency = String(input.currency ?? "").toUpperCase();
  const event: RealizedInvestmentEvent = {
    id: id("revent"),
    type: input.type === "DIVIDEND" ? "DIVIDEND" : "SELL",
    ticker:
      String(input.ticker ?? "")
        .trim()
        .toUpperCase() || "—",
    name: String(input.name ?? "").trim(),
    date: String(input.date ?? "").slice(0, 10) || isoDay(new Date()),
    quantity: Math.max(Number(input.quantity ?? 0), 0),
    sellPrice: Math.max(Number(input.sellPrice ?? 0), 0),
    buyPrice: Math.max(Number(input.buyPrice ?? 0), 0),
    amount: Math.max(Number(input.amount ?? 0), 0),
    fee: Math.max(Number(input.fee ?? 0), 0),
    currency: isSupportedCurrency(requestedCurrency) ? requestedCurrency : state.currency
  };
  state.realizedInvestmentEvents = [event, ...(state.realizedInvestmentEvents ?? [])];
  if (event.type === "SELL") applySale(state, event, input.accountId);
  return event;
}

/**
 * Количество бумаг — до шести знаков, как в summarizeLots, а не до копеек:
 * доли биткоина и дробные акции бывают тысячными. roundMoney превращал остаток
 * 0,004 после продажи 0,006 из 0,01 в ноль — позиция пропадала из портфеля.
 */
function roundQuantity(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * A sale leaves the portfolio as well as the tax ledger.
 *
 * Recording one used to do neither: the shares stayed in the holdings, the
 * money never arrived anywhere, and the same gain was counted twice — once as
 * realized in the report and again in the "if you sold today" estimate, which
 * values what is still held. The position is written down here, oldest lots
 * first (a share bought in 2023 is the one being sold, and that is what the
 * tax on it is based on), and the proceeds can land on a chosen account as an
 * ordinary income row so the money is somewhere the owner can see it.
 */
export function applySale(state: LocalState, event: RealizedInvestmentEvent, accountId?: string) {
  const position = state.investments.portfolio.find((item) => item.ticker === event.ticker);
  // Бумаги нет в портфеле (её не заводили или уже убрали) — портфель не
  // трогается, но деньги за неё всё равно приходят на названный счёт. Раньше
  // продажа тут и заканчивалась: запись в налоговом журнале была, денег нигде.
  if (position && event.quantity > 0) takeFromPortfolio(state, event, position);
  postProceeds(state, event, accountId);
}

function takeFromPortfolio(
  state: LocalState,
  event: RealizedInvestmentEvent,
  position: InvestmentData["portfolio"][number]
) {
  if (event.quantity > position.quantity)
    throw new Error(
      apiText("api.inv.sellTooMuch", {
        quantity: position.quantity,
        ticker: position.ticker
      })
    );

  const left = roundQuantity(position.quantity - event.quantity);
  // The lots the sold shares came out of, oldest first. Both halves are kept:
  // what stays in the position, and what left it — the latter so deleting the
  // record can put the shares back where they were.
  let remaining = event.quantity;
  const kept: PurchaseLot[] = [];
  const taken: PurchaseLot[] = [];
  for (const lot of sortLots(position.lots ?? [])) {
    const off = Math.min(lot.quantity, Math.max(remaining, 0));
    remaining = roundQuantity(remaining - off);
    if (off > 0) taken.push({ ...lot, quantity: off });
    const rest = roundQuantity(lot.quantity - off);
    if (rest > 0) kept.push({ ...lot, quantity: rest });
  }
  // What is left cost what the lots behind it cost. Selling the oldest — the
  // cheapest, as a rule — raises the average of everything still held, and
  // carrying the old average forward reported a profit on shares that never
  // earned it.
  const average = kept.length ? summarizeLots(kept).averageBuyPrice : position.averageBuyPrice;

  state.investments = {
    ...state.investments,
    portfolio:
      left > 0
        ? state.investments.portfolio.map((item) =>
            item.ticker === position.ticker
              ? {
                  ...item,
                  quantity: left,
                  averageBuyPrice: average,
                  currentValue: roundMoney(item.currentPrice * left),
                  // Прибыль — по чистой цене, без НКД, как в buildInvestmentsPage.
                  pnl: roundMoney(
                    (item.currentPrice - (item.accruedInterest ?? 0) - average) * left
                  ),
                  ...(kept.length ? { lots: kept } : {})
                }
              : item
          )
        : state.investments.portfolio.filter((item) => item.ticker !== position.ticker)
  };
  // Everything the sale changed, so it can be changed back — a sale typed by
  // mistake used to be undeletable in the only way that mattered: the record
  // went, the shares did not come back.
  // Цена покупки для налога — из тех самых лотов, что ушли (FIFO), если её не
  // ввели руками. Раньше её всегда вводили сами, и налог мог считаться с одной
  // цены, а портфель списывался по другой.
  if (!(event.buyPrice > 0)) {
    event.buyPrice = taken.length ? summarizeLots(taken).averageBuyPrice : position.averageBuyPrice;
  }
  event.soldFrom = {
    averageBuyPrice: position.averageBuyPrice,
    ...(taken.length ? { lots: taken } : {}),
    ...(left > 0 ? {} : { position })
  };
}

function postProceeds(state: LocalState, event: RealizedInvestmentEvent, accountId?: string) {
  // Where the money went, if the owner said. Without an account the sale is
  // still recorded — some people keep the cash with the broker and track it
  // as a position of its own.
  if (!accountId) return;
  // Named an account that no longer takes money? Say so. Passing over it left
  // the shares sold and the proceeds nowhere at all.
  const account = state.accounts.find((item) => item.id === accountId && !item.isArchived);
  if (!account) throw new Error(apiText("api.account.pickActive"));
  const proceeds = roundMoney(event.quantity * event.sellPrice - event.fee);
  if (proceeds <= 0) return;
  const category = findOrCreateAppCategory(state, "data.cat.investments", "INCOME");
  const posted = upsertTransaction(
    state,
    {
      amount: String(
        roundMoney(convert(proceeds, event.currency, account.currency, ratesOf(state)))
      ),
      type: "INCOME",
      accountId: account.id,
      categoryId: category.id,
      date: event.date,
      description: dataText("data.tx.sale", undefined, { ticker: event.ticker })
    },
    "POST"
  );
  // Продажа бумаги не из портфеля помнит только операцию с деньгами:
  // `outsidePortfolio` говорит undoSale, что бумаги возвращать некуда.
  event.soldFrom = {
    ...(event.soldFrom ?? { averageBuyPrice: 0, outsidePortfolio: true }),
    transactionId: posted.id
  };
}

/**
 * Deleting a sale puts back what recording it took away.
 *
 * Until this existed the two halves disagreed: creating the record emptied
 * the position and posted the money, deleting it only dropped a line from the
 * tax ledger. A mistyped sale could be removed from the report and still be
 * missing from the portfolio for good.
 */
export function undoSale(state: LocalState, event: RealizedInvestmentEvent) {
  const sold = event.soldFrom;
  if (!sold) return;
  if (sold.transactionId) deleteTransaction(state, sold.transactionId);
  if (sold.outsidePortfolio) return;

  const current = state.investments.portfolio.find((item) => item.ticker === event.ticker);
  if (!current) {
    // The sale emptied the position out of the portfolio, so the row itself
    // is what comes back.
    if (sold.position)
      state.investments = {
        ...state.investments,
        portfolio: [...state.investments.portfolio, sold.position]
      };
    return;
  }

  // Merge the lots back only when the position still keeps lots — half a set
  // of them would not add up to the quantity beside it.
  //
  // Позиция продавалась без покупок (количество и средняя руками), а лоты
  // появились потом — «Докупить» сделал из остатка первый лот. Проданные бумаги
  // возвращаются тогда отдельным лотом по прежней средней: без него количество
  // было бы больше суммы лотов, и следующая докупка, считающая по лотам,
  // теряла вернувшиеся бумаги.
  const returned: PurchaseLot[] = sold.lots?.length
    ? sold.lots
    : current.lots?.length && sold.averageBuyPrice > 0
      ? [{ date: event.date, quantity: event.quantity, price: sold.averageBuyPrice }]
      : [];
  const lots =
    current.lots && returned.length ? sortLots([...current.lots, ...returned]) : current.lots;
  const quantity = roundQuantity(current.quantity + event.quantity);
  const average = lots?.length ? summarizeLots(lots).averageBuyPrice : sold.averageBuyPrice;
  state.investments = {
    ...state.investments,
    portfolio: state.investments.portfolio.map((item) =>
      item.ticker === event.ticker
        ? {
            ...item,
            quantity,
            averageBuyPrice: average,
            currentValue: roundMoney(item.currentPrice * quantity),
            // Прибыль — по чистой цене, без НКД, как в buildInvestmentsPage.
            pnl: roundMoney((item.currentPrice - (item.accruedInterest ?? 0) - average) * quantity),
            ...(lots?.length ? { lots } : {})
          }
        : item
    )
  };
}

export function addExpectedDividend(state: LocalState, body: unknown): ExpectedDividend {
  const input = toFormObject(body);
  const requestedCurrency = String(input.currency ?? "").toUpperCase();
  const dividend: ExpectedDividend = {
    id: id("exdiv"),
    ticker:
      String(input.ticker ?? "")
        .trim()
        .toUpperCase() || "—",
    name: String(input.name ?? "").trim(),
    date: String(input.date ?? "").slice(0, 10) || isoDay(new Date()),
    amount: Math.max(Number(input.amount ?? 0), 0),
    currency: isSupportedCurrency(requestedCurrency) ? requestedCurrency : state.currency
  };
  state.expectedDividends = [dividend, ...(state.expectedDividends ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  return dividend;
}

// Adds an alert flag on a company fundamental (e.g. ETLN debt_ebitda > 3.5).
export function addMarketAlert(state: LocalState, body: unknown): MarketAlert {
  const input = toFormObject(body);
  const rawOp = String(input.op ?? ">");
  const alert: MarketAlert = {
    id: id("alert"),
    ticker:
      String(input.ticker ?? "")
        .trim()
        .toUpperCase() || "—",
    metric: String(input.metric ?? "debt_ebitda").trim(),
    op: (["<", ">", "<=", ">="] as const).includes(rawOp as MarketAlert["op"])
      ? (rawOp as MarketAlert["op"])
      : ">",
    value: Number(input.value ?? 0)
  };
  state.marketAlerts = [alert, ...(state.marketAlerts ?? [])];
  return alert;
}

// Replaces the full target-allocation set (the UI edits it as one list).
export function setTargetAllocations(
  state: LocalState,
  body: unknown
): { targets: TargetAllocation[] } {
  const raw = (body as { targets?: unknown })?.targets;
  const list = Array.isArray(raw) ? raw : [];
  state.targetAllocations = list
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: String(record.id ?? id("target")),
        sector: String(record.sector ?? "").trim(),
        targetPct: Math.max(0, Math.min(100, Number(record.targetPct ?? 0)))
      };
    })
    .filter((target) => target.sector.length > 0);
  return { targets: state.targetAllocations };
}

/**
 * Выплаты по бумагам портфеля: ближайшие на год вперёд — с суммой на ваше
 * количество, и недавние (за 90 дней), которые ещё не отмечены полученными.
 * Отметка «Получено» — это обычная запись дивиденда в «Доход»: так выплата
 * попадает и во «Весь доход», и в налог.
 */
export async function payoutsPage(state: LocalState) {
  const provider = createMarketDataProvider();
  const today = isoDay(new Date());
  const yearAhead = isoDay(new Date(Date.now() + 365 * 86_400_000));
  const recentFrom = isoDay(new Date(Date.now() - 90 * 86_400_000));
  const received = (state.realizedInvestmentEvents ?? []).filter(
    (event) => event.type === "DIVIDEND"
  );
  const positions = state.investments.portfolio;
  const found: Array<{
    ticker: string;
    name: string;
    kind: "DIVIDEND" | "COUPON";
    date: string;
    perShare: number;
    quantity: number;
    amount: number;
  }> = [];
  for (let start = 0; start < positions.length; start += 4) {
    await Promise.all(
      positions.slice(start, start + 4).map(async (position) => {
        const list = await provider
          .getPayouts(position.ticker, position.assetKind ?? "STOCK")
          .catch(() => []);
        for (const payout of list) {
          if (payout.date < recentFrom || payout.date > yearAhead) continue;
          found.push({
            ticker: position.ticker,
            name: position.name,
            kind: payout.kind,
            date: payout.date,
            perShare: payout.perShare,
            quantity: position.quantity,
            amount: roundMoney(
              convert(
                payout.perShare * position.quantity,
                payout.currency,
                state.currency,
                ratesOf(state)
              )
            )
          });
        }
      })
    );
  }
  found.sort((a, b) => a.date.localeCompare(b.date));
  // Недавняя выплата считается полученной, если по этой бумаге после её даты
  // (в пределах двух месяцев) уже записан дивиденд.
  const isReceived = (payout: (typeof found)[number]) =>
    received.some((event) => {
      const date = event.date.slice(0, 10);
      return (
        event.ticker === payout.ticker &&
        date >= payout.date &&
        date <= isoDay(new Date(Date.parse(payout.date) + 60 * 86_400_000))
      );
    });
  const upcoming = found.filter((payout) => payout.date >= today);
  return {
    currency: state.currency,
    upcoming,
    recent: found.filter((payout) => payout.date < today && !isReceived(payout)),
    yearAhead: roundMoney(upcoming.reduce((sum, payout) => sum + payout.amount, 0))
  };
}

/**
 * Весь доход от вложений, а не только «бумажный»: бумажная прибыль того, что
 * держишь, плюс зафиксированная на продажах, плюс полученные дивиденды и
 * купоны. Без продаж и выплат портфель, где продали удачно и получили
 * дивиденды, выглядел беднее, чем есть.
 */
export function investmentTotals(state: LocalState, portfolio: InvestmentData["portfolio"]) {
  const rates = ratesOf(state);
  const toBase = (amount: number, currency?: string) =>
    convert(amount, currency || state.currency, state.currency, rates);
  const events = state.realizedInvestmentEvents ?? [];
  const yearAgo = isoDay(new Date(Date.now() - 365 * 86_400_000));
  const unrealized = portfolio.reduce((sum, row) => sum + row.pnl, 0);
  const invested = portfolio.reduce((sum, row) => sum + row.quantity * row.averageBuyPrice, 0);
  const realized = events
    .filter((event) => event.type === "SELL")
    .reduce((sum, event) => sum + toBase(sellGain(event), event.currency), 0);
  const payouts = events.filter((event) => event.type === "DIVIDEND");
  const dividends = payouts.reduce((sum, event) => sum + toBase(event.amount, event.currency), 0);
  const dividends12m = payouts
    .filter((event) => event.date.slice(0, 10) >= yearAgo)
    .reduce((sum, event) => sum + toBase(event.amount, event.currency), 0);
  return {
    invested: roundMoney(invested),
    unrealized: roundMoney(unrealized),
    realized: roundMoney(realized),
    dividends: roundMoney(dividends),
    dividends12m: roundMoney(dividends12m),
    total: roundMoney(unrealized + realized + dividends)
  };
}

/**
 * Страница портфеля: документ плюс то, что дала биржа (investmentMarketFor).
 * Сети здесь нет и ждать нечего, поэтому страницу можно считать и внутри
 * очереди записей — по документу, прочитанному там же.
 */
export function buildInvestmentsPage(state: LocalState, market: InvestmentMarket): InvestmentData {
  const { securities, byTicker: securityByTicker } = market;
  const watchlist = state.investments.watchlist
    .map((item) => securityByTicker.get(item.ticker) ?? item)
    .filter((item, index, rows) => rows.findIndex((row) => row.ticker === item.ticker) === index)
    .sort((left, right) => left.ticker.localeCompare(right.ticker));

  const rowsWithoutShare = state.investments.portfolio.map((position) => {
    const security = securityByTicker.get(position.ticker);
    const price = security && security.price > 0 ? security.price : position.currentPrice;
    const currentValue = roundMoney(price * position.quantity);
    // Облигация: цена с биржи уже с НКД. Стоимость с ним и остаётся, а
    // прибыль — по чистой цене, иначе она завышена на весь накопленный купон.
    const accrued =
      security && security.price > 0
        ? (security.accruedInterest ?? 0)
        : (position.accruedInterest ?? 0);
    return {
      ticker: position.ticker,
      name: security?.name ?? position.name,
      // Kind comes from the market when it can be resolved, and from what was
      // stored when it cannot — so an offline portfolio keeps its grouping.
      assetKind: security?.assetKind ?? position.assetKind ?? "STOCK",
      // A hand-set industry outranks the directory — that is the point of it.
      sector: position.sectorOverride ?? security?.sector ?? position.sector,
      ...(position.sectorOverride ? { sectorOverride: position.sectorOverride } : {}),
      quantity: position.quantity,
      averageBuyPrice: position.averageBuyPrice,
      currentPrice: price,
      currentValue,
      pnl: roundMoney((price - accrued - position.averageBuyPrice) * position.quantity),
      share: 0,
      risk: security?.risk ?? position.risk,
      ...(accrued > 0 ? { accruedInterest: accrued } : {}),
      // The purchases the average was derived from travel with the position.
      ...(position.lots?.length ? { lots: position.lots } : {})
    };
  });
  const total = rowsWithoutShare.reduce((sum, row) => sum + row.currentValue, 0);
  const portfolio = rowsWithoutShare.map((row) => ({
    ...row,
    share: total > 0 ? percent(row.currentValue, total) : 0
  }));
  // История — только по тому, что в портфеле сейчас: биржу спрашивали по
  // документу до очереди, и проданная с тех пор бумага не должна влиять на
  // разбор рисков.
  const historical: Record<string, number[]> = {};
  for (const row of portfolio) {
    const points = market.history[row.ticker];
    if (points) historical[row.ticker] = points;
  }
  const analysis = new InvestmentAnalysisService().analyze(
    portfolio,
    state.riskProfileCode,
    historical,
    getClientLocale()
  );

  return {
    source: "database",
    currency: state.currency,
    riskProfile: translate(getClientLocale(), `riskProfile.${state.riskProfileCode}`),
    securities,
    watchlist,
    portfolio,
    structure: portfolio.map((row) => ({ name: row.ticker, value: row.share })),
    sectorStructure: buildSectorStructure(portfolio),
    assetStructure: buildAssetKindStructure(portfolio, (kind) =>
      translate(getClientLocale(), `inv.kind.${kind}`)
    ),
    risks: analysis.risks,
    education: analysis.education,
    totals: investmentTotals(state, portfolio),
    history: state.portfolioSnapshots ?? []
  };
}

/** Цены бумаг по тикеру — с биржи, то есть по сети. */
export type MarketPrices = ReadonlyMap<string, number>;

/**
 * Цены, которые понадобятся записи, — запрошенные ДО очереди записей.
 *
 * Биржа отвечает секундами, а то и не отвечает, пока не истечёт срок. Запись,
 * ждущая её внутри очереди, держит все записи за собой: снимок капитала,
 * который фоновый прогон делает при каждой загрузке, держал так «Создать» в
 * окне нового счёта — человек нажимал, а окно висело, пока не ответит биржа.
 * Пустой портфель цен не просит вовсе.
 */
export async function marketPricesFor(state: LocalState): Promise<MarketPrices> {
  if (!state.investments.portfolio.length) return new Map();
  const securities = await createMarketDataProvider().getSecurities();
  // Биржа не ответила — список пуст, и каждая бумага идёт по своей последней
  // цене (portfolioValueAt). Нулевая цена — не цена.
  return new Map(
    securities
      .filter((security) => security.price > 0)
      .map((security) => [security.ticker, security.price])
  );
}

/** Стоимость портфеля по данным ценам; бумага без цены — по последней своей. */
export function portfolioValueAt(state: LocalState, prices: MarketPrices): number {
  return roundMoney(
    state.investments.portfolio.reduce((sum, position) => {
      const price = prices.get(position.ticker) ?? position.currentPrice;
      return sum + price * position.quantity;
    }, 0)
  );
}

// Current market value of the investment portfolio (0 when empty).
export async function portfolioValueOf(state: LocalState): Promise<number> {
  return portfolioValueAt(state, await marketPricesFor(state));
}
