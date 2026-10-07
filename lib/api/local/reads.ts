// Таблица чтений: путь → обработчик. Здесь те, кому нужен только документ
// (и, для котировок, Мосбиржа); чтения, которые трогают хранилище, — копии,
// корзина, профили, фото — живут в самом LocalApiClient.
//
// Тип ответа каждого пути выводится из его обработчика (см. lib/api/routes.ts),
// поэтому экран получает ровно то, что здесь возвращается, без приведений.
//
// Обработчики получают закэшированный документ, а не копию: они строят новые
// объекты и никогда не меняют тот, что им дали. Держит их к этому
// tests/read-paths.test.ts — он обходит всю эту таблицу.

import { ASSET_KINDS, type AssetKind } from "@/types/enums";
import { monthKeyOf } from "@/lib/api/local/helpers";
import { readSheet } from "@/lib/api/local/sheet";
import { readCashback, readDeductions, readTrips } from "@/lib/api/local/extras";
import { MAIN_SHEET, readWorkbook, sheetScope } from "@/lib/api/local/sheets";
import { convert } from "@/lib/currency";
import { createMarketDataProvider } from "@/services/market/createMarketDataProvider";
import { historyRangeStart } from "@/lib/market/history-range";
import { isoDay } from "@/lib/net-worth-snapshots";
import { buildMonthRecap, previousMonth } from "@/lib/analytics/month-recap";
import { findLeaks } from "@/lib/analytics/watchdog";
import { buildWeekRecap } from "@/lib/analytics/week-recap";
import { familyPicture } from "@/lib/family/family";
import { findTransferPairs } from "@/lib/transactions/transfer-pairs";
import { monthsBack } from "@/lib/accounts/balance-history";
import { buildYearRecap } from "@/lib/analytics/year-recap";
import { compareMonths } from "@/lib/analytics/compare-months";
import { detectPayday, forecastToPayday } from "@/lib/analytics/payday";
import type { LocalState } from "@/lib/api/local/state";
import { countingState, inBase, ratesOf, sumInBase } from "@/lib/api/local/money";
import {
  accountsPage,
  balanceHistoryPage,
  importReferences,
  transactionsPage,
  watchRows
} from "@/lib/api/local/ledger";
import { goalsPage } from "@/lib/api/local/goals";
import { debtsPage } from "@/lib/api/local/debts";
import { recurringPage } from "@/lib/api/local/recurring";
import { investmentEventsPage, payoutsPage } from "@/lib/api/local/investments";
import { categoriesPage, rulesPage, sheetFacts } from "@/lib/api/local/categories";
import { planFactPage } from "@/lib/api/local/plan";
import {
  allowancePage,
  analyticsPage,
  budgetsPage,
  dashboardPage,
  forecastPage,
  whatIfBase
} from "@/lib/api/local/overview";
import { settingsPage } from "@/lib/api/local/settings";

/** Что получает обработчик чтения. */
export type ReadRequest = { state: LocalState; searchParams: URLSearchParams };

/** Итоги ПРОШЛОГО месяца по умолчанию: их показывают в начале нового. */
function monthRecap({ state, searchParams }: ReadRequest) {
  const counted = countingState(inBase(state), false);
  const today = isoDay(new Date());
  const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "")
    ? String(searchParams.get("month"))
    : previousMonth(today.slice(0, 7));
  return buildMonthRecap({
    month,
    // Идущий месяц — на сегодня, и прошлый для сравнения — к тому же числу.
    asOfDay: month === today.slice(0, 7) ? Number(today.slice(8, 10)) : null,
    rows: counted.transactions.map((row) => ({
      type: row.type === "INCOME" ? "INCOME" : "EXPENSE",
      date: row.date,
      amount: row.amount,
      categoryId: row.category.id,
      category: row.category.label,
      color: row.category.color
    })),
    budgets: budgetsPage(counted, month).budgets
  });
}

async function searchSecurities({ searchParams }: ReadRequest) {
  // `kind` narrows the search to shares, bonds, funds or metal. Without it
  // a search for "ОФЗ" drowned in every share whose name happens to match.
  const kind = searchParams.get("kind");
  const results = await createMarketDataProvider().searchSecurities(
    searchParams.get("q") ?? "",
    25,
    kind && ASSET_KINDS.includes(kind as AssetKind) ? (kind as AssetKind) : undefined
  );
  return { results };
}

