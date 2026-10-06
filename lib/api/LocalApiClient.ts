"use client";

import type { ApiClient } from "@/lib/api/ApiClient";
import { ASSET_KINDS, type AssetKind } from "@/types/enums";
import { id, monthKeyOf, normalizePath, toFormObject } from "@/lib/api/local/helpers";
import { readSheet } from "@/lib/api/local/sheet";
import {
  deductionKindOf,
  readCashback,
  readDeductions,
  readTrips,
  writeCashback,
  writeDeductionYear,
  writeTrips
} from "@/lib/api/local/extras";
import { freezeLedgerOutsideProduction } from "@/lib/api/freeze-state";
import { STAMPED, stampRows, trackDeletions } from "@/lib/sync/row-stamps";
import { localStateSchema, transactionRowSchema } from "@/lib/api/local/schemas";
import {
  BEFORE_CLEAR_SUFFIX,
  LOCAL_COPY_SUFFIX,
  TRASH_SUFFIX,
  PRE_UPGRADE_SUFFIX,
  RESCUE_SUFFIX
} from "@/lib/storage/SyncingStorageAdapter";
import {
  isPhotoData,
  orphanedPhotos,
  PHOTO_MAX_CHARS,
  PHOTO_PREFIX,
  photoKey,
  type PhotoPlace,
  type StoredPhoto
} from "@/lib/photos/receipt-photo";
import { todayDay } from "@/lib/transactions/date";
import { convert } from "@/lib/currency";
import { createStorageAdapter } from "@/lib/storage/createStorageAdapter";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { roundMoney } from "@/lib/utils";
import { salvageLocalState } from "@/lib/api/local/schemas";
import { transferKeyOf } from "@/lib/transactions/transfers";
import { createMarketDataProvider } from "@/services/market/createMarketDataProvider";
import { historyRangeStart } from "@/lib/market/history-range";
import { isoDay } from "@/lib/net-worth-snapshots";
import { recordPortfolioSnapshot } from "@/lib/investments/snapshots";
import { buildMonthRecap, previousMonth } from "@/lib/analytics/month-recap";
import { findLeaks, unusualFor } from "@/lib/analytics/watchdog";
import { buildWeekRecap } from "@/lib/analytics/week-recap";
import type { TransactionRow } from "@/types/finance";
import { SAMPLE_PROFILE_ID, type ProfileList, type UserProfile } from "@/types/profiles";
import { familyPicture } from "@/lib/family/family";
import { findTransferPairs } from "@/lib/transactions/transfer-pairs";
import { monthsBack } from "@/lib/accounts/balance-history";
import { buildYearRecap } from "@/lib/analytics/year-recap";
import { compareMonths } from "@/lib/analytics/compare-months";
import { detectPayday, forecastToPayday } from "@/lib/analytics/payday";
import {
  importIntoSheet,
  importWorkbook,
  MAIN_SHEET,
  readWorkbook,
  sheetScope,
  writeSheets,
  writeWorkbook,
  type WorkbookImportSheet
} from "@/lib/api/local/sheets";
import {
  addToTrash,
  pruneTrash,
  SHEET_ARCHIVE,
  readTrash,
  trashAmount,
  trashTitle,
  vanishedRows,
  type TrashEntry,
  type TrashOrigin
} from "@/lib/trash/trash";
import {
  type LocalState,
  STANDARD_CATEGORY_IDS,
  standardCategoriesFrom,
  createInitialState,
  createBlankState,
  migrateLocalState
} from "@/lib/api/local/state";
import { applyBalance, ratesOf, sumInBase, inBase, countingState } from "@/lib/api/local/money";
import {
  upsertAccount,
  upsertTransaction,
  createSplit,
  balanceHistoryPage,
  reconcileAccount,
  linkTransfer,
  createTransfer,
  restoreTransaction,
  deleteTransaction,
  importCsvRows,
  undoLastImport,
  accountsPage,
  transactionsPage,
  importReferences,
  watchRows
} from "@/lib/api/local/ledger";
import { budgetWarningFor, upsertBudget } from "@/lib/api/local/budgets";
import {
  upsertGoal,
  depositToGoal,
  withdrawFromGoal,
  goalAccount,
  goalsPage
} from "@/lib/api/local/goals";
import { upsertLiability, payDebt, autoPayDebts, debtsPage } from "@/lib/api/local/debts";
import {
  upsertRecurring,
  materializeRecurring,
  materializeAllDue,
  recurringPage
} from "@/lib/api/local/recurring";
import {
  updateInvestments,
  investmentEventsPage,
  addRealizedEvent,
  undoSale,
  addExpectedDividend,
  addMarketAlert,
  setTargetAllocations,
  payoutsPage,
  investmentsPage
} from "@/lib/api/local/investments";
import {
  rulesPage,
  addRule,
  categoriesPage,
  withSheetCategories,
  sheetFacts,
  upsertCategory
} from "@/lib/api/local/categories";
import { planFactPage, savePlan } from "@/lib/api/local/plan";
import {
  budgetsPage,
  forecastPage,
  recordNetWorthSnapshot,
  allowancePage,
  dashboardPage,
  analyticsPage,
  whatIfBase
} from "@/lib/api/local/overview";
import {
  backupDocument,
  updateSettings,
  updateFxRates,
  settingsPage
} from "@/lib/api/local/settings";
import { buildSampleState } from "@/lib/api/local/sample";
import { writeFamily } from "@/lib/api/local/family";

// Прежде жили здесь — потребители импортируют их отсюда.
export {
  STANDARD_CATEGORY_IDS,
  spendingPlan,
  OPENING_BALANCE_ID,
  SAVINGS_BALANCE_ID,
  SAVINGS_TRANSFER_ID
} from "@/lib/api/local/state";

const LEGACY_STATE_KEY = "localFinanceState";
const PROFILE_LIST_KEY = "profileList";

/** Книга до перевода на новую схему — то, что отдаёт `/backup/before-upgrade`. */
export type PreUpgradeBackup = {
  savedAt: string | null;
  fromVersion: number | null;
  toVersion: number | null;
  backup: Record<string, unknown>;
};

/** Что отдаёт `/backup/before-clear`: когда очистили и до какого числа можно вернуть. */
export type BeforeClearCopy = { savedAt: string; until: string };

function localCopyKey(id: string): string {
  return `${LOCAL_COPY_PREFIX}${id}${LOCAL_COPY_SUFFIX}`;
}

/** Копия всего, что было до «Очистить все данные». Живёт неделю. */
const BEFORE_CLEAR_KEY = `financeProfiles${BEFORE_CLEAR_SUFFIX}`;
const BEFORE_CLEAR_DAYS = 7;

/**
 * Копия всех данных на этом устройстве — что отдаёт `/backup/local-copies`.
 *
 * `daily` — сама, раз в день на главном устройстве; `manual` — по кнопке;
 * `before-restore` — отложенная перед «Вернуть», чтобы и возврат можно было
 * отменить.
 */
export type LocalCopy = {
  id: string;
  savedAt: string;
  reason: "daily" | "manual" | "before-restore";
  operations: number;
};

const LOCAL_COPY_INDEX_KEY = `financeCopies${LOCAL_COPY_SUFFIX}`;
const LOCAL_COPY_PREFIX = "financeCopy_";
/** Две недели ежедневных копий — и ещё место для ручных. */
export const LOCAL_COPIES_KEEP = 14;

type LocalCopyStored = {
  savedAt: string;
  list: ProfileList;
  states: Record<string, unknown>;
};

type BeforeClearStored = {
  savedAt: string;
  list: ProfileList;
  states: Record<string, unknown>;
};

function profileStateKey(profileId: string): string {
  return `localFinanceState_${profileId}`;
}

const DEFAULT_PROFILE: UserProfile = {
  id: "profile-default",
  name: "Основной",
  color: "#0d9488",
  createdAt: "1970-01-01T00:00:00.000Z"
};

/**
 * Книга для записи — без копирования строк.
 *
 * Запись меняет книгу так: подменяет раздел целиком (`state.accounts =
 * state.accounts.map(…)`), добавляет в него строку или переписывает поле
 * раздела-объекта (`state.investments.watchlist = …`). Для этого достаточно
 * свежих разделов и свежих объектов первого уровня; сами строки, которых
 * запись не касалась, остаются общими с кэшем. Раньше книга копировалась
 * целиком (structuredClone) — на двадцати тысячах операций это ~70 мс на
 * каждое сохранение, и ещё столько же уходило на сличение каждой строки с
 * прежней при отметке времени: копия — всегда «другой» объект. Общие строки
 * отметка узнаёт сразу (row-stamps, decide).
 *
 * Правка строки на месте была бы порчей кэша — вне поставки он заморожен
 * вглубь (freeze-state.ts), и такая правка падает на первом же тесте.
 */
function writableCopy<T>(state: T): T {
  const copy = { ...(state as Record<string, unknown>) };
  for (const [key, value] of Object.entries(copy)) {
    if (Array.isArray(value)) copy[key] = [...value];
    else if (value !== null && typeof value === "object") copy[key] = { ...value };
  }
  return copy as T;
}

