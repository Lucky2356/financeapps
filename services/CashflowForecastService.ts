import type { TransactionType } from "@/types/enums";
import { addDays, differenceInCalendarDays, format, isAfter, isBefore, startOfDay } from "date-fns";
import { enUS, ru } from "date-fns/locale";

import { upcomingInterest } from "@/lib/accounts/interest";
import { isSettledDebt } from "@/lib/debts/settled";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";
import type {
  AccountRow,
  ForecastData,
  ForecastEvent,
  GoalRow,
  LiabilityRow,
  RecurringTransactionRow
} from "@/types/finance";
import { roundMoney } from "@/lib/utils";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n/catalog";

export type CashflowForecastInput = {
  source: ForecastData["source"];
  currency: string;
  accounts: AccountRow[];
  recurringTransactions: RecurringTransactionRow[];
  goals: GoalRow[];
  /**
   * Debts with automatic payment. They leave the account on a known day for a
   * known amount — planned spending in every sense — and were simply missing:
   * a 40 000 ₽ monthly obligation left the 90-day balance ~120 000 ₽ too high,
   * with no warning that it goes negative.
   */
  liabilities?: LiabilityRow[];
  horizonDays?: number;
  today?: Date;
};

const liquidAccountTypes = new Set(["CASH", "DEBIT_CARD", "SAVINGS"]);

export class CashflowForecastService {
  private readonly recurring = new RecurringTransactionService();

  build(input: CashflowForecastInput, locale: Locale = DEFAULT_LOCALE): ForecastData {
    const dfLocale = locale === "en" ? enUS : ru;
    const today = startOfDay(input.today ?? new Date());
    const horizonDays = input.horizonDays ?? 90;
    const horizon = addDays(today, horizonDays);
    const startingBalance = roundMoney(
      input.accounts
        .filter((account) => liquidAccountTypes.has(account.type))
        .reduce((sum, account) => sum + account.balance, 0)
    );
    // Savings interest is planned income exactly like a recurring salary: it
    // arrives on a known date for a known amount, so leaving it out of the
    // forecast understates every horizon balance.
    const events = [
      ...this.buildEvents(input.recurringTransactions, today, horizon),
      ...this.buildInterestEvents(input.accounts, today, horizonDays, locale),
      ...this.buildDebtEvents(input.liabilities ?? [], today, horizon, locale)
    ].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    const points = this.buildPoints(startingBalance, events, today, horizonDays, dfLocale);
    const plannedIncome30d = this.sumEvents(events, "INCOME", 30, today);
    const plannedExpense30d = this.sumEvents(events, "EXPENSE", 30, today);
    const plannedIncome90d = this.sumEvents(events, "INCOME", 90, today);
    const plannedExpense90d = this.sumEvents(events, "EXPENSE", 90, today);
    // Compute the horizon balances from the exact 30/90-day event sums rather
    // than the 7-day chart points (which would otherwise land on day 35/91).
    const forecast30dBalance = roundMoney(startingBalance + plannedIncome30d - plannedExpense30d);
    const forecast90dBalance = roundMoney(startingBalance + plannedIncome90d - plannedExpense90d);

    return {
      source: input.source,
      currency: input.currency,
      startingBalance,
      forecast30dBalance,
      forecast90dBalance,
      plannedIncome30d,
      plannedExpense30d,
      plannedIncome90d,
      plannedExpense90d,
      points,
      upcomingEvents: events.slice(0, 12),
      events,
      warnings: this.buildWarnings(
        {
          startingBalance,
          forecast30dBalance,
          forecast90dBalance,
          plannedIncome30d,
          plannedExpense30d,
          plannedIncome90d,
          plannedExpense90d,
          goals: input.goals,
          events,
          today
        },
        locale,
        dfLocale
      )
    };
  }

