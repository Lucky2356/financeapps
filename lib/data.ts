import type { Prisma, RecurrenceFrequency, RiskProfileCode, TransactionType } from "@prisma/client";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";

import { ACCOUNT_TYPE_LABELS, RISK_PROFILE_LABELS } from "@/lib/constants";
import { shouldUseBuildFallbackData } from "@/lib/build-mode";
import {
  buildCategoryExpenses,
  buildMonthlyCashflow,
  buildSectorStructure,
  currentMonthRange
} from "@/lib/data/derive";
import { formatCurrency, formatInputDate, formatMonth } from "@/lib/format";
import { suggestedLimitFor } from "@/lib/budget-suggest";
import { buildEmergencyFund } from "@/lib/emergency-fund";
import { buildNetWorthTrend, computeNetWorth } from "@/lib/net-worth";
import type { CategorizationRule } from "@/lib/categorization-rules";
import { prisma } from "@/lib/prisma";
import { clamp, percent, roundMoney, toNumber } from "@/lib/utils";
import { transactionFilterSchema } from "@/lib/validations";
import { CashflowForecastService } from "@/services/CashflowForecastService";
import { FinanceRecommendationService } from "@/services/FinanceRecommendationService";
import { InvestmentAnalysisService } from "@/services/InvestmentAnalysisService";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";
import { buildAnalyticsDerived } from "@/services/AnalyticsInsightService";
import { createMarketDataProvider } from "@/services/market/createMarketDataProvider";
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
  Option,
  RecurringTransactionRow,
  RecommendationView,
  TransactionRow
} from "@/types/finance";

type CategoryOption = Option & {
  kind: "INCOME" | "EXPENSE";
  color: string;
  icon?: string;
  isEssential?: boolean;
  isSubscription?: boolean;
};

export type TransactionsPageData = {
  source: DataSource;
  transactions: TransactionRow[];
  accounts: AccountRow[];
  categories: CategoryOption[];
  filters: {
    from?: string;
    to?: string;
    type?: "ALL" | "INCOME" | "EXPENSE";
    categoryId?: string;
    accountId?: string;
    q?: string;
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
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  avgSavingsRate: number;
  bestMonth: string;
  worstMonth: string;
  expenseChangePct: number;
  savingsRateTrend: "up" | "down" | "flat";
  insights: RecommendationView[];
};

type DemoTransaction = TransactionRow & {
  categoryMeta: CategoryOption;
};
type TransactionFilters = ReturnType<typeof transactionFilterSchema.parse>;

const demoAccounts: AccountRow[] = [
  { id: "account-cash", name: "Наличные", type: "CASH", balance: 32000, currency: "RUB" },
  {
    id: "account-card",
    name: "Дебетовая карта",
    type: "DEBIT_CARD",
    balance: 184500,
    currency: "RUB"
  },
  {
    id: "account-savings",
    name: "Накопительный счет",
    type: "SAVINGS",
    balance: 280000,
    currency: "RUB"
  },
  {
    id: "account-brokerage",
    name: "Брокерский счет",
    type: "BROKERAGE",
    balance: 420000,
    currency: "RUB"
  }
];

const demoCategories: CategoryOption[] = [
  { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#16a34a" },
  { id: "cat-freelance", label: "Фриланс", kind: "INCOME", color: "#0d9488" },
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
  { id: "cat-entertainment", label: "Развлечения", kind: "EXPENSE", color: "#eab308" },
  { id: "cat-health", label: "Здоровье", kind: "EXPENSE", color: "#dc2626", isEssential: true },
  { id: "cat-education", label: "Образование", kind: "EXPENSE", color: "#0891b2" },
  { id: "cat-restaurants", label: "Рестораны", kind: "EXPENSE", color: "#ea580c" },
  { id: "cat-travel", label: "Путешествия", kind: "EXPENSE", color: "#0284c7" }
];

const budgetLimits = new Map([
  ["cat-food", 43000],
  ["cat-transport", 12000],
  ["cat-utilities", 21000],
  ["cat-subscriptions", 7000],
  ["cat-entertainment", 18000],
  ["cat-restaurants", 12000],
  ["cat-health", 14000],
  ["cat-education", 16000],
  ["cat-travel", 25000]
]);

function demoDate(monthOffset: number, day: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

function buildDemoTransactions(): DemoTransaction[] {
  const rows = [
    [-2, 5, 210000, "INCOME", "cat-salary", "account-card", "Зарплата за месяц"],
    [-2, 14, 22000, "INCOME", "cat-freelance", "account-card", "Проектная оплата"],
    [-2, 3, 38200, "EXPENSE", "cat-food", "account-card", "Супермаркеты"],
    [-2, 6, 9800, "EXPENSE", "cat-transport", "account-card", "Такси и проезд"],
    [-2, 8, 18500, "EXPENSE", "cat-utilities", "account-card", "Коммунальные платежи"],
    [-2, 10, 6900, "EXPENSE", "cat-subscriptions", "account-card", "Сервисы и приложения"],
    [-2, 19, 16400, "EXPENSE", "cat-entertainment", "account-card", "Кино и мероприятия"],
    [-2, 22, 8400, "EXPENSE", "cat-restaurants", "account-card", "Кафе"],
    [-1, 5, 210000, "INCOME", "cat-salary", "account-card", "Зарплата за месяц"],
    [-1, 12, 27000, "INCOME", "cat-freelance", "account-card", "Консультации"],
    [-1, 2, 42600, "EXPENSE", "cat-food", "account-card", "Супермаркеты"],
    [-1, 7, 11800, "EXPENSE", "cat-transport", "account-card", "Такси и проезд"],
    [-1, 9, 19000, "EXPENSE", "cat-utilities", "account-card", "Коммунальные платежи"],
    [-1, 13, 7600, "EXPENSE", "cat-subscriptions", "account-card", "Сервисы и приложения"],
    [-1, 20, 21400, "EXPENSE", "cat-entertainment", "account-card", "Концерты"],
    [-1, 24, 13300, "EXPENSE", "cat-restaurants", "account-card", "Кафе"],
    [-1, 28, 18000, "EXPENSE", "cat-education", "account-card", "Курс"],
    [0, 5, 210000, "INCOME", "cat-salary", "account-card", "Зарплата за месяц"],
    [0, 11, 18500, "INCOME", "cat-freelance", "account-card", "Разовая задача"],
    [0, 2, 48700, "EXPENSE", "cat-food", "account-card", "Супермаркеты"],
    [0, 6, 13200, "EXPENSE", "cat-transport", "account-card", "Такси и проезд"],
    [0, 8, 19700, "EXPENSE", "cat-utilities", "account-card", "Коммунальные платежи"],
    [0, 10, 8800, "EXPENSE", "cat-subscriptions", "account-card", "Сервисы и приложения"],
    [0, 15, 24800, "EXPENSE", "cat-entertainment", "account-card", "Выходные"],
    [0, 19, 16200, "EXPENSE", "cat-restaurants", "account-card", "Кафе"],
    [0, 22, 12600, "EXPENSE", "cat-health", "account-card", "Врач"],
    [0, 25, 30000, "EXPENSE", "cat-travel", "account-savings", "Билеты"]
  ] as const;

  return rows.map(([monthOffset, day, amount, type, categoryId, accountId, description], index) => {
    const category = demoCategories.find((item) => item.id === categoryId)!;
    const account = demoAccounts.find((item) => item.id === accountId)!;

    return {
      id: `demo-tx-${index}`,
      amount,
      type: type as TransactionType,
      date: demoDate(monthOffset, day).toISOString(),
      description,
      account: { id: account.id, label: account.name },
      category: { id: category.id, label: category.label, color: category.color },
      categoryMeta: category
    };
  });
}

const frequencyMonthlyFactor: Record<RecurrenceFrequency, number> = {
  WEEKLY: 4.33,
  MONTHLY: 1,
  YEARLY: 1 / 12
};

function buildRecurringSummary(rows: RecurringTransactionRow[]) {
  const service = new RecurringTransactionService();
  const activeRows = rows.filter((row) => row.isActive);
  const nextSevenDaysAmount = activeRows
    .filter((row) => service.isUpcomingSoon(new Date(row.nextDate)) || row.isDue)
    .reduce((sum, row) => sum + row.amount, 0);
  const monthlyAmount = (type: TransactionType) =>
    activeRows
      .filter((row) => row.type === type)
      .reduce((sum, row) => sum + row.amount * frequencyMonthlyFactor[row.frequency], 0);

  return {
    activeCount: activeRows.length,
    dueCount: activeRows.filter((row) => row.isDue).length,
    nextSevenDaysAmount: roundMoney(nextSevenDaysAmount),
    monthlyPlannedExpense: roundMoney(monthlyAmount("EXPENSE")),
    monthlyPlannedIncome: roundMoney(monthlyAmount("INCOME"))
  };
}

function buildDemoRecurringTransactions(): RecurringTransactionRow[] {
  const service = new RecurringTransactionService();
  const rows = [
    [0, 5, 210000, "INCOME", "MONTHLY", "cat-salary", "account-card", "Зарплата"],
    [0, 8, 19700, "EXPENSE", "MONTHLY", "cat-utilities", "account-card", "ЖКХ"],
    [0, 10, 8800, "EXPENSE", "MONTHLY", "cat-subscriptions", "account-card", "Подписки"],
    [0, 12, 3500, "EXPENSE", "WEEKLY", "cat-food", "account-card", "Плановая закупка продуктов"],
    [1, 3, 15000, "EXPENSE", "MONTHLY", "cat-education", "account-card", "Обучение"]
  ] as const;

  return service.sortUpcoming(
    rows.map(
      ([monthOffset, day, amount, type, frequency, categoryId, accountId, description], index) => {
        const category = demoCategories.find((item) => item.id === categoryId)!;
        const account = demoAccounts.find((item) => item.id === accountId)!;
        const nextDate = demoDate(monthOffset, day);
        const status = service.getStatus({ nextDate, frequency, isActive: true });

        return {
          id: `demo-recurring-${index}`,
          amount,
          type,
          frequency,
          nextDate: nextDate.toISOString(),
          description,
          isActive: true,
          daysUntilNext: status.daysUntilNext,
          isDue: status.isDue,
          account: { id: account.id, label: account.name },
          category: { id: category.id, label: category.label, color: category.color }
        };
      }
    )
  );
}

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
        progress: limitAmount > 0 ? clamp(percent(spent, limitAmount), 0, 140) : 0,
        isExceeded: limitAmount > 0 && spent > limitAmount,
        suggestedLimit: suggestedLimitFor(category.id, transactions, { now: monthDate })
      };
    });
}