/** Индекс Мосбиржи для сравнения: IMOEX (цены) или MCFTR (с дивидендами). */
async function indexHistory({ searchParams }: ReadRequest) {
  const index = searchParams.get("index") === "MCFTR" ? "MCFTR" : "IMOEX";
  const range = searchParams.get("range") ?? "6m";
  const prices = await createMarketDataProvider().getIndexHistory(
    index,
    historyRangeStart(range),
    new Date()
  );
  return {
    index,
    range,
    points: prices.map((p) => ({ date: p.date.toISOString(), price: p.price }))
  };
}

async function priceHistory({ searchParams }: ReadRequest) {
  const ticker = (searchParams.get("ticker") ?? "").toUpperCase();
  const range = searchParams.get("range") ?? "6m";
  const prices = ticker
    ? await createMarketDataProvider().getHistoricalPrices(
        ticker,
        historyRangeStart(range),
        new Date()
      )
    : [];
  return {
    ticker,
    range,
    points: prices.map((p) => ({ date: p.date.toISOString(), price: p.price }))
  };
}

function family({ state, searchParams }: ReadRequest) {
  const month = searchParams.get("month") || monthKeyOf(new Date());
  const members = (state.members ?? []).map(({ id: memberId, name, color, since }) => ({
    id: memberId,
    name,
    color,
    ...(since ? { since } : {})
  }));
  return {
    members,
    picture: familyPicture(
      members,
      inBase(state).transactions,
      state.familySettlements ?? [],
      month
    )
  };
}

function payday({ state, searchParams }: ReadRequest) {
  const today = isoDay(new Date());
  const counted = countingState(inBase(state), false);
  const manual = Number(searchParams.get("day"));
  const detected = detectPayday(
    counted.transactions
      .filter((row) => row.type === "INCOME" && row.date.slice(0, 10) <= today)
      .map((row) => ({ date: row.date, amount: row.amount, category: row.category.label }))
  );
  const day = manual >= 1 && manual <= 31 ? Math.trunc(manual) : detected;
  if (!day) return { forecast: null };
  const open = state.accounts.filter((account) => !account.isArchived);
  // Обычная трата в день — за 90 дней, без плановых платежей и долгов: они
  // стоят в списке платежей до зарплаты отдельно.
  const since = isoDay(new Date(Date.now() - 90 * 86_400_000));
  const everyday = counted.transactions
    .filter(
      (row) =>
        row.type === "EXPENSE" &&
        row.date.slice(0, 10) >= since &&
        row.date.slice(0, 10) < today &&
        !row.recurringId &&
        !row.liabilityId
    )
    .reduce((sum, row) => sum + row.amount, 0);
  return {
    forecast: forecastToPayday({
      today,
      payday: day,
      source: manual >= 1 && manual <= 31 ? "manual" : "history",
      liquid: sumInBase(
        state,
        open.filter((account) => account.type === "CASH" || account.type === "DEBIT_CARD")
      ),
      payments: forecastPage(inBase(state))
        .events.filter((event) => event.type === "EXPENSE")
        .map((event) => ({ date: event.date, amount: event.amount, title: event.title })),
      usualPerDay: everyday / 90
    })
  };
}

function compare({ state, searchParams }: ReadRequest) {
  const today = isoDay(new Date());
  const valid = (value: string | null) => (value && /^\d{4}-\d{2}$/.test(value) ? value : null);
  const a = valid(searchParams.get("a")) ?? today.slice(0, 7);
  const b = valid(searchParams.get("b")) ?? previousMonth(a);
  const counted = countingState(inBase(state), false);
  return compareMonths({
    a,
    b,
    today,
    rows: counted.transactions.map((row) => ({
      type: row.type,
      date: row.date,
      amount: row.amount,
      categoryId: row.category.id,
      category: row.category.label,
      color: row.category.color
    }))
  });
}

function balanceHistory({ state, searchParams }: ReadRequest) {
  const count = Math.min(Math.max(Number(searchParams.get("months")) || 12, 2), 60);
  return balanceHistoryPage(state, monthsBack(monthKeyOf(new Date()), count));
}

