import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";

import { ACCOUNT_TYPE_LABELS, RISK_PROFILE_LABELS } from "@/lib/constants";
import { buildMonthlyCashflow, currentMonthRange } from "@/lib/data/derive";
import { formatCurrency, formatInputDate, formatMonth } from "@/lib/format";
import { pickBestWorstMonth } from "@/lib/analytics/best-month";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n/catalog";
import { suggestedLimitFor } from "@/lib/budget-suggest";
import { topCategories, type RankedCategory } from "@/lib/categories/breakdown";
import { type InterestAccrual } from "@/lib/accounts/interest";
import { type PlannedDebtPayment } from "@/lib/debts/planned";
import { buildEmergencyFund } from "@/lib/emergency-fund";
import { buildNetWorthBreakdown } from "@/lib/net-worth";
import type { CategorizationRule } from "@/lib/categorization-rules";
import { clamp, percent, roundMoney } from "@/lib/utils";
import { transactionFilterSchema } from "@/lib/validations";
import { CashflowForecastService } from "@/services/CashflowForecastService";
import { FinanceRecommendationService } from "@/services/FinanceRecommendationService";
import { buildAnalyticsDerived } from "@/services/AnalyticsInsightService";
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  DashboardData,
  DataSource,
  ForecastData,
  GoalRow,
  InvestmentData,
  LiabilityRow,
  PlanFactPageData,
  RecurringTransactionRow,
  RecommendationView,
  TransactionRow
} from "@/types/finance";
import type { RiskProfileCode } from "@/types/enums";
import { budgetLimits, demoCategories, type CategoryOption } from "@/lib/data/demo-seed";

// ---------------------------------------------------------------------------
// Server-rendered page data.
//
// The app has no backend: every screen is server-rendered EMPTY and the client
// immediately fills it in from the device's IndexedDB through LocalApiClient
// (see hooks/use-api-page-data). Handing out demo or stale numbers here would
// show "phantom" data for a frame and hand forms account ids that do not exist
// on the device, so the shell must stay empty on purpose.
//
// What lives in this module is therefore only the page-data *shapes* plus the
// empty values that satisfy them.
// ---------------------------------------------------------------------------