function buildDemoGoals(): GoalRow[] {
  const rows = [
    ["goal-emergency", "Финансовая подушка", 900000, 280000, 9],
    ["goal-vacation", "Отпуск", 260000, 85000, 5],
    ["goal-laptop", "Обновление ноутбука", 220000, 70000, 7]
  ] as const;

  return rows.map(([id, title, targetAmount, currentAmount, months]) => {
    const deadline = subMonths(new Date(), -months);
    const remaining = Math.max(targetAmount - currentAmount, 0);

    return {
      id,
      title,
      targetAmount,
      currentAmount,
      deadline: deadline.toISOString(),
      progress: clamp(percent(currentAmount, targetAmount), 0, 100),
      monthlyContribution: Math.ceil(remaining / Math.max(months, 1))
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

function buildTrend(
  current: number,
  previous: number
): { value: number; label: string } | undefined {
  if (previous === 0) return undefined;
  const diff = percent(current - previous, previous);
  return { value: diff, label: "vs прошлый мес." };
}

function buildDemoDashboard(): DashboardData {
  const transactions = buildDemoTransactions();
  const goals = buildDemoGoals();
  const input = buildFinanceInput(transactions, demoAccounts, goals);
  const service = new FinanceRecommendationService();
  const totalBalance = demoAccounts.reduce((sum, account) => sum + account.balance, 0);
  const prevMonth = input.monthlyCashflow[input.monthlyCashflow.length - 2];
  const currMonth = input.monthlyCashflow[input.monthlyCashflow.length - 1];

  return {
    source: "demo-fallback",
    currency: "RUB",
    metrics: [
      {
        title: "Общий баланс",
        value: formatCurrency(totalBalance),
        detail: "Все счета и брокерский счет"
      },
      {
        title: "Доходы за месяц",
        value: formatCurrency(input.currentMonthIncome),
        detail: "Текущий календарный месяц",
        tone: "success",
        trend: buildTrend(currMonth.income, prevMonth?.income ?? 0)
      },
      {
        title: "Расходы за месяц",
        value: formatCurrency(input.currentMonthExpense),
        detail: "Текущий календарный месяц",
        tone: "warning",
        trend: buildTrend(currMonth.expense, prevMonth?.expense ?? 0)
      },
      {
        title: "Свободный остаток",
        value: formatCurrency(input.freeCashflow),
        detail: "Доходы минус расходы",
        tone: input.freeCashflow >= 0 ? "success" : "danger",
        trend: buildTrend(input.freeCashflow, (prevMonth?.income ?? 0) - (prevMonth?.expense ?? 0))
      },
      {
        title: "Процент накоплений",
        value: `${input.savingsRate.toFixed(1)}%`,
        detail: "Доля свободного остатка"
      },
      {
        title: "Финансовая подушка",
        value: `${input.emergencyFundMonths.toFixed(1)} мес.`,
        detail: "Резерв к средним расходам"
      }
    ],
    categoryExpenses: buildCategoryExpenses(transactions),
    monthlyCashflow: input.monthlyCashflow,
    recommendations: service.build(input),
    health: service.healthScore(input),
    netWorth: totalBalance,
    liabilitiesTotal: 0,
    netWorthTrend: buildNetWorthTrend({ currentNetWorth: totalBalance, transactions }),
    emergencyFund: buildEmergencyFund({
      savingsBalance: demoAccounts
        .filter((account) => account.type === "SAVINGS")
        .reduce((sum, account) => sum + account.balance, 0),
      averageMonthlyExpense:
        input.monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) /
        Math.max(input.monthlyCashflow.length, 1),
      targetMonths: 6
    })
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

async function getDefaultUser() {
  if (!prisma) return null;

  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    include: { riskProfile: true }
  });
}

async function safeData<T>(
  fallback: () => T | Promise<T>,
  query: () => Promise<T>,
  staticFallback?: () => T | Promise<T>
): Promise<T> {
  // Desktop/mobile static export: the client LocalApiClient is the source of
  // truth, so the baked-in server data must be EMPTY (not demo) to avoid
  // "phantom" data and account-id mismatches in forms.
  if (shouldUseBuildFallbackData()) return (staticFallback ?? fallback)();
  if (!prisma) return fallback();

  try {
    return await query();
  } catch (error) {
    console.error("Data layer fallback:", error);
    return fallback();
  }
}

// ---- Empty fallbacks for static (desktop) builds ----
// source "database" so the SourceBanner does not flag a demo state.

function emptyDashboard(): DashboardData {
  const input = buildFinanceInput([], [], []);
  const service = new FinanceRecommendationService();
  return {
    source: "database",
    currency: "RUB",
    metrics: [
      { title: "Общий баланс", value: formatCurrency(0), detail: "Все активные счета" },
      {
        title: "Доходы за месяц",
        value: formatCurrency(0),
        detail: "Текущий календарный месяц",
        tone: "success"
      },
      {
        title: "Расходы за месяц",
        value: formatCurrency(0),
        detail: "Текущий календарный месяц",
        tone: "warning"
      },
      {
        title: "Свободный остаток",
        value: formatCurrency(0),
        detail: "Доходы минус расходы",
        tone: "success"
      },
      { title: "Процент накоплений", value: "0.0%", detail: "Доля свободного остатка" },
      { title: "Финансовая подушка", value: "0.0 мес.", detail: "Резерв к средним расходам" }
    ],
    categoryExpenses: [],
    monthlyCashflow: input.monthlyCashflow,
    recommendations: [],
    health: service.healthScore(input),
    netWorth: 0,
    liabilitiesTotal: 0,
    netWorthTrend: [],
    emergencyFund: buildEmergencyFund({
      savingsBalance: 0,
      averageMonthlyExpense: 0,
      targetMonths: 6
    })
  };
}

function emptyForecast(): ForecastPageData {
  return new CashflowForecastService().build({
    source: "database",
    currency: "RUB",
    accounts: [],
    recurringTransactions: [],
    goals: []
  });
}

function emptyAnalytics(): AnalyticsData {
  return buildAnalyticsFromTransactions([], "RUB", "database");
}

function emptyInvestments(): InvestmentData {
  return {
    source: "database",
    currency: "RUB",
    riskProfile: RISK_PROFILE_LABELS.MODERATE,
    securities: [],
    watchlist: [],
    portfolio: [],
    structure: [],
    sectorStructure: [],
    risks: [],
    education: []
  };
}

function toAccountRow(account: {
  id: string;
  name: string;
  type: string;
  balance: unknown;
  currency: string;
}): AccountRow {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    balance: toNumber(account.balance),
    currency: account.currency
  };
}

function toCategoryOption(category: {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  color: string;
  icon?: string | null;
  isEssential: boolean;
  isSubscription: boolean;
}): CategoryOption {
  return {
    id: category.id,
    label: category.name,
    kind: category.kind,
    color: category.color,
    icon: category.icon ?? undefined,
    isEssential: category.isEssential,
    isSubscription: category.isSubscription
  };
}

function transactionWhere(
  userId: string,
  filters: TransactionFilters
): Prisma.TransactionWhereInput {
  return {
    userId,
    ...(filters.type && filters.type !== "ALL" ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.q
      ? {
          OR: [
            { description: { contains: filters.q, mode: "insensitive" } },
            { account: { name: { contains: filters.q, mode: "insensitive" } } },
            { category: { name: { contains: filters.q, mode: "insensitive" } } }
          ]
        }
      : {}),
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {})
          }
        }
      : {})
  };
}