export class LocalApiClient implements ApiClient {
  constructor(private readonly storage: StorageAdapter = createStorageAdapter()) {}

  // In-memory cache of the active profile's parsed state, keyed by its storage
  // key. Reads return a deep clone so a handler that mutates-then-throws can't
  // poison the cache; save() refreshes it and storage-bypassing writes (clear,
  // profile ops) call invalidateStateCache(). Avoids re-reading and Zod-parsing
  // storage on every request (plan A4).
  private stateCache: { key: string; state: LocalState } | null = null;

  /**
   * Книга, какой она была до того, как синхронизация подменила её снизу. Нужна
   * корзине: сличив её со слитой, видно, что удалили на другом устройстве.
   */
  private remoteBaseline: { key: string; state: LocalState } | null = null;

  private invalidateStateCache() {
    this.stateCache = null;
  }

  /**
   * Книгу подменили ПОД клиентом — забыть запомненное.
   *
   * Зовёт это синхронизация: она пишет слитую книгу в хранилище напрямую, ниже
   * этого слоя, и о её записи клиент узнать ниоткуда не может. Кэш при этом
   * держит книгу, прочитанную до слияния, и следующее чтение отдало бы вчерашние
   * числа — причём отдало бы их и после того, как экран честно перечитал себя.
   *
   * Отдельным именем, а не через invalidateStateCache: тот приватный и зовётся
   * там, где книгу меняет сам клиент. Здесь случай другой — снаружи и без него.
   */
  forgetCachedState(): void {
    // Первая подмена из нескольких подряд — та, с которой и сличать: книга до
    // неё — последняя, которую видел человек.
    if (!this.remoteBaseline && this.stateCache) this.remoteBaseline = this.stateCache;
    this.invalidateStateCache();
  }

