import type { Prisma, RecurrenceFrequency, RiskProfileCode, TransactionType } from "@prisma/client";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";

import { ACCOUNT_TYPE_LABELS, RISK_PROFILE_LABELS } from "@/lib/constants";
import { formatCurrency, formatInputDate, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { clamp, percent, roundMoney, toNumber } from "@/lib/utils";
import { transactionFilterSchema } from "@/lib/validations";
import { CashflowForecastService } from "@/services/CashflowForecastService";
import { FinanceRecommendationService } from "@/services/FinanceRecommendationService";
import { InvestmentAnalysisService } from "@/services/InvestmentAnalysisService";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";
import { MockMarketDataProvider } from "@/services/market/MockMarketDataProvider";
import type {
  AccountRow,
  BudgetRow,
  ChartDatum,
  DashboardData,
  DataSource,
  ForecastData,
  GoalRow,
  InvestmentData,
  MonthlyCashflowDatum,
  Option,
  PortfolioRow,
  RecurringTransactionRow,
  RecommendationView,
  TransactionRow
} from "@/types/finance";

type CategoryOption = Option & {
  kind: "INCOME" | "EXPENSE";
  color: string;
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
};

export type GoalsPageData = {
  source: DataSource;
  goals: GoalRow[];
  currency: string;
};

export type ForecastPageData = ForecastData;

export type SettingsPageData = {
  source: DataSource;
  currency: string;
  demoMode: boolean;
  emergencyFundMonthsTarget: number;
  riskProfileCode: RiskProfileCode;
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
};

type DemoTransaction = TransactionRow & {
  categoryMeta: CategoryOption;
};

const demoAccounts: AccountRow[] = [
  { id: "account-cash", name: "Наличные", type: "CASH", balance: 32000, currency: "RUB" },
  { id: "account-card", name: "Дебетовая карта", type: "DEBIT_CARD", balance: 184500, currency: "RUB" },
  { id: "account-savings", name: "Накопительный счет", type: "SAVINGS", balance: 280000, currency: "RUB" },
  { id: "account-brokerage", name: "Брокерский счет", type: "BROKERAGE", balance: 420000, currency: "RUB" }
];

const demoCategories: CategoryOption[] = [
  { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#16a34a" },
  { id: "cat-freelance", label: "Фриланс", kind: "INCOME", color: "#0d9488" },
  { id: "cat-food", label: "Продукты", kind: "EXPENSE", color: "#f97316", isEssential: true },
  { id: "cat-transport", label: "Транспорт", kind: "EXPENSE", color: "#2563eb", isEssential: true },
  { id: "cat-utilities", label: "ЖКХ", kind: "EXPENSE", color: "#7c3aed", isEssential: true },
  { id: "cat-subscriptions", label: "Подписки", kind: "EXPENSE", color: "#db2777", isSubscription: true },
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
    rows.map(([monthOffset, day, amount, type, frequency, categoryId, accountId, description], index) => {
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
    })
  );
}

function currentMonthRange() {
  const now = new Date();
  return {
    start: startOfMonth(now),
    end: endOfMonth(now)
  };
}

function buildMonthlyCashflow(transactions: TransactionRow[]): MonthlyCashflowDatum[] {
  const months = [subMonths(new Date(), 2), subMonths(new Date(), 1), new Date()];

  return months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const rows = transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return date >= start && date <= end;
    });

    return {
      month: format(month, "LLL", { locale: ru }),
      income: rows.filter((row) => row.type === "INCOME").reduce((sum, row) => sum + row.amount, 0),
      expense: rows.filter((row) => row.type === "EXPENSE").reduce((sum, row) => sum + row.amount, 0)
    };
  });
}