async function getDatabaseTransactions(
  userId: string,
  filters: TransactionFilters = transactionFilterSchema.parse({})
) {
  if (!prisma) return [];

  const transactions = await prisma.transaction.findMany({
    where: transactionWhere(userId, filters),
    orderBy: { date: "desc" },
    skip: ((filters.page ?? 1) - 1) * (filters.limit ?? 20),
    take: filters.limit ?? 20,
    include: {
      account: true,
      category: true
    }
  });

  return transactions.map(
    (transaction): TransactionRow => ({
      id: transaction.id,
      amount: toNumber(transaction.amount),
      type: transaction.type,
      date: transaction.date.toISOString(),
      description: transaction.description,
      account: { id: transaction.account.id, label: transaction.account.name },
      category: {
        id: transaction.category.id,
        label: transaction.category.name,
        color: transaction.category.color,
        icon: transaction.category.icon ?? undefined
      }
    })
  );
}

function toRecurringTransactionRow(row: {
  id: string;
  amount: unknown;
  type: TransactionType;
  frequency: RecurrenceFrequency;
  nextDate: Date;
  description: string | null;
  isActive: boolean;
  account: { id: string; name: string };
  category: { id: string; name: string; color: string };
}): RecurringTransactionRow {
  const status = new RecurringTransactionService().getStatus({
    nextDate: row.nextDate,
    frequency: row.frequency,
    isActive: row.isActive
  });

  return {
    id: row.id,
    amount: toNumber(row.amount),
    type: row.type,
    frequency: row.frequency,
    nextDate: row.nextDate.toISOString(),
    description: row.description,
    isActive: row.isActive,
    daysUntilNext: status.daysUntilNext,
    isDue: status.isDue,
    account: { id: row.account.id, label: row.account.name },
    category: { id: row.category.id, label: row.category.name, color: row.category.color }
  };
}

