// Плановые операции: шаблоны, проведение наступивших и страница «Плановые».

import type { RecurringTransactionsPageData } from "@/lib/data";
import { id, toFormObject } from "@/lib/api/local/helpers";
import { localCalendarDate, todayDay } from "@/lib/transactions/date";
import { monthlyInterestAverage, upcomingInterest } from "@/lib/accounts/interest";
import { plannedDebtMonthlyTotal, plannedDebtPayments } from "@/lib/debts/planned";
import { activeDebts } from "@/lib/debts/settled";
import { isUsableMoney, roundMoney } from "@/lib/utils";
import { startOfToday } from "date-fns";
import { baseAmountContext, baseAmountOf, countableAmount } from "@/lib/transactions/base-amount";
import {
  anchorDayOf,
  dayOfMonthFrom,
  RecurringTransactionService
} from "@/services/RecurringTransactionService";
import { type LocalState, withCurrentNames } from "@/lib/api/local/state";
import { debtInBase, ratesOf } from "@/lib/api/local/money";
import { upsertTransaction, accountsPage } from "@/lib/api/local/ledger";
import { budgetRows } from "@/lib/api/local/budgets";
import { apiText, moneyRangeText } from "@/lib/i18n/api-text";

export function upsertRecurring(state: LocalState, body: unknown, method: "POST" | "PUT") {
  const input = toFormObject(body);
  const account = state.accounts.find((item) => item.id === input.accountId && !item.isArchived);
  const category = state.categories.find((item) => item.id === input.categoryId);
  if (!account || !category) throw new Error(apiText("api.ledger.pickAccountCategory"));

  const service = new RecurringTransactionService();
  const frequency =
    input.frequency as RecurringTransactionsPageData["recurringTransactions"][number]["frequency"];
  const isActive = input.isActive === "true" || input.isActive === "on";
  const amount = Number(input.amount);
  // Ноль или «1,5» записывались как есть, а схема книги их не принимает: при
  // следующем запуске шаблон молча пропадал.
  if (!isUsableMoney(amount)) throw new Error(moneyRangeText());
  const type = input.type === "INCOME" ? "INCOME" : "EXPENSE";
  const description = input.description?.trim() || null;
  // Пробный период до — сторож напомнит за три дня, пока он не стал платным.
  const trialEndsOn = /^\d{4}-\d{2}-\d{2}$/.test(String(input.trialEndsOn ?? ""))
    ? String(input.trialEndsOn)
    : null;
  const accountRef = { id: account.id, label: account.name };
  const categoryRef = { id: category.id, label: category.label, color: category.color };
  // Местный день, а не UTC-полночь: западнее Гринвича «2026-01-31» иначе
  // становился 30-м (см. localCalendarDate).
  let nextDateInput = localCalendarDate(input.nextDate);
  // Дату в форме не трогали — число остаётся прежним. Иначе правка одной
  // суммы у платежа на 31-е, стоящего сейчас на 28 февраля, перевела бы его
  // на 28-е навсегда.
  const previous =
    method === "PUT" ? state.recurringTransactions.find((item) => item.id === input.id) : undefined;
  const dayOfMonth =
    previous && todayDay(new Date(previous.nextDate)) === String(input.nextDate).trim()
      ? anchorDayOf(previous)
      : dayOfMonthFrom(input.nextDate);

  // Шаблон стоял на паузе и снова включён — без этого он сохранял прежнюю
  // дату, и первая же запись (автоматическая — при запуске, молча) проводила
  // все платежи за время паузы задним числом. Пауза — значит, платежей не
  // было: следующий — первый не раньше сегодняшнего дня.
  if (previous && !previous.isActive && isActive) {
    const today = startOfToday();
    for (let step = 0; nextDateInput < today && step < 1000; step += 1) {
      nextDateInput = service.getNextDate(nextDateInput, frequency, dayOfMonth);
    }
  }

  if (method === "PUT" && input.id) {
    // A template is a plan, not a record: editing it never rewrites operations
    // that were already posted — those are facts about money that moved.
    const status = service.getStatus({
      nextDate: nextDateInput,
      frequency,
      isActive,
      anchorDay: dayOfMonth
    });
    const row: LocalState["recurringTransactions"][number] = {
      id: input.id,
      amount,
      type,
      frequency,
      nextDate: nextDateInput.toISOString(),
      dayOfMonth,
      description,
      isActive,
      daysUntilNext: status.daysUntilNext,
      isDue: status.isDue,
      account: accountRef,
      category: categoryRef,
      ...(trialEndsOn ? { trialEndsOn } : {})
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
  const status = service.getStatus({
    nextDate: nextDateInput,
    frequency,
    isActive,
    anchorDay: dayOfMonth
  });
  const row: LocalState["recurringTransactions"][number] = {
    id: newId,
    amount,
    type,
    frequency,
    nextDate: nextDateInput.toISOString(),
    dayOfMonth,
    description,
    isActive,
    daysUntilNext: status.daysUntilNext,
    isDue: status.isDue,
    account: accountRef,
    category: categoryRef,
    ...(trialEndsOn ? { trialEndsOn } : {})
  };
  state.recurringTransactions = [...state.recurringTransactions, row];
  return row;
}

export function materializeRecurring(state: LocalState, body: unknown) {
  const recurringId = (body as { id?: string })?.id;
  const recurring = state.recurringTransactions.find((item) => item.id === recurringId);
  if (!recurring) throw new Error(apiText("api.recurring.notFound"));

  const service = new RecurringTransactionService();
  const anchorDay = anchorDayOf(recurring);
  const status = service.getStatus({
    nextDate: new Date(recurring.nextDate),
    frequency: recurring.frequency,
    isActive: recurring.isActive,
    anchorDay
  });
  for (const dueDate of status.dueDates) {
    upsertTransaction(
      state,
      {
        amount: String(recurring.amount),
        type: recurring.type,
        accountId: recurring.account.id,
        categoryId: recurring.category.id,
        date: dueDate.toISOString(),
        description: recurring.description ?? withCurrentNames(state, recurring).category.label
      },
      "POST",
      // Операция помнит свой шаблон: без этого аренда, списанная в отпуске,
      // получала метку поездки, а «до зарплаты» считало её и обычной тратой,
      // и платежом впереди.
      recurring.id
    );
  }
  state.recurringTransactions = state.recurringTransactions.map((item) =>
    item.id === recurring.id
      ? {
          ...item,
          nextDate: status.nextDateAfterRun.toISOString(),
          dayOfMonth: anchorDay,
          isDue: false
        }
      : item
  );
  return { created: status.dueDates.length, nextDate: status.nextDateAfterRun.toISOString() };
}

// Materializes every currently-due active template at once (used by opt-in
// auto-posting on app start). Idempotent: each run advances nextDate past the
// due dates, so the next run only picks up newly-due templates.
export function materializeAllDue(state: LocalState) {
  const service = new RecurringTransactionService();
  let created = 0;
  for (const recurring of state.recurringTransactions) {
    if (!recurring.isActive) continue;
    const anchorDay = anchorDayOf(recurring);
    const status = service.getStatus({
      nextDate: new Date(recurring.nextDate),
      frequency: recurring.frequency,
      isActive: recurring.isActive,
      anchorDay
    });
    if (status.dueDates.length === 0) continue;
    // A template whose account was archived or whose category was deleted
    // throws. It must cost only itself: this runs on every start, and one
    // stale template used to silently cancel the whole batch — the caller
    // swallows the error, so nothing was posted and nothing was said.
    let failed = false;
    for (const dueDate of status.dueDates) {
      try {
        upsertTransaction(
          state,
          {
            amount: String(recurring.amount),
            type: recurring.type,
            accountId: recurring.account.id,
            categoryId: recurring.category.id,
            date: dueDate.toISOString(),
            description: recurring.description ?? withCurrentNames(state, recurring).category.label
          },
          "POST",
          recurring.id
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
        ? {
            ...item,
            nextDate: status.nextDateAfterRun.toISOString(),
            dayOfMonth: anchorDay,
            isDue: false
          }
        : item
    );
  }
  return { created };
}

export function recurringPage(state: LocalState): RecurringTransactionsPageData {
  const service = new RecurringTransactionService();
  const context = baseAmountContext(state.accounts, ratesOf(state), state.currency);
  const rows = service.sortUpcoming(
    state.recurringTransactions.map((stored) => {
      const item = withCurrentNames(state, stored);
      const status = service.getStatus({
        nextDate: new Date(item.nextDate),
        frequency: item.frequency,
        isActive: item.isActive,
        anchorDay: anchorDayOf(item)
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
  // В основной валюте, как и шаблоны: экран подписывает суммы её знаком и
  // складывает их с шаблонами в итоги месяца и недели.
  const debtPayments = plannedDebtPayments(
    activeDebts(state.liabilities ?? []).map((item) => debtInBase(state, item))
  );
  // Savings interest is the mirror image: money the plan will ADD, on dates
  // that follow from the rate and the capitalisation period.
  const interestAccruals = upcomingInterest(accountsPage(state).accounts);
  return {
    source: "database",
    recurringTransactions: rows,
    accounts: accountsPage(state).accounts,
    categories: [...state.categories],
    budgetHints: budgetRows(state)
      .filter((budget) => budget.limitAmount > 0)
      .map((budget) => ({ categoryId: budget.categoryId, amount: budget.limitAmount })),
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
          // countableAmount, как у итогов месяца ниже: 100 $ — это 9 000 ₽,
          // а не 100, сложенные с рублями.
          .reduce((sum, row) => sum + countableAmount(row), 0) +
          debtPayments
            .filter((payment) => payment.isDue || payment.daysUntilNext <= 7)
            .reduce((sum, payment) => sum + payment.amount, 0)
      ),
      monthlyPlannedIncome: roundMoney(
        monthly("INCOME") + monthlyInterestAverage(interestAccruals)
      ),
      monthlyPlannedExpense: roundMoney(monthly("EXPENSE") + plannedDebtMonthlyTotal(debtPayments))
    }
  };
}
