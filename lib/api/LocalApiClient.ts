"use client";

import { subMonths } from "date-fns";
import { z } from "zod";

import type { ApiClient } from "@/lib/api/ApiClient";
import { ASSET_KINDS, type AssetKind } from "@/types/enums";
import type {
  AccountsPageData,
  AnalyticsData,
  BudgetsPageData,
  CategoriesPageData,
  ForecastPageData,
  GoalsPageData,
  ImportPageData,
  LiabilitiesPageData,
  RulesPageData,
  RecurringTransactionsPageData,
  SettingsPageData,
  TransactionsPageData
} from "@/lib/data";
import { id, monthKeyOf, normalizePath, toFormObject } from "@/lib/api/local/helpers";
import { localStateSchema } from "@/lib/api/local/schemas";
import { criteriaFromParams, matchesCriteria } from "@/lib/transactions/filter";
import { dueLiabilities, monthKey, paymentAmount } from "@/lib/debts/auto-pay";
import { monthlyInterestAverage, upcomingInterest } from "@/lib/accounts/interest";
import { plannedDebtMonthlyTotal, plannedDebtPayments } from "@/lib/debts/planned";
import { activeDebts } from "@/lib/debts/settled";
import { parsePurchaseLots, sortLots, summarizeLots } from "@/lib/investments/lots";
import type { MarketAlert } from "@/lib/market/alerts";
import { buildAssetKindStructure, buildSectorStructure } from "@/lib/data/derive";
import type { CategorizationRule } from "@/lib/categorization-rules";
import {
  DEFAULT_CURRENCY_RATES,
  isSupportedCurrency,
  toBaseAmount,
  type CurrencyCode,
  type CurrencyRates
} from "@/lib/currency";
import { RISK_PROFILE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { createStorageAdapter } from "@/lib/storage/createStorageAdapter";
import {
  LATEST_LOCAL_STATE_VERSION,
  runLocalStateMigrations,
  type RawLocalState
} from "@/lib/storage/migrations/runLocalStateMigrations";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { clamp, percent, roundMoney } from "@/lib/utils";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { CashflowForecastService } from "@/services/CashflowForecastService";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/categories/palette";
import { categoryBreakdown, topCategories } from "@/lib/categories/breakdown";
import { pickBestWorstMonth } from "@/lib/analytics/best-month";
import {
  baseAmountContext,
  baseAmountOf,
  countableAmount,
  isSingleCurrency,
  toBaseRows
} from "@/lib/transactions/base-amount";
import { salvageLocalState } from "@/lib/api/local/schemas";
import { countableRows, isTransfer, TRANSFER_CATEGORY_LABEL } from "@/lib/transactions/transfers";
import { FinanceRecommendationService } from "@/services/FinanceRecommendationService";
import { InvestmentAnalysisService } from "@/services/InvestmentAnalysisService";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";
import { buildAnalyticsDerived } from "@/services/AnalyticsInsightService";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";
import { createMarketDataProvider } from "@/services/market/createMarketDataProvider";
import { historyRangeStart } from "@/lib/market/history-range";
import { suggestCategoryId } from "@/lib/category-suggest";
import { suggestedLimitFor } from "@/lib/budget-suggest";
import { effectiveLimit, rolloverCarry } from "@/lib/budget-rollover";
import { buildEmergencyFund } from "@/lib/emergency-fund";
import { buildNetWorthBreakdown, buildNetWorthTrend, computeNetWorth } from "@/lib/net-worth";
import { isoDay, recordSnapshot, type NetWorthSnapshot } from "@/lib/net-worth-snapshots";
import {
  SAMPLE_ACCOUNTS,
  SAMPLE_BUDGETS,
  SAMPLE_CATEGORIES,
  SAMPLE_GOALS,
  SAMPLE_TRANSACTIONS,
  sampleDate,
  sampleDeadline
} from "@/lib/sample-data";
import type {
  AccountRow,
  CategoryRow,
  DashboardData,
  ExpectedDividend,
  InvestmentData,
  LiabilityRow,
  PlanFactCell,
  PlanFactColumn,
  PlanFactMonth,
  PlanFactPageData,
  RealizedInvestmentEvent,
  TargetAllocation,
  TransactionRow
} from "@/types/finance";
import type { ProfileList, UserProfile } from "@/types/profiles";

const LEGACY_STATE_KEY = "localFinanceState";
const PROFILE_LIST_KEY = "profileList";

function profileStateKey(profileId: string): string {
  return `localFinanceState_${profileId}`;
}
const currency = "RUB" as const;

type CategoryOption = ImportPageData["categories"][number];
type LocalState = {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  currency: CurrencyCode;
  demoMode: boolean;
  emergencyFundMonthsTarget: number;
  riskProfileCode: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  defaultTransactionType: "INCOME" | "EXPENSE";
  lastBackupAt: string | null;
  accounts: Array<AccountRow & { isArchived?: boolean }>;
  liabilities: Array<Omit<LiabilityRow, "progress">>;
  rules: CategorizationRule[];
  autoMaterializeRecurring: boolean;
  paymentReminders: boolean;
  aiEnabled: boolean;
  aiProvider: string;
  aiEffort: string;
  aiApiKey: string;
  aiModel: string;
  currencyRates: CurrencyRates;
  currencyRatesUpdatedAt: string | null;
  netWorthSnapshots: NetWorthSnapshot[];
  realizedInvestmentEvents: RealizedInvestmentEvent[];
  expectedDividends: ExpectedDividend[];
  targetAllocations: TargetAllocation[];
  marketAlerts: MarketAlert[];
  categories: CategoryOption[];
  plans: Array<{ month: string; categoryId: string; amount: number }>;
  planNotes: Array<{ month: string; note: string; factNote: string }>;
  /** Months pinned into the plan/fact grid by hand (see savePlan/addMonth). */
  planMonths?: string[];
  transactions: Array<TransactionRow & { recurringId?: string }>;
  budgets: BudgetsPageData["budgets"];
  goals: GoalsPageData["goals"];
  recurringTransactions: Array<
    RecurringTransactionsPageData["recurringTransactions"][number] & {
      /**
       * Legacy: up to 1.4.0 a template posted its first operation immediately and
       * kept the link here. Nothing writes or reads it any more — kept so states
       * saved by older versions still validate.
       */
      lastTransactionId?: string;
    }
  >;
  investments: InvestmentData;
  importBatches?: Array<{
    id: string;
    importedAt: string;
    transactionIds: string[];
  }>;
};

const defaultCategories: CategoryOption[] = [
  { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#7ed6b7", icon: "Banknote" },
  {
    id: "cat-other-income",
    label: "Прочие доходы",
    kind: "INCOME",
    color: "#6fb2d2",
    icon: "Coins"
  },
  {
    id: "cat-food",
    label: "Продукты",
    kind: "EXPENSE",
    color: "#9184d9",
    icon: "ShoppingCart",
    isEssential: true
  },
  {
    id: "cat-transport",
    label: "Транспорт",
    kind: "EXPENSE",
    color: "#7f8fd8",
    icon: "Bus",
    isEssential: true
  },
  {
    id: "cat-utilities",
    label: "ЖКХ",
    kind: "EXPENSE",
    color: "#b3a7ea",
    icon: "Zap",
    isEssential: true
  },
  {
    id: "cat-subscriptions",
    label: "Подписки",
    kind: "EXPENSE",
    color: "#a89bc9",
    icon: "Repeat",
    isSubscription: true
  },
  {
    id: "cat-restaurants",
    label: "Рестораны",
    kind: "EXPENSE",
    color: "#e2b26e",
    icon: "Utensils"
  },
  {
    id: "cat-health",
    label: "Здоровье",
    kind: "EXPENSE",
    color: "#e2788a",
    icon: "Stethoscope",
    isEssential: true
  }
];

function recomputeGoal(
  goal: Omit<GoalsPageData["goals"][number], "progress" | "monthlyContribution">
): GoalsPageData["goals"][number] {
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const months = Math.max(
    1,
    Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
  );

  return {
    ...goal,
    progress: clamp(percent(goal.currentAmount, goal.targetAmount), 0, 100),
    monthlyContribution: Math.ceil(remaining / months)
  };
}

function recomputeLiability(liability: Omit<LiabilityRow, "progress">): LiabilityRow {
  // Progress = share of the original principal already repaid. Falls back to 0
  // when the original amount is unknown or smaller than the current balance.
  const repaid = Math.max(liability.originalAmount - liability.balance, 0);
  const progress =
    liability.originalAmount > 0 ? clamp(percent(repaid, liability.originalAmount), 0, 100) : 0;
  return { ...liability, progress };
}

function emptyInvestmentData(): InvestmentData {
  return {
    source: "demo-fallback",
    currency,
    riskProfile: translate(getClientLocale(), "riskProfile.MODERATE"),
    securities: [],
    watchlist: [],
    portfolio: [],
    structure: [],
    sectorStructure: [],
    assetStructure: [],
    risks: [],
    education: []
  };
}

function createInitialState(): LocalState {
  // A fresh install starts empty: no accounts, no transactions, no watchlist —
  // the user adds their own. Default categories are kept only so that operations
  // can be categorized out of the box; they carry no monetary data.
  return {
    schemaVersion: LATEST_LOCAL_STATE_VERSION,
    currency,
    demoMode: false,
    emergencyFundMonthsTarget: 6,
    riskProfileCode: "MODERATE",
    theme: "dark",
    density: "comfortable",
    defaultTransactionType: "EXPENSE",
    lastBackupAt: null,
    accounts: [],
    liabilities: [],
    rules: [],
    autoMaterializeRecurring: false,
    paymentReminders: false,
    aiEnabled: false,
    aiProvider: "anthropic",
    aiEffort: "medium",
    aiApiKey: "",
    aiModel: "",
    currencyRates: { ...DEFAULT_CURRENCY_RATES },
    currencyRatesUpdatedAt: null,
    netWorthSnapshots: [],
    realizedInvestmentEvents: [],
    expectedDividends: [],
    targetAllocations: [],
    marketAlerts: [],
    categories: defaultCategories,
    plans: [],
    planNotes: [],
    transactions: [],
    budgets: [],
    goals: [],
    recurringTransactions: [],
    investments: emptyInvestmentData(),
    importBatches: []
  };
}

// A truly empty state — used when the user explicitly wipes all data.
// Unlike createInitialState() this seeds nothing: no accounts, categories or watchlist.
function createBlankState(): LocalState {
  return {
    schemaVersion: LATEST_LOCAL_STATE_VERSION,
    currency,
    demoMode: false,
    emergencyFundMonthsTarget: 6,
    riskProfileCode: "MODERATE",
    theme: "dark",
    density: "comfortable",
    defaultTransactionType: "EXPENSE",
    lastBackupAt: null,
    accounts: [],
    liabilities: [],
    rules: [],
    autoMaterializeRecurring: false,
    paymentReminders: false,
    aiEnabled: false,
    aiProvider: "anthropic",
    aiEffort: "medium",
    aiApiKey: "",
    aiModel: "",
    currencyRates: { ...DEFAULT_CURRENCY_RATES },
    currencyRatesUpdatedAt: null,
    netWorthSnapshots: [],
    realizedInvestmentEvents: [],
    expectedDividends: [],
    targetAllocations: [],
    marketAlerts: [],
    categories: [],
    plans: [],
    planNotes: [],
    transactions: [],
    budgets: [],
    goals: [],
    recurringTransactions: [],
    investments: emptyInvestmentData(),
    importBatches: []
  };
}

function migrateLocalState(state: z.infer<typeof localStateSchema>): LocalState {
  // Delegate version stepping to the shared migration runner so future schema
  // bumps are append-only (see lib/storage/migrations). Zod has already applied
  // field defaults by this point; the runner carries structural changes.
  return runLocalStateMigrations(state as unknown as RawLocalState) as unknown as LocalState;
}

function isBackupReminderDue(lastBackupAt: string | null) {
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > 14 * 24 * 60 * 60 * 1000;
}

// The plan rows that are not categories: the money the month opened with, kept
// apart from the money set aside. A balance on a savings or brokerage account is
// not spending money, and adding it into one "остаток" made the figure useless.
export const OPENING_BALANCE_ID = "__opening__";
export const SAVINGS_BALANCE_ID = "__savings__";
const SAVINGS_ACCOUNT_TYPES = ["SAVINGS", "BROKERAGE"];
const MONTH_KEY = /^\d{4}-\d{2}$/;

/** What an imported operation is filed under when the file names no account. */
const DEFAULT_IMPORT_ACCOUNT = "Импорт";

function cellOf(plan: number, fact: number): PlanFactCell {
  const rounded = { plan: roundMoney(plan), fact: roundMoney(fact) };
  return { ...rounded, diff: roundMoney(rounded.plan - rounded.fact) };
}

/** The first day of "YYYY-MM" in local time, which is how month keys are read. */
function monthStart(month: string): Date {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, (index || 1) - 1, 1);
}

// "2026-08" three months on is "2026-11". Done through Date so December rolls
// the year over on its own.
function shiftMonth(month: string, step: number): string {
  const [year, index] = month.split("-").map(Number);
  return monthKeyOf(new Date(year, index - 1 + step, 1));
}

const DEFAULT_PROFILE: UserProfile = {
  id: "profile-default",
  name: "Основной",
  color: "#0d9488",
  createdAt: "1970-01-01T00:00:00.000Z"
};

export class LocalApiClient implements ApiClient {
  constructor(private readonly storage: StorageAdapter = createStorageAdapter()) {}

  // In-memory cache of the active profile's parsed state, keyed by its storage
  // key. Reads return a deep clone so a handler that mutates-then-throws can't
  // poison the cache; save() refreshes it and storage-bypassing writes (clear,
  // profile ops) call invalidateStateCache(). Avoids re-reading and Zod-parsing
  // storage on every request (plan A4).
  private stateCache: { key: string; state: LocalState } | null = null;

  private invalidateStateCache() {
    this.stateCache = null;
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

    if (pathname === "/accounts") return this.accounts(state) as T;
    if (pathname === "/transactions") return this.transactions(state, searchParams) as T;
    if (pathname === "/budgets")
      return this.budgets(this.inBase(state), searchParams.get("month") ?? undefined) as T;
    if (pathname === "/goals") return this.goals(state) as T;
    if (pathname === "/debts") return this.debts(state) as T;
    if (pathname === "/rules") return this.rulesPage(state) as T;
    if (pathname === "/recurring") return this.recurring(state) as T;
    if (pathname === "/forecast") return this.forecast(this.inBase(state)) as T;
    if (pathname === "/dashboard")
      return (await this.dashboard(
        this.countingState(this.inBase(state), searchParams.get("transfers") === "1")
      )) as T;
    if (pathname === "/settings") return this.settings(state) as T;
    if (pathname === "/import") return this.importReferences(state) as T;
    if (pathname === "/backup") {
      // The exported file records when it was made, so the stamp goes into the
      // payload here — and into storage inside the queue, on a state read
      // again, so an export cannot roll back whatever was saved meanwhile.
      const stamped = new Date().toISOString();
      const payload = await this.backup({ ...state, lastBackupAt: stamped });
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
      const invData = await this.investments(state);
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
        await this.save(fresh);
      });
      return invData as T;
    }
    if (pathname === "/investments/events") return this.investmentEventsPage(state) as T;
    if (pathname === "/market/alerts") return { alerts: state.marketAlerts ?? [] } as T;
    if (pathname === "/investments/dividends")
      return {
        dividends: state.expectedDividends ?? [],
        realized: (state.realizedInvestmentEvents ?? []).filter(
          (event) => event.type === "DIVIDEND"
        ),
        currency: state.currency
      } as T;
    if (pathname === "/investments/targets")
      return { targets: state.targetAllocations ?? [], currency: state.currency } as T;
    if (pathname === "/categories") return this.categoriesPage(state) as T;
    if (pathname === "/analytics")
      return this.analyticsPage(this.inBase(state), searchParams.get("transfers") === "1") as T;
    if (pathname === "/plan")
      return this.planFactPage(
        this.inBase(state),
        Number(searchParams.get("ahead") ?? 0),
        searchParams.get("transfers") === "1"
      ) as T;
    if (pathname === "/profiles") return (await this.profileList()) as T;

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
    } else if (pathname === "/transactions" && itemId) {
      this.deleteTransaction(state, itemId);
    } else if (pathname === "/goals" && itemId) {
      state.goals = state.goals.filter((goal) => goal.id !== itemId);
    } else if (pathname === "/debts" && itemId) {
      state.liabilities = state.liabilities.filter((liability) => liability.id !== itemId);
    } else if (pathname === "/investments/events" && itemId) {
      state.realizedInvestmentEvents = (state.realizedInvestmentEvents ?? []).filter(
        (event) => event.id !== itemId
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
      const txCount = state.transactions.filter((t) => t.category.id === itemId).length;
      if (txCount > 0) {
        throw new Error(`Нельзя удалить категорию: к ней привязано ${txCount} операций.`);
      }
      state.categories = state.categories.filter((c) => c.id !== itemId);
    } else if (pathname === "/profiles" && itemId) {
      await this.deleteProfile(itemId);
      return undefined as T;
    } else if (pathname === "/storage/clear") {
      // Wipe everything, then write a single blank profile so the app reloads
      // into a completely empty state instead of re-seeding demo defaults.
      await this.storage.clear();
      await this.storage.setItem(PROFILE_LIST_KEY, {
        profiles: [DEFAULT_PROFILE],
        activeProfileId: DEFAULT_PROFILE.id
      } satisfies ProfileList);
      await this.storage.setItem(profileStateKey(DEFAULT_PROFILE.id), createBlankState());
      this.invalidateStateCache();
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
      const sample = this.buildSampleState();
      await this.save(sample);
      return { loaded: true } as TResponse;
    }
    if (pathname === "/accounts")
      return this.saveAndReturn<TResponse>(state, this.upsertAccount(state, body, method));
    if (pathname === "/transactions" && (body as { action?: unknown })?.action === "transfer")
      return this.saveAndReturn<TResponse>(state, this.createTransfer(state, body));
    if (pathname === "/transactions") {
      const tx = this.upsertTransaction(state, body, method);
      const budgetWarning = this.budgetWarningFor(state, tx);
      return this.saveAndReturn<TResponse>(state, { ...tx, budgetWarning });
    }
    if (pathname === "/transactions/transfer")
      return this.saveAndReturn<TResponse>(state, this.createTransfer(state, body));
    if (pathname === "/budgets")
      return this.saveAndReturn<TResponse>(state, this.upsertBudget(state, body));
    if (pathname === "/goals" && (body as { action?: unknown })?.action === "deposit") {
      return this.saveAndReturn<TResponse>(state, this.depositToGoal(state, body));
    }
    if (pathname === "/goals")
      return this.saveAndReturn<TResponse>(state, this.upsertGoal(state, body, method));
    if (pathname === "/debts")
      return this.saveAndReturn<TResponse>(state, this.upsertLiability(state, body, method));
    if (pathname === "/rules")
      return this.saveAndReturn<TResponse>(state, this.addRule(state, body));
    if (pathname === "/recurring")
      return this.saveAndReturn<TResponse>(state, this.upsertRecurring(state, body, method));
    if (pathname === "/recurring/materialize")
      return this.saveAndReturn<TResponse>(state, this.materializeRecurring(state, body));
    if (pathname === "/recurring/materialize-all")
      return this.saveAndReturn<TResponse>(state, this.materializeAllDue(state));
    if (pathname === "/debts/auto-pay")
      return this.saveAndReturn<TResponse>(state, this.autoPayDebts(state));
    if (pathname === "/networth/snapshot")
      return this.saveAndReturn<TResponse>(state, await this.recordNetWorthSnapshot(state));
    if (pathname === "/import")
      return this.saveAndReturn<TResponse>(state, this.importCsvRows(state, body));
    if (pathname === "/import/undo")
      return this.saveAndReturn<TResponse>(state, this.undoLastImport(state));
    if (pathname === "/settings")
      return this.saveAndReturn<TResponse>(state, this.updateSettings(state, body));
    if (pathname === "/fx")
      return this.saveAndReturn<TResponse>(state, this.updateFxRates(state, body));
    if (pathname === "/investments/events")
      return this.saveAndReturn<TResponse>(state, this.addRealizedEvent(state, body));
    if (pathname === "/investments/dividends")
      return this.saveAndReturn<TResponse>(state, this.addExpectedDividend(state, body));
    if (pathname === "/investments/targets")
      return this.saveAndReturn<TResponse>(state, this.setTargetAllocations(state, body));
    if (pathname === "/market/alerts")
      return this.saveAndReturn<TResponse>(state, this.addMarketAlert(state, body));
    if (pathname === "/backup") return this.restoreBackup<TResponse>(body);
    if (pathname === "/investments")
      return this.saveAndReturn<TResponse>(state, await this.updateInvestments(state, body));
    if (pathname === "/categories")
      return this.saveAndReturn<TResponse>(state, this.upsertCategory(state, body, method));
    if (pathname === "/plan")
      return this.saveAndReturn<TResponse>(state, this.savePlan(state, body));
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
    await this.save(migrateLocalState(parsed.data));
    return { restored: true } as TResponse;
  }

  private async backup(state: LocalState): Promise<LocalState> {
    return {
      ...state,
      accounts: state.accounts.map((account) => ({ ...account })),
      categories: state.categories.map((category) => ({ ...category })),
      transactions: state.transactions.map((transaction) => ({ ...transaction })),
      budgets: state.budgets.map((budget) => ({ ...budget })),
      goals: state.goals.map((goal) => ({ ...goal })),
      recurringTransactions: state.recurringTransactions.map((transaction) => ({ ...transaction })),
      investments: await this.investments(state),
      importBatches: [...(state.importBatches ?? [])]
    };
  }

  private upsertAccount(state: LocalState, body: unknown, method: "POST" | "PUT") {
    const input = toFormObject(body);
    const requestedCurrency = String(input.currency ?? "").toUpperCase();
    const account = {
      id: method === "PUT" && input.id ? input.id : id("account"),
      name: input.name?.trim() || "Новый счет",
      type: input.type || "DEBIT_CARD",
      balance: Number(input.balance ?? 0),
      // Honour an explicitly chosen supported currency; fall back to the base.
      currency: isSupportedCurrency(requestedCurrency) ? requestedCurrency : state.currency,
      // Savings terms. A blank rate means "no interest", so the fields are
      // dropped rather than stored as zero.
      ...(() => {
        const rate = Number(input.interestRate);
        if (!Number.isFinite(rate) || rate <= 0) return {};
        const period = input.interestCompounding;
        const compounding: AccountRow["interestCompounding"] =
          period === "QUARTERLY" || period === "YEARLY" ? period : "MONTHLY";
        return { interestRate: rate, interestCompounding: compounding };
      })()
    };

    state.accounts =
      method === "PUT"
        ? state.accounts.map((item) => (item.id === account.id ? account : item))
        : [...state.accounts, account];
    state.transactions = state.transactions.map((transaction) =>
      transaction.account.id === account.id
        ? { ...transaction, account: { id: account.id, label: account.name } }
        : transaction
    );
    return account;
  }

  private upsertTransaction(
    state: LocalState,
    body: unknown,
    method: "POST" | "PUT",
    recurringId?: string
  ) {
    const input = toFormObject(body);
    const account = state.accounts.find((item) => item.id === input.accountId && !item.isArchived);
    const category = state.categories.find((item) => item.id === input.categoryId);
    if (!account || !category) throw new Error("Выберите существующий счет и категорию.");

    const previous =
      method === "PUT" && input.id
        ? state.transactions.find((item) => item.id === input.id)
        : undefined;
    if (method === "PUT" && input.id) this.deleteTransaction(state, input.id);

    const amount = Number(input.amount);
    // Checked here because the stored schema demands a positive number: a zero
    // or a stray letter used to be written happily and made the whole document
    // unreadable on the next start.
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Введите сумму больше нуля.");
    const type = input.type === "INCOME" ? "INCOME" : "EXPENSE";
    const linkedRecurringId = recurringId ?? previous?.recurringId;
    const linkedLiabilityId =
      (typeof input.liabilityId === "string" && input.liabilityId) || previous?.liabilityId;
    const tags = String(input.tags ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12);
    const transaction: TransactionRow & { recurringId?: string } = {
      id: method === "PUT" && input.id ? input.id : id("tx"),
      amount,
      type,
      date: new Date(input.date).toISOString(),
      description: input.description?.trim() || null,
      account: { id: account.id, label: account.name },
      category: {
        id: category.id,
        label: category.label,
        color: category.color,
        ...(category.icon ? { icon: category.icon } : {})
      },
      ...(linkedRecurringId ? { recurringId: linkedRecurringId } : {}),
      ...(linkedLiabilityId ? { liabilityId: linkedLiabilityId } : {}),
      ...(tags.length ? { tags } : {}),
      ...(input.splitGroupId ? { splitGroupId: String(input.splitGroupId) } : {}),
      ...(input.transferId ? { transferId: String(input.transferId) } : {})
    };

    state.transactions = [
      transaction,
      ...state.transactions.filter((item) => item.id !== transaction.id)
    ];
    this.applyBalance(state, account.id, type === "INCOME" ? amount : -amount);
    return transaction;
  }

  // Returns budget overflow info when an EXPENSE pushes its category over the limit.
  private budgetWarningFor(
    state: LocalState,
    tx: TransactionRow
  ): { category: string; spent: number; limit: number } | null {
    if (tx.type !== "EXPENSE") return null;
    const budget = state.budgets.find((item) => item.categoryId === tx.category.id);
    if (!budget || budget.limitAmount <= 0) return null;
    const month = tx.date.slice(0, 7);
    const context = baseAmountContext(state.accounts, this.rates(state), state.currency);
    const spent = toBaseRows(state.transactions, context)
      .filter(
        (item) =>
          item.type === "EXPENSE" &&
          item.category.id === tx.category.id &&
          item.date.startsWith(month)
      )
      .reduce((sum, item) => sum + item.amount, 0);
    if (spent > budget.limitAmount) {
      return { category: tx.category.label, spent: roundMoney(spent), limit: budget.limitAmount };
    }
    return null;
  }

  private createTransfer(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const fromAccount = state.accounts.find(
      (item) => item.id === input.fromAccountId && !item.isArchived
    );
    const toAccount = state.accounts.find(
      (item) => item.id === input.toAccountId && !item.isArchived
    );
    const amount = Number(input.amount);

    if (!fromAccount || !toAccount)
      throw new Error("Выберите существующие активные счета для перевода.");
    if (fromAccount.id === toAccount.id)
      throw new Error("Счета списания и зачисления должны отличаться.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Введите сумму больше нуля.");

    const transferId = id("transfer");
    const expenseCategory = this.findOrCreateCategory(state, TRANSFER_CATEGORY_LABEL, "EXPENSE");
    const incomeCategory = this.findOrCreateCategory(state, TRANSFER_CATEGORY_LABEL, "INCOME");
    const description =
      input.description?.trim() || `Перевод ${fromAccount.name} -> ${toAccount.name}`;
    const date = input.date || new Date().toISOString();
    const expense = this.upsertTransaction(
      state,
      {
        amount: String(amount),
        type: "EXPENSE",
        accountId: fromAccount.id,
        categoryId: expenseCategory.id,
        date,
        transferId,
        description: `${description} [transfer:${transferId}]`
      },
      "POST"
    );
    const income = this.upsertTransaction(
      state,
      {
        amount: String(amount),
        type: "INCOME",
        accountId: toAccount.id,
        categoryId: incomeCategory.id,
        date,
        transferId,
        description: `${description} [transfer:${transferId}]`
      },
      "POST"
    );

    return { transferId, transactions: [expense, income] };
  }

  private deleteTransaction(state: LocalState, transactionId: string) {
    const existing = state.transactions.find((item) => item.id === transactionId);
    if (!existing) return;
    this.applyBalance(
      state,
      existing.account.id,
      existing.type === "INCOME" ? -existing.amount : existing.amount
    );
    state.transactions = state.transactions.filter((item) => item.id !== transactionId);
  }

  private applyBalance(state: LocalState, accountId: string, delta: number) {
    state.accounts = state.accounts.map((account) =>
      account.id === accountId
        ? { ...account, balance: roundMoney(account.balance + delta) }
        : account
    );
  }

  private upsertBudget(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const category = state.categories.find(
      (item) => item.id === input.categoryId && item.kind === "EXPENSE"
    );
    if (!category) throw new Error("Выберите расходную категорию.");

    const limit = Number(input.limitAmount);
    if (!Number.isFinite(limit) || limit < 0) throw new Error("Введите лимит от нуля.");
    const monthKey = typeof input.month === "string" && input.month ? input.month : undefined;

    // A zero limit means "reset" — remove the budget for this category.
    if (limit === 0) {
      state.budgets = state.budgets.filter((item) => item.categoryId !== category.id);
      return { removed: true };
    }

    const existing = state.budgets.find((item) => item.categoryId === category.id);
    // Update rollover only when explicitly provided (so saving a limit doesn't
    // silently turn it off). toFormObject stringifies values.
    const rolloverProvided = input.rollover === "true" || input.rollover === "false";
    const rollover = rolloverProvided ? input.rollover === "true" : (existing?.rollover ?? false);

    const row = this.buildBudgetRow(state, category, limit, monthKey, rollover);
    state.budgets = [row, ...state.budgets.filter((item) => item.categoryId !== category.id)];
    return row;
  }

  private upsertGoal(state: LocalState, body: unknown, method: "POST" | "PUT") {
    const input = toFormObject(body);
    const row = recomputeGoal({
      id: method === "PUT" && input.id ? input.id : id("goal"),
      title: input.title?.trim() || "Новая цель",
      targetAmount: Number(input.targetAmount),
      currentAmount: Number(input.currentAmount ?? 0),
      deadline: new Date(input.deadline).toISOString(),
      linkedAccountId: input.linkedAccountId?.trim() || undefined,
      plannedContribution: Math.max(Number(input.plannedContribution ?? 0), 0)
    });
    state.goals =
      method === "PUT"
        ? state.goals.map((item) => (item.id === row.id ? row : item))
        : [...state.goals, row];
    return row;
  }

  private upsertLiability(state: LocalState, body: unknown, method: "POST" | "PUT") {
    const input = toFormObject(body);
    const kindInput = input.kind ?? "";
    const kind = (
      ["CREDIT_CARD", "LOAN", "MORTGAGE", "INSTALLMENT", "OTHER"].includes(kindInput)
        ? kindInput
        : "OTHER"
    ) as LiabilityRow["kind"];
    const balance = Math.max(Number(input.balance ?? 0), 0);
    const dueDayRaw = Number(input.dueDay);
    const stored: Omit<LiabilityRow, "progress"> = {
      id: method === "PUT" && input.id ? input.id : id("debt"),
      name: input.name?.trim() || "Новое обязательство",
      kind,
      balance,
      originalAmount: Math.max(Number(input.originalAmount ?? 0), balance),
      interestRate: Math.max(Number(input.interestRate ?? 0), 0),
      minPayment: Math.max(Number(input.minPayment ?? 0), 0),
      ...(Number.isInteger(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 31
        ? { dueDay: dueDayRaw }
        : {}),
      currency: isSupportedCurrency(input.currency ?? "") ? input.currency : state.currency,
      // Auto-payment settings (v5). Keep lastPaidMonth from the existing record
      // so editing a liability never re-opens an already posted month.
      // FormData sends the checkbox value as the string "true" when ticked.
      autoPay: input.autoPay === "true",
      ...(input.paymentAccountId ? { paymentAccountId: input.paymentAccountId } : {}),
      ...(input.paymentCategoryId ? { paymentCategoryId: input.paymentCategoryId } : {}),
      ...(() => {
        const previous =
          method === "PUT" ? state.liabilities.find((item) => item.id === input.id) : undefined;
        return previous?.lastPaidMonth ? { lastPaidMonth: previous.lastPaidMonth } : {};
      })(),
      // «Погашен» (v6). The form sends it as a checkbox; editing other fields
      // must not silently un-settle a debt, so an absent field keeps the
      // stored value.
      ...(() => {
        const previous =
          method === "PUT" ? state.liabilities.find((item) => item.id === input.id) : undefined;
        if (input.settled === undefined) {
          return previous?.settledAt ? { settledAt: previous.settledAt } : {};
        }
        if (input.settled !== "true") return {};
        return { settledAt: previous?.settledAt ?? new Date().toISOString().slice(0, 10) };
      })()
    };
    state.liabilities =
      method === "PUT"
        ? state.liabilities.map((item) => (item.id === stored.id ? stored : item))
        : [...state.liabilities, stored];
    return recomputeLiability(stored);
  }

  // Top up a goal by moving money from a chosen account into the goal — a
  // transfer to savings, NOT a consumption expense. No income/expense
  // transaction is recorded, so savings rate / monthly expense / budgets are
  // not distorted; the account balance drops and the goal grows, leaving net
  // worth (which counts goal savings) conserved.
  private depositToGoal(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const goal = state.goals.find((item) => item.id === input.goalId);
    if (!goal) throw new Error("Цель не найдена.");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Введите сумму больше нуля.");
    if (!input.accountId) throw new Error("Выберите счёт для пополнения.");
    const account = state.accounts.find((item) => item.id === input.accountId && !item.isArchived);
    if (!account) throw new Error("Выберите существующий активный счёт.");
    if (amount > account.balance) throw new Error("Недостаточно средств на счёте.");

    this.applyBalance(state, account.id, -amount);
    // Spread the goal rather than rebuilding it from five fields: the funding
    // account and the planned contribution live on it too, and listing the
    // fields by hand erased both on every top-up.
    const updated = recomputeGoal({ ...goal, currentAmount: goal.currentAmount + amount });
    state.goals = state.goals.map((item) => (item.id === goal.id ? updated : item));
    return updated;
  }

  private upsertRecurring(state: LocalState, body: unknown, method: "POST" | "PUT") {
    const input = toFormObject(body);
    const account = state.accounts.find((item) => item.id === input.accountId && !item.isArchived);
    const category = state.categories.find((item) => item.id === input.categoryId);
    if (!account || !category) throw new Error("Выберите существующий счет и категорию.");

    const service = new RecurringTransactionService();
    const frequency =
      input.frequency as RecurringTransactionsPageData["recurringTransactions"][number]["frequency"];
    const isActive = input.isActive === "true" || input.isActive === "on";
    const amount = Number(input.amount);
    const type = input.type === "INCOME" ? "INCOME" : "EXPENSE";
    const description = input.description?.trim() || null;
    const accountRef = { id: account.id, label: account.name };
    const categoryRef = { id: category.id, label: category.label, color: category.color };
    const nextDateInput = new Date(input.nextDate);

    if (method === "PUT" && input.id) {
      // A template is a plan, not a record: editing it never rewrites operations
      // that were already posted — those are facts about money that moved.
      const status = service.getStatus({ nextDate: nextDateInput, frequency, isActive });
      const row: LocalState["recurringTransactions"][number] = {
        id: input.id,
        amount,
        type,
        frequency,
        nextDate: nextDateInput.toISOString(),
        description,
        isActive,
        daysUntilNext: status.daysUntilNext,
        isDue: status.isDue,
        account: accountRef,
        category: categoryRef
      };
      state.recurringTransactions = state.recurringTransactions.map((item) =>
        item.id === row.id ? row : item
      );
      return row;
    }

    // POST — create the template only. Planning stays separate from bookkeeping:
    // the operation appears in "Учёт" when the due date arrives (auto-posting or
    // the confirm button), never at the moment the plan is written down.
    const newId = id("recurring");
    const status = service.getStatus({ nextDate: nextDateInput, frequency, isActive });
    const row: LocalState["recurringTransactions"][number] = {
      id: newId,
      amount,
      type,
      frequency,
      nextDate: nextDateInput.toISOString(),
      description,
      isActive,
      daysUntilNext: status.daysUntilNext,
      isDue: status.isDue,
      account: accountRef,
      category: categoryRef
    };
    state.recurringTransactions = [...state.recurringTransactions, row];
    return row;
  }

  private materializeRecurring(state: LocalState, body: unknown) {
    const recurringId = (body as { id?: string })?.id;
    const recurring = state.recurringTransactions.find((item) => item.id === recurringId);
    if (!recurring) throw new Error("Recurring transaction not found.");

    const service = new RecurringTransactionService();
    const status = service.getStatus({
      nextDate: new Date(recurring.nextDate),
      frequency: recurring.frequency,
      isActive: recurring.isActive
    });
    for (const dueDate of status.dueDates) {
      this.upsertTransaction(
        state,
        {
          amount: String(recurring.amount),
          type: recurring.type,
          accountId: recurring.account.id,
          categoryId: recurring.category.id,
          date: dueDate.toISOString(),
          description: recurring.description ?? recurring.category.label
        },
        "POST"
      );
    }
    state.recurringTransactions = state.recurringTransactions.map((item) =>
      item.id === recurring.id
        ? { ...item, nextDate: status.nextDateAfterRun.toISOString(), isDue: false }
        : item
    );
    return { created: status.dueDates.length, nextDate: status.nextDateAfterRun.toISOString() };
  }

  // Materializes every currently-due active template at once (used by opt-in
  // auto-posting on app start). Idempotent: each run advances nextDate past the
  // due dates, so the next run only picks up newly-due templates.
  private materializeAllDue(state: LocalState) {
    const service = new RecurringTransactionService();
    let created = 0;
    for (const recurring of state.recurringTransactions) {
      if (!recurring.isActive) continue;
      const status = service.getStatus({
        nextDate: new Date(recurring.nextDate),
        frequency: recurring.frequency,
        isActive: recurring.isActive
      });
      if (status.dueDates.length === 0) continue;
      // A template whose account was archived or whose category was deleted
      // throws. It must cost only itself: this runs on every start, and one
      // stale template used to silently cancel the whole batch — the caller
      // swallows the error, so nothing was posted and nothing was said.
      let failed = false;
      for (const dueDate of status.dueDates) {
        try {
          this.upsertTransaction(
            state,
            {
              amount: String(recurring.amount),
              type: recurring.type,
              accountId: recurring.account.id,
              categoryId: recurring.category.id,
              date: dueDate.toISOString(),
              description: recurring.description ?? recurring.category.label
            },
            "POST"
          );
          created += 1;
        } catch {
          failed = true;
        }
      }
      // Nothing posted means the template stays due, so a fixed account or
      // category makes it catch up rather than skip the period silently.
      if (failed) continue;
      state.recurringTransactions = state.recurringTransactions.map((item) =>
        item.id === recurring.id
          ? { ...item, nextDate: status.nextDateAfterRun.toISOString(), isDue: false }
          : item
      );
    }
    return { created };
  }

  // Posts the monthly payment for every liability whose due day has arrived and
  // that hasn't been charged this month yet (see lib/debts/auto-pay for the pure
  // rules). Each posting creates a normal EXPENSE transaction — so budgets and
  // analytics see it like any other spending — and reduces the outstanding
  // balance. Idempotent: `lastPaidMonth` stops a second run in the same month.
  private autoPayDebts(state: LocalState) {
    const today = new Date();
    const due = dueLiabilities(state.liabilities, today);
    if (due.length === 0) return { posted: 0 };

    const fallbackAccount = state.accounts.find((account) => !account.isArchived);
    const fallbackCategory = state.categories.find((category) => category.kind === "EXPENSE");
    let posted = 0;

    for (const liability of due) {
      const accountId =
        state.accounts.find(
          (account) => account.id === liability.paymentAccountId && !account.isArchived
        )?.id ?? fallbackAccount?.id;
      const categoryId =
        state.categories.find(
          (category) => category.id === liability.paymentCategoryId && category.kind === "EXPENSE"
        )?.id ?? fallbackCategory?.id;
      // Without an account or an expense category there is nowhere to post.
      if (!accountId || !categoryId) continue;

      const amount = paymentAmount(liability);
      if (amount <= 0) continue;

      this.upsertTransaction(
        state,
        {
          amount: String(amount),
          type: "EXPENSE",
          accountId,
          categoryId,
          date: today.toISOString(),
          description: liability.name,
          liabilityId: liability.id
        },
        "POST"
      );

      state.liabilities = state.liabilities.map((item) =>
        item.id === liability.id
          ? {
              ...item,
              balance: Math.max(0, Math.round((item.balance - amount) * 100) / 100),
              lastPaidMonth: monthKey(today)
            }
          : item
      );
      posted += 1;
    }

    return { posted };
  }

  private importCsvRows(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const rows = JSON.parse(input.rows || "[]") as Array<Record<string, unknown>>;
    // A fresh profile has no accounts, and the import used to stop there — with
    // an English sentence, on a screen that had already read the file and shown
    // which account every row belongs to. The names in the file are enough to
    // make the accounts, the same way the categories in it are made.
    let fallbackAccount = state.accounts.find((account) => !account.isArchived);

    let imported = 0;
    let skipped = 0;
    const transactionIds: string[] = [];
    for (const row of rows) {
      const rawAmount = parseImportedAmount(row[input.amountColumn]);
      const date = parseImportedDate(row[input.dateColumn]);
      if (rawAmount === null || rawAmount === 0 || !date) {
        skipped += 1;
        continue;
      }
      const type = rawAmount >= 0 ? "INCOME" : "EXPENSE";
      const accountName = String(row[input.accountColumn ?? ""] ?? "").trim();
      const account = accountName
        ? this.findOrCreateAccount(state, accountName)
        : (fallbackAccount ?? this.findOrCreateAccount(state, DEFAULT_IMPORT_ACCOUNT));
      // Rows without an account of their own follow the first one there is —
      // including one this import has just made.
      fallbackAccount = fallbackAccount ?? account;
      const rawCategoryName = String(row[input.categoryColumn ?? ""] ?? "").trim();
      const description = String(row[input.descriptionColumn ?? ""] ?? "").trim();
      // When the CSV row carries no category, try to auto-categorize it from
      // the description against existing transactions before falling back to a
      // generic import bucket.
      let category;
      if (rawCategoryName) {
        category = this.findOrCreateCategory(state, rawCategoryName, type);
      } else {
        const suggestedId = suggestCategoryId(description, state.transactions, {
          type,
          rules: state.rules
        });
        category =
          (suggestedId
            ? state.categories.find((item) => item.id === suggestedId && item.kind === type)
            : undefined) ??
          this.findOrCreateCategory(
            state,
            type === "INCOME" ? "Импорт доходов" : "Импорт расходов",
            type
          );
      }
      const duplicate = state.transactions.some((transaction) => {
        return (
          transaction.account.id === account.id &&
          transaction.category.id === category.id &&
          transaction.type === type &&
          transaction.amount === Math.abs(rawAmount) &&
          transaction.date.slice(0, 10) === date.toISOString().slice(0, 10) &&
          (transaction.description ?? "") === description
        );
      });
      if (duplicate) {
        skipped += 1;
        continue;
      }
      const created = this.upsertTransaction(
        state,
        {
          amount: String(Math.abs(rawAmount)),
          type,
          accountId: account.id,
          categoryId: category.id,
          date: date.toISOString(),
          description
        },
        "POST"
      );
      transactionIds.push(created.id);
      imported += 1;
    }
    if (transactionIds.length > 0) {
      state.importBatches = [
        { id: id("import"), importedAt: new Date().toISOString(), transactionIds },
        ...(state.importBatches ?? []).slice(0, 9)
      ];
    }
    return { imported, skipped };
  }

  private undoLastImport(state: LocalState) {
    const [batch, ...rest] = state.importBatches ?? [];
    if (!batch) return { removed: 0 };
    let removed = 0;
    for (const transactionId of batch.transactionIds) {
      const before = state.transactions.length;
      this.deleteTransaction(state, transactionId);
      if (state.transactions.length < before) removed += 1;
    }
    state.importBatches = rest;
    return { removed, importBatchId: batch.id };
  }

  /**
   * The account a CSV row names, made if it is not there yet. Balances follow
   * from the operations posted onto it, so a new account starts at zero and
   * ends up holding exactly what was imported into it.
   */
  private findOrCreateAccount(state: LocalState, name: string) {
    const label = name.trim().slice(0, 60) || DEFAULT_IMPORT_ACCOUNT;
    const existing = state.accounts.find(
      (item) => !item.isArchived && item.name.toLowerCase() === label.toLowerCase()
    );
    if (existing) return existing;
    const account = {
      id: id("account"),
      name: label,
      type: "DEBIT_CARD" as const,
      balance: 0,
      currency: state.currency
    };
    state.accounts = [...state.accounts, account];
    return account;
  }

  private findOrCreateCategory(state: LocalState, label: string, kind: "INCOME" | "EXPENSE") {
    const existing = state.categories.find(
      (item) => item.kind === kind && item.label.toLowerCase() === label.toLowerCase()
    );
    if (existing) return existing;
    const category = {
      id: id("cat"),
      label,
      kind,
      color: kind === "INCOME" ? "#7ed6b7" : DEFAULT_CATEGORY_COLOR
    } satisfies CategoryOption;
    state.categories = [...state.categories, category];
    return category;
  }

  private updateSettings(state: LocalState, body: unknown) {
    // Partial update: only fields actually present in the payload are changed,
    // so a single-field save (e.g. the sidebar theme toggle sending just
    // { theme }) does not reset every other setting to its default.
    const raw = (body ?? {}) as Record<string, unknown>;
    const input = toFormObject(body);
    if (raw.demoMode !== undefined) {
      state.demoMode = raw.demoMode === true || raw.demoMode === "true" || raw.demoMode === "on";
    }
    if (input.riskProfileCode) {
      state.riskProfileCode = input.riskProfileCode as LocalState["riskProfileCode"];
    }
    if (input.currency && isSupportedCurrency(input.currency)) {
      state.currency = input.currency;
      // Single-currency model: keep every account on the app currency so the
      // displayed currency stays consistent. Amounts are not converted — only
      // the currency label changes (no invented FX rates).
      state.accounts = state.accounts.map((account) => ({
        ...account,
        currency: state.currency
      }));
    }
    if (input.emergencyFundMonthsTarget !== undefined && input.emergencyFundMonthsTarget !== "") {
      state.emergencyFundMonthsTarget = Number(input.emergencyFundMonthsTarget);
    }
    if (input.theme && ["light", "dark", "system"].includes(input.theme)) {
      state.theme = input.theme as LocalState["theme"];
    }
    if (input.density && ["comfortable", "compact"].includes(input.density)) {
      state.density = input.density as LocalState["density"];
    }
    if (
      input.defaultTransactionType &&
      ["INCOME", "EXPENSE"].includes(input.defaultTransactionType)
    ) {
      state.defaultTransactionType =
        input.defaultTransactionType as LocalState["defaultTransactionType"];
    }
    if (raw.autoMaterializeRecurring !== undefined) {
      state.autoMaterializeRecurring =
        raw.autoMaterializeRecurring === true ||
        raw.autoMaterializeRecurring === "true" ||
        raw.autoMaterializeRecurring === "on";
    }
    if (raw.paymentReminders !== undefined) {
      state.paymentReminders =
        raw.paymentReminders === true ||
        raw.paymentReminders === "true" ||
        raw.paymentReminders === "on";
    }
    if (raw.aiEnabled !== undefined) {
      state.aiEnabled =
        raw.aiEnabled === true || raw.aiEnabled === "true" || raw.aiEnabled === "on";
    }
    if (raw.aiProvider !== undefined) {
      // Only accept a string; anything else falls back to the default provider
      // (avoids stringifying an object to "[object Object]").
      state.aiProvider =
        typeof raw.aiProvider === "string" ? raw.aiProvider.trim() || "anthropic" : "anthropic";
    }
    if (raw.aiEffort !== undefined) {
      state.aiEffort =
        typeof raw.aiEffort === "string" ? raw.aiEffort.trim() || "medium" : "medium";
    }
    if (raw.aiApiKey !== undefined) {
      state.aiApiKey = String(raw.aiApiKey ?? "").trim();
    }
    if (raw.aiModel !== undefined) {
      state.aiModel = String(raw.aiModel ?? "").trim();
    }
    return this.settings(state);
  }

  private async updateInvestments(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const action = input.action ?? "";
    const provider = createMarketDataProvider();
    // An explicit refresh should bypass the cache for genuinely fresh quotes.
    if (action === "refreshMarket") await provider.updateMarketPrices();
    const securities = await provider.getSecurities();
    const ticker = input.ticker?.toUpperCase();
    const marketSource = process.env.NEXT_PUBLIC_MARKET_DATA === "moex" ? "MOEX ISS" : "MOCK";

    if (action === "refreshMarket") {
      state.investments = await this.investments(state);
      return { updated: securities.length, source: marketSource };
    }

    if (action === "addWatchlist") {
      if (!ticker) throw new Error("Ticker is required.");
      // The search spans the whole MOEX board, so a picked ticker may be outside
      // the curated list — resolve it live before giving up.
      const security =
        securities.find((item) => item.ticker === ticker) ??
        (await provider.getSecurityByTicker(ticker));
      if (!security) throw new Error("Security not found in the market directory.");
      const exists = state.investments.watchlist.some((item) => item.ticker === ticker);
      state.investments.watchlist = exists
        ? state.investments.watchlist
        : [...state.investments.watchlist, security];
      state.investments = await this.investments(state);
      return state.investments.watchlist.find((item) => item.ticker === ticker);
    }

    if (action === "removeWatchlist") {
      if (!ticker) throw new Error("Ticker is required.");
      state.investments.watchlist = state.investments.watchlist.filter(
        (item) => item.ticker !== ticker
      );
      state.investments = await this.investments(state);
      return undefined;
    }

    if (action === "delete") {
      if (!ticker) throw new Error("Ticker is required.");
      state.investments.portfolio = state.investments.portfolio.filter(
        (item) => item.ticker !== ticker
      );
      state.investments = await this.investments(state);
      return undefined;
    }

    if (!ticker) throw new Error("Ticker is required.");
    const security =
      securities.find((item) => item.ticker === ticker) ??
      (await provider.getSecurityByTicker(ticker));
    if (!security) throw new Error("Security not found in the market directory.");

    // The form sends EITHER a list of purchases (the app works out the weighted
    // average) OR a quantity and an average typed in by hand. Lots win when both
    // arrive, because they are the source the average is derived from.
    const lots = parsePurchaseLots(input.lots);
    const fromLots = lots.length > 0 ? summarizeLots(lots) : null;
    const quantity = fromLots ? fromLots.quantity : Number(input.quantity);
    const averageBuyPrice = fromLots ? fromLots.averageBuyPrice : Number(input.averageBuyPrice);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new Error("Введите количество больше нуля.");
    if (!Number.isFinite(averageBuyPrice) || averageBuyPrice <= 0)
      throw new Error("Введите среднюю цену больше нуля.");

    // The industry can be corrected by hand: the market directory knows the
    // liquid names, and a bond or a fresh listing is nobody's to classify but
    // the owner's. Choosing what the directory already says stores nothing.
    const typedSector = String(input.sector ?? "").trim();
    const existing = state.investments.portfolio.find((item) => item.ticker === ticker);
    const sectorOverride =
      typedSector && typedSector !== security.sector
        ? typedSector
        : typedSector
          ? undefined
          : existing?.sectorOverride;

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
    state.investments = await this.investments(state);
    return state.investments.portfolio.find((item) => item.ticker === ticker);
  }

  // Cached FX table (RUB per unit) for cross-currency aggregation. Falls back to
  // the built-in defaults if a refresh has not populated it yet.
  private rates(state: LocalState): CurrencyRates {
    const rates = state.currencyRates;
    return rates && Object.keys(rates).length > 0 ? rates : DEFAULT_CURRENCY_RATES;
  }

  // Sums a list of {balance, currency} items into the base currency (RUB) so a
  // mixed-currency total is a single honest number, not raw digits added up.
  private sumInBase(
    state: LocalState,
    items: Array<{ balance: number; currency: string }>
  ): number {
    const rates = this.rates(state);
    return roundMoney(
      items.reduce((sum, item) => sum + toBaseAmount(item.balance, item.currency, rates), 0)
    );
  }

  private accounts(state: LocalState): AccountsPageData {
    const accounts = state.accounts.filter((account) => !account.isArchived);
    return {
      source: "database",
      accounts,
      totalBalance: this.sumInBase(state, accounts),
      currency: state.currency
    };
  }

  // Realized investment events (desktop tax ledger): sells and dividends.
  private investmentEventsPage(state: LocalState): {
    events: RealizedInvestmentEvent[];
    currency: string;
  } {
    return { events: state.realizedInvestmentEvents ?? [], currency: state.currency };
  }

  private addRealizedEvent(state: LocalState, body: unknown): RealizedInvestmentEvent {
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
    return event;
  }

  private addExpectedDividend(state: LocalState, body: unknown): ExpectedDividend {
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
  private addMarketAlert(state: LocalState, body: unknown): MarketAlert {
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
  private setTargetAllocations(state: LocalState, body: unknown): { targets: TargetAllocation[] } {
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

  // Merges a fresh FX table (RUB per unit, fetched client-side from the CBR feed)
  // into the cached rates. Only positive finite rates for supported currencies
  // are accepted; RUB stays pinned to 1. Records the refresh time so the UI can
  // show how fresh the numbers are.
  private updateFxRates(
    state: LocalState,
    body: unknown
  ): { updatedAt: string; rates: CurrencyRates } {
    const incoming = (body as { rates?: Record<string, unknown> } | undefined)?.rates ?? {};
    const next: CurrencyRates = { ...this.rates(state), RUB: 1 };
    for (const [code, value] of Object.entries(incoming)) {
      if (!isSupportedCurrency(code) || code === "RUB") continue;
      const rate = Number(value);
      if (Number.isFinite(rate) && rate > 0) next[code] = rate;
    }
    state.currencyRates = next;
    state.currencyRatesUpdatedAt = new Date().toISOString();
    return { updatedAt: state.currencyRatesUpdatedAt, rates: next };
  }

  private transactions(state: LocalState, searchParams: URLSearchParams): TransactionsPageData {
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") || 20)));
    const criteria = criteriaFromParams(searchParams);
    const filters = {
      from: criteria.from,
      to: criteria.to,
      type: criteria.type ?? "ALL",
      categoryId: searchParams.get("categoryId") || undefined,
      accountId: criteria.accountId,
      q: criteria.q,
      minAmount: criteria.minAmount,
      maxAmount: criteria.maxAmount,
      page,
      limit
    };
    const filtered = [...state.transactions]
      .filter((transaction) => matchesCriteria(transaction, criteria))
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const start = (page - 1) * limit;

    // The rows keep the amount as it was recorded — a dollar operation reads
    // as dollars — and carry what it is worth in the base currency beside it,
    // so the totals above the list add up like every other total in the app.
    const context = baseAmountContext(state.accounts, this.rates(state), state.currency);
    const rows = filtered.slice(start, start + limit).map((row) => {
      const base = baseAmountOf(row, context);
      return base === row.amount ? row : { ...row, baseAmount: base };
    });

    return {
      source: "database",
      transactions: rows,
      accounts: this.accounts(state).accounts,
      categories: state.categories,
      rules: state.rules,
      filters,
      pagination: {
        page,
        limit,
        total: filtered.length,
        hasPreviousPage: page > 1,
        hasNextPage: start + limit < filtered.length
      }
    };
  }

  private budgets(state: LocalState, month?: string): BudgetsPageData {
    // "2026-08-01" parses as UTC midnight, and the key is read back in local
    // time — west of Greenwich that is the previous month.
    const targetDate = month ? monthStart(month) : new Date();
    const selectedMonth = monthKeyOf(targetDate);
    const budgets = this.budgetRows(state, selectedMonth);
    const finance = this.financeInput(state);
    return {
      source: "database",
      budgets,
      categories: state.categories,
      recommendations: new FinanceRecommendationService()
        .build(finance, getClientLocale())
        .filter((item) => ["WARNING", "CRITICAL", "INFO"].includes(item.severity)),
      currency: state.currency,
      selectedMonth
    };
  }

  /** Amounts are expected in the base currency already — see `inBase`. */
  private spentInMonth(state: LocalState, categoryId: string, monthKey: string): number {
    return state.transactions
      .filter(
        (transaction) =>
          transaction.type === "EXPENSE" &&
          transaction.category.id === categoryId &&
          transaction.date.startsWith(monthKey)
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }

  private buildBudgetRow(
    state: LocalState,
    category: CategoryOption,
    limitAmount: number,
    monthKey?: string,
    rollover = false
  ): BudgetsPageData["budgets"][number] {
    const now = new Date();
    const month = monthKey ?? monthKeyOf(now);
    const spent = this.spentInMonth(state, category.id, month);
    // Previous month (single-month carryover); desktop stores one limit per
    // category, so the previous limit equals the current limit.
    const [y, m] = month.split("-").map(Number);
    const prevMonthKey = monthKeyOf(new Date(y, m - 2, 1));
    const carried = rolloverCarry(
      rollover,
      limitAmount,
      this.spentInMonth(state, category.id, prevMonthKey)
    );
    const effective = effectiveLimit(limitAmount, carried);
    return {
      id: `budget-${category.id}`,
      categoryId: category.id,
      category: category.label,
      color: category.color,
      limitAmount,
      spent: roundMoney(spent),
      rollover,
      rolloverAmount: carried,
      progress: effective > 0 ? clamp(percent(spent, effective), 0, 140) : 0,
      isExceeded: effective > 0 && spent > effective,
      suggestedLimit: suggestedLimitFor(category.id, state.transactions, {
        now: monthKey ? new Date(`${monthKey}-01`) : now
      })
    };
  }

  private budgetRows(state: LocalState, monthKey?: string) {
    return state.categories
      .filter((category) => category.kind === "EXPENSE")
      .map((category) => {
        const existing = state.budgets.find((budget) => budget.categoryId === category.id);
        return this.buildBudgetRow(
          state,
          category,
          existing?.limitAmount ?? 0,
          monthKey,
          existing?.rollover ?? false
        );
      });
  }

  private goals(state: LocalState): GoalsPageData {
    return { source: "database", goals: state.goals.map(recomputeGoal), currency: state.currency };
  }

  private debts(state: LocalState): LiabilitiesPageData {
    const liabilities = state.liabilities.map(recomputeLiability);
    return {
      source: "database",
      liabilities,
      // Repaid debts stay in the list as history but are no longer owed.
      total: this.sumInBase(state, activeDebts(liabilities)),
      currency: state.currency
    };
  }

  private rulesPage(state: LocalState): RulesPageData {
    return {
      source: "database",
      rules: state.rules,
      categories: state.categories.map((category) => ({
        id: category.id,
        label: category.label,
        kind: category.kind
      }))
    };
  }

  private addRule(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const match = input.match?.trim();
    const categoryId = input.categoryId?.trim();
    if (!match || !categoryId) throw new Error("Укажите текст и категорию для правила.");
    if (!state.categories.some((category) => category.id === categoryId)) {
      throw new Error("Выберите существующую категорию.");
    }
    const rule: CategorizationRule = { id: id("rule"), match, categoryId };
    state.rules = [rule, ...state.rules];
    return rule;
  }

  private recurring(state: LocalState): RecurringTransactionsPageData {
    const service = new RecurringTransactionService();
    const context = baseAmountContext(state.accounts, this.rates(state), state.currency);
    const rows = service.sortUpcoming(
      state.recurringTransactions.map((item) => {
        const status = service.getStatus({
          nextDate: new Date(item.nextDate),
          frequency: item.frequency,
          isActive: item.isActive
        });
        const base = baseAmountOf(item, context);
        return {
          ...item,
          daysUntilNext: status.daysUntilNext,
          isDue: status.isDue,
          ...(base === item.amount ? {} : { baseAmount: base })
        };
      })
    );
    const active = rows.filter((row) => row.isActive);
    const monthly = (type: "INCOME" | "EXPENSE") =>
      active
        .filter((row) => row.type === type)
        .reduce(
          (sum, row) =>
            sum +
            countableAmount(row) *
              (row.frequency === "WEEKLY" ? 4.33 : row.frequency === "YEARLY" ? 1 / 12 : 1),
          0
        );
    // Debts with a due day are scheduled obligations — they belong here too,
    // otherwise the due day entered on the debts page has no visible effect.
    const debtPayments = plannedDebtPayments(activeDebts(state.liabilities ?? []));
    // Savings interest is the mirror image: money the plan will ADD, on dates
    // that follow from the rate and the capitalisation period.
    const interestAccruals = upcomingInterest(this.accounts(state).accounts);
    return {
      source: "database",
      recurringTransactions: rows,
      accounts: this.accounts(state).accounts,
      categories: state.categories,
      budgetHints: state.budgets.map((budget) => ({
        categoryId: budget.categoryId,
        amount: budget.limitAmount
      })),
      debtPayments,
      interestAccruals,
      currency: state.currency,
      summary: {
        activeCount: active.length + debtPayments.length,
        dueCount:
          active.filter((row) => row.isDue).length +
          debtPayments.filter((payment) => payment.isDue).length,
        nextSevenDaysAmount: roundMoney(
          active
            .filter((row) => row.isDue || row.daysUntilNext <= 7)
            .reduce((sum, row) => sum + row.amount, 0) +
            debtPayments
              .filter((payment) => payment.isDue || payment.daysUntilNext <= 7)
              .reduce((sum, payment) => sum + payment.amount, 0)
        ),
        monthlyPlannedIncome: roundMoney(
          monthly("INCOME") + monthlyInterestAverage(interestAccruals)
        ),
        monthlyPlannedExpense: roundMoney(
          monthly("EXPENSE") + plannedDebtMonthlyTotal(debtPayments)
        )
      }
    };
  }

  private forecast(state: LocalState): ForecastPageData {
    const rates = this.rates(state);
    return new CashflowForecastService().build(
      {
        source: "database",
        currency: state.currency,
        // Balances converted to the base currency first: the forecast adds them
        // up, and 1 000 $ counted as 1 000 ₽ corrupts every point on the chart.
        accounts: this.accounts(state).accounts.map((account) => ({
          ...account,
          balance: toBaseAmount(account.balance, account.currency, rates),
          currency: state.currency
        })),
        recurringTransactions: this.recurring(state).recurringTransactions,
        goals: this.goals(state).goals,
        liabilities: state.liabilities.map(recomputeLiability)
      },
      getClientLocale()
    );
  }

  private async investments(state: LocalState): Promise<InvestmentData> {
    const provider = createMarketDataProvider();
    const securities = await provider.getSecurities();
    const securityByTicker = new Map(securities.map((security) => [security.ticker, security]));
    const watchlist = state.investments.watchlist
      .map((item) => securityByTicker.get(item.ticker) ?? item)
      .filter((item, index, rows) => rows.findIndex((row) => row.ticker === item.ticker) === index)
      .sort((left, right) => left.ticker.localeCompare(right.ticker));

    // A position may hold a security outside the curated board — the "add
    // position" dialog searches the WHOLE MOEX board. Resolve those tickers
    // live (the board snapshot is shared and cached, so this is cheap) so their
    // price stays fresh; if the market is unreachable we keep the stored
    // snapshot. Dropping unknown tickers here used to make a just-saved
    // position disappear the moment it was written.
    const unresolved = [
      ...new Set(
        state.investments.portfolio
          .map((position) => position.ticker)
          .filter((ticker) => !securityByTicker.has(ticker))
      )
    ];
    await Promise.all(
      unresolved.map(async (ticker) => {
        const resolved = await provider.getSecurityByTicker(ticker).catch(() => null);
        if (resolved) securityByTicker.set(resolved.ticker, resolved);
      })
    );

    const rowsWithoutShare = state.investments.portfolio.map((position) => {
      const security = securityByTicker.get(position.ticker);
      const price = security && security.price > 0 ? security.price : position.currentPrice;
      const currentValue = roundMoney(price * position.quantity);
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
        pnl: roundMoney((price - position.averageBuyPrice) * position.quantity),
        share: 0,
        risk: security?.risk ?? position.risk,
        // The purchases the average was derived from travel with the position.
        ...(position.lots?.length ? { lots: position.lots } : {})
      };
    });
    const total = rowsWithoutShare.reduce((sum, row) => sum + row.currentValue, 0);
    const portfolio = rowsWithoutShare.map((row) => ({
      ...row,
      share: total > 0 ? percent(row.currentValue, total) : 0
    }));
    const historical: Record<string, number[]> = {};
    for (const row of portfolio) {
      historical[row.ticker] = (
        await provider.getHistoricalPrices(row.ticker, subMonths(new Date(), 1), new Date())
      ).map((item) => item.price);
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
      education: analysis.education
    };
  }

  // Builds a fully-populated example state (accounts, categories, transactions,
  // budgets, goals) from the shared sample dataset, so a new user can explore a
  // realistic app in one click.
  private buildSampleState(): LocalState {
    const accounts = SAMPLE_ACCOUNTS.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency
    }));
    const categories: CategoryOption[] = SAMPLE_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      kind: category.kind,
      color: category.color,
      ...(category.isEssential ? { isEssential: true } : {}),
      ...(category.isSubscription ? { isSubscription: true } : {})
    }));
    const transactions = SAMPLE_TRANSACTIONS.map((tx, index) => {
      const account = accounts.find((item) => item.id === tx.accountId)!;
      const category = categories.find((item) => item.id === tx.categoryId)!;
      return {
        id: `sample-tx-${index}`,
        amount: tx.amount,
        type: tx.type,
        date: sampleDate(tx.monthOffset, tx.day).toISOString(),
        description: tx.description,
        account: { id: account.id, label: account.name },
        category: { id: category.id, label: category.label, color: category.color }
      };
    });
    const goals = SAMPLE_GOALS.map((goal) =>
      recomputeGoal({
        id: goal.id,
        title: goal.title,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        deadline: sampleDeadline(goal.monthsToDeadline).toISOString()
      })
    );

    const state: LocalState = {
      ...createInitialState(),
      accounts,
      categories,
      transactions,
      goals
    };
    state.budgets = SAMPLE_BUDGETS.map((budget) => {
      const category = categories.find((item) => item.id === budget.categoryId);
      return category ? this.buildBudgetRow(state, category, budget.limitAmount) : null;
    }).filter((row): row is NonNullable<typeof row> => row !== null);
    return state;
  }

  // Current net worth (liquid + portfolio + goals − debts) — used by the
  // dashboard and the daily snapshot recorder (plan B7).
  private async computeNetWorthValue(state: LocalState): Promise<number> {
    const totalBalance = this.accounts(state).totalBalance;
    const portfolioValue = await this.portfolioValue(state);
    const goalSavings = roundMoney(state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0));
    const liabilitiesTotal = this.sumInBase(state, activeDebts(state.liabilities));
    return computeNetWorth({ totalBalance, portfolioValue, goalSavings, liabilitiesTotal });
  }

  // Records today's net worth snapshot (idempotent per day). Called once on app
  // load via the automation runner so the capital trend reflects real values.
  private async recordNetWorthSnapshot(state: LocalState) {
    const value = await this.computeNetWorthValue(state);
    state.netWorthSnapshots = recordSnapshot(
      state.netWorthSnapshots ?? [],
      isoDay(new Date()),
      value
    );
    return { recorded: true, value };
  }

  // The same state with transfers between own accounts left out of the
  // operations, so everything derived downstream — month totals, category
  // breakdowns, budget spending, the health score — counts the same rows. The
  // balances are untouched, and so is capital: a transfer never changed them.
  /**
   * The same document with every operation's amount expressed in the base
   * currency.
   *
   * An operation is stored in the currency of its account — a dollar card keeps
   * 100, not what that is worth in roubles. Balances were converted before they
   * were summed; operations were not, so every total built on them added
   * dollars to roubles as though they were the same unit. The conversion
   * happens here, once, on the way into the read paths; a ledger already in one
   * currency is handed back untouched and pays nothing for this.
   */
  private inBase(state: LocalState): LocalState {
    const context = baseAmountContext(state.accounts, this.rates(state), state.currency);
    if (isSingleCurrency(context)) return state;

    return {
      ...state,
      transactions: toBaseRows(state.transactions, context),
      // A recurring template spends from the same account, so it carries the
      // same currency and the forecast needs it converted too.
      recurringTransactions: state.recurringTransactions.map((row) => {
        const amount = baseAmountOf({ amount: row.amount, account: row.account }, context);
        return amount === row.amount ? row : { ...row, amount };
      })
    };
  }

  private countingState(state: LocalState, includeTransfers: boolean): LocalState {
    if (includeTransfers) return state;
    return { ...state, transactions: countableRows(state.transactions, false) };
  }

  private async dashboard(state: LocalState): Promise<DashboardData> {
    const finance = this.financeInput(state, true);
    const totalBalance = this.accounts(state).totalBalance;
    const portfolioValue = await this.portfolioValue(state);
    // Goal savings are money the user set aside from accounts, so they stay
    // part of net worth (a deposit just moves it from a balance into a goal).
    const goalSavings = roundMoney(state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0));
    const liabilitiesTotal = this.sumInBase(state, activeDebts(state.liabilities));
    const netWorth = computeNetWorth({
      totalBalance,
      portfolioValue,
      goalSavings,
      liabilitiesTotal
    });
    const netWorthTrend = buildNetWorthTrend({
      currentNetWorth: netWorth,
      snapshots: state.netWorthSnapshots ?? [],
      transactions: state.transactions
    });
    const savingsBalance = this.sumInBase(
      state,
      // Archived accounts are outside capital, so they cannot back the
      // emergency fund either — the two figures have to agree.
      state.accounts.filter((account) => account.type === "SAVINGS" && !account.isArchived)
    );
    const averageMonthlyExpense =
      finance.monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) /
      Math.max(finance.monthlyCashflow.length, 1);
    const emergencyFund = buildEmergencyFund({
      savingsBalance,
      averageMonthlyExpense,
      targetMonths: state.emergencyFundMonthsTarget
    });
    const recommendationService = new FinanceRecommendationService();
    const locale = getClientLocale();
    const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
    return {
      source: "database",
      currency: state.currency,
      metrics: [
        {
          key: "totalBalance",
          title: t("svc.metric.totalBalance"),
          value: formatCurrency(totalBalance, currency),
          detail: t("svc.metric.totalBalance.detail")
        },
        {
          key: "monthIncome",
          title: t("svc.metric.monthIncome"),
          value: formatCurrency(finance.currentMonthIncome, currency),
          detail: t("svc.metric.month.detail"),
          tone: "success",
          spark: finance.monthlyCashflow.map((month) => month.income)
        },
        {
          key: "monthExpense",
          title: t("svc.metric.monthExpense"),
          value: formatCurrency(finance.currentMonthExpense, currency),
          detail: t("svc.metric.month.detail"),
          tone: "warning",
          spark: finance.monthlyCashflow.map((month) => month.expense)
        },
        {
          key: "freeCash",
          title: t("svc.metric.freeCash"),
          value: formatCurrency(finance.freeCashflow, currency),
          detail: t("svc.metric.freeCash.detail"),
          tone: finance.freeCashflow >= 0 ? "success" : "danger"
        }
      ],
      categoryExpenses: this.budgetRows(state)
        .filter((budget) => budget.spent > 0)
        .map((budget) => ({ name: budget.category, value: budget.spent, fill: budget.color })),
      // Where the money came from, alongside where it went. Expenses are read
      // off the budget rows; income has no budgets, so it is summed directly.
      categoryIncome: categoryBreakdown(state.transactions, {
        type: "INCOME",
        month: monthKeyOf(new Date()),
        colorOf: (categoryId) => state.categories.find((item) => item.id === categoryId)?.color
      }),
      monthlyCashflow: finance.monthlyCashflow,
      recommendations: recommendationService.build(finance, locale),
      health: recommendationService.healthScore(finance, locale),
      netWorth,
      liabilitiesTotal,
      netWorthBreakdown: buildNetWorthBreakdown({
        totalBalance,
        portfolioValue,
        goalSavings,
        liabilitiesTotal
      }),
      netWorthTrend,
      emergencyFund
    };
  }

  // Current market value of the investment portfolio (0 when empty).
  private async portfolioValue(state: LocalState): Promise<number> {
    if (!state.investments.portfolio.length) return 0;
    const provider = createMarketDataProvider();
    const securities = await provider.getSecurities();
    const priceByTicker = new Map(securities.map((security) => [security.ticker, security.price]));
    return roundMoney(
      state.investments.portfolio.reduce((sum, position) => {
        const price = priceByTicker.get(position.ticker) ?? position.currentPrice;
        return sum + price * position.quantity;
      }, 0)
    );
  }

  private settings(state: LocalState): SettingsPageData {
    return {
      source: "database",
      currency: state.currency,
      demoMode: state.demoMode,
      emergencyFundMonthsTarget: state.emergencyFundMonthsTarget,
      riskProfileCode: state.riskProfileCode,
      theme: state.theme ?? "system",
      density: state.density ?? "comfortable",
      defaultTransactionType: state.defaultTransactionType ?? "EXPENSE",
      autoMaterializeRecurring: state.autoMaterializeRecurring ?? false,
      paymentReminders: state.paymentReminders ?? false,
      aiEnabled: state.aiEnabled ?? false,
      aiProvider: state.aiProvider ?? "anthropic",
      aiEffort: state.aiEffort ?? "medium",
      aiApiKey: state.aiApiKey ?? "",
      aiModel: state.aiModel ?? "",
      currencyRatesUpdatedAt: state.currencyRatesUpdatedAt ?? null,
      riskProfiles: [
        {
          id: "risk-conservative",
          code: "CONSERVATIVE",
          title: RISK_PROFILE_LABELS.CONSERVATIVE,
          description: "Стабильность и контроль просадки."
        },
        {
          id: "risk-moderate",
          code: "MODERATE",
          title: RISK_PROFILE_LABELS.MODERATE,
          description: "Баланс роста и риска."
        },
        {
          id: "risk-aggressive",
          code: "AGGRESSIVE",
          title: RISK_PROFILE_LABELS.AGGRESSIVE,
          description: "Готовность к заметной волатильности."
        }
      ]
    };
  }

  private importReferences(state: LocalState): ImportPageData {
    return {
      source: "database",
      accounts: this.accounts(state).accounts,
      categories: state.categories,
      lastBackupAt: state.lastBackupAt,
      backupReminderDue: isBackupReminderDue(state.lastBackupAt)
    };
  }

  private categoriesPage(state: LocalState): CategoriesPageData {
    const categories: CategoryRow[] = state.categories.map((cat) => ({
      id: cat.id,
      name: cat.label,
      kind: cat.kind,
      color: cat.color,
      icon: cat.icon,
      isEssential: cat.isEssential ?? false,
      isSubscription: cat.isSubscription ?? false,
      transactionCount: state.transactions.filter((t) => t.category.id === cat.id).length
    }));
    return { source: "database", categories };
  }

  // Plan versus fact, laid out the way the owner's own spreadsheet is: every
  // category is a column, every month a row, in three bands — what was
  // intended, what the ledger holds, and the gap between them. Only the plan is
  // typed in; the other two bands are read off the operations, so the grid can
  // never disagree with the ledger.
  private planFactPage(state: LocalState, ahead = 0, includeTransfers = false): PlanFactPageData {
    // Both sides collected as month → category → amount, so a month row is one
    // lookup rather than another pass over every operation.
    const fact = new Map<string, Map<string, number>>();
    for (const transaction of countableRows(state.transactions, includeTransfers)) {
      const month = transaction.date.slice(0, 7);
      const byCategory = fact.get(month) ?? new Map<string, number>();
      byCategory.set(
        transaction.category.id,
        (byCategory.get(transaction.category.id) ?? 0) + transaction.amount
      );
      fact.set(month, byCategory);
    }

    const plan = new Map<string, Map<string, number>>();
    for (const entry of state.plans) {
      const byCategory = plan.get(entry.month) ?? new Map<string, number>();
      byCategory.set(entry.categoryId, entry.amount);
      plan.set(entry.month, byCategory);
    }

    const current = monthKeyOf(new Date());
    const keys = new Set(
      [current, ...plan.keys(), ...fact.keys(), ...(state.planMonths ?? [])].filter((key) =>
        MONTH_KEY.test(key)
      )
    );
    // A month still to come has no operations of its own; it is here only
    // because the owner asked for a row to plan that far ahead.
    for (let step = 1; step <= Math.min(Math.max(Math.trunc(ahead) || 0, 0), 24); step += 1)
      keys.add(shiftMonth(current, step));
    const monthKeys = [...keys].sort((left, right) => right.localeCompare(left));

    // One column order for every band and every month, or the eye loses the
    // column it was following: income first, then spending, each sorted by how
    // much money actually passes through it. Summed once here rather than
    // inside the comparator, which asked the same question of every month again
    // on every comparison.
    const weights = new Map<string, number>();
    for (const source of [fact, plan])
      for (const byCategory of source.values())
        for (const [categoryId, amount] of byCategory)
          weights.set(categoryId, (weights.get(categoryId) ?? 0) + amount);
    const weight = (categoryId: string) => weights.get(categoryId) ?? 0;
    // A transfer is not income and not spending, so when the reader has said so,
    // its category has no business taking two columns of the grid either. Only
    // a category that holds nothing BUT transfers goes: someone who files real
    // spending under a category of their own called "Переводы" — money sent to
    // relatives, say — must keep both the column and the money in the totals.
    const transferOnly = new Set<string>();
    if (!includeTransfers) {
      const withTransfers = new Set<string>();
      const withOwnRows = new Set<string>();
      for (const transaction of state.transactions)
        (isTransfer(transaction) ? withTransfers : withOwnRows).add(transaction.category.id);
      for (const category of state.categories) {
        const isTransferCategory =
          withTransfers.has(category.id) ||
          category.label.toLowerCase() === TRANSFER_CATEGORY_LABEL.toLowerCase();
        if (isTransferCategory && !withOwnRows.has(category.id)) transferOnly.add(category.id);
      }
    }

    const columns: PlanFactColumn[] = state.categories
      .filter((category) => !transferOnly.has(category.id))
      .map((category) => ({
        categoryId: category.id,
        label: category.label,
        color: category.color,
        ...(category.icon ? { icon: category.icon } : {}),
        kind: category.kind
      }))
      .sort(
        (left, right) =>
          (left.kind === right.kind ? 0 : left.kind === "INCOME" ? -1 : 1) ||
          weight(right.categoryId) - weight(left.categoryId) ||
          left.label.localeCompare(right.label)
      );

    const notes = new Map(state.planNotes.map((entry) => [entry.month, entry] as const));
    const openingOf = this.openingBalances(state);
    const months: PlanFactMonth[] = monthKeys.map((month) => {
      const factOf = fact.get(month);
      const planOf = plan.get(month);
      const cells: Record<string, PlanFactCell> = {};
      let incomePlan = 0;
      let incomeFact = 0;
      let expensePlan = 0;
      let expenseFact = 0;

      for (const column of columns) {
        const cell = cellOf(
          planOf?.get(column.categoryId) ?? 0,
          factOf?.get(column.categoryId) ?? 0
        );
        cells[column.categoryId] = cell;
        if (column.kind === "INCOME") {
          incomePlan += cell.plan;
          incomeFact += cell.fact;
        } else {
          expensePlan += cell.plan;
          expenseFact += cell.fact;
        }
      }

      // What the month started with, in two parts. The plan side is the owner's
      // own figure; the fact side is derived — today's balances wound back
      // through everything recorded since the month began.
      const opening = cellOf(planOf?.get(OPENING_BALANCE_ID) ?? 0, openingOf(month, false));
      const savings = cellOf(planOf?.get(SAVINGS_BALANCE_ID) ?? 0, openingOf(month, true));
      const income = cellOf(incomePlan, incomeFact);
      const expense = cellOf(expensePlan, expenseFact);

      return {
        month,
        opening,
        savings,
        cells,
        income,
        expense,
        result: cellOf(
          opening.plan + savings.plan + income.plan - expense.plan,
          opening.fact + savings.fact + income.fact - expense.fact
        ),
        note: notes.get(month)?.note ?? "",
        factNote: notes.get(month)?.factNote ?? ""
      };
    });

    return { source: "database", currency: state.currency, columns, months };
  }

  /**
   * What each group of accounts held when a month started: today's balances,
   * wound back through everything recorded on those accounts since.
   *
   * Returns a lookup rather than a number because the grid asks for every month
   * twice; walking the whole ledger each time turned a page of a few hundred
   * rows into tens of passes over it. One pass here, then arithmetic over the
   * handful of months that exist.
   *
   * A transfer is an ordinary row on each side of this figure whatever the
   * reader chose about totals — it has to be, or moving money into savings
   * would leave both halves wrong.
   */
  private openingBalances(state: LocalState): (month: string, savings: boolean) => number {
    const rates = this.rates(state);
    // Archived accounts are outside every other total on this screen, so their
    // rows must not be wound back out of a balance that never held them.
    const live = state.accounts.filter((account) => !account.isArchived);
    const group = new Map(
      live.map((account) => [account.id, SAVINGS_ACCOUNT_TYPES.includes(account.type)] as const)
    );

    const now = { main: 0, savings: 0 };
    for (const account of live) {
      const base = toBaseAmount(account.balance, account.currency, rates);
      if (group.get(account.id)) now.savings += base;
      else now.main += base;
    }

    // Everything recorded since, per month and per group — in base currency, or
    // a foreign-currency account would be wound back by raw units of its own.
    const flow = new Map<string, { main: number; savings: number }>();
    for (const transaction of state.transactions) {
      const savings = group.get(transaction.account.id);
      if (savings === undefined) continue; // archived, or an account since gone
      const month = transaction.date.slice(0, 7);
      const bucket = flow.get(month) ?? { main: 0, savings: 0 };
      // Amounts arrive in the base currency already (see `inBase`), so only
      // the balances above still need converting.
      const signed = transaction.type === "INCOME" ? transaction.amount : -transaction.amount;
      if (savings) bucket.savings += signed;
      else bucket.main += signed;
      flow.set(month, bucket);
    }

    return (month, savings) => {
      let since = 0;
      for (const [key, bucket] of flow)
        if (key >= month) since += savings ? bucket.savings : bucket.main;
      return roundMoney((savings ? now.savings : now.main) - since);
    };
  }

  // One cell of the plan, or the month's note. An amount of zero clears the
  // cell rather than storing a zero, so an untouched category stays untouched.
  private savePlan(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const month = String(input.month ?? "");
    if (!MONTH_KEY.test(month)) throw new Error("Укажите месяц в виде ГГГГ-ММ.");

    // A month the owner wants a row for. Before this, the grid could only be
    // asked for months AHEAD of the current one, so an earlier month with
    // nothing recorded in it could not be planned at all.
    const action = String(input.action ?? "");
    if (action === "addMonth") {
      const pinned = state.planMonths ?? [];
      state.planMonths = [...new Set([...pinned, month])].sort().slice(-48);
      return { month };
    }
    // Removing a month takes away what this screen owns — the plan and the
    // comments. Operations are not the grid's to delete, so a month that has
    // any stays in the table with its fact row; the period filter is what hides
    // it from view.
    if (action === "removeMonth") {
      state.planMonths = (state.planMonths ?? []).filter((entry) => entry !== month);
      state.plans = state.plans.filter((entry) => entry.month !== month);
      state.planNotes = state.planNotes.filter((entry) => entry.month !== month);
      const hasFacts = state.transactions.some((row) => row.date.slice(0, 7) === month);
      return { month, hasFacts };
    }

    if (input.note !== undefined || input.factNote !== undefined) {
      // Either comment can be written on its own, so the one not being edited
      // is carried over rather than wiped.
      const clean = (value: unknown) => String(value).trim().slice(0, 500);
      const current = state.planNotes.find((entry) => entry.month === month);
      const note = input.note !== undefined ? clean(input.note) : (current?.note ?? "");
      const factNote =
        input.factNote !== undefined ? clean(input.factNote) : (current?.factNote ?? "");
      state.planNotes = [
        ...state.planNotes.filter((entry) => entry.month !== month),
        ...(note || factNote ? [{ month, note, factNote }] : [])
      ];
      return { month, note, factNote };
    }

    const categoryId = String(input.categoryId ?? "");
    if (!categoryId) throw new Error("Выберите категорию.");
    if (
      categoryId !== OPENING_BALANCE_ID &&
      categoryId !== SAVINGS_BALANCE_ID &&
      !state.categories.some((category) => category.id === categoryId)
    )
      throw new Error("Категория не найдена.");

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Введите сумму от нуля.");

    const rest = state.plans.filter(
      (entry) => !(entry.month === month && entry.categoryId === categoryId)
    );
    state.plans = amount > 0 ? [...rest, { month, categoryId, amount: roundMoney(amount) }] : rest;
    return { month, categoryId, amount: roundMoney(amount) };
  }

  // `includeTransfers` decides whether moving money between the owner's own
  // accounts counts as income and spending. It normally does not: the pair of
  // rows a transfer writes made "Переводы" the largest category on both sides
  // at once, which says nothing about what was earned or spent.
  private analyticsPage(state: LocalState, includeTransfers = false): AnalyticsData {
    const transactions = countableRows(state.transactions, includeTransfers);
    const now = new Date();
    const months: Array<{ key: string; label: string; start: string; end: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = monthKeyOf(d);
      const endDate = new Date(year, month + 1, 0);
      const shortLabel = d.toLocaleDateString("ru", { month: "short" });
      months.push({
        key,
        label: shortLabel,
        start: `${key}-01`,
        end: `${year}-${String(month + 1).padStart(2, "0")}-${endDate.getDate()}`
      });
    }

    const monthlyCashflow = months.map((m) => {
      const rows = transactions.filter((t) => t.date.startsWith(m.key));
      const income = rows.filter((r) => r.type === "INCOME").reduce((sum, r) => sum + r.amount, 0);
      const expense = rows
        .filter((r) => r.type === "EXPENSE")
        .reduce((sum, r) => sum + r.amount, 0);
      const savings = income - expense;
      const savingsRate = income > 0 ? Math.round((savings / income) * 1000) / 10 : 0;
      return { month: m.label, income, expense, savings, savingsRate };
    });

    const nonZero = monthlyCashflow.filter((m) => m.income > 0 || m.expense > 0).length || 1;
    const avgMonthlyIncome = Math.round(
      monthlyCashflow.reduce((sum, m) => sum + m.income, 0) / nonZero
    );
    const avgMonthlyExpense = Math.round(
      monthlyCashflow.reduce((sum, m) => sum + m.expense, 0) / nonZero
    );
    // Averaged over the months that HAVE something in them, exactly like income
    // and expense above. Dividing by six regardless meant two active months at
    // 30% were reported as 10% — a number the owner reads next to a 51% figure
    // computed the honest way, and the two never agreed.
    const avgSavingsRate =
      Math.round((monthlyCashflow.reduce((sum, m) => sum + m.savingsRate, 0) / nonZero) * 10) / 10;

    // The guarded pick: with nothing to compare, a plain sort is stable and
    // would name the first month of the window as "the best" (and the same one
    // as the worst) on a profile that has no data at all.
    const { best: bestMonth, worst: worstMonth } = pickBestWorstMonth(monthlyCashflow);

    // Top expense categories over the same six months the chart above draws.
    // The window had no upper end, so an operation dated next year counted in
    // every category share while being absent from the months beside it.
    const firstKey = months[0].key;
    const lastKey = months[months.length - 1].key;
    const inWindow = (date: string) => {
      const key = date.slice(0, 7);
      return key >= firstKey && key <= lastKey;
    };
    const expenseTxs = transactions.filter((t) => t.type === "EXPENSE" && inWindow(t.date));
    const totalExpense = expenseTxs.reduce((sum, t) => sum + t.amount, 0);
    const catTotals = new Map<
      string,
      { categoryId: string; category: string; color: string; total: number }
    >();
    for (const t of expenseTxs) {
      const existing = catTotals.get(t.category.id) ?? {
        categoryId: t.category.id,
        category: t.category.label,
        color: t.category.color,
        total: 0
      };
      existing.total += t.amount;
      catTotals.set(t.category.id, existing);
    }
    const topExpenseCategories = [...catTotals.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        share: totalExpense > 0 ? Math.round((item.total / totalExpense) * 1000) / 10 : 0
      }));
    const derived = buildAnalyticsDerived(monthlyCashflow, topExpenseCategories, getClientLocale());
    // Income has no budgets to read totals off, so it is ranked straight from
    // the operations over the same six months.
    const topIncomeCategories = topCategories(transactions, {
      type: "INCOME",
      since: `${firstKey}-01`,
      until: monthKeyOf(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
      colorOf: (categoryId) => state.categories.find((item) => item.id === categoryId)?.color
    });

    return {
      source: "database",
      currency: state.currency,
      monthlyCashflow,
      topExpenseCategories,
      topIncomeCategories,
      avgMonthlyIncome,
      avgMonthlyExpense,
      avgSavingsRate,
      bestMonth,
      worstMonth,
      expenseChangePct: derived.expenseChangePct,
      savingsRateTrend: derived.savingsRateTrend,
      insights: derived.insights
    };
  }

  private upsertCategory(state: LocalState, body: unknown, method: "POST" | "PUT") {
    const input = toFormObject(body);
    const name = (input.name ?? "").trim();
    const kind = (input.kind ?? "EXPENSE") as "INCOME" | "EXPENSE";
    const color = input.color ?? "#64748b";
    // The picture travels with the category into every screen that lists it,
    // including operations already recorded under it.
    const icon = input.icon?.trim() || undefined;
    const isEssential = input.isEssential === "true" || input.isEssential === "on";
    const isSubscription = input.isSubscription === "true" || input.isSubscription === "on";

    if (name.length < 2) throw new Error("Название слишком короткое");

    if (method === "PUT" && input.id) {
      const existing = state.categories.find((c) => c.id === input.id);
      if (!existing) throw new Error("Категория не найдена.");
      // Check uniqueness
      const duplicate = state.categories.find(
        (c) => c.id !== input.id && c.kind === kind && c.label.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) throw new Error("Категория с таким именем уже существует.");

      const updated: CategoryOption = {
        ...existing,
        label: name,
        kind,
        color,
        icon,
        isEssential,
        isSubscription
      };
      state.categories = state.categories.map((c) => (c.id === input.id ? updated : c));
      // Update category label/colour/icon in existing transactions
      state.transactions = state.transactions.map((t) =>
        t.category.id === input.id
          ? { ...t, category: { ...t.category, label: name, color, icon } }
          : t
      );
      return updated;
    }

    // POST - create new
    const duplicate = state.categories.find(
      (c) => c.kind === kind && c.label.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) throw new Error("Категория с таким именем уже существует.");

    const category: CategoryOption = {
      id: id("cat"),
      label: name,
      kind,
      color,
      icon,
      isEssential,
      isSubscription
    };
    state.categories = [...state.categories, category];
    return category;
  }

  /**
   * The three-month picture the health score, recommendations and the emergency
   * fund are built from.
   *
   * `alreadyFiltered` is the dashboard, which hands over a state whose transfers
   * were already dealt with according to the reader's choice. Everyone else gets
   * them removed here: a transfer between your own accounts is not income and
   * not spending, and counting it diluted the savings rate — so the budgets
   * screen and the home screen disagreed about the same three months.
   */
  private financeInput(state: LocalState, alreadyFiltered = false) {
    const rows = alreadyFiltered ? state.transactions : countableRows(state.transactions, false);
    const now = new Date();
    const monthKey = (offset: number) =>
      monthKeyOf(new Date(now.getFullYear(), now.getMonth() + offset, 1));
    const monthlyCashflow = [-2, -1, 0].map((offset) => {
      const key = monthKey(offset);
      const monthRows = rows.filter((transaction) => transaction.date.startsWith(key));
      return {
        month: key,
        income: monthRows
          .filter((row) => row.type === "INCOME")
          .reduce((sum, row) => sum + row.amount, 0),
        expense: monthRows
          .filter((row) => row.type === "EXPENSE")
          .reduce((sum, row) => sum + row.amount, 0)
      };
    });
    const currentMonth = monthlyCashflow[monthlyCashflow.length - 1];
    const expenseRows = rows.filter(
      (row) => row.type === "EXPENSE" && row.date.startsWith(monthKey(0))
    );
    const averageExpense =
      monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) /
      Math.max(monthlyCashflow.length, 1);
    const emergencyFund = this.sumInBase(
      state,
      state.accounts.filter((account) => account.type === "SAVINGS")
    );
    const softExpense = expenseRows
      .filter((row) => {
        const category = state.categories.find((item) => item.id === row.category.id);
        // Discretionary = subscriptions + entertainment + restaurants (same
        // definition as the web/Prisma path, for parity).
        return (
          category?.isSubscription || ["Развлечения", "Рестораны"].includes(category?.label ?? "")
        );
      })
      .reduce((sum, row) => sum + row.amount, 0);
    const essentialExpense = expenseRows
      .filter(
        (row) => state.categories.find((category) => category.id === row.category.id)?.isEssential
      )
      .reduce((sum, row) => sum + row.amount, 0);
    const freeCashflow = currentMonth.income - currentMonth.expense;
    return {
      budgets: this.budgetRows(state).map((budget) => ({
        ...budget,
        isSubscription: state.categories.find((category) => category.id === budget.categoryId)
          ?.isSubscription
      })),
      monthlyCashflow,
      currentMonthIncome: currentMonth.income,
      currentMonthExpense: currentMonth.expense,
      freeCashflow,
      savingsRate: currentMonth.income > 0 ? percent(freeCashflow, currentMonth.income) : 0,
      emergencyFundMonths: averageExpense > 0 ? emergencyFund / averageExpense : 0,
      emergencyFundTargetMonths: state.emergencyFundMonthsTarget,
      essentialExpenseShare:
        currentMonth.income > 0 ? percent(essentialExpense, currentMonth.income) : 0,
      subscriptionAndEntertainmentShare:
        currentMonth.expense > 0 ? percent(softExpense, currentMonth.expense) : 0,
      monthlyDebtPayments: activeDebts(state.liabilities).reduce(
        (sum, item) => sum + item.minPayment,
        0
      ),
      goals: this.goals(state).goals.map((goal) => ({
        title: goal.title,
        progress: goal.progress,
        monthlyContribution: goal.monthlyContribution
      }))
    };
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
      return mutable ? structuredClone(this.stateCache.state) : this.stateCache.state;
    }
    const existing = await this.storage.getItem<unknown>(key);
    const parsed = localStateSchema.safeParse(existing);
    if (parsed.success) {
      const migrated = migrateLocalState(parsed.data);
      if (migrated.schemaVersion !== (existing as { schemaVersion?: unknown })?.schemaVersion) {
        await this.storage.setItem(key, migrated);
      }
      this.stateCache = { key, state: structuredClone(migrated) };
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
      this.stateCache = { key, state: structuredClone(initial) };
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
    this.stateCache = { key, state: structuredClone(migrated) };
    return structuredClone(migrated);
  }

  /**
   * Puts the unreadable document aside before anything else touches the key.
   * Written once: a second failure must not overwrite the first rescue, which
   * is the one closest to the moment things went wrong.
   */
  private async keepRescueCopy(key: string, document: unknown) {
    const rescueKey = `${key}:rescue`;
    try {
      if ((await this.storage.getItem<unknown>(rescueKey)) == null)
        await this.storage.setItem(rescueKey, document);
    } catch {
      /* storage refused the copy — the original is still where it was */
    }
  }

  private async save(state: LocalState) {
    const profileId = await this.getActiveProfileId();
    const key = profileStateKey(profileId);
    await this.storage.setItem(key, state);
    this.stateCache = { key, state: structuredClone(state) };
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