  private buildEvents(
    recurringTransactions: RecurringTransactionRow[],
    today: Date,
    horizon: Date
  ): ForecastEvent[] {
    const events: ForecastEvent[] = [];

    for (const item of recurringTransactions) {
      if (!item.isActive) continue;

      let cursor = startOfDay(new Date(item.nextDate));
      while (isBefore(cursor, today)) {
        cursor = this.recurring.getNextDate(cursor, item.frequency);
      }

      while (!isAfter(cursor, horizon)) {
        events.push({
          id: `${item.id}-${format(cursor, "yyyy-MM-dd")}`,
          date: cursor.toISOString(),
          title: item.description || item.category.label,
          amount: item.amount,
          type: item.type,
          category: item.category.label,
          account: item.account.label
        });
        cursor = this.recurring.getNextDate(cursor, item.frequency);
      }
    }

    return events.sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()
    );
  }

  // Interest credited by savings accounts inside the horizon, as income events.
  private buildInterestEvents(
    accounts: AccountRow[],
    today: Date,
    horizonDays: number,
    locale: Locale
  ): ForecastEvent[] {
    const title = translate(locale, "forecast.interestEvent");
    return upcomingInterest(accounts, today, horizonDays).map((accrual) => ({
      id: `interest-${accrual.accountId}-${accrual.date.slice(0, 10)}`,
      date: accrual.date,
      title,
      amount: accrual.amount,
      type: "INCOME" as TransactionType,
      category: title,
      account: accrual.accountName
    }));
  }

  /**
   * Every automatic debt payment falling inside the horizon. The app posts them
   * itself on the due day, so a forecast that ignores them is planning with
   * money already spoken for.
   */
  private buildDebtEvents(
    liabilities: LiabilityRow[],
    today: Date,
    horizon: Date,
    locale: Locale
  ): ForecastEvent[] {
    const title = translate(locale, "forecast.debtEvent");
    const events: ForecastEvent[] = [];

    for (const liability of liabilities) {
      if (!liability.autoPay || !liability.dueDay || isSettledDebt(liability)) continue;

      // What is still owed caps the payments: a debt with two payments left
      // does not keep taking money for the rest of the horizon.
      let outstanding = liability.balance;
      for (let month = 0; month <= 12 && outstanding > 0; month += 1) {
        const candidate = new Date(today.getFullYear(), today.getMonth() + month, 1);
        // A 31st due day on a 30-day month lands on the last day of it.
        const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
        const date = new Date(
          candidate.getFullYear(),
          candidate.getMonth(),
          Math.min(liability.dueDay, lastDay)
        );
        if (isBefore(date, today)) continue;
        if (isAfter(date, horizon)) break;

        const amount = roundMoney(Math.min(liability.minPayment, outstanding));
        if (amount <= 0) break;
        outstanding = roundMoney(outstanding - amount);

        events.push({
          id: `debt-${liability.id}-${format(date, "yyyy-MM-dd")}`,
          date: date.toISOString(),
          title: `${title}: ${liability.name}`,
          amount,
          type: "EXPENSE" as TransactionType,
          category: title,
          account: liability.name
        });
      }
    }

    return events;
  }

  private buildPoints(
    startingBalance: number,
    events: ForecastEvent[],
    today: Date,
    horizonDays: number,
    dfLocale: typeof ru
  ) {
    const points = [];

    for (let day = 0; day <= horizonDays; day += day === 0 ? 7 : 7) {
      const date = addDays(today, day);
      const dayEvents = events.filter(
        (event) => differenceInCalendarDays(new Date(event.date), today) <= day
      );
      const income = dayEvents
        .filter((event) => event.type === "INCOME")
        .reduce((sum, event) => sum + event.amount, 0);
      const expense = dayEvents
        .filter((event) => event.type === "EXPENSE")
        .reduce((sum, event) => sum + event.amount, 0);

      points.push({
        date: date.toISOString(),
        label: format(date, "d MMM", { locale: dfLocale }),
        balance: roundMoney(startingBalance + income - expense),
        income: roundMoney(income),
        expense: roundMoney(expense)
      });
    }

    if (
      points[points.length - 1] &&
      differenceInCalendarDays(new Date(points[points.length - 1].date), today) !== horizonDays
    ) {
      const date = addDays(today, horizonDays);
      const dayEvents = events.filter(
        (event) => differenceInCalendarDays(new Date(event.date), today) <= horizonDays
      );
      const income = dayEvents
        .filter((event) => event.type === "INCOME")
        .reduce((sum, event) => sum + event.amount, 0);
      const expense = dayEvents
        .filter((event) => event.type === "EXPENSE")
        .reduce((sum, event) => sum + event.amount, 0);
      points.push({
        date: date.toISOString(),
        label: format(date, "d MMM", { locale: dfLocale }),
        balance: roundMoney(startingBalance + income - expense),
        income: roundMoney(income),
        expense: roundMoney(expense)
      });
    }

    return points;
  }

  private sumEvents(events: ForecastEvent[], type: TransactionType, days: number, today: Date) {
    return roundMoney(
      events
        .filter(
          (event) =>
            event.type === type && differenceInCalendarDays(new Date(event.date), today) <= days
        )
        .reduce((sum, event) => sum + event.amount, 0)
    );
  }

  private buildWarnings(
    input: {
      startingBalance: number;
      forecast30dBalance: number;
      forecast90dBalance: number;
      plannedIncome30d: number;
      plannedExpense30d: number;
      plannedIncome90d: number;
      plannedExpense90d: number;
      goals: GoalRow[];
      events: ForecastEvent[];
      today: Date;
    },
    locale: Locale,
    dfLocale: typeof ru
  ) {
    const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
    const warnings: ForecastData["warnings"] = [];
    const firstNegativeEvent = this.findFirstNegativeBalance(input.startingBalance, input.events);
    const monthlyGoalPressure = input.goals.reduce(
      (sum, goal) => sum + goal.monthlyContribution,
      0
    );
    const net30 = input.plannedIncome30d - input.plannedExpense30d;

    if (firstNegativeEvent) {
      warnings.push({
        id: "negative-balance",
        title: t("svc.fc.negBalance.title"),
        description: t("svc.fc.negBalance.desc", {
          date: format(new Date(firstNegativeEvent.date), "d MMMM", { locale: dfLocale })
        }),
        severity: "CRITICAL"
      });
    }

    // Only meaningful while there is a balance to fall from: below zero the
    // threshold flips, and −100 000 improving to −50 000 tripped the warning.
    if (input.startingBalance > 0 && input.forecast30dBalance < input.startingBalance * 0.15) {
      warnings.push({
        id: "low-30d-balance",
        title: t("svc.fc.low30.title"),
        description: t("svc.fc.low30.desc"),
        severity: "WARNING"
      });
    }

    if (monthlyGoalPressure > Math.max(net30, 0) && monthlyGoalPressure > 0) {
      warnings.push({
        id: "goal-pressure",
        title: t("svc.fc.goalPressure.title"),
        description: t("svc.fc.goalPressure.desc"),
        severity: "WARNING"
      });
    }

    if (input.plannedExpense90d > input.plannedIncome90d && input.plannedIncome90d > 0) {
      warnings.push({
        id: "negative-90d-flow",
        title: t("svc.fc.neg90.title"),
        description: t("svc.fc.neg90.desc"),
        severity: "WARNING"
      });
    }

    if (warnings.length === 0) {
      warnings.push({
        id: "stable-forecast",
        title: t("svc.fc.stable.title"),
        description: t("svc.fc.stable.desc"),
        severity: "INFO"
      });
    }

    return warnings;
  }

  private findFirstNegativeBalance(startingBalance: number, events: ForecastEvent[]) {
    let balance = startingBalance;

    for (const event of events) {
      balance += event.type === "INCOME" ? event.amount : -event.amount;
      if (balance < 0) return event;
    }

    return null;
  }
}
