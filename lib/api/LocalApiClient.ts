"use client";

import { subMonths } from "date-fns";
import { z } from "zod";

import type { ApiClient } from "@/lib/api/ApiClient";
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
import { buildSectorStructure } from "@/lib/data/derive";
import type { CategorizationRule } from "@/lib/categorization-rules";
import { isSupportedCurrency, type CurrencyCode } from "@/lib/currency";
import { RISK_PROFILE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { createStorageAdapter } from "@/lib/storage/createStorageAdapter";
import {
  runLocalStateMigrations,
  type RawLocalState
} from "@/lib/storage/migrations/runLocalStateMigrations";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { clamp, percent, roundMoney } from "@/lib/utils";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { CashflowForecastService } from "@/services/CashflowForecastService";
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
  InvestmentData,
  LiabilityRow,
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
  schemaVersion: 1 | 2 | 3;
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
  aiApiKey: string;
  aiModel: string;
  netWorthSnapshots: NetWorthSnapshot[];
  categories: CategoryOption[];
  transactions: Array<TransactionRow & { recurringId?: string }>;
  budgets: BudgetsPageData["budgets"];
  goals: GoalsPageData["goals"];
  recurringTransactions: Array<
    RecurringTransactionsPageData["recurringTransactions"][number] & { lastTransactionId?: string }
  >;
  investments: InvestmentData;
  importBatches?: Array<{
    id: string;
    importedAt: string;
    transactionIds: string[];
  }>;
};

const defaultCategories: CategoryOption[] = [
  { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#16a34a" },
  { id: "cat-other-income", label: "Прочие доходы", kind: "INCOME", color: "#0d9488" },
  { id: "cat-food", label: "Продукты", kind: "EXPENSE", color: "#f97316", isEssential: true },
  { id: "cat-transport", label: "Транспорт", kind: "EXPENSE", color: "#2563eb", isEssential: true },
  { id: "cat-utilities", label: "ЖКХ", kind: "EXPENSE", color: "#7c3aed", isEssential: true },
  {
    id: "cat-subscriptions",
    label: "Подписки",
    kind: "EXPENSE",
    color: "#db2777",
    isSubscription: true
  },
  { id: "cat-restaurants", label: "Рестораны", kind: "EXPENSE", color: "#ea580c" },
  { id: "cat-health", label: "Здоровье", kind: "EXPENSE", color: "#dc2626", isEssential: true }
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
    risks: [],
    education: []
  };
}