function buildCategoryExpenses(transactions: TransactionRow[]): ChartDatum[] {
  const { start, end } = currentMonthRange();
  const byCategory = new Map<string, ChartDatum>();

  for (const transaction of transactions) {
    const date = new Date(transaction.date);
    if (transaction.type !== "EXPENSE" || date < start || date > end) continue;

    const current = byCategory.get(transaction.category.id) ?? {
      name: transaction.category.label,
      value: 0,
      fill: transaction.category.color
    };
    current.value += transaction.amount;
    byCategory.set(transaction.category.id, current);
  }

  return [...byCategory.values()].sort((a, b) => b.value - a.value);
}

function buildSectorStructure(portfolio: PortfolioRow[]): ChartDatum[] {
  const totals = new Map<string, number>();
  const total = portfolio.reduce((sum, row) => sum + row.currentValue, 0);
  if (total === 0) return [];

  for (const row of portfolio) {
    totals.set(row.sector, (totals.get(row.sector) ?? 0) + row.currentValue);
  }

  return [...totals.entries()]
    .map(([name, value]) => ({ name, value: percent(value, total) }))
    .sort((left, right) => right.value - left.value);
}

function buildBudgetRows(transactions: TransactionRow[], categories = demoCategories): BudgetRow[] {
  const { start, end } = currentMonthRange();
  return categories
    .filter((category) => category.kind === "EXPENSE")
    .map((category) => {
      const spent = transactions
        .filter((transaction) => {
          const date = new Date(transaction.date);
          return transaction.category.id === category.id && transaction.type === "EXPENSE" && date >= start && date <= end;
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
        isExceeded: limitAmount > 0 && spent > limitAmount
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

function buildFinanceInput(transactions: TransactionRow[], accounts: AccountRow[], goals: GoalRow[]) {
  const monthlyCashflow = buildMonthlyCashflow(transactions);
  const currentMonth = monthlyCashflow[monthlyCashflow.length - 1];
  const freeCashflow = currentMonth.income - currentMonth.expense;
  const averageExpense = monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) / monthlyCashflow.length;
  const emergencyFund = accounts.filter((account) => account.type === "SAVINGS").reduce((sum, account) => sum + account.balance, 0);
  const emergencyFundMonths = averageExpense > 0 ? emergencyFund / averageExpense : 0;
  const currentExpenseRows = transactions.filter((transaction) => {
    const { start, end } = currentMonthRange();
    const date = new Date(transaction.date);
    return transaction.type === "EXPENSE" && date >= start && date <= end;
  });
  const essentialExpense = currentExpenseRows
    .filter((transaction) => demoCategories.find((category) => category.id === transaction.category.id)?.isEssential)
    .reduce((sum, row) => sum + row.amount, 0);
  const softExpense = currentExpenseRows
    .filter((transaction) => ["cat-subscriptions", "cat-entertainment", "cat-restaurants"].includes(transaction.category.id))
    .reduce((sum, row) => sum + row.amount, 0);
  const budgets = buildBudgetRows(transactions);

  return {
    budgets: budgets.map((budget) => ({
      category: budget.category,
      limitAmount: budget.limitAmount,
      spent: budget.spent,
      isExceeded: budget.isExceeded,
      isSubscription: demoCategories.find((category) => category.id === budget.categoryId)?.isSubscription
    })),
    monthlyCashflow,
    currentMonthIncome: currentMonth.income,
    currentMonthExpense: currentMonth.expense,
    freeCashflow,
    savingsRate: currentMonth.income > 0 ? percent(freeCashflow, currentMonth.income) : 0,
    emergencyFundMonths,
    emergencyFundTargetMonths: 6,
    essentialExpenseShare: currentMonth.income > 0 ? percent(essentialExpense, currentMonth.income) : 0,
    subscriptionAndEntertainmentShare: currentMonth.expense > 0 ? percent(softExpense, currentMonth.expense) : 0,
    goals: goals.map((goal) => ({
      title: goal.title,
      progress: goal.progress,
      monthlyContribution: goal.monthlyContribution
    }))
  };
}

function buildDemoDashboard(): DashboardData {
  const transactions = buildDemoTransactions();
  const goals = buildDemoGoals();
  const input = buildFinanceInput(transactions, demoAccounts, goals);
  const service = new FinanceRecommendationService();
  const totalBalance = demoAccounts.reduce((sum, account) => sum + account.balance, 0);

  return {
    source: "demo-fallback",
    currency: "RUB",
    metrics: [
      { title: "Общий баланс", value: formatCurrency(totalBalance), detail: "Все счета и брокерский счет" },
      { title: "Доходы за месяц", value: formatCurrency(input.currentMonthIncome), detail: "Текущий календарный месяц", tone: "success" },
      { title: "Расходы за месяц", value: formatCurrency(input.currentMonthExpense), detail: "Текущий календарный месяц", tone: "warning" },
      { title: "Свободный остаток", value: formatCurrency(input.freeCashflow), detail: "Доходы минус расходы", tone: input.freeCashflow >= 0 ? "success" : "danger" },
      { title: "Процент накоплений", value: `${input.savingsRate.toFixed(1)}%`, detail: "Доля свободного остатка" },
      { title: "Финансовая подушка", value: `${input.emergencyFundMonths.toFixed(1)} мес.`, detail: "Резерв к средним расходам" }
    ],
    categoryExpenses: buildCategoryExpenses(transactions),
    monthlyCashflow: input.monthlyCashflow,
    recommendations: service.build(input),
    health: service.healthScore(input)
  };
}

function normalizeSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
}

async function getDefaultUser() {
  if (!prisma) return null;

  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    include: { riskProfile: true }
  });
}

async function safeData<T>(fallback: () => T | Promise<T>, query: () => Promise<T>): Promise<T> {
  if (!prisma) return fallback();

  try {
    return await query();
  } catch (error) {
    console.error("Data layer fallback:", error);
    return fallback();
  }
}

function toAccountRow(account: { id: string; name: string; type: string; balance: unknown; currency: string }): AccountRow {
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
  isEssential: boolean;
  isSubscription: boolean;
}): CategoryOption {
  return {
    id: category.id,
    label: category.name,
    kind: category.kind,
    color: category.color,
    isEssential: category.isEssential,
    isSubscription: category.isSubscription
  };
}

