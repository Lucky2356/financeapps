// Сводные экраны: главная, лимиты с рекомендациями, прогноз, «можно тратить
// сегодня», аналитика, «что если» и снимки капитала.

import type { AnalyticsData, BudgetsPageData, ForecastPageData } from "@/lib/data";
import { monthKeyOf } from "@/lib/api/local/helpers";
import { depositsEndingSoon } from "@/lib/accounts/deposits";
import { activeDebts } from "@/lib/debts/settled";
import { convert } from "@/lib/currency";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { percent, roundMoney } from "@/lib/utils";
import { translate } from "@/lib/i18n/catalog";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { CashflowForecastService } from "@/services/CashflowForecastService";
import { categoryBreakdown, topCategories } from "@/lib/categories/breakdown";
import { pickBestWorstMonth } from "@/lib/analytics/best-month";
import { countableRows } from "@/lib/transactions/transfers";
import { FinanceRecommendationService } from "@/services/FinanceRecommendationService";
import { buildAnalyticsDerived } from "@/services/AnalyticsInsightService";
import { buildEmergencyFund } from "@/lib/emergency-fund";
import { buildNetWorthBreakdown, buildNetWorthTrend, computeNetWorth } from "@/lib/net-worth";
import { isoDay, recordSnapshot } from "@/lib/net-worth-snapshots";
import { computeDailyAllowance, type Allowance } from "@/lib/analytics/daily-allowance";
import type { DashboardData, TransactionRow } from "@/types/finance";
import type { WhatIfBase } from "@/lib/whatif/simulate";
import { type LocalState, recomputeLiability, monthStart } from "@/lib/api/local/state";
import { ratesOf, sumInBase } from "@/lib/api/local/money";
import { accountsPage } from "@/lib/api/local/ledger";
import { budgetRows } from "@/lib/api/local/budgets";
import { goalsPage } from "@/lib/api/local/goals";
import { recurringPage } from "@/lib/api/local/recurring";
import { portfolioValueOf } from "@/lib/api/local/investments";

export function budgetsPage(state: LocalState, month?: string): BudgetsPageData {
  // "2026-08-01" parses as UTC midnight, and the key is read back in local
  // time — west of Greenwich that is the previous month.
  const targetDate = month ? monthStart(month) : new Date();
  const selectedMonth = monthKeyOf(targetDate);
  const budgets = budgetRows(state, selectedMonth, true);
  const finance = financeInput(state);
  return {
    source: "database",
    budgets,
    categories: [...state.categories],
    recommendations: new FinanceRecommendationService()
      .build(finance, getClientLocale())
      .filter((item) => ["WARNING", "CRITICAL", "INFO"].includes(item.severity)),
    currency: state.currency,
    selectedMonth
  };
}

export function forecastPage(state: LocalState): ForecastPageData {
  const rates = ratesOf(state);
  const result = new CashflowForecastService().build(
    {
      source: "database",
      currency: state.currency,
      // Balances converted to the base currency first: the forecast adds them
      // up, and 1 000 $ counted as 1 000 ₽ corrupts every point on the chart.
      accounts: accountsPage(state).accounts.map((account) => ({
        ...account,
        balance: convert(account.balance, account.currency, state.currency, rates),
        currency: state.currency
      })),
      recurringTransactions: recurringPage(state).recurringTransactions,
      goals: goalsPage(state).goals,
      liabilities: state.liabilities.map(recomputeLiability)
    },
    getClientLocale()
  );
  // Вклад кончается на этой неделе — в колокольчик и в уведомления: решить,
  // куда деньги, пока банк не продлил их под меньший процент.
  const locale = getClientLocale();
  const ending = depositsEndingSoon(state.accounts.filter((account) => !account.isArchived)).map(
    ({ account, daysLeft }) => ({
      id: `deposit-${account.id}-${account.depositEndsOn}`,
      title: translate(locale, "deposit.endingTitle", {
        name: account.name,
        when:
          daysLeft === 0
            ? translate(locale, "notif.due.today")
            : daysLeft === 1
              ? translate(locale, "notif.due.tomorrow")
              : translate(locale, "notif.due.inDays", { days: daysLeft })
      }),
      description: translate(locale, "deposit.endingDesc", {
        amount: formatCurrency(account.balance, account.currency)
      }),
      severity: "WARNING" as const
    })
  );
  return ending.length ? { ...result, warnings: [...ending, ...result.warnings] } : result;
}