function createInitialState(): LocalState {
  // A fresh install starts empty: no accounts, no transactions, no watchlist —
  // the user adds their own. Default categories are kept only so that operations
  // can be categorized out of the box; they carry no monetary data.
  return {
    schemaVersion: 3,
    currency,
    demoMode: false,
    emergencyFundMonthsTarget: 6,
    riskProfileCode: "MODERATE",
    theme: "system",
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
    aiApiKey: "",
    aiModel: "",
    netWorthSnapshots: [],
    categories: defaultCategories,
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
    schemaVersion: 3,
    currency,
    demoMode: false,
    emergencyFundMonthsTarget: 6,
    riskProfileCode: "MODERATE",
    theme: "system",
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
    aiApiKey: "",
    aiModel: "",
    netWorthSnapshots: [],
    categories: [],
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

  async get<T>(path: string): Promise<T> {
    const state = await this.state();
    const { pathname, searchParams } = normalizePath(path);

    if (pathname === "/accounts") return this.accounts(state) as T;
    if (pathname === "/transactions") return this.transactions(state, searchParams) as T;
    if (pathname === "/budgets")
      return this.budgets(state, searchParams.get("month") ?? undefined) as T;
    if (pathname === "/goals") return this.goals(state) as T;
    if (pathname === "/debts") return this.debts(state) as T;
    if (pathname === "/rules") return this.rulesPage(state) as T;
    if (pathname === "/recurring") return this.recurring(state) as T;
    if (pathname === "/forecast") return this.forecast(state) as T;
    if (pathname === "/dashboard") return (await this.dashboard(state)) as T;
    if (pathname === "/settings") return this.settings(state) as T;
    if (pathname === "/import") return this.importReferences(state) as T;
    if (pathname === "/backup") {
      state.lastBackupAt = new Date().toISOString();
      await this.save(state);
      return (await this.backup(state)) as T;
    }
    if (pathname === "/investments/search") {
      const results = await createMarketDataProvider().searchSecurities(
        searchParams.get("q") ?? "",
        25
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
      // Persist last-known prices so they survive app restart
      state.investments = {
        ...state.investments,
        securities: invData.securities,
        watchlist: invData.watchlist,
        portfolio: invData.portfolio,
        structure: invData.structure,
        sectorStructure: invData.sectorStructure
      };
      await this.save(state);
      return invData as T;
    }
    if (pathname === "/categories") return this.categoriesPage(state) as T;
    if (pathname === "/analytics") return this.analyticsPage(state) as T;
    if (pathname === "/profiles") return (await this.profileList()) as T;

    throw new Error(`Local API route is not implemented: ${pathname}`);
  }

  async post<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
    return this.write<TResponse>(path, body, "POST");
  }

  async put<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
    return this.write<TResponse>(path, body, "PUT");
  }

  async delete<T>(path: string): Promise<T> {
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
    } else if (pathname === "/rules" && itemId) {
      state.rules = state.rules.filter((rule) => rule.id !== itemId);
    } else if (pathname === "/recurring" && itemId) {
      const existing = state.recurringTransactions.find((item) => item.id === itemId);
      // Remove the linked materialized transaction so balances/budgets stay correct
      if (existing?.lastTransactionId) {
        this.deleteTransaction(state, existing.lastTransactionId);
      }
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
    if (pathname === "/networth/snapshot")
      return this.saveAndReturn<TResponse>(state, await this.recordNetWorthSnapshot(state));
    if (pathname === "/import")
      return this.saveAndReturn<TResponse>(state, this.importCsvRows(state, body));
    if (pathname === "/import/undo")
      return this.saveAndReturn<TResponse>(state, this.undoLastImport(state));
    if (pathname === "/settings")
      return this.saveAndReturn<TResponse>(state, this.updateSettings(state, body));
    if (pathname === "/backup") return this.restoreBackup<TResponse>(body);
    if (pathname === "/investments")
      return this.saveAndReturn<TResponse>(state, await this.updateInvestments(state, body));
    if (pathname === "/categories")
      return this.saveAndReturn<TResponse>(state, this.upsertCategory(state, body, method));
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
    const parsed = localStateSchema.safeParse(payload);
    if (!parsed.success)
      throw new Error("Backup payload is invalid or incompatible with local mode.");
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
    const account = {
      id: method === "PUT" && input.id ? input.id : id("account"),
      name: input.name?.trim() || "Новый счет",
      type: input.type || "DEBIT_CARD",
      balance: Number(input.balance ?? 0),
      currency: state.currency
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
    const type = input.type === "INCOME" ? "INCOME" : "EXPENSE";
    const linkedRecurringId = recurringId ?? previous?.recurringId;
    const transaction: TransactionRow & { recurringId?: string } = {
      id: method === "PUT" && input.id ? input.id : id("tx"),
      amount,
      type,
      date: new Date(input.date).toISOString(),
      description: input.description?.trim() || null,
      account: { id: account.id, label: account.name },
      category: { id: category.id, label: category.label, color: category.color },
      ...(linkedRecurringId ? { recurringId: linkedRecurringId } : {})
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
    const spent = state.transactions
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
    const expenseCategory = this.findOrCreateCategory(state, "Переводы", "EXPENSE");
    const incomeCategory = this.findOrCreateCategory(state, "Переводы", "INCOME");
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
      deadline: new Date(input.deadline).toISOString()
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
      currency: isSupportedCurrency(input.currency ?? "") ? input.currency : state.currency
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
    const updated = recomputeGoal({
      id: goal.id,
      title: goal.title,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount + amount,
      deadline: goal.deadline
    });
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
      const existing = state.recurringTransactions.find((item) => item.id === input.id);
      // Keep the already-created transaction in sync so budgets/balances reflect edits
      if (
        existing?.lastTransactionId &&
        state.transactions.some((item) => item.id === existing.lastTransactionId)
      ) {
        const linked = state.transactions.find((item) => item.id === existing.lastTransactionId)!;
        this.upsertTransaction(
          state,
          {
            id: linked.id,
            amount: String(amount),
            type,
            accountId: account.id,
            categoryId: category.id,
            date: linked.date,
            description: description ?? category.label
          },
          "PUT",
          existing.id
        );
      }
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
        category: categoryRef,
        lastTransactionId: existing?.lastTransactionId
      };
      state.recurringTransactions = state.recurringTransactions.map((item) =>
        item.id === row.id ? row : item
      );
      return row;
    }

    // POST — create the template AND immediately materialize the first occurrence,
    // so the planned payment counts right away without an extra confirm click.
    const newId = id("recurring");
    let lastTransactionId: string | undefined;
    if (isActive) {
      const created = this.upsertTransaction(
        state,
        {
          amount: String(amount),
          type,
          accountId: account.id,
          categoryId: category.id,
          date: nextDateInput.toISOString(),
          description: description ?? category.label
        },
        "POST",
        newId
      );
      lastTransactionId = created.id;
    }
    // Advance the schedule past the occurrence we just created.
    const advancedNext = isActive ? service.getNextDate(nextDateInput, frequency) : nextDateInput;
    const status = service.getStatus({ nextDate: advancedNext, frequency, isActive });
    const row: LocalState["recurringTransactions"][number] = {
      id: newId,
      amount,
      type,
      frequency,
      nextDate: advancedNext.toISOString(),
      description,
      isActive,
      daysUntilNext: status.daysUntilNext,
      isDue: status.isDue,
      account: accountRef,
      category: categoryRef,
      lastTransactionId
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
        created += 1;
      }
      state.recurringTransactions = state.recurringTransactions.map((item) =>
        item.id === recurring.id
          ? { ...item, nextDate: status.nextDateAfterRun.toISOString(), isDue: false }
          : item
      );
    }
    return { created };
  }

  private importCsvRows(state: LocalState, body: unknown) {
    const input = toFormObject(body);
    const rows = JSON.parse(input.rows || "[]") as Array<Record<string, unknown>>;
    const fallbackAccount = state.accounts.find((account) => !account.isArchived);
    if (!fallbackAccount) throw new Error("Create an account before importing CSV.");

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
      const accountName = String(row[input.accountColumn ?? ""] ?? "")
        .trim()
        .toLowerCase();
      const account =
        state.accounts.find(
          (item) => item.name.toLowerCase() === accountName && !item.isArchived
        ) ?? fallbackAccount;
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

  private findOrCreateCategory(state: LocalState, label: string, kind: "INCOME" | "EXPENSE") {
    const existing = state.categories.find(
      (item) => item.kind === kind && item.label.toLowerCase() === label.toLowerCase()
    );
    if (existing) return existing;
    const category = {
      id: id("cat"),
      label,
      kind,
      color: kind === "INCOME" ? "#16a34a" : "#64748b"
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
      state.aiProvider = String(raw.aiProvider ?? "anthropic").trim() || "anthropic";
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

    const quantity = Number(input.quantity);
    const averageBuyPrice = Number(input.averageBuyPrice);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new Error("Введите количество больше нуля.");
    if (!Number.isFinite(averageBuyPrice) || averageBuyPrice <= 0)
      throw new Error("Введите среднюю цену больше нуля.");

    const position = {
      ticker: security.ticker,
      name: security.name,
      sector: security.sector,
      quantity,
      averageBuyPrice,
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

  private accounts(state: LocalState): AccountsPageData {
    const accounts = state.accounts.filter((account) => !account.isArchived);
    return {
      source: "database",
      accounts,
      totalBalance: roundMoney(accounts.reduce((sum, account) => sum + account.balance, 0)),
      currency: state.currency
    };
  }

  private transactions(state: LocalState, searchParams: URLSearchParams): TransactionsPageData {
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") || 20)));
    const filters = {
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      type: (searchParams.get("type") as TransactionsPageData["filters"]["type"]) || "ALL",
      categoryId: searchParams.get("categoryId") || undefined,
      accountId: searchParams.get("accountId") || undefined,
      q: searchParams.get("q") || undefined,
      page,
      limit
    };
    const filtered = [...state.transactions]
      .filter((transaction) => {
        const date = transaction.date.slice(0, 10);
        if (filters.from && date < filters.from) return false;
        if (filters.to && date > filters.to) return false;
        if (filters.type && filters.type !== "ALL" && transaction.type !== filters.type)
          return false;
        if (filters.categoryId && transaction.category.id !== filters.categoryId) return false;
        if (filters.accountId && transaction.account.id !== filters.accountId) return false;
        if (filters.q) {
          const query = filters.q.toLowerCase();
          const haystack =
            `${transaction.description ?? ""} ${transaction.account.label} ${transaction.category.label}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const start = (page - 1) * limit;

    return {
      source: "database",
      transactions: filtered.slice(start, start + limit),
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
    const targetDate = month ? new Date(`${month}-01`) : new Date();
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
      total: roundMoney(liabilities.reduce((sum, item) => sum + item.balance, 0)),
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
    const rows = service.sortUpcoming(
      state.recurringTransactions.map((item) => {
        const status = service.getStatus({
          nextDate: new Date(item.nextDate),
          frequency: item.frequency,
          isActive: item.isActive
        });
        return { ...item, daysUntilNext: status.daysUntilNext, isDue: status.isDue };
      })
    );
    const active = rows.filter((row) => row.isActive);
    const monthly = (type: "INCOME" | "EXPENSE") =>
      active
        .filter((row) => row.type === type)
        .reduce(
          (sum, row) =>
            sum +
            row.amount *
              (row.frequency === "WEEKLY" ? 4.33 : row.frequency === "YEARLY" ? 1 / 12 : 1),
          0
        );
    return {
      source: "database",
      recurringTransactions: rows,
      accounts: this.accounts(state).accounts,
      categories: state.categories,
      currency: state.currency,
      summary: {
        activeCount: active.length,
        dueCount: active.filter((row) => row.isDue).length,
        nextSevenDaysAmount: roundMoney(
          active
            .filter((row) => row.isDue || row.daysUntilNext <= 7)
            .reduce((sum, row) => sum + row.amount, 0)
        ),
        monthlyPlannedIncome: roundMoney(monthly("INCOME")),
        monthlyPlannedExpense: roundMoney(monthly("EXPENSE"))
      }
    };
  }

  private forecast(state: LocalState): ForecastPageData {
    return new CashflowForecastService().build(
      {
        source: "database",
        currency: state.currency,
        accounts: this.accounts(state).accounts,
        recurringTransactions: this.recurring(state).recurringTransactions,
        goals: this.goals(state).goals
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

    const rowsWithoutShare = state.investments.portfolio
      .map((position) => {
        const security = securityByTicker.get(position.ticker);
        if (!security) return null;
        const currentValue = roundMoney(security.price * position.quantity);
        return {
          ticker: security.ticker,
          name: security.name,
          sector: security.sector,
          quantity: position.quantity,
          averageBuyPrice: position.averageBuyPrice,
          currentPrice: security.price,
          currentValue,
          pnl: roundMoney((security.price - position.averageBuyPrice) * position.quantity),
          share: 0,
          risk: security.risk
        };
      })
      .filter((position): position is InvestmentData["portfolio"][number] => Boolean(position));
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
    const liabilitiesTotal = roundMoney(
      state.liabilities.reduce((sum, item) => sum + item.balance, 0)
    );
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

  private async dashboard(state: LocalState): Promise<DashboardData> {
    const finance = this.financeInput(state);
    const totalBalance = this.accounts(state).totalBalance;
    const portfolioValue = await this.portfolioValue(state);
    // Goal savings are money the user set aside from accounts, so they stay
    // part of net worth (a deposit just moves it from a balance into a goal).
    const goalSavings = roundMoney(state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0));
    const liabilitiesTotal = roundMoney(
      state.liabilities.reduce((sum, item) => sum + item.balance, 0)
    );
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
    const savingsBalance = state.accounts
      .filter((account) => account.type === "SAVINGS")
      .reduce((sum, account) => sum + account.balance, 0);
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
          tone: "success"
        },
        {
          key: "monthExpense",
          title: t("svc.metric.monthExpense"),
          value: formatCurrency(finance.currentMonthExpense, currency),
          detail: t("svc.metric.month.detail"),
          tone: "warning"
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
      aiApiKey: state.aiApiKey ?? "",
      aiModel: state.aiModel ?? "",
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
      isEssential: cat.isEssential ?? false,
      isSubscription: cat.isSubscription ?? false,
      transactionCount: state.transactions.filter((t) => t.category.id === cat.id).length
    }));
    return { source: "database", categories };
  }

  private analyticsPage(state: LocalState): AnalyticsData {
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
      const rows = state.transactions.filter((t) => t.date.startsWith(m.key));
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
    const avgSavingsRate =
      Math.round(
        (monthlyCashflow.reduce((sum, m) => sum + m.savingsRate, 0) / monthlyCashflow.length) * 10
      ) / 10;

    const bestMonth = [...monthlyCashflow].sort((a, b) => b.savings - a.savings)[0]?.month ?? "-";
    const worstMonth = [...monthlyCashflow].sort((a, b) => a.savings - b.savings)[0]?.month ?? "-";

    // Top expense categories over 6 months
    const sixMonthsAgoKey = months[0].key;
    const expenseTxs = state.transactions.filter(
      (t) => t.type === "EXPENSE" && t.date >= sixMonthsAgoKey
    );
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

    return {
      source: "database",
      currency: state.currency,
      monthlyCashflow,
      topExpenseCategories,
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
        isEssential,
        isSubscription
      };
      state.categories = state.categories.map((c) => (c.id === input.id ? updated : c));
      // Update category label/color in existing transactions
      state.transactions = state.transactions.map((t) =>
        t.category.id === input.id ? { ...t, category: { ...t.category, label: name, color } } : t
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
      isEssential,
      isSubscription
    };
    state.categories = [...state.categories, category];
    return category;
  }

  private financeInput(state: LocalState) {
    const now = new Date();
    const monthKey = (offset: number) =>
      monthKeyOf(new Date(now.getFullYear(), now.getMonth() + offset, 1));
    const monthlyCashflow = [-2, -1, 0].map((offset) => {
      const key = monthKey(offset);
      const rows = state.transactions.filter((transaction) => transaction.date.startsWith(key));
      return {
        month: key,
        income: rows
          .filter((row) => row.type === "INCOME")
          .reduce((sum, row) => sum + row.amount, 0),
        expense: rows
          .filter((row) => row.type === "EXPENSE")
          .reduce((sum, row) => sum + row.amount, 0)
      };
    });
    const currentMonth = monthlyCashflow[monthlyCashflow.length - 1];
    const expenseRows = state.transactions.filter(
      (row) => row.type === "EXPENSE" && row.date.startsWith(monthKey(0))
    );
    const averageExpense =
      monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) /
      Math.max(monthlyCashflow.length, 1);
    const emergencyFund = state.accounts
      .filter((account) => account.type === "SAVINGS")
      .reduce((sum, account) => sum + account.balance, 0);
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
      monthlyDebtPayments: state.liabilities.reduce((sum, item) => sum + item.minPayment, 0),
      goals: this.goals(state).goals.map((goal) => ({
        title: goal.title,
        progress: goal.progress,
        monthlyContribution: goal.monthlyContribution
      }))
    };
  }

  private async state() {
    const profileId = await this.getActiveProfileId();
    const key = profileStateKey(profileId);
    if (this.stateCache && this.stateCache.key === key) {
      return structuredClone(this.stateCache.state);
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
    const initial = createInitialState();
    await this.storage.setItem(key, initial);
    this.stateCache = { key, state: structuredClone(initial) };
    return structuredClone(initial);
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