function transactionWhere(
  userId: string,
  filters: ReturnType<typeof transactionFilterSchema.parse>
): Prisma.TransactionWhereInput {
  return {
    userId,
    ...(filters.type && filters.type !== "ALL" ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
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

async function getDatabaseTransactions(userId: string, filters: ReturnType<typeof transactionFilterSchema.parse> = {}) {
  if (!prisma) return [];

  const transactions = await prisma.transaction.findMany({
    where: transactionWhere(userId, filters),
    orderBy: { date: "desc" },
    include: {
      account: true,
      category: true
    }
  });

  return transactions.map((transaction): TransactionRow => ({
    id: transaction.id,
    amount: toNumber(transaction.amount),
    type: transaction.type,
    date: transaction.date.toISOString(),
    description: transaction.description,
    account: { id: transaction.account.id, label: transaction.account.name },
    category: {
      id: transaction.category.id,
      label: transaction.category.name,
      color: transaction.category.color
    }
  }));
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
  const averageExpense = monthlyCashflow.reduce((sum, month) => sum + month.expense, 0) / Math.max(monthlyCashflow.length, 1);
  const emergencyFund = accountRows.filter((account) => account.type === "SAVINGS").reduce((sum, account) => sum + account.balance, 0);
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
      return category?.isSubscription || ["Развлечения", "Рестораны"].includes(category?.name ?? "");
    })
    .reduce((sum, row) => sum + row.amount, 0);
  const budgetRows = await buildDatabaseBudgetRows(userId, transactions, categories.map(toCategoryOption));
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
      essentialExpenseShare: currentMonth.income > 0 ? percent(essentialExpense, currentMonth.income) : 0,
      subscriptionAndEntertainmentShare: currentMonth.expense > 0 ? percent(softExpense, currentMonth.expense) : 0,
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

function toGoalRow(goal: { id: string; title: string; targetAmount: unknown; currentAmount: unknown; deadline: Date }): GoalRow {
  const targetAmount = toNumber(goal.targetAmount);
  const currentAmount = toNumber(goal.currentAmount);
  const monthsLeft = Math.max(
    1,
    Math.ceil((startOfMonth(goal.deadline).getTime() - startOfMonth(new Date()).getTime()) / (1000 * 60 * 60 * 24 * 30))
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
  categories: CategoryOption[]
): Promise<BudgetRow[]> {
  if (!prisma) return [];

  const month = startOfMonth(new Date());
  const budgets = await prisma.budget.findMany({
    where: { userId, month },
    include: { category: true }
  });
  const budgetByCategory = new Map(budgets.map((budget) => [budget.categoryId, budget]));
  const { start, end } = currentMonthRange();

  return categories
    .filter((category) => category.kind === "EXPENSE")
    .map((category) => {
      const budget = budgetByCategory.get(category.id);
      const limitAmount = budget ? toNumber(budget.limitAmount) : 0;
      const spent = transactions
        .filter((transaction) => {
          const date = new Date(transaction.date);
          return transaction.type === "EXPENSE" && transaction.category.id === category.id && date >= start && date <= end;
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
        isExceeded: limitAmount > 0 && spent > limitAmount
      };
    });
}

export async function getDashboardData(): Promise<DashboardData> {
  return safeData<DashboardData>(buildDemoDashboard, async () => {
    const user = await getDefaultUser();
    if (!user) return buildDemoDashboard();

    const finance = await getDatabaseFinanceInput(user.id, user.emergencyFundMonthsTarget);
    const service = new FinanceRecommendationService();
    const totalBalance = finance.accounts.reduce((sum, account) => sum + account.balance, 0);
    const input = finance.input;

    return {
      source: "database",
      currency: user.currency,
      metrics: [
        { title: "Общий баланс", value: formatCurrency(totalBalance, user.currency), detail: "Все активные счета" },
        { title: "Доходы за месяц", value: formatCurrency(input.currentMonthIncome, user.currency), detail: "Текущий календарный месяц", tone: "success" },
        { title: "Расходы за месяц", value: formatCurrency(input.currentMonthExpense, user.currency), detail: "Текущий календарный месяц", tone: "warning" },
        { title: "Свободный остаток", value: formatCurrency(input.freeCashflow, user.currency), detail: "Доходы минус расходы", tone: input.freeCashflow >= 0 ? "success" : "danger" },
        { title: "Процент накоплений", value: `${input.savingsRate.toFixed(1)}%`, detail: "Доля свободного остатка" },
        { title: "Финансовая подушка", value: `${input.emergencyFundMonths.toFixed(1)} мес.`, detail: "Резерв к средним расходам" }
      ],
      categoryExpenses: buildCategoryExpenses(finance.transactions),
      monthlyCashflow: input.monthlyCashflow,
      recommendations: service.build(input),
      health: service.healthScore(input)
    };
  });
}

export async function getTransactionsPageData(
  searchParams: Record<string, string | string[] | undefined>
): Promise<TransactionsPageData> {
  const parsed = transactionFilterSchema.parse(normalizeSearchParams(searchParams));

  return safeData<TransactionsPageData>(
    () => {
      const transactions = buildDemoTransactions().filter((transaction) => {
        if (parsed.type && parsed.type !== "ALL" && transaction.type !== parsed.type) return false;
        if (parsed.categoryId && transaction.category.id !== parsed.categoryId) return false;
        if (parsed.accountId && transaction.account.id !== parsed.accountId) return false;
        if (parsed.from && new Date(transaction.date) < new Date(parsed.from)) return false;
        if (parsed.to && new Date(transaction.date) > new Date(`${parsed.to}T23:59:59`)) return false;
        return true;
      });

      return {
        source: "demo-fallback",
        transactions,
        accounts: demoAccounts,
        categories: demoCategories,
        filters: parsed
      };
    },
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const [transactions, accounts, categories] = await Promise.all([
        getDatabaseTransactions(user.id, parsed),
        prisma.account.findMany({ where: { userId: user.id, isArchived: false }, orderBy: { createdAt: "asc" } }),
        prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] })
      ]);

      return {
        source: "database",
        transactions,
        accounts: accounts.map(toAccountRow),
        categories: categories.map(toCategoryOption),
        filters: parsed
      };
    }
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
        prisma.account.findMany({ where: { userId: user.id, isArchived: false }, orderBy: { createdAt: "asc" } }),
        prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] })
      ]);
      const recurringTransactions = service.sortUpcoming(recurringRows.map(toRecurringTransactionRow));

      return {
        source: "database",
        recurringTransactions,
        accounts: accounts.map(toAccountRow),
        categories: categories.map(toCategoryOption),
        currency: user.currency,
        summary: buildRecurringSummary(recurringTransactions)
      };
    }
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
        prisma.account.findMany({ where: { userId: user.id, isArchived: false }, orderBy: { createdAt: "asc" } }),
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
    }
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
      const accounts = (await prisma.account.findMany({
        where: { userId: user.id, isArchived: false },
        orderBy: { createdAt: "asc" }
      })).map(toAccountRow);

      return {
        source: "database",
        accounts,
        totalBalance: accounts.reduce((sum, account) => sum + account.balance, 0),
        currency: user.currency
      };
    }
  );
}