// Current net worth (liquid + portfolio + goals − debts) — used by the
// dashboard and the daily snapshot recorder (plan B7).
export async function computeNetWorthValue(state: LocalState): Promise<number> {
  const totalBalance = accountsPage(state).totalBalance;
  const portfolioValue = await portfolioValueOf(state);
  const goalSavings = roundMoney(state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0));
  const liabilitiesTotal = sumInBase(state, activeDebts(state.liabilities));
  return computeNetWorth({ totalBalance, portfolioValue, goalSavings, liabilitiesTotal });
}

// Records today's net worth snapshot (idempotent per day). Called once on app
// load via the automation runner so the capital trend reflects real values.
export async function recordNetWorthSnapshot(state: LocalState) {
  const value = await computeNetWorthValue(state);
  state.netWorthSnapshots = recordSnapshot(
    state.netWorthSnapshots ?? [],
    isoDay(new Date()),
    value
  );
  return { recorded: true, value };
}

/**
 * «Можно тратить сегодня» — см. lib/analytics/daily-allowance.ts. Переводы
 * между своими счетами не считаются ни доходом, ни расходом (countingState
 * уже без них), плановые платежи — из того же прогноза, что на экране
 * «Прогноз», чтобы два числа не спорили.
 */
export function allowancePage(state: LocalState): Allowance {
  const now = new Date();
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const month = today.slice(0, 7);
  const monthEnd = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const sum = (rows: TransactionRow[]) => rows.reduce((total, row) => total + row.amount, 0);
  const monthRows = state.transactions.filter((row) => row.date.startsWith(month));
  const expenses = monthRows.filter((row) => row.type === "EXPENSE");
  const finance = financeInput(state, true);
  const previous = finance.monthlyCashflow.slice(0, -1).filter((item) => item.income > 0);
  const upcoming = forecastPage(state)
    .events.filter(
      (event) =>
        event.type === "EXPENSE" &&
        event.date.slice(0, 10) > today &&
        event.date.slice(0, 10) <= monthEnd
    )
    .reduce((total, event) => total + event.amount, 0);
  return computeDailyAllowance({
    today,
    income: sum(monthRows.filter((row) => row.type === "INCOME")),
    averageIncome: previous.length
      ? previous.reduce((total, item) => total + item.income, 0) / previous.length
      : 0,
    upcoming,
    spentBeforeToday: sum(expenses.filter((row) => row.date.slice(0, 10) < today)),
    spentToday: sum(expenses.filter((row) => row.date.slice(0, 10) === today)),
    spentYesterday: sum(expenses.filter((row) => row.date.slice(0, 10) === yesterday))
  });
}

