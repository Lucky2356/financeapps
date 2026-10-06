// Документ состояния профиля: его тип, начальное наполнение и общие для всех
// разделов константы. Вынесено из LocalApiClient — сюда смотрят все модули
// lib/api/local, а сам клиент только хранит документ и разводит запросы.

import { differenceInCalendarMonths } from "date-fns";
import { z } from "zod";
import type {
  BudgetsPageData,
  GoalsPageData,
  ImportPageData,
  RecurringTransactionsPageData
} from "@/lib/data";
import { monthKeyOf } from "@/lib/api/local/helpers";
import type { ExtrasState } from "@/lib/api/local/extras";
import type { Stamped, Tombstone } from "@/lib/sync/row-stamps";
import { localStateSchema } from "@/lib/api/local/schemas";
import type { MarketAlert } from "@/lib/market/alerts";
import type { CategorizationRule } from "@/lib/categorization-rules";
import { DEFAULT_CURRENCY_RATES, type CurrencyCode, type CurrencyRates } from "@/lib/currency";
import {
  LATEST_LOCAL_STATE_VERSION,
  runLocalStateMigrations,
  type RawLocalState
} from "@/lib/storage/migrations/runLocalStateMigrations";
import { clamp, percent, roundMoney } from "@/lib/utils";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { budgetInForce } from "@/lib/budget-rollover";
import type { NetWorthSnapshot } from "@/lib/net-worth-snapshots";
import type { PortfolioSnapshot } from "@/lib/investments/snapshots";
import type {
  AccountRow,
  ExpectedDividend,
  InvestmentData,
  LiabilityRow,
  PlanFactCell,
  RealizedInvestmentEvent,
  TargetAllocation,
  TransactionRow
} from "@/types/finance";
import type { BookState } from "@/lib/api/local/sheets";

export const currency = "RUB" as const;

export type CategoryOption = ImportPageData["categories"][number];
export type LocalState = BookState &
  ExtrasState & {
    schemaVersion:
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6
      | 7
      | 8
      | 9
      | 10
      | 11
      | 12
      | 13
      | 14
      | 15
      | 16
      | 17
      | 18
      | 19;
    /** Следы удалённых строк — см. lib/sync/row-stamps. */
    deletions?: Tombstone[];
    currency: CurrencyCode;
    demoMode: boolean;
    emergencyFundMonthsTarget: number;
    riskProfileCode: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
    theme: "light" | "dark" | "system";
    density: "comfortable" | "compact";
    defaultTransactionType: "INCOME" | "EXPENSE";
    lastBackupAt: string | null;
    accounts: Array<Stamped<AccountRow & { isArchived?: boolean }>>;
    liabilities: Array<Stamped<Omit<LiabilityRow, "progress">>>;
    rules: Array<Stamped<CategorizationRule>>;
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
    /** Раз в день: стоимость портфеля и вложенное — см. lib/investments/snapshots.ts. */
    portfolioSnapshots?: PortfolioSnapshot[];
    realizedInvestmentEvents: Array<Stamped<RealizedInvestmentEvent>>;
    expectedDividends: Array<Stamped<ExpectedDividend>>;
    targetAllocations: Array<Stamped<TargetAllocation>>;
    marketAlerts: Array<Stamped<MarketAlert>>;
    categories: Array<Stamped<CategoryOption>>;
    plans: Array<Stamped<{ month: string; categoryId: string; amount: number }>>;
    planNotes: Array<Stamped<{ month: string; note: string; factNote: string }>>;
    /** Months pinned into the plan/fact grid by hand (see savePlan/addMonth). */
    planMonths?: string[];
    /** Top-ups of saving goals — a balance change with no operation behind it. */
    goalMovements?: Array<
      Stamped<{
        id: string;
        goalId: string;
        accountId: string;
        amount: number;
        date: string;
      }>
    >;
    transactions: Array<Stamped<TransactionRow & { recurringId?: string }>>;
    /** Семья: участники и отметки «Рассчитались» — см. lib/family/family.ts. */
    members?: Array<Stamped<{ id: string; name: string; color: string; since?: string }>>;
    familySettlements?: Array<
      Stamped<{ id: string; from: string; to: string; amount: number; date: string }>
    >;
    budgets: Array<Stamped<BudgetsPageData["budgets"][number]>>;
    goals: Array<Stamped<GoalsPageData["goals"][number]>>;
    recurringTransactions: Array<
      Stamped<RecurringTransactionsPageData["recurringTransactions"][number]> & {
        /**
         * Legacy: up to 1.4.0 a template posted its first operation immediately and
         * kept the link here. Nothing writes or reads it any more — kept so states
         * saved by older versions still validate.
         */
        lastTransactionId?: string;
        /** Пробный период до (YYYY-MM-DD) — сторож напомнит за три дня. */
        trialEndsOn?: string | null;
      }
    >;
    investments: InvestmentData;
    importBatches?: Array<
      Stamped<{
        id: string;
        importedAt: string;
        transactionIds: string[];
      }>
    >;
  };