async function getDatabaseFinanceInput(userId: string, emergencyFundTargetMonths: number) {
  if (!prisma) throw new Error("Prisma client is not configured.");

  const [accounts, categories, goals, transactions] = await Promise.all([
    prisma.account.findMany({ where: { userId, isArchived: false } }),
    prisma.category.findMany({ where: { userId } }),
    prisma.savingGoal.findMany({ where: { userId } }),
    getDatabaseTransactions(userId)
  ]);

  const accountRows = accounts.map(toAccountRow);
  const goalRows = goals.map(toGoalRow);
  const monthlyCashflow = buildMonthlyCashflow(transactions);
  const currentMonth = monthlyCashflow[monthlyCashflow.length - 1];
  const averageExpense =
    monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) /
    Math.max(monthlyCashflow.length, 1);
  const emergencyFund = accountRows
    .filter((account) => account.type === "SAVINGS")
    .reduce((sum, account) => sum + account.balance, 0);
  const { start, end } = currentMonthRange();
  const currentExpenseRows = transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return transaction.type === "EXPENSE" && date >= start && date <= end;
  });
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const essentialExpense = currentExpenseRows
    .filter((transaction) => categoryById.get(transaction.category.id)?.isEssential)
    .reduce((sum, row) => sum + row.amount, 0);
  const softExpense = currentExpenseRows
    .filter((transaction) => {
      const category = categoryById.get(transaction.category.id);
      return (
        category?.isSubscription || ["Развлечения", "Рестораны"].includes(category?.name ?? "")
      );
    })
    .reduce((sum, row) => sum + row.amount, 0);
  const budgetRows = await buildDatabaseBudgetRows(
    userId,
    transactions,
    categories.map(toCategoryOption)
  );
  const freeCashflow = currentMonth.income - currentMonth.expense;

  return {
    input: {
      budgets: budgetRows.map((budget) => ({
        category: budget.category,
        limitAmount: budget.limitAmount,
        spent: budget.spent,
        isExceeded: budget.isExceeded,
        isSubscription: categoryById.get(budget.categoryId)?.isSubscription
      })),
      monthlyCashflow,
      currentMonthIncome: currentMonth.income,
      currentMonthExpense: currentMonth.expense,
      freeCashflow,
      savingsRate: currentMonth.income > 0 ? percent(freeCashflow, currentMonth.income) : 0,
      emergencyFundMonths: averageExpense > 0 ? emergencyFund / averageExpense : 0,
      emergencyFundTargetMonths,
      essentialExpenseShare:
        currentMonth.income > 0 ? percent(essentialExpense, currentMonth.income) : 0,
      subscriptionAndEntertainmentShare:
        currentMonth.expense > 0 ? percent(softExpense, currentMonth.expense) : 0,
      goals: goalRows.map((goal) => ({
        title: goal.title,
        progress: goal.progress,
        monthlyContribution: goal.monthlyContribution
      }))
    },
    accounts: accountRows,
    transactions,
    goals: goalRows
  };
}

function toGoalRow(goal: {
  id: string;
  title: string;
  targetAmount: unknown;
  currentAmount: unknown;
  deadline: Date;
}): GoalRow {
  const targetAmount = toNumber(goal.targetAmount);
  const currentAmount = toNumber(goal.currentAmount);
  const monthsLeft = Math.max(
    1,
    Math.ceil(
      (startOfMonth(goal.deadline).getTime() - startOfMonth(new Date()).getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    )
  );
  const remaining = Math.max(targetAmount - currentAmount, 0);

  return {
    id: goal.id,
    title: goal.title,
    targetAmount,
    currentAmount,
    deadline: goal.deadline.toISOString(),
    progress: clamp(percent(currentAmount, targetAmount), 0, 100),
    monthlyContribution: Math.ceil(remaining / monthsLeft)
  };
}

async function buildDatabaseBudgetRows(
  userId: string,
  transactions: TransactionRow[],
  categories: CategoryOption[],
  targetMonthDate?: Date
): Promise<BudgetRow[]> {
  if (!prisma) return [];

  const monthDate = targetMonthDate ?? new Date();
  const month = startOfMonth(monthDate);
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const budgets = await prisma.budget.findMany({
    where: { userId, month },
    include: { category: true }
  });
  const budgetByCategory = new Map(budgets.map((budget) => [budget.categoryId, budget]));

  return categories
    .filter((category) => category.kind === "EXPENSE")
    .map((category) => {
      const budget = budgetByCategory.get(category.id);
      const limitAmount = budget ? toNumber(budget.limitAmount) : 0;
      const spent = transactions
        .filter((transaction) => {
          const date = new Date(transaction.date);
          return (
            transaction.type === "EXPENSE" &&
            transaction.category.id === category.id &&
            date >= start &&
            date <= end
          );
        })
        .reduce((sum, row) => sum + row.amount, 0);

      return {
        id: budget?.id ?? `new-${category.id}`,
        categoryId: category.id,
        category: category.label,
        color: category.color,
        limitAmount,
        spent,
        progress: limitAmount > 0 ? clamp(percent(spent, limitAmount), 0, 140) : 0,
        isExceeded: limitAmount > 0 && spent > limitAmount,
        suggestedLimit: suggestedLimitFor(category.id, transactions, { now: monthDate })
      };
    });
}

export async function getDashboardData(): Promise<DashboardData> {
  return safeData<DashboardData>(
    buildDemoDashboard,
    async () => {
      const user = await getDefaultUser();
      if (!user) return buildDemoDashboard();

      const finance = await getDatabaseFinanceInput(user.id, user.emergencyFundMonthsTarget);
      const service = new FinanceRecommendationService();
      const totalBalance = finance.accounts.reduce((sum, account) => sum + account.balance, 0);
      const input = finance.input;

      // Net worth = accounts + current portfolio value + goal savings (parity with desktop).
      const investments = await getInvestmentData();
      const portfolioValue = investments.portfolio.reduce(
        (sum, position) => sum + position.currentValue,
        0
      );
      const goalSavings = finance.goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
      const liabilities = prisma
        ? (await prisma.liability.findMany({ where: { userId: user.id } })).map(toLiabilityRow)
        : [];
      const liabilitiesTotal = roundMoney(liabilities.reduce((sum, item) => sum + item.balance, 0));
      const monthlyDebtPayments = liabilities.reduce((sum, item) => sum + item.minPayment, 0);
      const healthInput = { ...input, monthlyDebtPayments };
      const netWorth = computeNetWorth({
        totalBalance,
        portfolioValue,
        goalSavings,
        liabilitiesTotal
      });

      const savingsBalance = finance.accounts
        .filter((account) => account.type === "SAVINGS")
        .reduce((sum, account) => sum + account.balance, 0);
      const averageMonthlyExpense =
        input.monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) /
        Math.max(input.monthlyCashflow.length, 1);
      const emergencyFund = buildEmergencyFund({
        savingsBalance,
        averageMonthlyExpense,
        targetMonths: user.emergencyFundMonthsTarget
      });

      const prevMonth = input.monthlyCashflow[input.monthlyCashflow.length - 2];
      const currMonth = input.monthlyCashflow[input.monthlyCashflow.length - 1];

      return {
        source: "database",
        currency: user.currency,
        metrics: [
          {
            title: "Общий баланс",
            value: formatCurrency(totalBalance, user.currency),
            detail: "Все активные счета"
          },
          {
            title: "Доходы за месяц",
            value: formatCurrency(input.currentMonthIncome, user.currency),
            detail: "Текущий календарный месяц",
            tone: "success",
            trend: buildTrend(currMonth.income, prevMonth?.income ?? 0)
          },
          {
            title: "Расходы за месяц",
            value: formatCurrency(input.currentMonthExpense, user.currency),
            detail: "Текущий календарный месяц",
            tone: "warning",
            trend: buildTrend(currMonth.expense, prevMonth?.expense ?? 0)
          },
          {
            title: "Свободный остаток",
            value: formatCurrency(input.freeCashflow, user.currency),
            detail: "Доходы минус расходы",
            tone: input.freeCashflow >= 0 ? "success" : "danger",
            trend: buildTrend(
              input.freeCashflow,
              (prevMonth?.income ?? 0) - (prevMonth?.expense ?? 0)
            )
          },
          {
            title: "Процент накоплений",
            value: `${input.savingsRate.toFixed(1)}%`,
            detail: "Доля свободного остатка"
          },
          {
            title: "Финансовая подушка",
            value: `${input.emergencyFundMonths.toFixed(1)} мес.`,
            detail: "Резерв к средним расходам"
          }
        ],
        categoryExpenses: buildCategoryExpenses(finance.transactions),
        monthlyCashflow: input.monthlyCashflow,
        recommendations: service.build(healthInput),
        health: service.healthScore(healthInput),
        netWorth,
        liabilitiesTotal,
        netWorthTrend: buildNetWorthTrend({
          currentNetWorth: netWorth,
          transactions: finance.transactions
        }),
        emergencyFund
      };
    },
    emptyDashboard
  );
}

