import type { TransactionType } from "@prisma/client";
import { addDays, differenceInCalendarDays, format, isAfter, isBefore, startOfDay } from "date-fns";
import { ru } from "date-fns/locale";

import { RecurringTransactionService } from "@/services/RecurringTransactionService";
import type { AccountRow, ForecastData, ForecastEvent, GoalRow, RecurringTransactionRow } from "@/types/finance";
import { roundMoney } from "@/lib/utils";

export type CashflowForecastInput = {
  source: ForecastData["source"];
  currency: string;
  accounts: AccountRow[];
  recurringTransactions: RecurringTransactionRow[];
  goals: GoalRow[];
  horizonDays?: number;
  today?: Date;
};

const liquidAccountTypes = new Set(["CASH", "DEBIT_CARD", "SAVINGS"]);

export class CashflowForecastService {
  private readonly recurring = new RecurringTransactionService();

  build(input: CashflowForecastInput): ForecastData {
    const today = startOfDay(input.today ?? new Date());
    const horizonDays = input.horizonDays ?? 90;
    const horizon = addDays(today, horizonDays);
    const startingBalance = roundMoney(
      input.accounts
        .filter((account) => liquidAccountTypes.has(account.type))
        .reduce((sum, account) => sum + account.balance, 0)
    );
    const events = this.buildEvents(input.recurringTransactions, today, horizon);
    const points = this.buildPoints(startingBalance, events, today, horizonDays);
    const forecast30dBalance = this.balanceAt(points, 30);
    const forecast90dBalance = points[points.length - 1]?.balance ?? startingBalance;
    const plannedIncome30d = this.sumEvents(events, "INCOME", 30, today);
    const plannedExpense30d = this.sumEvents(events, "EXPENSE", 30, today);
    const plannedIncome90d = this.sumEvents(events, "INCOME", 90, today);
    const plannedExpense90d = this.sumEvents(events, "EXPENSE", 90, today);

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
      warnings: this.buildWarnings({
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
      })
    };
  }

  private buildEvents(recurringTransactions: RecurringTransactionRow[], today: Date, horizon: Date): ForecastEvent[] {
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

    return events.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  }

  private buildPoints(startingBalance: number, events: ForecastEvent[], today: Date, horizonDays: number) {
    const points = [];

    for (let day = 0; day <= horizonDays; day += day === 0 ? 7 : 7) {
      const date = addDays(today, day);
      const dayEvents = events.filter((event) => differenceInCalendarDays(new Date(event.date), today) <= day);
      const income = dayEvents.filter((event) => event.type === "INCOME").reduce((sum, event) => sum + event.amount, 0);
      const expense = dayEvents.filter((event) => event.type === "EXPENSE").reduce((sum, event) => sum + event.amount, 0);

      points.push({
        date: date.toISOString(),
        label: format(date, "d MMM", { locale: ru }),
        balance: roundMoney(startingBalance + income - expense),
        income: roundMoney(income),
        expense: roundMoney(expense)
      });
    }

    if (points[points.length - 1] && differenceInCalendarDays(new Date(points[points.length - 1].date), today) !== horizonDays) {
      const date = addDays(today, horizonDays);
      const dayEvents = events.filter((event) => differenceInCalendarDays(new Date(event.date), today) <= horizonDays);
      const income = dayEvents.filter((event) => event.type === "INCOME").reduce((sum, event) => sum + event.amount, 0);
      const expense = dayEvents.filter((event) => event.type === "EXPENSE").reduce((sum, event) => sum + event.amount, 0);
      points.push({
        date: date.toISOString(),
        label: format(date, "d MMM", { locale: ru }),
        balance: roundMoney(startingBalance + income - expense),
        income: roundMoney(income),
        expense: roundMoney(expense)
      });
    }

    return points;
  }

  private balanceAt(points: ForecastData["points"], day: number) {
    const point = points.find((item, index) => index > 0 && differenceInCalendarDays(new Date(item.date), new Date(points[0].date)) >= day);
    return point?.balance ?? points[points.length - 1]?.balance ?? 0;
  }

  private sumEvents(events: ForecastEvent[], type: TransactionType, days: number, today: Date) {
    return roundMoney(
      events
        .filter((event) => event.type === type && differenceInCalendarDays(new Date(event.date), today) <= days)
        .reduce((sum, event) => sum + event.amount, 0)
    );
  }

  private buildWarnings(input: {
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
  }) {
    const warnings: ForecastData["warnings"] = [];
    const firstNegativeEvent = this.findFirstNegativeBalance(input.startingBalance, input.events);
    const monthlyGoalPressure = input.goals.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
    const net30 = input.plannedIncome30d - input.plannedExpense30d;

    if (firstNegativeEvent) {
      warnings.push({
        id: "negative-balance",
        title: "Возможен кассовый разрыв",
        description: `По плановым операциям остаток может уйти ниже нуля к ${format(new Date(firstNegativeEvent.date), "d MMMM", { locale: ru })}. Проверьте даты и суммы обязательных платежей.`,
        severity: "CRITICAL"
      });
    }

    if (input.forecast30dBalance < input.startingBalance * 0.15) {
      warnings.push({
        id: "low-30d-balance",
        title: "Остаток через 30 дней станет низким",
        description: "Прогноз показывает заметное снижение доступного остатка. Полезно заранее проверить крупные платежи ближайшего месяца.",
        severity: "WARNING"
      });
    }

    if (monthlyGoalPressure > Math.max(net30, 0) && monthlyGoalPressure > 0) {
      warnings.push({
        id: "goal-pressure",
        title: "Цели требуют больше свободного потока",
        description: "Суммарный плановый взнос по целям выше прогнозного свободного потока на 30 дней. Можно пересмотреть сроки или размеры взносов.",
        severity: "WARNING"
      });
    }

    if (input.plannedExpense90d > input.plannedIncome90d && input.plannedIncome90d > 0) {
      warnings.push({
        id: "negative-90d-flow",
        title: "Плановые расходы выше доходов",
        description: "На горизонте 90 дней регулярные расходы превышают регулярные доходы. Это сигнал проверить подписки, обязательства и даты поступлений.",
        severity: "WARNING"
      });
    }

    if (warnings.length === 0) {
      warnings.push({
        id: "stable-forecast",
        title: "Кассовый прогноз выглядит устойчиво",
        description: "На основе текущих шаблонов плановых платежей критических разрывов не видно. Поддерживайте актуальность расписания.",
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