export async function dashboardPage(state: LocalState): Promise<DashboardData> {
  // Every figure on this screen is expressed in the app's currency, so the
  // sign printed beside it is that one — not the rouble the module-level
  // constant assumes.
  const currency = state.currency;
  const finance = financeInput(state, true);
  const totalBalance = accountsPage(state).totalBalance;
  const portfolioValue = await portfolioValueOf(state);
  // Goal savings are money the user set aside from accounts, so they stay
  // part of net worth (a deposit just moves it from a balance into a goal).
  const goalSavings = roundMoney(state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0));
  const liabilitiesTotal = sumInBase(state, activeDebts(state.liabilities));
  const netWorth = computeNetWorth({
    totalBalance,
    portfolioValue,
    goalSavings,
    liabilitiesTotal
  });
  const netWorthTrend = buildNetWorthTrend({
    currentNetWorth: netWorth,
    snapshots: [...(state.netWorthSnapshots ?? [])],
    transactions: state.transactions
  });
  const savingsBalance = sumInBase(
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
    // Both halves are totalled the same way, from the operations themselves.
    // Spending used to be read off the budget rows, which walk the category
    // list: anything filed under a category the list no longer holds was
    // missing from the ring, and the ring came out in the order the categories
    // happen to be stored in rather than largest first.
    categoryExpenses: categoryBreakdown(state.transactions, {
      type: "EXPENSE",
      month: monthKeyOf(new Date()),
      colorOf: (categoryId) => state.categories.find((item) => item.id === categoryId)?.color
    }),
    // Where the money came from, alongside where it went.
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

// `includeTransfers` decides whether moving money between the owner's own
// accounts counts as income and spending. It normally does not: the pair of
// rows a transfer writes made "Переводы" the largest category on both sides
// at once, which says nothing about what was earned or spent.
export function analyticsPage(state: LocalState, includeTransfers = false): AnalyticsData {
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
    const expense = rows.filter((r) => r.type === "EXPENSE").reduce((sum, r) => sum + r.amount, 0);
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
  // Every category, largest first. Keeping only the six biggest here meant the
  // ring on the operations screen added up to less than the month it claimed
  // to show — «всего 102 079 ₽» beside a spend of 111 234 ₽, the difference
  // being the eight categories that were never drawn. Screens that want a
  // short list cut it themselves and say what the rest is.
  const topExpenseCategories = [...catTotals.values()]
    .sort((a, b) => b.total - a.total)
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

  const [lastYear, lastMonth] = lastKey.split("-").map(Number);
  return {
    source: "database",
    currency: state.currency,
    // The exact window everything above was taken over, so a legend row can
    // open the ledger on the same six months rather than on all of history.
    from: `${firstKey}-01`,
    to: formatInputDate(new Date(lastYear, lastMonth, 0)),
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
export function financeInput(state: LocalState, alreadyFiltered = false) {
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
  const emergencyFund = sumInBase(
    state,
    // Archived accounts are outside capital, so they cannot back the reserve
    // either — the health score and the dashboard card have to agree on what
    // the cushion is.
    state.accounts.filter((account) => account.type === "SAVINGS" && !account.isArchived)
  );
  const softExpense = expenseRows
    .filter((row) => {
      const category = state.categories.find((item) => item.id === row.category.id);
      // Discretionary = subscriptions + entertainment + restaurants.
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
    budgets: budgetRows(state).map((budget) => ({
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
    // A debt is kept in its own currency; the income it is compared against is
    // in the app's.
    monthlyDebtPayments: sumInBase(
      state,
      activeDebts(state.liabilities).map((item) => ({
        balance: item.minPayment,
        currency: item.currency
      }))
    ),
    goals: goalsPage(state).goals.map((goal) => ({
      title: goal.title,
      progress: goal.progress,
      monthlyContribution: goal.monthlyContribution
    }))
  };
}

/**
 * Числа для «Что если» (lib/whatif). Средние — по трём ПОЛНЫМ прошлым
 * месяцам: текущий не кончился, и с ним расход выходил бы меньше настоящего,
 * а покупка — безопаснее, чем она есть. Нет полных месяцев — берём что есть.
 */
export function whatIfBase(state: LocalState): WhatIfBase {
  const rows = countableRows(state.transactions, false);
  // Платежи по долгам с минимальным платежом идут ниже отдельной строкой.
  // Долг без него (кредитка, закрытый) платежом в месяц не считается — его
  // платежи остаются обычным расходом, иначе они пропали бы вовсе.
  const scheduledDebts = new Set(
    activeDebts(state.liabilities)
      .filter((item) => item.minPayment > 0)
      .map((item) => item.id)
  );
  const now = new Date();
  const keyOf = (offset: number) =>
    monthKeyOf(new Date(now.getFullYear(), now.getMonth() + offset, 1));
  const sums = (keys: string[]) => {
    let income = 0;
    let expense = 0;
    for (const row of rows) {
      if (!keys.some((key) => row.date.startsWith(key))) continue;
      if (row.type === "INCOME") income += row.amount;
      // Платёж по долгу — тоже расход, но платежи по долгам идут ниже
      // отдельной строкой (debtPayments): посчитать их и тут значило бы
      // вычесть дважды и напугать человека несуществующей дырой.
      else if (row.type === "EXPENSE" && !(row.liabilityId && scheduledDebts.has(row.liabilityId)))
        expense += row.amount;
    }
    return { income, expense };
  };
  const full = [-3, -2, -1]
    .map(keyOf)
    .filter((key) => rows.some((row) => row.date.startsWith(key)));
  const keys = full.length > 0 ? full : [keyOf(0)];
  const total = sums(keys);
  const open = state.accounts.filter((account) => !account.isArchived);
  return {
    currency: state.currency,
    liquid: sumInBase(
      state,
      open.filter((account) => account.type === "CASH" || account.type === "DEBIT_CARD")
    ),
    savings: sumInBase(
      state,
      open.filter((account) => account.type === "SAVINGS")
    ),
    avgIncome: roundMoney(total.income / keys.length),
    avgExpense: roundMoney(total.expense / keys.length),
    debtPayments: sumInBase(
      state,
      activeDebts(state.liabilities).map((item) => ({
        balance: item.minPayment,
        currency: item.currency
      }))
    ),
    cushionTarget: state.emergencyFundMonthsTarget,
    goals: goalsPage(state)
      .goals.filter((goal) => goal.currentAmount < goal.targetAmount)
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        target: goal.targetAmount,
        saved: goal.currentAmount,
        monthly: goal.plannedContribution || goal.monthlyContribution
      }))
  };
}