export async function getBudgetsPageData(): Promise<BudgetsPageData> {
  return safeData<BudgetsPageData>(
    () => {
      const transactions = buildDemoTransactions();
      const goals = buildDemoGoals();
      const input = buildFinanceInput(transactions, demoAccounts, goals);
      const service = new FinanceRecommendationService();

      return {
        source: "demo-fallback",
        budgets: buildBudgetRows(transactions),
        categories: demoCategories,
        recommendations: service.build(input).filter((item) => ["WARNING", "CRITICAL", "INFO"].includes(item.severity)),
        currency: "RUB"
      };
    },
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const [categories, transactions] = await Promise.all([
        prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
        getDatabaseTransactions(user.id)
      ]);
      const categoryOptions = categories.map(toCategoryOption);
      const budgets = await buildDatabaseBudgetRows(user.id, transactions, categoryOptions);
      const finance = await getDatabaseFinanceInput(user.id, user.emergencyFundMonthsTarget);
      const recommendations = new FinanceRecommendationService()
        .build(finance.input)
        .filter((item) => ["WARNING", "CRITICAL", "INFO"].includes(item.severity));

      return {
        source: "database",
        budgets,
        categories: categoryOptions,
        recommendations,
        currency: user.currency
      };
    }
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
    }
  );
}