  /**
   * Every change runs to completion before the next one starts.
   *
   * A change is read-modify-write over the WHOLE state, saved as one blob, so
   * two of them in flight at once means the second one saves a picture taken
   * before the first one happened — and the first is gone without a trace. It
   * is not a theoretical race: the background runner writes a capital snapshot
   * and refreshes rates on every load, and that is exactly when a person is
   * loading the example or adding an operation. Losing the example that way is
   * how it was found.
   */
  private pending: Promise<unknown> = Promise.resolve();

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    // The queue must survive a failed operation, so both paths continue it.
    const next = this.pending.then(operation, operation);
    this.pending = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async get<T>(path: string): Promise<T> {
    // Reads get the cached document itself rather than a copy of it. Cloning a
    // ledger of a few thousand operations costs more than everything the screen
    // then does with it — over half the time of a page load went into copying
    // data nobody was going to change. Read handlers build new objects and must
    // never touch this one; `tests/read-paths.test.ts` holds them to it.
    const state = await this.state(false);
    const { pathname, searchParams } = normalizePath(path);

    if (pathname === "/accounts") return accountsPage(state) as T;
    if (pathname === "/transactions") return transactionsPage(state, searchParams) as T;
    if (pathname === "/budgets")
      // Moving money between your own accounts is not spending, so a limit must
      // never be eaten by it — on this screen there is nothing to toggle, the
      // answer is always no.
      return budgetsPage(
        countingState(inBase(state), false),
        searchParams.get("month") ?? undefined
      ) as T;
    if (pathname === "/goals") return goalsPage(state) as T;
    if (pathname === "/debts") return debtsPage(state) as T;
    if (pathname === "/rules") return rulesPage(state) as T;
    if (pathname === "/recurring") return recurringPage(state) as T;
    if (pathname === "/forecast") return forecastPage(inBase(state)) as T;
    if (pathname === "/month-recap") {
      // Итоги ПРОШЛОГО месяца по умолчанию: их показывают в начале нового.
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
      }) as T;
    }
    if (pathname === "/allowance") return allowancePage(countingState(inBase(state), false)) as T;
    if (pathname === "/dashboard")
      return (await dashboardPage(
        countingState(inBase(state), searchParams.get("transfers") === "1")
      )) as T;
    if (pathname === "/settings") return settingsPage(state) as T;
    if (pathname === "/backup/before-upgrade") return (await this.preUpgradeBackup()) as T;
    if (pathname === "/backup/before-clear") return (await this.beforeClearCopy()) as T;
    if (pathname === "/backup/local-copies") return (await this.localCopies()) as T;
    if (pathname === "/trash") return (await this.trashList()) as T;
    if (pathname === "/import") return importReferences(state) as T;
    if (pathname === "/backup") {
      // The exported file records when it was made, so the stamp goes into the
      // payload here — and into storage inside the queue, on a state read
      // again, so an export cannot roll back whatever was saved meanwhile.
      const stamped = new Date().toISOString();
      const payload = await backupDocument({ ...state, lastBackupAt: stamped });
      await this.serialize(async () => {
        const fresh = await this.state();
        fresh.lastBackupAt = stamped;
        await this.save(fresh);
      });
      return payload as T;
    }
    if (pathname === "/investments/search") {
      // `kind` narrows the search to shares, bonds, funds or metal. Without it
      // a search for "ОФЗ" drowned in every share whose name happens to match.
      const kind = searchParams.get("kind");
      const results = await createMarketDataProvider().searchSecurities(
        searchParams.get("q") ?? "",
        25,
        kind && ASSET_KINDS.includes(kind as AssetKind) ? (kind as AssetKind) : undefined
      );
      return { results } as T;
    }
    if (pathname === "/investments/payouts") return (await payoutsPage(state)) as T;
    if (pathname === "/investments/index") {
      // Индекс Мосбиржи для сравнения: IMOEX (цены) или MCFTR (с дивидендами).
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
      } as T;
    }
    if (pathname === "/investments/history") {
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
      } as T;
    }
    if (pathname === "/investments") {
      const invData = await investmentsPage(state);
      // Persist last-known prices so they survive app restart. Read the state
      // again inside the queue first: fetching quotes takes seconds, and
      // whatever the owner saved meanwhile must not be rolled back by the
      // snapshot this request started from.
      await this.serialize(async () => {
        const fresh = await this.state();
        fresh.investments = {
          ...fresh.investments,
          securities: invData.securities,
          watchlist: invData.watchlist,
          portfolio: invData.portfolio,
          structure: invData.structure,
          sectorStructure: invData.sectorStructure,
          assetStructure: invData.assetStructure
        };
        // Снимок дня: портфель пуст — снимать нечего (иначе история
        // начиналась бы с нулей до первой покупки).
        if (invData.portfolio.length > 0) {
          fresh.portfolioSnapshots = recordPortfolioSnapshot(
            fresh.portfolioSnapshots ?? [],
            isoDay(new Date()),
            invData.portfolio.reduce((sum, row) => sum + row.currentValue, 0),
            invData.portfolio.reduce((sum, row) => sum + row.quantity * row.averageBuyPrice, 0)
          );
          invData.history = fresh.portfolioSnapshots;
        }
        await this.save(fresh);
      });
      return invData as T;
    }
    if (pathname === "/investments/events") return investmentEventsPage(state) as T;
    if (pathname === "/market/alerts") return { alerts: [...(state.marketAlerts ?? [])] } as T;
    if (pathname === "/investments/dividends")
      return {
        dividends: [...(state.expectedDividends ?? [])],
        realized: (state.realizedInvestmentEvents ?? []).filter(
          (event) => event.type === "DIVIDEND"
        ),
        currency: state.currency
      } as T;
    if (pathname === "/investments/targets")
      return { targets: [...(state.targetAllocations ?? [])], currency: state.currency } as T;
    if (pathname === "/categories") return categoriesPage(state) as T;
    if (pathname === "/analytics")
      return analyticsPage(inBase(state), searchParams.get("transfers") === "1") as T;
    if (pathname === "/plan")
      return planFactPage(
        inBase(state),
        Number(searchParams.get("ahead") ?? 0),
        searchParams.get("transfers") === "1"
      ) as T;
    if (pathname === "/profiles") return (await this.profileList()) as T;
    if (pathname === "/sheet")
      return readSheet(sheetScope(state, searchParams.get("sheet") || MAIN_SHEET)) as T;
    if (pathname === "/workbook") return readWorkbook(state, searchParams.get("sheet")) as T;
    if (pathname === "/what-if") return whatIfBase(inBase(state)) as T;
    if (pathname === "/family") {
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
      } as T;
    }
    if (pathname === "/payday") {
      const today = isoDay(new Date());
      const counted = countingState(inBase(state), false);
      const manual = Number(searchParams.get("day"));
      const detected = detectPayday(
        counted.transactions
          .filter((row) => row.type === "INCOME" && row.date.slice(0, 10) <= today)
          .map((row) => ({ date: row.date, amount: row.amount, category: row.category.label }))
      );
      const payday = manual >= 1 && manual <= 31 ? Math.trunc(manual) : detected;
      if (!payday) return { forecast: null } as T;
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
          payday,
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
      } as T;
    }
    if (pathname === "/compare-months") {
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
      }) as T;
    }
    if (pathname === "/balance-history") {
      const count = Math.min(Math.max(Number(searchParams.get("months")) || 12, 2), 60);
      return balanceHistoryPage(state, monthsBack(monthKeyOf(new Date()), count)) as T;
    }
    if (pathname === "/year-recap") {
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
      }) as T;
    }
    if (pathname === "/transfer-pairs") {
      // «Это перевод?»: отложенные человеком пары («нет, это не перевод») —
      // по ключам, переданным страницей; помнит их само устройство.
      const dismissed = new Set((searchParams.get("dismissed") ?? "").split(",").filter(Boolean));
      const currencyOf = (accountId: string) =>
        state.accounts.find((item) => item.id === accountId)?.currency ?? state.currency;
      return { pairs: findTransferPairs(state.transactions, currencyOf, dismissed) } as T;
    }
    if (pathname === "/watchdog") {
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
      } as T;
    }
    if (pathname === "/week-recap") {
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
      }) as T;
    }
    if (pathname === "/photos")
      return (await this.readPhoto(state, searchParams.get("id") ?? "")) as T;
    if (pathname === "/cashback") {
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
      ) as T;
    }
    if (pathname === "/trips") {
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
      ) as T;
    }
    if (pathname === "/deductions") {
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
      }) as T;
    }
    if (pathname === "/sheet/facts")
      return sheetFacts(
        countingState(inBase(state), false),
        searchParams.get("from") ?? "",
        searchParams.get("to") ?? ""
      ) as T;

    throw new Error(`Local API route is not implemented: ${pathname}`);
  }

  async post<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
    return this.serialize(() => this.write<TResponse>(path, body, "POST"));
  }

  async put<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
    return this.serialize(() => this.write<TResponse>(path, body, "PUT"));
  }

  async delete<T>(path: string): Promise<T> {
    return this.serialize(() => this.remove<T>(path));
  }

  private async remove<T>(path: string): Promise<T> {
    const state = await this.state();
    const { pathname, searchParams } = normalizePath(path);
    const itemId = searchParams.get("id");

    if (pathname === "/accounts" && itemId) {
      state.accounts = state.accounts.map((account) =>
        account.id === itemId ? { ...account, isArchived: true } : account
      );
    } else if (pathname === "/transactions" && searchParams.get("splitGroupId")) {
      // Чек, разложенный по категориям, удаляется целиком — его части по
      // отдельности ничего не значат.
      const group = searchParams.get("splitGroupId");
      for (const part of state.transactions.filter((item) => item.splitGroupId === group)) {
        deleteTransaction(state, part.id);
      }
    } else if (pathname === "/transactions" && itemId) {
      // Перевод — две строки: списание и зачисление. Удалить одну значило бы
      // заставить деньги исчезнуть — со счёта ушли, никуда не пришли (или
      // наоборот). Удаляется весь перевод.
      // Перевод узнаётся и по старой метке в описании (записанные до 1.10).
      const row = state.transactions.find((item) => item.id === itemId);
      const transfer = row ? transferKeyOf(row) : null;
      const ids = transfer
        ? state.transactions
            .filter((item) => transferKeyOf(item) === transfer)
            .map((item) => item.id)
        : [itemId];
      for (const one of ids) deleteTransaction(state, one);
    } else if (pathname === "/photos" && itemId) {
      const row = state.transactions.find((item) => item.id === itemId);
      if (row?.photo) await this.dropPhoto(itemId, row.photo);
      state.transactions = state.transactions.map((item) => {
        if (item.id !== itemId) return item;
        const { photo: _dropped, ...rest } = item;
        void _dropped;
        return rest;
      });
    } else if (pathname === "/goals" && itemId) {
      // Deleting a goal that still holds money used to make that money vanish:
      // capital fell by the amount, no account got it back, and the record of
      // how it got there stayed behind and kept being counted. The money goes
      // somewhere first — onto a chosen account, or written off deliberately.
      const goal = state.goals.find((item) => item.id === itemId);
      if (goal && goal.currentAmount > 0) {
        const writeOff = searchParams.get("writeOff") === "1";
        const accountId = searchParams.get("accountId") || goal.linkedAccountId;
        if (!writeOff) {
          const account = goalAccount(state, accountId);
          applyBalance(
            state,
            account.id,
            roundMoney(
              convert(goal.currentAmount, state.currency, account.currency, ratesOf(state))
            )
          );
        }
      }
      state.goals = state.goals.filter((item) => item.id !== itemId);
      state.goalMovements = (state.goalMovements ?? []).filter(
        (movement) => movement.goalId !== itemId
      );
    } else if (pathname === "/debts" && itemId) {
      state.liabilities = state.liabilities.filter((liability) => liability.id !== itemId);
    } else if (pathname === "/investments/events" && itemId) {
      // Recording a sale takes the shares out of the portfolio and puts the
      // money on an account, so deleting the record has to undo both — see
      // undoSale.
      const event = (state.realizedInvestmentEvents ?? []).find((item) => item.id === itemId);
      if (event?.type === "SELL") undoSale(state, event);
      state.realizedInvestmentEvents = (state.realizedInvestmentEvents ?? []).filter(
        (item) => item.id !== itemId
      );
    } else if (pathname === "/market/alerts" && itemId) {
      state.marketAlerts = (state.marketAlerts ?? []).filter((alert) => alert.id !== itemId);
    } else if (pathname === "/investments/dividends" && itemId) {
      state.expectedDividends = (state.expectedDividends ?? []).filter(
        (dividend) => dividend.id !== itemId
      );
    } else if (pathname === "/investments/targets" && itemId) {
      state.targetAllocations = (state.targetAllocations ?? []).filter(
        (target) => target.id !== itemId
      );
    } else if (pathname === "/rules" && itemId) {
      state.rules = state.rules.filter((rule) => rule.id !== itemId);
    } else if (pathname === "/recurring" && itemId) {
      // Deleting a plan only removes the plan — operations already posted from it
      // stay in the ledger (they describe money that actually moved).
      state.recurringTransactions = state.recurringTransactions.filter(
        (item) => item.id !== itemId
      );
    } else if (pathname === "/categories" && itemId) {
      if (STANDARD_CATEGORY_IDS.has(itemId)) {
        throw new Error(
          "Стандартную категорию удалить нельзя — её можно переименовать, перекрасить или сменить значок."
        );
      }
      const txCount = state.transactions.filter((t) => t.category.id === itemId).length;
      if (txCount > 0) {
        throw new Error(`Нельзя удалить категорию: к ней привязано ${txCount} операций.`);
      }
      state.categories = state.categories.filter((c) => c.id !== itemId);
    } else if (pathname === "/profiles" && itemId) {
      await this.deleteProfile(itemId);
      return undefined as T;
    } else if (pathname === "/storage/clear") {
      await this.clearEverything();
      return undefined as T;
    } else {
      throw new Error(`Local API delete route is not implemented: ${pathname}`);
    }

    await this.save(state);
    return undefined as T;
  }

  private async write<TResponse>(path: string, body: unknown, method: "POST" | "PUT") {
    const state = await this.state();
    const { pathname } = normalizePath(path);

    if (pathname === "/sample") {
      // Пример — в своём профиле, а не поверх того, что человек уже завёл.
      // Раньше «Загрузить пример» ложился в текущие данные, и потом их надо
      // было чистить — вместе со своими, если успел что-то внести. Теперь
      // открывается профиль «Пример», а вернуться к своим — одна кнопка.
      await this.openSampleProfile();
      const sample = buildSampleState();
      await this.save(sample, { trash: false });
      return { loaded: true } as TResponse;
    }
    if (pathname === "/sample/leave") {
      await this.leaveSampleProfile(toFormObject(body).remove === "true");
      return undefined as TResponse;
    }
    if (pathname === "/sync/resolve") return this.resolveConflict<TResponse>(state, body);
    if (pathname === "/accounts" && (body as { action?: unknown })?.action === "reconcile")
      return this.saveAndReturn<TResponse>(state, reconcileAccount(state, body));
    if (pathname === "/accounts")
      return this.saveAndReturn<TResponse>(state, upsertAccount(state, body, method));
    if (pathname === "/transactions" && (body as { action?: unknown })?.action === "transfer")
      return this.saveAndReturn<TResponse>(state, createTransfer(state, body));
    if (pathname === "/transactions" && (body as { action?: unknown })?.action === "restore")
      return this.saveAndReturn<TResponse>(state, restoreTransaction(state, body));
    if (pathname === "/transactions" && (body as { action?: unknown })?.action === "split")
      return this.saveAndReturn<TResponse>(state, createSplit(state, body));
    if (pathname === "/transactions" && (body as { action?: unknown })?.action === "linkTransfer")
      return this.saveAndReturn<TResponse>(state, linkTransfer(state, body));
    if (pathname === "/transactions") {
      const tx = upsertTransaction(state, body, method);
      const budgetWarning = budgetWarningFor(state, tx);
      // Сторож: трата втрое больше обычной для категории — «это верно?».
      const usual =
        tx.type === "EXPENSE" && method === "POST"
          ? unusualFor(
              { amount: tx.amount, categoryId: tx.category.id, date: tx.date },
              watchRows(state).filter((row) => row.id !== tx.id)
            )
          : null;
      return this.saveAndReturn<TResponse>(state, {
        ...tx,
        budgetWarning,
        ...(usual !== null ? { unusual: { usual } } : {})
      });
    }
    if (pathname === "/transactions/transfer")
      return this.saveAndReturn<TResponse>(state, createTransfer(state, body));
    if (pathname === "/budgets")
      return this.saveAndReturn<TResponse>(state, upsertBudget(state, body));
    if (pathname === "/goals" && (body as { action?: unknown })?.action === "deposit") {
      return this.saveAndReturn<TResponse>(state, depositToGoal(state, body));
    }
    if (pathname === "/goals" && (body as { action?: unknown })?.action === "withdraw") {
      return this.saveAndReturn<TResponse>(state, withdrawFromGoal(state, body));
    }
    if (pathname === "/goals")
      return this.saveAndReturn<TResponse>(state, upsertGoal(state, body, method));
    if (pathname === "/debts")
      return this.saveAndReturn<TResponse>(state, upsertLiability(state, body, method));
    if (pathname === "/rules") return this.saveAndReturn<TResponse>(state, addRule(state, body));
    if (pathname === "/recurring")
      return this.saveAndReturn<TResponse>(state, upsertRecurring(state, body, method));
    if (pathname === "/recurring/materialize")
      return this.saveAndReturn<TResponse>(state, materializeRecurring(state, body));
    if (pathname === "/recurring/materialize-all")
      return this.saveAndReturn<TResponse>(state, materializeAllDue(state));
    if (pathname === "/debts/pay")
      return this.saveAndReturn<TResponse>(state, payDebt(state, body));
    if (pathname === "/debts/auto-pay")
      return this.saveAndReturn<TResponse>(state, autoPayDebts(state));
    if (pathname === "/networth/snapshot")
      return this.saveAndReturn<TResponse>(state, await recordNetWorthSnapshot(state));
    if (pathname === "/import")
      return this.saveAndReturn<TResponse>(state, importCsvRows(state, body));
    if (pathname === "/import/undo")
      return this.saveAndReturn<TResponse>(state, undoLastImport(state));
    if (pathname === "/settings")
      return this.saveAndReturn<TResponse>(state, updateSettings(state, body));
    if (pathname === "/fx") return this.saveAndReturn<TResponse>(state, updateFxRates(state, body));
    if (pathname === "/investments/events")
      return this.saveAndReturn<TResponse>(state, addRealizedEvent(state, body));
    if (pathname === "/investments/dividends")
      return this.saveAndReturn<TResponse>(state, addExpectedDividend(state, body));
    if (pathname === "/investments/targets")
      return this.saveAndReturn<TResponse>(state, setTargetAllocations(state, body));
    if (pathname === "/market/alerts")
      return this.saveAndReturn<TResponse>(state, addMarketAlert(state, body));
    if (pathname === "/backup") return this.restoreBackup<TResponse>(body);
    if (pathname === "/backup/before-clear") {
      await this.undoClear();
      return { restored: true } as TResponse;
    }
    if (pathname === "/backup/local-copies") {
      const input = (body ?? {}) as { action?: unknown; id?: unknown };
      if (input.action === "restore") {
        await this.restoreLocalCopy(String(input.id ?? ""));
        return { restored: true } as TResponse;
      }
      if (input.action === "daily") return (await this.dailyLocalCopy()) as TResponse;
      return (await this.takeLocalCopy("manual")) as TResponse;
    }
    if (pathname === "/backup/merge") return this.mergeBackup<TResponse>(body);
    if (pathname === "/trash") {
      const input = (body ?? {}) as { action?: unknown; ids?: unknown };
      const ids = Array.isArray(input.ids) ? input.ids.map(String) : [];
      if (input.action === "restore") return (await this.restoreFromTrash(state, ids)) as TResponse;
      if (input.action === "empty") return (await this.purgeTrash("all")) as TResponse;
      return (await this.purgeTrash(ids)) as TResponse;
    }
    if (pathname === "/investments")
      return this.saveAndReturn<TResponse>(state, await updateInvestments(state, body));
    if (pathname === "/categories")
      return this.saveAndReturn<TResponse>(state, upsertCategory(state, body, method));
    if (pathname === "/plan") return this.saveAndReturn<TResponse>(state, savePlan(state, body));
    if (pathname === "/photos") return this.attachPhoto<TResponse>(state, body);
    if (pathname === "/cashback")
      return this.saveAndReturn<TResponse>(
        state,
        writeCashback(state, (body ?? {}) as Record<string, unknown>, () => id("cb"), {
          account: (accountId) =>
            state.accounts.some((item) => item.id === accountId && !item.isArchived),
          category: (categoryId) => state.categories.some((item) => item.id === categoryId)
        })
      );
    if (pathname === "/trips")
      return this.saveAndReturn<TResponse>(
        state,
        writeTrips(state, (body ?? {}) as Record<string, unknown>, () => id("trip"))
      );
    if (pathname === "/deductions") {
      const input = (body ?? {}) as Record<string, unknown>;
      if (input.action === "mark") {
        const kind = deductionKindOf(input.kind);
        state.categories = state.categories.map((category) => {
          if (category.id !== input.categoryId) return category;
          const { deduction: _was, ...rest } = category;
          void _was;
          return kind ? { ...rest, deduction: kind } : rest;
        });
        return this.saveAndReturn<TResponse>(state, { categoryId: input.categoryId, kind });
      }
      return this.saveAndReturn<TResponse>(state, writeDeductionYear(state, input));
    }
    if (pathname === "/sheet") {
      const input = (body ?? {}) as Record<string, unknown>;
      const sheetId = input.sheetId ? String(input.sheetId) : MAIN_SHEET;
      if (input.action === "import")
        return this.saveAndReturn<TResponse>(
          state,
          importIntoSheet(
            state,
            sheetId,
            withSheetCategories(state, input.payload),
            () => id("col"),
            new Date().toISOString()
          )
        );
      return this.saveAndReturn<TResponse>(
        state,
        writeWorkbook(state, input, () => id("col"))
      );
    }
    if (pathname === "/family")
      return this.saveAndReturn<TResponse>(state, writeFamily(state, body));
    if (pathname === "/sheets") {
      const input = (body ?? {}) as Record<string, unknown>;
      if (input.action === "importWorkbook") {
        const sheets = (Array.isArray(input.sheets) ? input.sheets : []) as WorkbookImportSheet[];
        for (const item of sheets)
          if (item.kind === "budget") item.payload = withSheetCategories(state, item.payload);
        return this.saveAndReturn<TResponse>(
          state,
          importWorkbook(state, sheets, () => id("sh"), new Date().toISOString())
        );
      }
      return this.saveAndReturn<TResponse>(
        state,
        writeSheets(state, input, () => id("sh"))
      );
    }
    if (pathname === "/profiles/create") {
      const input = toFormObject(body);
      const profile = await this.createProfile(input.name ?? "Профиль", input.color ?? "#0d9488");
      return profile as TResponse;
    }
    if (pathname === "/profiles/switch") {
      const input = toFormObject(body);
      await this.switchProfile(input.profileId ?? "");
      return undefined as TResponse;
    }
    if (pathname === "/profiles/rename") {
      const input = toFormObject(body);
      await this.renameProfile(input.profileId ?? "", input.name ?? "");
      return undefined as TResponse;
    }

    throw new Error(`Local API write route is not implemented: ${pathname}`);
  }

  private async saveAndReturn<TResponse>(state: LocalState, value: unknown) {
    await this.save(state);
    return value as TResponse;
  }

  private async restoreBackup<TResponse>(body: unknown) {
    const payload = (body as { backup?: unknown })?.backup;
    // Scheduled backups and folder sync write the document inside an envelope
    // (`{ exportedAt, backup }`); the button writes it bare. Accept either, so
    // any file the app itself produced can be restored.
    const document =
      payload && typeof payload === "object" && "backup" in payload
        ? (payload as { backup?: unknown }).backup
        : payload;
    const parsed = localStateSchema.safeParse(document);
    if (!parsed.success)
      throw new Error(
        "Файл не похож на резервную копию приложения — выберите файл, сохранённый кнопкой «Скачать backup»."
      );
    const restored = migrateLocalState(parsed.data);

    // The key does not travel in the file (see `backup`), so a copy carries an
    // empty one. Writing that over the key set on THIS machine would quietly
    // switch the AI features off on every restore, and the owner would go
    // looking for the fault in the wrong place. The machine keeps its own.
    const current = await this.state();
    if (!restored.aiApiKey) restored.aiApiKey = current.aiApiKey ?? "";

    await this.save(restored, { stamp: false });
    return { restored: true } as TResponse;
  }

  /**
   * Добавить к текущим данным записи из копии — «Объединить» при подключении.
   *
   * Устройство со своими записями подключается к другому: ключ и данные
   * приезжают оттуда, а свои записи, снятые копией до подключения, ложатся
   * сюда ДОБАВКОЙ. Ничего из уже лежащего здесь не заменяется.
   *
   * Одноимённые категории склеиваются: «Продукты» с двух устройств — это одни
   * «Продукты», и операции переводятся на ту, что уже есть. Счета — нет:
   * «Карта» на телефоне и «Карта» на ноутбуке могут быть разными картами, и
   * сложить их остатки значило бы соврать. Одинаковое имя получает «(2)», чтобы
   * было видно, что их два, — объединить или убрать лишний человек решит сам.
   */
  private async mergeBackup<TResponse>(body: unknown) {
    const payload = (body as { backup?: unknown })?.backup;
    const document =
      payload && typeof payload === "object" && "backup" in payload
        ? (payload as { backup?: unknown }).backup
        : payload;
    const parsed = localStateSchema.safeParse(document);
    if (!parsed.success) throw new Error("Не удалось прочитать записи для объединения.");
    const incoming = migrateLocalState(parsed.data);

    let added = 0;
    const state = await this.state();

    const categoryOf = new Map<string, LocalState["categories"][number]>();
    for (const category of incoming.categories) {
      const same =
        state.categories.find((existing) => existing.id === category.id) ??
        state.categories.find(
          (existing) =>
            existing.kind === category.kind &&
            existing.label.trim().toLowerCase() === category.label.trim().toLowerCase()
        );
      if (same) {
        categoryOf.set(category.id, same);
        continue;
      }
      state.categories.push(category);
      categoryOf.set(category.id, category);
    }
    const recategorize = <T extends { category: { id: string; label: string } }>(row: T): T => {
      const target = categoryOf.get(row.category.id);
      return target
        ? { ...row, category: { ...row.category, id: target.id, label: target.label } }
        : row;
    };

    const names = new Set(state.accounts.map((account) => account.name.trim().toLowerCase()));
    const accountIds = new Set(state.accounts.map((account) => account.id));
    for (const account of incoming.accounts) {
      if (accountIds.has(account.id)) continue;
      let name = account.name;
      for (let n = 2; names.has(name.trim().toLowerCase()); n += 1) name = `${account.name} (${n})`;
      names.add(name.trim().toLowerCase());
      state.accounts.push({ ...account, name });
      added += 1;
    }

    const addById = <T extends { id: string }>(target: T[], rows: T[], shape = (row: T) => row) => {
      const have = new Set(target.map((row) => row.id));
      for (const row of rows) {
        if (have.has(row.id)) continue;
        target.push(shape(row));
        added += 1;
      }
    };
    addById(state.transactions, incoming.transactions, (row) => {
      const moved = recategorize(row);
      const account = state.accounts.find((item) => item.id === moved.account.id);
      return account ? { ...moved, account: { ...moved.account, name: account.name } } : moved;
    });
    addById(state.recurringTransactions, incoming.recurringTransactions, recategorize);
    addById(state.goals, incoming.goals);
    state.goalMovements ??= [];
    addById(state.goalMovements, incoming.goalMovements ?? []);
    addById(state.liabilities, incoming.liabilities);
    addById(state.rules, incoming.rules);
    addById(
      state.budgets,
      incoming.budgets
        .map((budget) => ({
          ...budget,
          categoryId: categoryOf.get(budget.categoryId)?.id ?? budget.categoryId
        }))
        // Лимит на ту же категорию в тот же месяц уже есть — здешний главнее.
        .filter(
          (budget) =>
            !state.budgets.some(
              (existing) =>
                existing.categoryId === budget.categoryId &&
                (existing as { month?: string }).month === (budget as { month?: string }).month
            )
        )
    );

    await this.save(state);
    return { merged: added } as TResponse;
  }

  /**
   * The active profile's document. `mutable` (the default) hands back a copy,
   * so a handler that changes things — and may still throw — cannot poison the
   * cache; reads pass `false` and get the cached object itself, which is what
   * keeps a big ledger quick.
   */
  private async state(mutable = true) {
    const profileId = await this.getActiveProfileId();
    const key = profileStateKey(profileId);
    if (this.stateCache && this.stateCache.key === key) {
      return mutable ? writableCopy(this.stateCache.state) : this.stateCache.state;
    }
    const existing = await this.storage.getItem<unknown>(key);
    const parsed = localStateSchema.safeParse(existing);
    if (parsed.success) {
      const migrated = migrateLocalState(parsed.data);
      const storedVersion = (existing as { schemaVersion?: unknown })?.schemaVersion;
      if (migrated.schemaVersion !== storedVersion) {
        // Книга сейчас будет переписана в новом виде — и это единственная
        // секунда, когда прежняя ещё существует. Отложить её надо ЗДЕСЬ:
        // готовая выгрузка копии (`/backup`) читает книгу через это же место и
        // получит уже переведённую, то есть поймать прежнюю не может в принципе.
        await this.keepPreUpgradeCopy(
          key,
          existing,
          typeof storedVersion === "number" ? storedVersion : 1,
          migrated.schemaVersion
        );
        await this.storage.setItem(key, migrated);
      }
      this.stateCache = { key, state: freezeLedgerOutsideProduction(structuredClone(migrated)) };
      const baseline = this.remoteBaseline;
      this.remoteBaseline = null;
      if (baseline?.key === key) {
        await this.putInTrash(
          key,
          vanishedRows(
            baseline.state as unknown as Record<string, unknown>,
            migrated as unknown as Record<string, unknown>
          ),
          "elsewhere"
        );
      }
      return structuredClone(migrated);
    }
    // Nothing below may overwrite what is stored: the only reason we are here
    // is that this build cannot read it, and "cannot read" is not "may erase".
    // Replacing it with an empty state — which is what happened until 1.13.0 —
    // turns one bad row, or a file written by a newer build, into the loss of
    // every account, operation and plan.
    if (existing == null) {
      const initial = createInitialState();
      await this.storage.setItem(key, initial);
      this.stateCache = { key, state: freezeLedgerOutsideProduction(structuredClone(initial)) };
      return structuredClone(initial);
    }

    const storedVersion = (existing as { schemaVersion?: unknown })?.schemaVersion;
    if (typeof storedVersion === "number" && storedVersion > LATEST_LOCAL_STATE_VERSION)
      throw new Error(
        `Данные сохранены более новой версией приложения (формат ${storedVersion}). ` +
          "Обновите приложение — старая версия их не откроет."
      );

    await this.keepRescueCopy(key, existing);

    const salvaged = salvageLocalState(existing);
    if (!salvaged)
      throw new Error(
        "Не удалось прочитать сохранённые данные. Они не тронуты, копия отложена — " +
          "восстановите из резервной копии в настройках."
      );

    const migrated = migrateLocalState(salvaged.state);
    await this.storage.setItem(key, migrated);
    this.stateCache = { key, state: freezeLedgerOutsideProduction(structuredClone(migrated)) };
    return structuredClone(migrated);
  }

  /**
   * Puts the unreadable document aside before anything else touches the key.
   * Written once: a second failure must not overwrite the first rescue, which
   * is the one closest to the moment things went wrong.
   */
  /**
   * Книга, какой она была до перевода на новую схему, — или ничего, если
   * переводов ещё не было.
   *
   * Отдаётся в том же виде, что и обычная выгрузка, и это главное: в ней лежит
   * СТАРАЯ схема, и прежняя версия приложения примет такой файл своим обычным
   * «восстановить из копии». Ради этой одной возможности копия и держится.
   */
  private async preUpgradeBackup(): Promise<PreUpgradeBackup | null> {
    const profileId = await this.getActiveProfileId();
    const stored = await this.storage.getItem<unknown>(
      `${profileStateKey(profileId)}${PRE_UPGRADE_SUFFIX}`
    );
    if (!stored || typeof stored !== "object") return null;

    const record = stored as Record<string, unknown>;
    if (!record.document || typeof record.document !== "object") return null;

    // Ключ помощника из файла убирается — по той же причине, что и в обычной
    // выгрузке: файл уходит с машины, а ключ принадлежит машине.
    const document = { ...(record.document as Record<string, unknown>) };
    delete document.aiApiKey;

    return {
      savedAt: typeof record.savedAt === "string" ? record.savedAt : null,
      fromVersion: typeof record.fromVersion === "number" ? record.fromVersion : null,
      toVersion: typeof record.toVersion === "number" ? record.toVersion : null,
      backup: document
    };
  }

  private async keepRescueCopy(key: string, document: unknown) {
    const rescueKey = `${key}${RESCUE_SUFFIX}`;
    try {
      if ((await this.storage.getItem<unknown>(rescueKey)) == null)
        await this.storage.setItem(rescueKey, document);
    } catch {
      /* storage refused the copy — the original is still where it was */
    }
  }

  /**
   * Откладывает книгу такой, какой она была до перевода на новую схему.
   *
   * Схемы едут только вперёд, и миграции необратимы: «сложить два поля в одно»
   * нельзя разложить обратно, потому что раскладывать уже нечего. Значит
   * единственный способ вернуться — сохранить то, что было, пока оно есть.
   *
   * Нужно это ровно в одном случае, зато в важном: человек поставил себе
   * пробную сборку раньше остальных — а ради этого вся обкатка и заводилась, —
   * и она оказалась плохой. Без копии откат означает «книга не открывается
   * прежней версией»; с копией — «выгрузил файл, поставил прежнюю, развернул».
   *
   * Копия ОДНА и заменяется каждым переводом. Хранить все прежние ни к чему:
   * вернуться можно на шаг назад, а не на пять — приложения, читающего схему
   * пятилетней давности, всё равно уже нет, — и ряд копий рос бы без конца,
   * удваивая книгу на каждом обновлении.
   */
  private async keepPreUpgradeCopy(
    key: string,
    document: unknown,
    fromVersion: number,
    toVersion: number
  ) {
    try {
      await this.storage.setItem(`${key}${PRE_UPGRADE_SUFFIX}`, {
        savedAt: new Date().toISOString(),
        fromVersion,
        toVersion,
        document
      });
    } catch {
      // Хранилище отказало — скорее всего кончилось место. Перевод всё равно
      // продолжается: отказаться от него значило бы оставить человека с
      // приложением, которое не открывается вовсе. Но сказать правду стоит:
      // защиты на этот раз не будет, и узнает об этом только тот, кто читает
      // этот комментарий. Дверь в настройках покажет, что копии нет.
    }
  }

  /**
   * Единственная дверь, через которую книга попадает на диск.
   *
   * Здесь же строкам проставляется время последней правки: сличением с тем, что
   * лежало до этого, — изменившиеся и новые получают текущее время, нетронутые
   * сохраняют прежнее. Ставить отметки в обработчиках нельзя: их около
   * восьмидесяти, и восемьдесят первый её не поставит. Здесь — не забудет никто.
   *
   * `stamp: false` — для восстановления из копии: там отметки уже есть в файле и
   * означают, когда строку правили на самом деле. Переписать их на «сейчас»
   * значило бы объявить трёхлетнюю книгу целиком свежей.
   */
  /**
   * Решение человека по спорной строке.
   *
   * Обычная правка книги, а не особый путь: строка кладётся на своё место (или
   * убирается), и дальше всё идёт как всегда — отметка времени, след удаления,
   * отправка на сервер. Поэтому выбранное доезжает до второго устройства само и
   * ровно тем же порядком, что любая другая правка, а не отдельным механизмом,
   * который однажды разойдётся с основным.
   */
  private async resolveConflict<TResponse>(state: LocalState, body: unknown): Promise<TResponse> {
    const input = body as { collection?: unknown; key?: unknown; row?: unknown };
    const collection = typeof input.collection === "string" ? input.collection : "";
    const key = typeof input.key === "string" ? input.key : "";

    const identify = STAMPED.find(([name]) => name === collection)?.[1];
    if (!identify) throw new Error(`Такого раздела в данных нет: ${collection}`);

    const holder = state as unknown as Record<string, unknown>;
    const rows = Array.isArray(holder[collection]) ? (holder[collection] as unknown[]) : [];
    const kept = rows.filter((row) => {
      if (typeof row !== "object" || row === null) return true;
      return identify(row as Record<string, unknown>) !== key;
    });

    // Пустой строки нет — значит, выбрали «здесь её удалили»: строка просто не
    // возвращается, а след удаления поставит сохранение, как и всегда.
    //
    // Отметку времени со строки снимать не нужно, хотя рука и тянется: точка
    // сохранения верному времени учит сама и отметке, пришедшей вместе со
    // строкой, не доверяет вовсе (см. row-stamps, decide).
    if (input.row && typeof input.row === "object") {
      kept.push({ ...(input.row as Record<string, unknown>) });
    }

    holder[collection] = kept;
    await this.save(state);
    return { resolved: true } as TResponse;
  }

  private async save(state: LocalState, options: { stamp?: boolean; trash?: boolean } = {}) {
    const profileId = await this.getActiveProfileId();
    const key = profileStateKey(profileId);
    const previous = await this.storedState(key);
    const now = new Date().toISOString();
    // Отметки и следы удалений ставятся ВМЕСТЕ и от одного сличения: строка,
    // исчезнувшая из книги, — это то же событие, что и правка, просто с другим
    // исходом. Разведи их по разным местам — однажды поставится одно без другого.
    const next =
      options.stamp === false
        ? state
        : trackDeletions(stampRows(state, previous, now), previous, now);
    await this.storage.setItem(key, next);
    // Без копии: следующая запись всё равно начнёт с writableCopy, а чтения
    // книгу не трогают (см. freeze-state.ts — вне поставки она заморожена).
    this.stateCache = { key, state: freezeLedgerOutsideProduction(next) };
    // Удалённое — в корзину. Сличаем записанное с прежним, как и для фото ниже:
    // мест, где что-то удаляют, слишком много, чтобы ловить каждое.
    // Загрузка примера переписывает книгу целиком — это не удаление.
    if (options.trash !== false) {
      await this.putInTrash(
        key,
        vanishedRows(previous, next as unknown as Record<string, unknown>),
        "here"
      );
    }
    // Операции не стало — не стало и её фото. Сличаем записанное с прежним,
    // а не ловим каждое место, где операцию удаляют: их много (одна, чек
    // целиком, выбранные, перевод), и одно забытое оставило бы фото навсегда.
    for (const gone of orphanedPhotos(
      (previous?.transactions as Array<{ id: string; photo?: PhotoPlace }> | undefined) ?? [],
      next.transactions
    )) {
      await this.dropPhoto(gone.id, gone.place);
    }
  }

  // ——— корзина ————————————————————————————————————————————————————

  private async putInTrash(
    stateKey: string,
    gone: ReturnType<typeof vanishedRows>,
    origin: TrashOrigin
  ): Promise<void> {
    if (gone.length === 0) return;
    try {
      const key = `${stateKey}${TRASH_SUFFIX}`;
      const trash = readTrash(await this.storage.getItem<unknown>(key));
      await this.storage.setItem(key, {
        v: 1,
        entries: addToTrash(trash, gone, new Date().toISOString(), origin, () => id("trash"))
      });
    } catch {
      /* корзина — страховка; книга уже записана, и падать из-за неё нельзя */
    }
  }

  private async trashKey(): Promise<string> {
    return `${profileStateKey(await this.getActiveProfileId())}${TRASH_SUFFIX}`;
  }

  private async trashEntries(): Promise<TrashEntry[]> {
    const key = await this.trashKey();
    return pruneTrash(
      readTrash(await this.storage.getItem<unknown>(key)),
      new Date().toISOString()
    );
  }

  private async trashList() {
    const entries = await this.trashEntries();
    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        collection: entry.collection,
        title: trashTitle(entry),
        amount: trashAmount(entry),
        currency: typeof entry.row.currency === "string" ? entry.row.currency : "RUB",
        type: typeof entry.row.type === "string" ? entry.row.type : null,
        date: typeof entry.row.date === "string" ? entry.row.date : null,
        deletedAt: entry.deletedAt,
        origin: entry.origin
      }))
    };
  }

  /**
   * Вернуть из корзины. Сначала счета и категории, потом то, что на них
   * ссылается: удалили счёт вместе с операциями — вернуть надо в том же порядке.
   */
  private async restoreFromTrash(state: LocalState, ids: string[]) {
    const order = [
      "sheets",
      "accounts",
      "categories",
      "liabilities",
      "goals",
      "budgets",
      "rules",
      "recurringTransactions",
      "cashbackRules",
      "trips",
      "sheetColumns",
      "sheetTargets",
      "members",
      "familySettlements",
      "transactions"
    ];
    const all = await this.trashEntries();
    // Перевод — две операции. Вернуть одну значило бы оставить деньги
    // ушедшими со счёта и никуда не пришедшими: вторая половина идёт следом.
    const transferOf = (entry: TrashEntry) =>
      entry.collection === "transactions"
        ? transferKeyOf(entry.row as { description: string | null; transferId?: string })
        : null;
    const transfers = new Set(
      all
        .filter((entry) => ids.includes(entry.id))
        .map(transferOf)
        .filter((value): value is string => value !== null)
    );
    const entries = all
      .filter((entry) => {
        const transfer = transferOf(entry);
        return ids.includes(entry.id) || (transfer !== null && transfers.has(transfer));
      })
      .sort((a, b) => order.indexOf(a.collection) - order.indexOf(b.collection));
    if (entries.length === 0) throw new Error("В корзине этого уже нет.");
    const holder = state as unknown as Record<string, unknown>;
    const restored: string[] = [];
    const failed: string[] = [];
    // Счёт, возвращаемый вместе со своими операциями, уже несёт остаток с ними:
    // провести операции по нему ещё раз значило бы удвоить деньги.
    const accountsBack = new Set<string>();
    for (const entry of entries) {
      const { updatedAt: _stamp, ...row } = entry.row;
      void _stamp;
      try {
        if (entry.collection === "transactions") {
          const accountId = (row.account as { id?: unknown } | undefined)?.id;
          if (typeof accountId === "string" && accountsBack.has(accountId)) {
            if (!state.transactions.some((item) => item.id === row.id))
              state.transactions = [
                transactionRowSchema.omit({ updatedAt: true }).parse(row) as TransactionRow,
                ...state.transactions
              ];
          } else {
            restoreTransaction(state, { transaction: row });
          }
        } else {
          // Лист (и столбец) возвращается вместе со всем, что на нём было.
          const content = row[SHEET_ARCHIVE] as Record<string, unknown[]> | undefined;
          delete row[SHEET_ARCHIVE];
          if (content) {
            for (const [collection, list] of Object.entries(content)) {
              const present = Array.isArray(holder[collection])
                ? (holder[collection] as Array<Record<string, unknown>>)
                : [];
              const ids = new Set(present.map((item) => item.id));
              holder[collection] = [
                ...present,
                ...(list as Array<Record<string, unknown>>)
                  .filter((item) => !ids.has(item.id))
                  .map(({ updatedAt: _at, ...rest }) => (void _at, rest))
              ];
            }
          }
          const rows = Array.isArray(holder[entry.collection])
            ? (holder[entry.collection] as Array<Record<string, unknown>>)
            : [];
          if (!rows.some((item) => item.id === row.id)) {
            // Цель при удалении отдала деньги на счёт (см. remove, /goals): вернуть
            // её с прежней суммой значило бы посчитать эти деньги дважды.
            if (entry.collection === "goals") Object.assign(row, { currentAmount: 0, progress: 0 });
            holder[entry.collection] = [...rows, row];
            if (entry.collection === "accounts" && typeof row.id === "string")
              accountsBack.add(row.id);
          }
        }
        restored.push(entry.id);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : String(error));
      }
    }
    await this.save(state);
    const key = await this.trashKey();
    const left = readTrash(await this.storage.getItem<unknown>(key)).filter(
      (entry) => !restored.includes(entry.id)
    );
    await this.storage.setItem(key, { v: 1, entries: left });
    return { restored: restored.length, failed };
  }

  private async purgeTrash(ids: string[] | "all") {
    const key = await this.trashKey();
    const entries = readTrash(await this.storage.getItem<unknown>(key));
    const left = ids === "all" ? [] : entries.filter((entry) => !ids.includes(entry.id));
    await this.storage.setItem(key, { v: 1, entries: left });
    return { removed: entries.length - left.length };
  }

  // ——— фото чеков ————————————————————————————————————————————————

  private async readPhoto(state: LocalState, transactionId: string) {
    const row = state.transactions.find((item) => item.id === transactionId);
    if (!row?.photo) return { photo: null, place: null, missing: false };
    const stored = await this.storage.getItem<StoredPhoto>(photoKey(transactionId, row.photo));
    return isPhotoData(stored)
      ? { photo: stored.data, place: row.photo, missing: false }
      : // Отметка есть, а фото нет: его сняли «только на этом устройстве» на
        // другом, или оно ещё едет с сервера.
        { photo: null, place: row.photo, missing: true };
  }

  private async attachPhoto<TResponse>(state: LocalState, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const transactionId = String(input.transactionId ?? "");
    const row = state.transactions.find((item) => item.id === transactionId);
    if (!row) throw new Error("Операция не найдена — возможно, её уже удалили.");
    const data = String(input.data ?? "");
    if (!data.startsWith("data:image/") || data.length > PHOTO_MAX_CHARS)
      throw new Error("Не получилось прочитать фото. Попробуйте снять ещё раз.");
    const place: PhotoPlace = input.place === "device" ? "device" : "synced";
    // Было фото в другом месте — убрать, чтобы не лежало два.
    if (row.photo && row.photo !== place) await this.dropPhoto(transactionId, row.photo);
    const stored: StoredPhoto = {
      data,
      width: Number(input.width) || 0,
      height: Number(input.height) || 0,
      createdAt: new Date().toISOString()
    };
    await this.storage.setItem(photoKey(transactionId, place), stored);
    state.transactions = state.transactions.map((item) =>
      item.id === transactionId ? { ...item, photo: place } : item
    );
    return this.saveAndReturn<TResponse>(state, { transactionId, place });
  }

  /**
   * Убрать фото. Синхронизируемое — следом «удалено», а не стиранием: стёртое
   * здесь осталось бы на сервере и на других устройствах (слой синхронизации
   * нарочно не передаёт удаление ключа, см. SyncingStorageAdapter.removeItem).
   */
  private async dropPhoto(transactionId: string, place: PhotoPlace) {
    const key = photoKey(transactionId, place);
    try {
      if (place === "device") await this.storage.removeItem(key);
      else if (await this.storage.getItem<unknown>(key))
        await this.storage.setItem<StoredPhoto>(key, {
          removed: true,
          at: new Date().toISOString()
        });
    } catch {
      /* фото не главное — книга уже записана */
    }
  }

  /**
   * Книга, какой она лежит сейчас, — чтобы было с чем сличать. Почти всегда это
   * уже прогретая память (её наполняет любое чтение перед записью); обращение к
   * хранилищу остаётся на тот случай, когда запись идёт первой.
   */
  private async storedState(key: string): Promise<Record<string, unknown> | null> {
    if (this.stateCache?.key === key) return this.stateCache.state as Record<string, unknown>;
    const stored = await this.storage.getItem<Record<string, unknown>>(key);
    return stored && typeof stored === "object" ? stored : null;
  }

  private async getActiveProfileId(): Promise<string> {
    const list = await this.profileList();
    return list.activeProfileId;
  }

  private async profileList(): Promise<ProfileList> {
    const stored = await this.storage.getItem<ProfileList>(PROFILE_LIST_KEY);
    if (stored && Array.isArray(stored.profiles) && stored.profiles.length > 0) return stored;

    // Migration: check for legacy state
    const legacy = await this.storage.getItem<unknown>(LEGACY_STATE_KEY);
    const defaultProfile: UserProfile = {
      id: "profile-default",
      name: "Основной",
      color: "#0d9488",
      createdAt: new Date().toISOString()
    };
    const list: ProfileList = { profiles: [defaultProfile], activeProfileId: defaultProfile.id };

    if (legacy) {
      const parsed = localStateSchema.safeParse(legacy);
      await this.storage.setItem(
        profileStateKey(defaultProfile.id),
        parsed.success ? migrateLocalState(parsed.data) : legacy
      );
      await this.storage.removeItem(LEGACY_STATE_KEY);
      this.invalidateStateCache();
    }

    await this.storage.setItem(PROFILE_LIST_KEY, list);
    return list;
  }

  private async createProfile(name: string, color: string): Promise<UserProfile> {
    const list = await this.profileList();
    const profile: UserProfile = {
      id: id("profile"),
      name: name.trim().slice(0, 40) || "Новый профиль",
      color,
      createdAt: new Date().toISOString()
    };
    list.profiles.push(profile);
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    await this.storage.setItem(profileStateKey(profile.id), createInitialState());
    return profile;
  }

  private async renameProfile(profileId: string, name: string): Promise<void> {
    const list = await this.profileList();
    const profile = list.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    profile.name = name.trim().slice(0, 40) || profile.name;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
  }

  private async switchProfile(profileId: string): Promise<void> {
    const list = await this.profileList();
    if (!list.profiles.find((p) => p.id === profileId)) throw new Error("Profile not found");
    list.activeProfileId = profileId;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    this.invalidateStateCache();
  }

  /**
   * «Очистить все данные» — ПРАВКА данных, а не стирание файлов.
   *
   * Раньше здесь стоял `storage.clear()`, и при подключённой службе кнопка
   * врала. Очистка хранилища убирает книгу с диска и забывает номер версии —
   * а слой синхронизации нарочно не трогает сервер. Первый же обмен шёл от
   * версии ноль, получал «вас обогнали» и сливал пустое с полным без общей
   * основы, то есть возвращал всё обратно. Человек видел пустой экран, а через
   * секунду — свои данные. На экране при этом было написано «необратимо».
   *
   * Теперь пустота записывается ПОВЕРХ текущего, как любая другая правка. Она
   * уезжает на службу с верным номером версии, и другие устройства получают
   * её как удаление строк, а не как «у нас ещё не добавили».
   *
   * Тетрадки, кроме основной, тоже записываются пустыми, а не убираются:
   * убрать ключ значит снова «убрать с устройства, но не со службы», и на
   * службе осталась бы полная копия каждой.
   */
  private async clearEverything(): Promise<void> {
    const list = await this.profileList();
    const ids = new Set([...list.profiles.map((profile) => profile.id), DEFAULT_PROFILE.id]);

    // Сначала — копия всего, что сейчас есть: «Очистить все данные» нажимают и
    // по ошибке, а резервную копию в файл делают не все. Неделю её можно
    // вернуть одной кнопкой в настройках; на службу она не ездит.
    const states: Record<string, unknown> = {};
    for (const id of ids) {
      const existing = await this.storage.getItem<unknown>(profileStateKey(id));
      if (existing) states[id] = existing;
    }
    await this.storage.setItem<BeforeClearStored>(BEFORE_CLEAR_KEY, {
      savedAt: new Date().toISOString(),
      list,
      states
    });

    for (const id of ids) {
      const key = profileStateKey(id);
      const existing = await this.storage.getItem<unknown>(key);
      await this.storage.setItem(key, createBlankState(standardCategoriesFrom(existing)));
    }
    await this.storage.setItem(PROFILE_LIST_KEY, {
      profiles: [DEFAULT_PROFILE],
      activeProfileId: DEFAULT_PROFILE.id
    } satisfies ProfileList);

    // Местные копии — отложенные перед обновлением схемы и при поломке. Каждая
    // держит книгу ЦЕЛИКОМ, и «удалить всё», оставив их, значило бы удалить
    // не всё. На службу они не ездят, так что убрать их с диска и есть удалить.
    for (const key of await this.storage.keys()) {
      // Фото чеков — тоже данные человека. Синхронизируемые гасятся следом,
      // чтобы исчезли и на других устройствах.
      if (key.startsWith(PHOTO_PREFIX)) {
        const [, rest] = key.split(PHOTO_PREFIX);
        const place: PhotoPlace = rest.endsWith(":device") ? "device" : "synced";
        await this.dropPhoto(rest.replace(/:device$/, ""), place);
        continue;
      }
      if (
        key === LEGACY_STATE_KEY ||
        key.endsWith(PRE_UPGRADE_SUFFIX) ||
        key.endsWith(RESCUE_SUFFIX) ||
        // Ежедневные копии — тоже данные целиком. Отменить очистку можно и
        // без них: для этого откладывается своя копия, выше.
        key.endsWith(LOCAL_COPY_SUFFIX) ||
        key.endsWith(TRASH_SUFFIX)
      ) {
        await this.storage.removeItem(key);
      }
    }
    this.invalidateStateCache();
  }

  /** Копия до очистки, если она есть и ей не больше недели. */
  private async beforeClearCopy(): Promise<BeforeClearCopy | null> {
    const stored = await this.storage.getItem<BeforeClearStored>(BEFORE_CLEAR_KEY);
    if (!stored?.savedAt) return null;
    const until = new Date(Date.parse(stored.savedAt) + BEFORE_CLEAR_DAYS * 24 * 60 * 60 * 1000);
    if (until.getTime() < Date.now()) {
      await this.storage.removeItem(BEFORE_CLEAR_KEY);
      return null;
    }
    return { savedAt: stored.savedAt, until: until.toISOString() };
  }

  /**
   * «Вернуть» — всё, как было до очистки. Каждая тетрадка записывается как
   * правка поверх пустой: так возвращённое уезжает на другие устройства тем
   * же путём, каким туда уехала очистка.
   */
  private async undoClear(): Promise<void> {
    if (!(await this.beforeClearCopy())) {
      throw new Error("Копии до очистки нет: её хранят неделю.");
    }
    const stored = (await this.storage.getItem<BeforeClearStored>(BEFORE_CLEAR_KEY))!;
    for (const [profileId, raw] of Object.entries(stored.states)) {
      const parsed = localStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      await this.storage.setItem(PROFILE_LIST_KEY, {
        ...stored.list,
        activeProfileId: profileId
      } satisfies ProfileList);
      this.invalidateStateCache();
      await this.save(migrateLocalState(parsed.data), { stamp: false });
    }
    await this.storage.setItem(PROFILE_LIST_KEY, stored.list);
    await this.storage.removeItem(BEFORE_CLEAR_KEY);
    this.invalidateStateCache();
  }

  /** Копии на этом устройстве, свежие первыми. */
  private async localCopies(): Promise<LocalCopy[]> {
    const index = await this.storage.getItem<LocalCopy[]>(LOCAL_COPY_INDEX_KEY);
    return Array.isArray(index)
      ? [...index].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      : [];
  }

  /**
   * Отложить копию всего, что сейчас есть, — все тетрадки целиком.
   *
   * Перечень хранится отдельно от самих копий: чтобы показать список, не надо
   * открывать четырнадцать полных копий книги.
   */
  private async takeLocalCopy(reason: LocalCopy["reason"]): Promise<LocalCopy> {
    const list = await this.profileList();
    const ids = new Set([...list.profiles.map((profile) => profile.id), DEFAULT_PROFILE.id]);
    const states: Record<string, unknown> = {};
    let operations = 0;
    for (const id of ids) {
      const existing = await this.storage.getItem<unknown>(profileStateKey(id));
      if (!existing) continue;
      states[id] = existing;
      const rows = (existing as { transactions?: unknown }).transactions;
      if (Array.isArray(rows)) operations += rows.length;
    }

    const now = new Date();
    const copy: LocalCopy = {
      id: `${now.getTime()}`,
      savedAt: now.toISOString(),
      reason,
      operations
    };
    await this.storage.setItem<LocalCopyStored>(localCopyKey(copy.id), {
      savedAt: copy.savedAt,
      list,
      states
    });

    const kept = [copy, ...(await this.localCopies())];
    for (const stale of kept.slice(LOCAL_COPIES_KEEP)) {
      await this.storage.removeItem(localCopyKey(stale.id));
    }
    await this.storage.setItem(LOCAL_COPY_INDEX_KEY, kept.slice(0, LOCAL_COPIES_KEEP));
    return copy;
  }

  /** Раз в день: если сегодня копии ещё не было — сделать. */
  private async dailyLocalCopy(): Promise<LocalCopy | null> {
    const today = todayDay();
    const copies = await this.localCopies();
    if (
      copies.some((copy) => copy.reason === "daily" && todayDay(new Date(copy.savedAt)) === today)
    ) {
      return null;
    }
    return this.takeLocalCopy("daily");
  }

  /**
   * «Вернуть» копию — тем же путём, что и возврат после очистки: каждая
   * тетрадка записывается как обычная правка и уезжает на другие устройства.
   * Нынешнее перед этим откладывается ещё одной копией — передумать можно.
   */
  private async restoreLocalCopy(id: string): Promise<void> {
    const stored = await this.storage.getItem<LocalCopyStored>(localCopyKey(id));
    if (!stored?.states) throw new Error("Такой копии на этом устройстве нет.");
    await this.takeLocalCopy("before-restore");
    for (const [profileId, raw] of Object.entries(stored.states)) {
      const parsed = localStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      await this.storage.setItem(PROFILE_LIST_KEY, {
        ...stored.list,
        activeProfileId: profileId
      } satisfies ProfileList);
      this.invalidateStateCache();
      // С новой отметкой: возвращённое — это правка, сделанная сейчас, и на
      // других устройствах она обязана перевесить то, что было после копии.
      await this.save(migrateLocalState(parsed.data));
    }
    await this.storage.setItem(PROFILE_LIST_KEY, stored.list);
    this.invalidateStateCache();
  }

  /** Завести профиль «Пример» (или взять прежний) и сделать его текущим. */
  private async openSampleProfile(): Promise<void> {
    const list = await this.profileList();
    if (!list.profiles.some((p) => p.id === SAMPLE_PROFILE_ID)) {
      list.profiles.push({
        id: SAMPLE_PROFILE_ID,
        name: "Пример",
        color: "#a855f7",
        createdAt: new Date().toISOString()
      });
    }
    if (list.activeProfileId !== SAMPLE_PROFILE_ID) list.returnTo = list.activeProfileId;
    list.activeProfileId = SAMPLE_PROFILE_ID;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    this.invalidateStateCache();
  }

  /** Вернуться из примера к своим данным; по желанию — убрать пример совсем. */
  private async leaveSampleProfile(remove: boolean): Promise<void> {
    const list = await this.profileList();
    const back =
      list.profiles.find((p) => p.id === list.returnTo && p.id !== SAMPLE_PROFILE_ID) ??
      list.profiles.find((p) => p.id !== SAMPLE_PROFILE_ID);
    if (!back) {
      // Кроме примера профилей нет — заводим основной, пустой.
      await this.createProfile("Основной", "#0d9488");
      return this.leaveSampleProfile(remove);
    }
    list.activeProfileId = back.id;
    delete list.returnTo;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    this.invalidateStateCache();
    if (remove && list.profiles.some((p) => p.id === SAMPLE_PROFILE_ID)) {
      await this.deleteProfile(SAMPLE_PROFILE_ID);
    }
  }

  private async deleteProfile(profileId: string): Promise<void> {
    const list = await this.profileList();
    if (list.profiles.length <= 1) throw new Error("Нельзя удалить последний профиль");
    list.profiles = list.profiles.filter((p) => p.id !== profileId);
    if (list.activeProfileId === profileId) list.activeProfileId = list.profiles[0].id;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    await this.storage.removeItem(profileStateKey(profileId));
    this.invalidateStateCache();
  }
}