export async function getTransactionsPageData(
  searchParams: Record<string, string | string[] | undefined>
): Promise<TransactionsPageData> {
  const parsed = transactionFilterSchema.parse(normalizeSearchParams(searchParams));

  return safeData<TransactionsPageData>(
    () => {
      const filteredTransactions = buildDemoTransactions().filter((transaction) => {
        if (parsed.type && parsed.type !== "ALL" && transaction.type !== parsed.type) return false;
        if (parsed.categoryId && transaction.category.id !== parsed.categoryId) return false;
        if (parsed.accountId && transaction.account.id !== parsed.accountId) return false;
        if (parsed.q) {
          const query = parsed.q.toLowerCase();
          const haystack =
            `${transaction.description ?? ""} ${transaction.account.label} ${transaction.category.label}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        if (parsed.from && new Date(transaction.date) < new Date(parsed.from)) return false;
        if (parsed.to && new Date(transaction.date) > new Date(`${parsed.to}T23:59:59`))
          return false;
        return true;
      });
      const start = (parsed.page - 1) * parsed.limit;
      const transactions = filteredTransactions.slice(start, start + parsed.limit);

      return {
        source: "demo-fallback",
        transactions,
        accounts: demoAccounts,
        categories: demoCategories,
        filters: parsed,
        pagination: {
          page: parsed.page,
          limit: parsed.limit,
          total: filteredTransactions.length,
          hasPreviousPage: parsed.page > 1,
          hasNextPage: start + parsed.limit < filteredTransactions.length
        }
      };
    },
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const [transactions, total, accounts, categories] = await Promise.all([
        getDatabaseTransactions(user.id, parsed),
        prisma.transaction.count({ where: transactionWhere(user.id, parsed) }),
        prisma.account.findMany({
          where: { userId: user.id, isArchived: false },
          orderBy: { createdAt: "asc" }
        }),
        prisma.category.findMany({
          where: { userId: user.id },
          orderBy: [{ kind: "asc" }, { name: "asc" }]
        })
      ]);
      const start = (parsed.page - 1) * parsed.limit;

      return {
        source: "database",
        transactions,
        accounts: accounts.map(toAccountRow),
        categories: categories.map(toCategoryOption),
        filters: parsed,
        pagination: {
          page: parsed.page,
          limit: parsed.limit,
          total,
          hasPreviousPage: parsed.page > 1,
          hasNextPage: start + parsed.limit < total
        }
      };
    },
    () => ({
      source: "database",
      transactions: [],
      accounts: [],
      categories: [],
      filters: parsed,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total: 0,
        hasPreviousPage: false,
        hasNextPage: false
      }
    })
  );
}

export async function getRecurringTransactionsPageData(): Promise<RecurringTransactionsPageData> {
  return safeData<RecurringTransactionsPageData>(
    () => {
      const recurringTransactions = buildDemoRecurringTransactions();

      return {
        source: "demo-fallback",
        recurringTransactions,
        accounts: demoAccounts,
        categories: demoCategories,
        currency: "RUB",
        summary: buildRecurringSummary(recurringTransactions)
      };
    },
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const service = new RecurringTransactionService();
      const [recurringRows, accounts, categories] = await Promise.all([
        prisma.recurringTransaction.findMany({
          where: { userId: user.id },
          orderBy: [{ isActive: "desc" }, { nextDate: "asc" }],
          include: { account: true, category: true }
        }),
        prisma.account.findMany({
          where: { userId: user.id, isArchived: false },
          orderBy: { createdAt: "asc" }
        }),
        prisma.category.findMany({
          where: { userId: user.id },
          orderBy: [{ kind: "asc" }, { name: "asc" }]
        })
      ]);
      const recurringTransactions = service.sortUpcoming(
        recurringRows.map(toRecurringTransactionRow)
      );

      return {
        source: "database",
        recurringTransactions,
        accounts: accounts.map(toAccountRow),
        categories: categories.map(toCategoryOption),
        currency: user.currency,
        summary: buildRecurringSummary(recurringTransactions)
      };
    },
    () => ({
      source: "database",
      recurringTransactions: [],
      accounts: [],
      categories: [],
      currency: "RUB",
      summary: {
        activeCount: 0,
        dueCount: 0,
        nextSevenDaysAmount: 0,
        monthlyPlannedExpense: 0,
        monthlyPlannedIncome: 0
      }
    })
  );
}

export async function getForecastData(): Promise<ForecastPageData> {
  return safeData<ForecastPageData>(
    () => {
      const recurringTransactions = buildDemoRecurringTransactions();
      const goals = buildDemoGoals();

      return new CashflowForecastService().build({
        source: "demo-fallback",
        currency: "RUB",
        accounts: demoAccounts,
        recurringTransactions,
        goals
      });
    },
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const [accounts, recurringRows, goals] = await Promise.all([
        prisma.account.findMany({
          where: { userId: user.id, isArchived: false },
          orderBy: { createdAt: "asc" }
        }),
        prisma.recurringTransaction.findMany({
          where: { userId: user.id },
          orderBy: [{ isActive: "desc" }, { nextDate: "asc" }],
          include: { account: true, category: true }
        }),
        prisma.savingGoal.findMany({ where: { userId: user.id }, orderBy: { deadline: "asc" } })
      ]);

      return new CashflowForecastService().build({
        source: "database",
        currency: user.currency,
        accounts: accounts.map(toAccountRow),
        recurringTransactions: recurringRows.map(toRecurringTransactionRow),
        goals: goals.map(toGoalRow)
      });
    },
    emptyForecast
  );
}

export async function getAccountsPageData(): Promise<AccountsPageData> {
  return safeData<AccountsPageData>(
    () => ({
      source: "demo-fallback",
      accounts: demoAccounts,
      totalBalance: demoAccounts.reduce((sum, account) => sum + account.balance, 0),
      currency: "RUB"
    }),
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const accounts = (
        await prisma.account.findMany({
          where: { userId: user.id, isArchived: false },
          orderBy: { createdAt: "asc" }
        })
      ).map(toAccountRow);

      return {
        source: "database",
        accounts,
        totalBalance: accounts.reduce((sum, account) => sum + account.balance, 0),
        currency: user.currency
      };
    },
    () => ({ source: "database", accounts: [], totalBalance: 0, currency: "RUB" })
  );
}

export async function getBudgetsPageData(month?: string): Promise<BudgetsPageData> {
  const targetMonthDate = month ? new Date(`${month}-01`) : new Date();
  const selectedMonth = format(startOfMonth(targetMonthDate), "yyyy-MM");

  return safeData<BudgetsPageData>(
    () => {
      const transactions = buildDemoTransactions();
      const goals = buildDemoGoals();
      const input = buildFinanceInput(transactions, demoAccounts, goals);
      const service = new FinanceRecommendationService();

      return {
        source: "demo-fallback",
        budgets: buildBudgetRows(transactions, demoCategories, targetMonthDate),
        categories: demoCategories,
        recommendations: service
          .build(input)
          .filter((item) => ["WARNING", "CRITICAL", "INFO"].includes(item.severity)),
        currency: "RUB",
        selectedMonth
      };
    },
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const [categories, transactions] = await Promise.all([
        prisma.category.findMany({
          where: { userId: user.id },
          orderBy: [{ kind: "asc" }, { name: "asc" }]
        }),
        getDatabaseTransactions(user.id)
      ]);
      const categoryOptions = categories.map(toCategoryOption);
      const budgets = await buildDatabaseBudgetRows(
        user.id,
        transactions,
        categoryOptions,
        targetMonthDate
      );
      const finance = await getDatabaseFinanceInput(user.id, user.emergencyFundMonthsTarget);
      const recommendations = new FinanceRecommendationService()
        .build(finance.input)
        .filter((item) => ["WARNING", "CRITICAL", "INFO"].includes(item.severity));

      return {
        source: "database",
        budgets,
        categories: categoryOptions,
        recommendations,
        currency: user.currency,
        selectedMonth
      };
    },
    () => ({
      source: "database",
      budgets: [],
      categories: [],
      recommendations: [],
      currency: "RUB",
      selectedMonth
    })
  );
}

export async function getGoalsPageData(): Promise<GoalsPageData> {
  return safeData<GoalsPageData>(
    () => ({
      source: "demo-fallback",
      goals: buildDemoGoals(),
      currency: "RUB"
    }),
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const goals = await prisma.savingGoal.findMany({
        where: { userId: user.id },
        orderBy: { deadline: "asc" }
      });

      return {
        source: "database",
        goals: goals.map(toGoalRow),
        currency: user.currency
      };
    },
    () => ({ source: "database", goals: [], currency: "RUB" })
  );
}

function toLiabilityRow(row: {
  id: string;
  name: string;
  kind: string;
  balance: unknown;
  originalAmount: unknown;
  interestRate: unknown;
  minPayment: unknown;
  dueDay: number | null;
  currency: string;
}): LiabilityRow {
  const balance = toNumber(row.balance);
  const originalAmount = toNumber(row.originalAmount);
  const repaid = Math.max(originalAmount - balance, 0);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as LiabilityRow["kind"],
    balance,
    originalAmount,
    interestRate: toNumber(row.interestRate),
    minPayment: toNumber(row.minPayment),
    ...(row.dueDay != null ? { dueDay: row.dueDay } : {}),
    currency: row.currency,
    progress: originalAmount > 0 ? clamp(percent(repaid, originalAmount), 0, 100) : 0
  };
}

export async function getLiabilitiesPageData(): Promise<LiabilitiesPageData> {
  return safeData<LiabilitiesPageData>(
    () => ({ source: "demo-fallback", liabilities: [], total: 0, currency: "RUB" }),
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const liabilities = await prisma.liability.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" }
      });
      const rows = liabilities.map(toLiabilityRow);
      return {
        source: "database",
        liabilities: rows,
        total: roundMoney(rows.reduce((sum, item) => sum + item.balance, 0)),
        currency: user.currency
      };
    },
    () => ({ source: "database", liabilities: [], total: 0, currency: "RUB" })
  );
}

export async function getInvestmentData(): Promise<InvestmentData> {
  return safeData<InvestmentData>(
    buildDemoInvestmentData,
    async (): Promise<InvestmentData> => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");

      const watchlistItems = await prisma.watchlistItem.findMany({
        where: { userId: user.id },
        include: {
          security: {
            include: {
              prices: { orderBy: { date: "desc" }, take: 31 }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      });

      const securities = await prisma.security.findMany({
        include: {
          prices: { orderBy: { date: "desc" }, take: 1 }
        },
        orderBy: { ticker: "asc" }
      });

      const portfolio = await prisma.portfolio.findFirst({
        where: { userId: user.id },
        include: {
          positions: {
            include: {
              security: {
                include: {
                  prices: { orderBy: { date: "desc" }, take: 45 }
                }
              }
            }
          }
        }
      });

      const watchlist = watchlistItems.map((item) => {
        const latest = item.security.prices[0];
        return {
          ticker: item.security.ticker,
          name: item.security.name,
          sector: item.security.sector,
          price: latest ? toNumber(latest.price) : 0,
          changeDay: latest ? toNumber(latest.changeDay) : 0,
          change30d: latest ? toNumber(latest.change30d) : 0,
          risk: item.security.risk,
          comment: item.security.comment
        };
      });
      const securityRows = securities.map((security) => {
        const latest = security.prices[0];
        return {
          ticker: security.ticker,
          name: security.name,
          sector: security.sector,
          price: latest ? toNumber(latest.price) : 0,
          changeDay: latest ? toNumber(latest.changeDay) : 0,
          change30d: latest ? toNumber(latest.change30d) : 0,
          risk: security.risk,
          comment: security.comment
        };
      });

      const rowsWithoutShare =
        portfolio?.positions.map((position) => {
          const latest = position.security.prices[0];
          const currentPrice = latest ? toNumber(latest.price) : 0;
          const quantity = toNumber(position.quantity);
          const averageBuyPrice = toNumber(position.averageBuyPrice);
          const currentValue = roundMoney(currentPrice * quantity);

          return {
            ticker: position.security.ticker,
            name: position.security.name,
            sector: position.security.sector,
            quantity,
            averageBuyPrice,
            currentPrice,
            currentValue,
            pnl: roundMoney((currentPrice - averageBuyPrice) * quantity),
            share: 0,
            risk: position.security.risk
          };
        }) ?? [];

      const total = rowsWithoutShare.reduce((sum, row) => sum + row.currentValue, 0);
      const portfolioRows = rowsWithoutShare.map((row) => ({
        ...row,
        share: total > 0 ? percent(row.currentValue, total) : 0
      }));
      const historical: Record<string, number[]> = {};
      for (const position of portfolio?.positions ?? []) {
        historical[position.security.ticker] = [...position.security.prices]
          .reverse()
          .map((priceRow) => toNumber(priceRow.price));
      }
      const riskCode = user.riskProfile?.code ?? "MODERATE";
      const analysis = new InvestmentAnalysisService().analyze(portfolioRows, riskCode, historical);

      return {
        source: "database",
        currency: user.currency,
        riskProfile: RISK_PROFILE_LABELS[riskCode],
        securities: securityRows,
        watchlist,
        portfolio: portfolioRows,
        structure: portfolioRows.map((row) => ({ name: row.ticker, value: row.share })),
        sectorStructure: buildSectorStructure(portfolioRows),
        risks: analysis.risks,
        education: analysis.education
      };
    },
    emptyInvestments
  );
}

async function buildDemoInvestmentData(): Promise<InvestmentData> {
  const provider = createMarketDataProvider();
  const securities = await provider.getSecurities();
  const positionConfig = [
    ["SBER", 350, 287],
    ["LKOH", 18, 6950],
    ["YNDX", 22, 3780],
    ["MOEX", 520, 214],
    ["T", 28, 2860],
    ["GAZP", 480, 154]
  ] as const;
  const rowsWithoutShare = positionConfig.map(([ticker, quantity, averageBuyPrice]) => {
    const security = securities.find((item) => item.ticker === ticker)!;
    const currentValue = roundMoney(security.price * quantity);

    return {
      ticker,
      name: security.name,
      sector: security.sector,
      quantity,
      averageBuyPrice,
      currentPrice: security.price,
      currentValue,
      pnl: roundMoney((security.price - averageBuyPrice) * quantity),
      share: 0,
      risk: security.risk
    };
  });
  const total = rowsWithoutShare.reduce((sum, row) => sum + row.currentValue, 0);
  const portfolioRows = rowsWithoutShare.map((row) => ({
    ...row,
    share: total > 0 ? percent(row.currentValue, total) : 0
  }));
  const historical: Record<string, number[]> = {};
  for (const row of portfolioRows) {
    historical[row.ticker] = (
      await provider.getHistoricalPrices(row.ticker, subMonths(new Date(), 1), new Date())
    ).map((item) => item.price);
  }
  const analysis = new InvestmentAnalysisService().analyze(portfolioRows, "MODERATE", historical);

  return {
    source: "demo-fallback",
    currency: "RUB",
    riskProfile: RISK_PROFILE_LABELS.MODERATE,
    securities,
    watchlist: securities,
    portfolio: portfolioRows,
    structure: portfolioRows.map((row) => ({ name: row.ticker, value: row.share })),
    sectorStructure: buildSectorStructure(portfolioRows),
    risks: analysis.risks,
    education: analysis.education
  };
}

export async function getSettingsPageData(): Promise<SettingsPageData> {
  return safeData<SettingsPageData>(
    () => ({
      source: "demo-fallback",
      currency: "RUB",
      demoMode: true,
      emergencyFundMonthsTarget: 6,
      riskProfileCode: "MODERATE",
      theme: "system",
      density: "comfortable",
      defaultTransactionType: "EXPENSE" as const,
      autoMaterializeRecurring: false,
      paymentReminders: false,
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
    }),
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const riskProfiles = await prisma.riskProfile.findMany({ orderBy: { code: "asc" } });

      return {
        source: "database",
        currency: user.currency,
        demoMode: user.demoMode,
        emergencyFundMonthsTarget: user.emergencyFundMonthsTarget,
        riskProfileCode: user.riskProfile?.code ?? "MODERATE",
        theme: "system" as const,
        density: "comfortable" as const,
        defaultTransactionType: "EXPENSE" as const,
        autoMaterializeRecurring: false,
        paymentReminders: false,
        riskProfiles: riskProfiles.map((profile) => ({
          id: profile.id,
          code: profile.code,
          title: profile.title,
          description: profile.description
        }))
      };
    },
    () => ({
      source: "database",
      currency: "RUB",
      demoMode: false,
      emergencyFundMonthsTarget: 6,
      riskProfileCode: "MODERATE",
      theme: "system",
      density: "comfortable",
      defaultTransactionType: "EXPENSE" as const,
      autoMaterializeRecurring: false,
      paymentReminders: false,
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
    })
  );
}

export async function getImportPageData(): Promise<ImportPageData> {
  return safeData<ImportPageData>(
    () => ({
      source: "demo-fallback",
      accounts: demoAccounts,
      categories: demoCategories,
      lastBackupAt: null,
      backupReminderDue: true
    }),
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const [accounts, categories] = await Promise.all([
        prisma.account.findMany({
          where: { userId: user.id, isArchived: false },
          orderBy: { createdAt: "asc" }
        }),
        prisma.category.findMany({
          where: { userId: user.id },
          orderBy: [{ kind: "asc" }, { name: "asc" }]
        })
      ]);

      return {
        source: "database",
        accounts: accounts.map(toAccountRow),
        categories: categories.map(toCategoryOption),
        lastBackupAt: null,
        backupReminderDue: false
      };
    },
    () => ({
      source: "database",
      accounts: [],
      categories: [],
      lastBackupAt: null,
      backupReminderDue: true
    })
  );
}

function buildAnalyticsFromTransactions(
  transactions: TransactionRow[],
  currency: string,
  source: DataSource
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

  const bestMonthData = [...monthlyCashflow].sort((a, b) => b.savings - a.savings)[0];
  const worstMonthData = [...monthlyCashflow].sort((a, b) => a.savings - b.savings)[0];

  // Top expense categories (last 6 months)
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
  const derived = buildAnalyticsDerived(monthlyCashflow, topExpenseCategories);

  return {
    source,
    currency,
    monthlyCashflow,
    topExpenseCategories,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgSavingsRate,
    bestMonth: bestMonthData?.month ?? "-",
    worstMonth: worstMonthData?.month ?? "-",
    expenseChangePct: derived.expenseChangePct,
    savingsRateTrend: derived.savingsRateTrend,
    insights: derived.insights
  };
}

function buildDemoAnalytics(): AnalyticsData {
  const transactions = buildDemoTransactions();
  const result = buildAnalyticsFromTransactions(transactions, "RUB", "demo-fallback");

  // Supplement with more realistic 6-month demo data if we don't have 6 months of real demo data
  // (demo only has 3 months). Patch months with no data to have realistic values.
  const patchedCashflow = result.monthlyCashflow.map((m, index) => {
    if (m.income === 0 && m.expense === 0) {
      const baseIncome = 145000 + index * 5000;
      const baseExpense = 108000 + index * 2000;
      const savings = baseIncome - baseExpense;
      return {
        month: m.month,
        income: baseIncome,
        expense: baseExpense,
        savings,
        savingsRate: percent(savings, baseIncome)
      };
    }
    return m;
  });

  const patchedTotals = patchedCashflow.reduce(
    (acc, m) => ({ income: acc.income + m.income, expense: acc.expense + m.expense }),
    { income: 0, expense: 0 }
  );
  const avgMonthlyIncome = roundMoney(patchedTotals.income / 6);
  const avgMonthlyExpense = roundMoney(patchedTotals.expense / 6);
  const avgSavingsRate = roundMoney(patchedCashflow.reduce((sum, m) => sum + m.savingsRate, 0) / 6);
  const bestMonth = [...patchedCashflow].sort((a, b) => b.savings - a.savings)[0]?.month ?? "-";
  const worstMonth = [...patchedCashflow].sort((a, b) => a.savings - b.savings)[0]?.month ?? "-";

  const topExpenseCategories =
    result.topExpenseCategories.length > 0
      ? result.topExpenseCategories
      : [
          {
            categoryId: "cat-food",
            category: "Продукты",
            color: "#f97316",
            total: 260000,
            share: 28
          },
          {
            categoryId: "cat-utilities",
            category: "ЖКХ",
            color: "#7c3aed",
            total: 115000,
            share: 12
          },
          {
            categoryId: "cat-entertainment",
            category: "Развлечения",
            color: "#eab308",
            total: 130000,
            share: 14
          },
          {
            categoryId: "cat-transport",
            category: "Транспорт",
            color: "#2563eb",
            total: 68000,
            share: 7
          },
          {
            categoryId: "cat-restaurants",
            category: "Рестораны",
            color: "#ea580c",
            total: 95000,
            share: 10
          },
          {
            categoryId: "cat-health",
            category: "Здоровье",
            color: "#dc2626",
            total: 55000,
            share: 6
          }
        ];
  const derived = buildAnalyticsDerived(patchedCashflow, topExpenseCategories);

  return {
    source: "demo-fallback",
    currency: "RUB",
    monthlyCashflow: patchedCashflow,
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

export async function getCategoriesPageData(): Promise<CategoriesPageData> {
  return safeData<CategoriesPageData>(
    () => ({
      source: "demo-fallback",
      categories: demoCategories.map((cat) => ({
        id: cat.id,
        name: cat.label,
        kind: cat.kind,
        color: cat.color,
        isEssential: cat.isEssential ?? false,
        isSubscription: cat.isSubscription ?? false,
        transactionCount: buildDemoTransactions().filter((t) => t.category.id === cat.id).length
      }))
    }),
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const categories = await prisma.category.findMany({
        where: { userId: user.id },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
        include: { _count: { select: { transactions: true } } }
      });

      return {
        source: "database",
        categories: categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          kind: cat.kind,
          color: cat.color,
          isEssential: cat.isEssential,
          isSubscription: cat.isSubscription,
          transactionCount: cat._count.transactions
        }))
      };
    },
    () => ({ source: "database", categories: [] })
  );
}

export async function getAnalyticsData(): Promise<AnalyticsData> {
  return safeData<AnalyticsData>(
    buildDemoAnalytics,
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");

      const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5));
      const transactions = await prisma.transaction.findMany({
        where: { userId: user.id, date: { gte: sixMonthsAgo } },
        include: { category: true },
        orderBy: { date: "desc" }
      });

      const transactionRows: TransactionRow[] = transactions.map((t) => ({
        id: t.id,
        amount: toNumber(t.amount),
        type: t.type,
        date: t.date.toISOString(),
        description: t.description,
        account: { id: t.accountId, label: "" },
        category: { id: t.category.id, label: t.category.name, color: t.category.color }
      }));

      return buildAnalyticsFromTransactions(transactionRows, user.currency, "database");
    },
    emptyAnalytics
  );
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