export type TransactionsPageData = {
  source: DataSource;
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryOption[];
  rules: CategorizationRule[];
  filters: {
    from?: string;
    to?: string;
    type?: "ALL" | "INCOME" | "EXPENSE";
    categoryId?: string;
    accountId?: string;
    q?: string;
    minAmount?: number;
    maxAmount?: number;
    page?: number;
    limit?: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

export type RecurringTransactionsPageData = {
  source: DataSource;
  recurringTransactions: RecurringTransactionRow[];
  accounts: AccountRow[];
  categories: CategoryOption[];
  /** Monthly limits per category — prefill the template amount from the budget. */
  budgetHints: Array<{ categoryId: string; amount: number }>;
  /** Scheduled payments derived from the debts page (read-only here). */
  debtPayments: PlannedDebtPayment[];
  /** Interest savings accounts will credit in the next 12 months (read-only). */
  interestAccruals: InterestAccrual[];
  currency: string;
  summary: {
    activeCount: number;
    dueCount: number;
    nextSevenDaysAmount: number;
    monthlyPlannedExpense: number;
    monthlyPlannedIncome: number;
  };
};

export type AccountsPageData = {
  source: DataSource;
  accounts: AccountRow[];
  totalBalance: number;
  currency: string;
};

export type BudgetsPageData = {
  source: DataSource;
  budgets: BudgetRow[];
  categories: CategoryOption[];
  recommendations: RecommendationView[];
  currency: string;
  selectedMonth: string;
};

export type GoalsPageData = {
  source: DataSource;
  goals: GoalRow[];
  currency: string;
};

export type LiabilitiesPageData = {
  source: DataSource;
  liabilities: LiabilityRow[];
  total: number;
  currency: string;
};

export type RulesPageData = {
  source: DataSource;
  rules: CategorizationRule[];
  categories: Array<{ id: string; label: string; kind: "INCOME" | "EXPENSE" }>;
};

export type ForecastPageData = ForecastData;

export type SettingsPageData = {
  source: DataSource;
  currency: string;
  demoMode: boolean;
  emergencyFundMonthsTarget: number;
  riskProfileCode: RiskProfileCode;
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  defaultTransactionType: "INCOME" | "EXPENSE";
  autoMaterializeRecurring: boolean;
  paymentReminders: boolean;
  aiEnabled: boolean;
  /** The user's own provider/key, stored on the device and never sent anywhere. */
  aiProvider?: string;
  aiEffort?: string;
  aiApiKey?: string;
  aiModel?: string;
  /** When the cached CBR FX rates were last refreshed (ISO) or null. */
  currencyRatesUpdatedAt?: string | null;
  riskProfiles: Array<{
    id: string;
    code: RiskProfileCode;
    title: string;
    description: string;
  }>;
};

export type ImportPageData = {
  source: DataSource;
  accounts: AccountRow[];
  categories: CategoryOption[];
  lastBackupAt?: string | null;
  backupReminderDue?: boolean;
};

export type CategoriesPageData = {
  source: DataSource;
  categories: CategoryRow[];
};

export type AnalyticsData = {
  source: DataSource;
  currency: string;
  monthlyCashflow: Array<{
    month: string;
    income: number;
    expense: number;
    savings: number;
    savingsRate: number;
  }>;
  topExpenseCategories: Array<{
    categoryId: string;
    category: string;
    color: string;
    total: number;
    share: number;
  }>;
  /** Same ranking for money coming in — the other half of the picture. */
  topIncomeCategories: RankedCategory[];
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  avgSavingsRate: number;
  bestMonth: string;
  worstMonth: string;
  expenseChangePct: number;
  savingsRateTrend: "up" | "down" | "flat";
  insights: RecommendationView[];
};

// ---- Shared builders -------------------------------------------------------

function buildBudgetRows(
  transactions: TransactionRow[],
  categories = demoCategories,
  targetMonthDate?: Date
): BudgetRow[] {
  const monthDate = targetMonthDate ?? new Date();
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return categories
    .filter((category) => category.kind === "EXPENSE")
    .map((category) => {
      const spent = transactions
        .filter((transaction) => {
          const date = new Date(transaction.date);
          return (
            transaction.category.id === category.id &&
            transaction.type === "EXPENSE" &&
            date >= start &&
            date <= end
          );
        })
        .reduce((sum, row) => sum + row.amount, 0);
      const limitAmount = budgetLimits.get(category.id) ?? 0;

      return {
        id: `budget-${category.id}`,
        categoryId: category.id,
        category: category.label,
        color: category.color,
        limitAmount,
        spent,
        rollover: false,
        rolloverAmount: 0,
        progress: limitAmount > 0 ? clamp(percent(spent, limitAmount), 0, 140) : 0,
        isExceeded: limitAmount > 0 && spent > limitAmount,
        suggestedLimit: suggestedLimitFor(category.id, transactions, { now: monthDate })
      };
    });
}

function buildFinanceInput(
  transactions: TransactionRow[],
  accounts: AccountRow[],
  goals: GoalRow[]
) {
  const monthlyCashflow = buildMonthlyCashflow(transactions);
  const currentMonth = monthlyCashflow[monthlyCashflow.length - 1];
  const freeCashflow = currentMonth.income - currentMonth.expense;
  const averageExpense =
    monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) / monthlyCashflow.length;
  const emergencyFund = accounts
    .filter((account) => account.type === "SAVINGS")
    .reduce((sum, account) => sum + account.balance, 0);
  const emergencyFundMonths = averageExpense > 0 ? emergencyFund / averageExpense : 0;
  const currentExpenseRows = transactions.filter((transaction) => {
    const { start, end } = currentMonthRange();
    const date = new Date(transaction.date);
    return transaction.type === "EXPENSE" && date >= start && date <= end;
  });
  const essentialExpense = currentExpenseRows
    .filter(
      (transaction) =>
        demoCategories.find((category) => category.id === transaction.category.id)?.isEssential
    )
    .reduce((sum, row) => sum + row.amount, 0);
  const softExpense = currentExpenseRows
    .filter((transaction) =>
      ["cat-subscriptions", "cat-entertainment", "cat-restaurants"].includes(
        transaction.category.id
      )
    )
    .reduce((sum, row) => sum + row.amount, 0);
  const budgets = buildBudgetRows(transactions);

  return {
    budgets: budgets.map((budget) => ({
      category: budget.category,
      limitAmount: budget.limitAmount,
      spent: budget.spent,
      isExceeded: budget.isExceeded,
      isSubscription: demoCategories.find((category) => category.id === budget.categoryId)
        ?.isSubscription
    })),
    monthlyCashflow,
    currentMonthIncome: currentMonth.income,
    currentMonthExpense: currentMonth.expense,
    freeCashflow,
    savingsRate: currentMonth.income > 0 ? percent(freeCashflow, currentMonth.income) : 0,
    emergencyFundMonths,
    emergencyFundTargetMonths: 6,
    essentialExpenseShare:
      currentMonth.income > 0 ? percent(essentialExpense, currentMonth.income) : 0,
    subscriptionAndEntertainmentShare:
      currentMonth.expense > 0 ? percent(softExpense, currentMonth.expense) : 0,
    goals: goals.map((goal) => ({
      title: goal.title,
      progress: goal.progress,
      monthlyContribution: goal.monthlyContribution
    }))
  };
}

function buildAnalyticsFromTransactions(
  transactions: TransactionRow[],
  currency: string,
  source: DataSource,
  locale: Locale = DEFAULT_LOCALE
): AnalyticsData {
  const months = [
    subMonths(new Date(), 5),
    subMonths(new Date(), 4),
    subMonths(new Date(), 3),
    subMonths(new Date(), 2),
    subMonths(new Date(), 1),
    new Date()
  ];

  const monthlyCashflow = months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const rows = transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return date >= start && date <= end;
    });
    const income = rows
      .filter((row) => row.type === "INCOME")
      .reduce((sum, row) => sum + row.amount, 0);
    const expense = rows
      .filter((row) => row.type === "EXPENSE")
      .reduce((sum, row) => sum + row.amount, 0);
    const savings = income - expense;
    const savingsRate = income > 0 ? percent(savings, income) : 0;
    return {
      month: format(month, "LLL", { locale: ru }),
      income,
      expense,
      savings,
      savingsRate
    };
  });

  const totalIncome = monthlyCashflow.reduce((sum, m) => sum + m.income, 0);
  const totalExpense = monthlyCashflow.reduce((sum, m) => sum + m.expense, 0);
  const nonZeroMonths = monthlyCashflow.filter((m) => m.income > 0 || m.expense > 0).length || 1;
  const avgMonthlyIncome = roundMoney(totalIncome / nonZeroMonths);
  const avgMonthlyExpense = roundMoney(totalExpense / nonZeroMonths);
  const avgSavingsRate = roundMoney(
    monthlyCashflow.reduce((sum, m) => sum + m.savingsRate, 0) / monthlyCashflow.length
  );

  const bestWorst = pickBestWorstMonth(monthlyCashflow);

  const categoryTotals = new Map<
    string,
    { categoryId: string; category: string; color: string; total: number }
  >();
  const sixMonthsAgo = startOfMonth(months[0]);
  const expenseTransactions = transactions.filter(
    (t) => t.type === "EXPENSE" && new Date(t.date) >= sixMonthsAgo
  );
  const totalExpenseAll = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
  for (const t of expenseTransactions) {
    const existing = categoryTotals.get(t.category.id) ?? {
      categoryId: t.category.id,
      category: t.category.label,
      color: t.category.color,
      total: 0
    };
    existing.total += t.amount;
    categoryTotals.set(t.category.id, existing);
  }
  const topExpenseCategories = [...categoryTotals.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((item) => ({
      ...item,
      share: totalExpenseAll > 0 ? percent(item.total, totalExpenseAll) : 0
    }));
  const derived = buildAnalyticsDerived(monthlyCashflow, topExpenseCategories, locale);
  const topIncomeCategories = topCategories(transactions, {
    type: "INCOME",
    since: formatInputDate(sixMonthsAgo),
    colorOf: (categoryId) => transactions.find((t) => t.category.id === categoryId)?.category.color
  });

  return {
    source,
    currency,
    monthlyCashflow,
    topExpenseCategories,
    topIncomeCategories,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgSavingsRate,
    bestMonth: bestWorst.best,
    worstMonth: bestWorst.worst,
    expenseChangePct: derived.expenseChangePct,
    savingsRateTrend: derived.savingsRateTrend,
    insights: derived.insights
  };
}

function normalizeSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value
    ])
  );
}

// ---- Page data -------------------------------------------------------------

export async function getDashboardData(): Promise<DashboardData> {
  const locale = DEFAULT_LOCALE;
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const input = buildFinanceInput([], [], []);
  const service = new FinanceRecommendationService();

  return {
    source: "database",
    currency: "RUB",
    metrics: [
      {
        key: "totalBalance",
        title: t("svc.metric.totalBalance"),
        value: formatCurrency(0),
        detail: t("svc.metric.totalBalance.detail")
      },
      {
        key: "monthIncome",
        title: t("svc.metric.monthIncome"),
        value: formatCurrency(0),
        detail: t("svc.metric.month.detail"),
        tone: "success"
      },
      {
        key: "monthExpense",
        title: t("svc.metric.monthExpense"),
        value: formatCurrency(0),
        detail: t("svc.metric.month.detail"),
        tone: "warning"
      },
      {
        key: "freeCash",
        title: t("svc.metric.freeCash"),
        value: formatCurrency(0),
        detail: t("svc.metric.freeCash.detail"),
        tone: "success"
      },
      {
        key: "savingsRate",
        title: t("svc.metric.savingsRate"),
        value: "0.0%",
        detail: t("svc.metric.savingsRate.detail")
      },
      {
        key: "emergencyFund",
        title: t("svc.metric.emergencyFund"),
        value: t("svc.value.months", { months: "0.0" }),
        detail: t("svc.metric.emergencyFund.detail")
      }
    ],
    categoryExpenses: [],
    categoryIncome: [],
    monthlyCashflow: input.monthlyCashflow,
    recommendations: [],
    health: service.healthScore(input, locale),
    netWorth: 0,
    liabilitiesTotal: 0,
    netWorthBreakdown: buildNetWorthBreakdown({ totalBalance: 0 }),
    netWorthTrend: [],
    emergencyFund: buildEmergencyFund({
      savingsBalance: 0,
      averageMonthlyExpense: 0,
      targetMonths: 6
    })
  };
}