function yearRecap({ state, searchParams }: ReadRequest) {
  const today = isoDay(new Date());
  const year = Number(searchParams.get("year")) || Number(today.slice(0, 4));
  const counted = countingState(inBase(state), false);
  const history = balanceHistoryPage(state, [
    `${year - 1}-12`,
    today.startsWith(String(year)) ? today.slice(0, 7) : `${year}-12`
  ]);
  return buildYearRecap({
    year,
    today,
    rows: counted.transactions.map((row) => ({
      type: row.type === "INCOME" ? "INCOME" : "EXPENSE",
      date: row.date,
      amount: row.amount,
      categoryId: row.category.id,
      category: row.category.label,
      color: row.category.color,
      description: row.description
    })),
    capital: { start: history.total[0], end: history.total[1] },
    cushion: { start: history.cushion[0], end: history.cushion[1] }
  });
}

/**
 * «Это перевод?»: отложенные человеком пары («нет, это не перевод») — по
 * ключам, переданным страницей; помнит их само устройство.
 */
function transferPairs({ state, searchParams }: ReadRequest) {
  const dismissed = new Set((searchParams.get("dismissed") ?? "").split(",").filter(Boolean));
  const currencyOf = (accountId: string) =>
    state.accounts.find((item) => item.id === accountId)?.currency ?? state.currency;
  return { pairs: findTransferPairs(state.transactions, currencyOf, dismissed) };
}

function watchdog({ state }: ReadRequest) {
  const counted = countingState(inBase(state), false);
  return {
    findings: findLeaks({
      rows: watchRows(counted),
      trials: state.recurringTransactions
        .filter((item) => item.isActive && item.trialEndsOn)
        .map((item) => ({
          id: item.id,
          name: item.description || item.category.label,
          trialEndsOn: String(item.trialEndsOn),
          amount: item.amount
        })),
      today: isoDay(new Date())
    })
  };
}

function weekRecap({ state }: ReadRequest) {
  const counted = countingState(inBase(state), false);
  return buildWeekRecap({
    today: new Date(),
    perDay: allowancePage(counted).perDay,
    rows: counted.transactions.map((row) => ({
      type: row.type === "INCOME" ? "INCOME" : "EXPENSE",
      date: row.date,
      amount: row.amount,
      categoryId: row.category.id,
      category: row.category.label
    }))
  });
}

function cashback({ state, searchParams }: ReadRequest) {
  const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "")
    ? String(searchParams.get("month"))
    : isoDay(new Date()).slice(0, 7);
  return readCashback(
    state,
    month,
    // Погашение кредита — не покупка по карте: кэшбэк за него не платят.
    countingState(state, false)
      .transactions.filter((row) => row.type === "EXPENSE" && !row.liabilityId)
      .map((row) => ({
        id: row.id,
        date: row.date,
        amount: row.amount,
        accountId: row.account.id,
        categoryId: row.category.id,
        category: row.category.label
      }))
  );
}

function trips({ state }: ReadRequest) {
  const based = countingState(inBase(state), false);
  const rates = ratesOf(state);
  return readTrips(
    state,
    (tripCurrency) =>
      based.transactions
        .filter((row) => row.type === "EXPENSE" && row.tags?.length)
        .map((row) => ({
          date: row.date,
          amount: convert(row.amount, state.currency, tripCurrency, rates),
          categoryId: row.category.id,
          category: row.category.label,
          color: row.category.color,
          tags: row.tags
        })),
    isoDay(new Date())
  );
}

function deductions({ state, searchParams }: ReadRequest) {
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const based = countingState(inBase(state), false);
  const kinds = new Map(
    state.categories.flatMap((c) => (c.deduction ? [[c.id, c.deduction] as const] : []))
  );
  const salaryWords = /зарплат|зп\b|аванс|преми|оклад|salary|wage/i;
  return readDeductions(state, {
    year,
    spends: based.transactions.flatMap((row) => {
      const kind = row.type === "EXPENSE" ? kinds.get(row.category.id) : undefined;
      return kind
        ? [
            {
              id: row.id,
              date: row.date,
              amount: row.amount,
              kind,
              description: row.description,
              category: row.category.label
            }
          ]
        : [];
    }),
    netSalary: based.transactions
      .filter(
        (row) =>
          row.type === "INCOME" &&
          row.date.startsWith(String(year)) &&
          salaryWords.test(row.category.label)
      )
      .reduce((sum, row) => sum + row.amount, 0),
    marked: [...kinds.entries()].map(([categoryId, kind]) => ({ categoryId, kind }))
  });
}