export async function getInvestmentData(): Promise<InvestmentData> {
  return safeData<InvestmentData>(buildDemoInvestmentData, async () => {
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
  });
}

async function buildDemoInvestmentData(): Promise<InvestmentData> {
  const provider = new MockMarketDataProvider();
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
    historical[row.ticker] = (await provider.getHistoricalPrices(row.ticker, subMonths(new Date(), 1), new Date())).map((item) => item.price);
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
        riskProfiles: riskProfiles.map((profile) => ({
          id: profile.id,
          code: profile.code,
          title: profile.title,
          description: profile.description
        }))
      };
    }
  );
}

export async function getImportPageData(): Promise<ImportPageData> {
  return safeData<ImportPageData>(
    () => ({
      source: "demo-fallback",
      accounts: demoAccounts,
      categories: demoCategories
    }),
    async () => {
      if (!prisma) throw new Error("Prisma client is not configured.");
      const user = await getDefaultUser();
      if (!user) throw new Error("No user found.");
      const [accounts, categories] = await Promise.all([
        prisma.account.findMany({ where: { userId: user.id, isArchived: false }, orderBy: { createdAt: "asc" } }),
        prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] })
      ]);

      return {
        source: "database",
        accounts: accounts.map(toAccountRow),
        categories: categories.map(toCategoryOption)
      };
    }
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