export const defaultCategories: CategoryOption[] = [
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

/**
 * Стандартные категории — те, с которыми приложение ставится. Их нельзя
 * удалить, и «Очистить все данные» их не трогает: без них первую же операцию
 * некуда отнести. Переименовать, перекрасить, сменить значок — можно, и эти
 * правки очистку переживают: имя, которое человек выбрал сам, — это его
 * настройка, а не его данные.
 */
export const STANDARD_CATEGORY_IDS: ReadonlySet<string> = new Set(
  defaultCategories.map((category) => category.id)
);

/**
 * Стандартные категории из того, что лежит сейчас, — с правками человека.
 * Пропавшая (удалённая в прежних версиях, когда это ещё было можно) или
 * испорченная возвращается такой, какой ставилась.
 */
export function standardCategoriesFrom(existing: unknown): CategoryOption[] {
  const held = new Map<string, CategoryOption>();
  const list = (existing as { categories?: unknown } | null)?.categories;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Partial<CategoryOption>;
      if (
        typeof row.id === "string" &&
        STANDARD_CATEGORY_IDS.has(row.id) &&
        typeof row.label === "string" &&
        row.label.trim() !== "" &&
        (row.kind === "INCOME" || row.kind === "EXPENSE") &&
        typeof row.color === "string"
      ) {
        held.set(row.id, { ...(row as CategoryOption) });
      }
    }
  }
  return defaultCategories.map((category) => held.get(category.id) ?? { ...category });
}

export function recomputeGoal(
  goal: Omit<GoalsPageData["goals"][number], "progress" | "monthlyContribution">
): GoalsPageData["goals"][number] {
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  // Counted in whole calendar months, the same way the card beside this figure
  // says how long is left. Thirty-day months and rounding up disagreed with it:
  // «осталось 2 месяца, по 30 000 ₽» for the 90 000 ₽ still missing.
  const months = Math.max(1, differenceInCalendarMonths(new Date(goal.deadline), new Date()));

  return {
    ...goal,
    progress: clamp(percent(goal.currentAmount, goal.targetAmount), 0, 100),
    monthlyContribution: Math.ceil(remaining / months)
  };
}

export function recomputeLiability(liability: Omit<LiabilityRow, "progress">): LiabilityRow {
  // Progress = share of the original principal already repaid. Falls back to 0
  // when the original amount is unknown or smaller than the current balance.
  const repaid = Math.max(liability.originalAmount - liability.balance, 0);
  const progress =
    liability.originalAmount > 0 ? clamp(percent(repaid, liability.originalAmount), 0, 100) : 0;
  return { ...liability, progress };
}

/**
 * Шаблон плановой операции с именами, какие они сейчас.
 *
 * Шаблон хранит у себя копию названия категории и счёта. Переименование
 * исправляло операции, но не шаблоны, — и «Плановые», прогноз и календарь
 * показывали старое имя и старый цвет, а описание новой проведённой операции
 * получало название, которого у категории давно нет. Имя берётся по номеру из
 * живых списков; нет такой категории или счёта — остаётся то, что помнил шаблон.
 */
/**
 * Сколько человек собирается потратить на категорию за месяц — одно число и
 * для «Лимитов», и для строки плана в «План/факте».
 *
 * Прежде это были два разных числа в двух местах: лимит, который действует,
 * пока его не поменяли, и план, вписанный в клетку месяца. Их приходилось
 * вводить дважды, и они расходились. Теперь число одно, и держат его лимиты;
 * запись с любого экрана пишет туда же (см. upsertBudget и savePlan).
 *
 * План, вписанный в клетку прежними версиями, ещё может лежать рядом — и
 * приехать с устройства, где стоит старая версия. Он тоже слово человека про
 * этот месяц, поэтому из двух слов про один и тот же месяц берётся более
 * позднее. Лимит, унаследованный от прошлого месяца, клетке этого месяца
 * уступает: она сказана именно про него.
 */
export function spendingPlan(
  state: Pick<LocalState, "plans" | "budgets">,
  categoryId: string,
  month: string
): number | undefined {
  const cell = state.plans.find(
    (entry) => entry.month === month && entry.categoryId === categoryId
  );
  const own = state.budgets.find(
    (budget) => budget.categoryId === categoryId && budget.month === month
  );
  if (cell && (!own || (cell.updatedAt ?? "") > (own.updatedAt ?? ""))) return cell.amount;
  return budgetInForce(state.budgets, categoryId, month)?.limitAmount;
}

export type NamedTemplate = {
  account: { id: string; label: string };
  category: { id: string; label: string; color: string; icon?: string };
};