/** Чтения, которым нужен только документ. */
export const STATE_READS = {
  "/accounts": ({ state }: ReadRequest) => accountsPage(state),
  "/transactions": ({ state, searchParams }: ReadRequest) => transactionsPage(state, searchParams),
  // Moving money between your own accounts is not spending, so a limit must
  // never be eaten by it — on this screen there is nothing to toggle, the
  // answer is always no.
  "/budgets": ({ state, searchParams }: ReadRequest) =>
    budgetsPage(countingState(inBase(state), false), searchParams.get("month") ?? undefined),
  "/goals": ({ state }: ReadRequest) => goalsPage(state),
  "/debts": ({ state }: ReadRequest) => debtsPage(state),
  "/rules": ({ state }: ReadRequest) => rulesPage(state),
  "/recurring": ({ state }: ReadRequest) => recurringPage(state),
  "/forecast": ({ state }: ReadRequest) => forecastPage(inBase(state)),
  "/month-recap": monthRecap,
  "/allowance": ({ state }: ReadRequest) => allowancePage(countingState(inBase(state), false)),
  "/dashboard": ({ state, searchParams }: ReadRequest) =>
    dashboardPage(countingState(inBase(state), searchParams.get("transfers") === "1")),
  "/settings": ({ state }: ReadRequest) => settingsPage(state),
  "/import": ({ state }: ReadRequest) => importReferences(state),
  "/investments/payouts": ({ state }: ReadRequest) => payoutsPage(state),
  "/investments/events": ({ state }: ReadRequest) => investmentEventsPage(state),
  "/market/alerts": ({ state }: ReadRequest) => ({ alerts: [...(state.marketAlerts ?? [])] }),
  "/investments/dividends": ({ state }: ReadRequest) => ({
    dividends: [...(state.expectedDividends ?? [])],
    realized: (state.realizedInvestmentEvents ?? []).filter((event) => event.type === "DIVIDEND"),
    currency: state.currency
  }),
  "/investments/targets": ({ state }: ReadRequest) => ({
    targets: [...(state.targetAllocations ?? [])],
    currency: state.currency
  }),
  "/categories": ({ state }: ReadRequest) => categoriesPage(state),
  "/analytics": ({ state, searchParams }: ReadRequest) =>
    analyticsPage(inBase(state), searchParams.get("transfers") === "1"),
  "/plan": ({ state, searchParams }: ReadRequest) =>
    planFactPage(
      inBase(state),
      Number(searchParams.get("ahead") ?? 0),
      searchParams.get("transfers") === "1"
    ),
  "/sheet": ({ state, searchParams }: ReadRequest) =>
    readSheet(sheetScope(state, searchParams.get("sheet") || MAIN_SHEET)),
  "/workbook": ({ state, searchParams }: ReadRequest) =>
    readWorkbook(state, searchParams.get("sheet")),
  "/what-if": ({ state }: ReadRequest) => whatIfBase(inBase(state)),
  "/family": family,
  "/payday": payday,
  "/compare-months": compare,
  "/balance-history": balanceHistory,
  "/year-recap": yearRecap,
  "/transfer-pairs": transferPairs,
  "/watchdog": watchdog,
  "/week-recap": weekRecap,
  "/cashback": cashback,
  "/trips": trips,
  "/deductions": deductions,
  "/sheet/facts": ({ state, searchParams }: ReadRequest) =>
    sheetFacts(
      countingState(inBase(state), false),
      searchParams.get("from") ?? "",
      searchParams.get("to") ?? ""
    )
};

/** Чтения с Мосбиржи: документ им не нужен, нужна сеть. */
export const MARKET_READS = {
  "/investments/search": searchSecurities,
  "/investments/index": indexHistory,
  "/investments/history": priceHistory
};