export async function getTransactionsPageData(
  searchParams: Record<string, string | string[] | undefined>
): Promise<TransactionsPageData> {
  const parsed = transactionFilterSchema.parse(normalizeSearchParams(searchParams));

  return {
    source: "database",
    transactions: [],
    accounts: [],
    categories: [],
    rules: [],
    filters: parsed,
    pagination: {
      page: parsed.page,
      limit: parsed.limit,
      total: 0,
      hasPreviousPage: false,
      hasNextPage: false
    }
  };
}

export async function getRecurringTransactionsPageData(): Promise<RecurringTransactionsPageData> {
  return {
    source: "database",
    recurringTransactions: [],
    accounts: [],
    categories: [],
    budgetHints: [],
    debtPayments: [],
    interestAccruals: [],
    currency: "RUB",
    summary: {
      activeCount: 0,
      dueCount: 0,
      nextSevenDaysAmount: 0,
      monthlyPlannedExpense: 0,
      monthlyPlannedIncome: 0
    }
  };
}

export async function getRulesPageData(): Promise<RulesPageData> {
  return { source: "database", rules: [], categories: [] };
}

export async function getForecastData(): Promise<ForecastPageData> {
  return new CashflowForecastService().build(
    {
      source: "database",
      currency: "RUB",
      accounts: [],
      recurringTransactions: [],
      goals: []
    },
    DEFAULT_LOCALE
  );
}

export async function getAccountsPageData(): Promise<AccountsPageData> {
  return { source: "database", accounts: [], totalBalance: 0, currency: "RUB" };
}

export async function getBudgetsPageData(month?: string): Promise<BudgetsPageData> {
  const targetMonthDate = month ? new Date(`${month}-01`) : new Date();

  return {
    source: "database",
    budgets: [],
    categories: [],
    recommendations: [],
    currency: "RUB",
    selectedMonth: format(startOfMonth(targetMonthDate), "yyyy-MM")
  };
}

export async function getGoalsPageData(): Promise<GoalsPageData> {
  return { source: "database", goals: [], currency: "RUB" };
}

export async function getLiabilitiesPageData(): Promise<LiabilitiesPageData> {
  return { source: "database", liabilities: [], total: 0, currency: "RUB" };
}

export async function getInvestmentData(): Promise<InvestmentData> {
  return {
    source: "database",
    currency: "RUB",
    riskProfile: translate(DEFAULT_LOCALE, "riskProfile.MODERATE"),
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

export async function getSettingsPageData(): Promise<SettingsPageData> {
  return {
    source: "database",
    currency: "RUB",
    demoMode: false,
    emergencyFundMonthsTarget: 6,
    riskProfileCode: "MODERATE",
    theme: "system",
    density: "comfortable",
    defaultTransactionType: "EXPENSE",
    autoMaterializeRecurring: false,
    paymentReminders: false,
    aiEnabled: false,
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

export async function getImportPageData(): Promise<ImportPageData> {
  return {
    source: "database",
    accounts: [],
    categories: [],
    lastBackupAt: null,
    backupReminderDue: true
  };
}

export async function getPlanFactPageData(): Promise<PlanFactPageData> {
  return { source: "database", currency: "RUB", columns: [], months: [] };
}

export async function getCategoriesPageData(): Promise<CategoriesPageData> {
  return { source: "database", categories: [] };
}

export async function getAnalyticsData(): Promise<AnalyticsData> {
  return buildAnalyticsFromTransactions([], "RUB", "database", DEFAULT_LOCALE);
}

export function dateInputValue(value: string | Date) {
  return formatInputDate(value);
}

export function monthLabel(value: string | Date) {
  return formatMonth(value);
}

export function accountTypeLabel(type: string) {
  return ACCOUNT_TYPE_LABELS[type as keyof typeof ACCOUNT_TYPE_LABELS] ?? type;
}