export function withCurrentNames<T extends NamedTemplate>(
  state: Pick<LocalState, "accounts" | "categories">,
  item: T
): T {
  const category = state.categories.find((entry) => entry.id === item.category.id);
  const account = state.accounts.find((entry) => entry.id === item.account.id);
  return {
    ...item,
    category: category
      ? { ...item.category, label: category.label, color: category.color, icon: category.icon }
      : item.category,
    account: account ? { ...item.account, label: account.name } : item.account
  };
}

export function emptyInvestmentData(): InvestmentData {
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

export function createInitialState(): LocalState {
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
    importBatches: [],
    cashbackRules: [],
    trips: [],
    deductionYears: []
  };
}

// An empty state — used when the user explicitly wipes all data. Nothing of
// theirs is seeded: no accounts, operations or watchlist. The one exception is
// the standard categories, passed in as they stood, edits included.
export function createBlankState(categories: CategoryOption[]): LocalState {
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
    categories,
    plans: [],
    planNotes: [],
    transactions: [],
    budgets: [],
    goals: [],
    recurringTransactions: [],
    investments: emptyInvestmentData(),
    importBatches: [],
    cashbackRules: [],
    trips: [],
    deductionYears: []
  };
}

export function migrateLocalState(state: z.infer<typeof localStateSchema>): LocalState {
  // Delegate version stepping to the shared migration runner so future schema
  // bumps are append-only (see lib/storage/migrations). Zod has already applied
  // field defaults by this point; the runner carries structural changes.
  return runLocalStateMigrations(state as unknown as RawLocalState) as unknown as LocalState;
}

export function isBackupReminderDue(lastBackupAt: string | null) {
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
/**
 * Псевдостатья плана: сколько владелец собирается отложить в сбережения.
 *
 * Не доход и не расход — перевод между своими же деньгами. Но без него план не
 * делился на «основные» и «сбережения» вовсе: у статьи есть категория и нет
 * счёта, и какая часть задуманного осядет на вкладе, взять было неоткуда.
 */
export const SAVINGS_TRANSFER_ID = "__toSavings__";
export const SAVINGS_ACCOUNT_TYPES = ["SAVINGS", "BROKERAGE"];
export const MONTH_KEY = /^\d{4}-\d{2}$/;

/** What an imported operation is filed under when the file names no account. */
export const DEFAULT_IMPORT_ACCOUNT = "Импорт";

export function cellOf(plan: number, fact: number): PlanFactCell {
  const rounded = { plan: roundMoney(plan), fact: roundMoney(fact) };
  return { ...rounded, diff: roundMoney(rounded.plan - rounded.fact) };
}

/** The first day of "YYYY-MM" in local time, which is how month keys are read. */
export function monthStart(month: string): Date {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, (index || 1) - 1, 1);
}

// "2026-08" three months on is "2026-11". Done through Date so December rolls
// the year over on its own.
export function shiftMonth(month: string, step: number): string {
  const [year, index] = month.split("-").map(Number);
  return monthKeyOf(new Date(year, index - 1 + step, 1));
}

/** Цвета участников семьи по очереди — различимые и в светлой, и в тёмной теме. */
/**
 * Доли совместной цели из формы: JSON {участник: %}. Пустой объект — «поровну»
 * (поле убирается); форма, которая о долях молчит, прежних не трогает.
 */
export function goalSharesFrom(
  raw: unknown,
  previous: Record<string, number> | undefined
): { shares?: Record<string, number> } {
  if (raw === undefined) return previous ? { shares: previous } : {};
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      parsed = {};
    }
  }
  const shares: Record<string, number> = {};
  if (parsed && typeof parsed === "object")
    for (const [member, value] of Object.entries(parsed as Record<string, unknown>)) {
      const number = Number(value);
      if (member && Number.isFinite(number) && number > 0) shares[member] = number;
    }
  return Object.keys(shares).length > 0 ? { shares } : {};
}

/** Статья для разницы, найденной сверкой с банком. */
export const RECONCILE_CATEGORY_LABEL = "Сверка с банком";

export const FAMILY_COLORS = ["#0ea5e9", "#f97316", "#22c55e", "#e11d48", "#a855f7", "#eab308"];

/** Поля семьи для операции: из формы, а если форма о них молчит — прежние. */
export function familyFields(
  state: LocalState,
  input: Record<string, unknown>,
  previous: { memberId?: string; shared?: boolean } | undefined
): { memberId?: string; shared?: boolean } {
  const members = new Set((state.members ?? []).map((member) => member.id));
  const raw = input.memberId;
  const memberId =
    raw === undefined
      ? previous?.memberId
      : typeof raw === "string" && members.has(raw)
        ? raw
        : undefined;
  const sharedRaw = input.shared;
  const shared =
    sharedRaw === undefined
      ? previous?.shared
      : sharedRaw === true || sharedRaw === "true" || sharedRaw === "1" || sharedRaw === "on";
  return {
    ...(memberId ? { memberId } : {}),
    ...(shared && memberId ? { shared: true } : {})
  };
}
