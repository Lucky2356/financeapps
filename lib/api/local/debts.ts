// Долги: запись кредита или займа, платёж, автоплатежи и страница «Долги».

import type { LiabilitiesPageData } from "@/lib/data";
import { id, toFormObject } from "@/lib/api/local/helpers";
import { todayDay } from "@/lib/transactions/date";
import { dueLiabilities, monthKey, paymentAmount } from "@/lib/debts/auto-pay";
import { plannedDebtPayments } from "@/lib/debts/planned";
import { activeDebts, isSettledDebt } from "@/lib/debts/settled";
import { convert, isSupportedCurrency } from "@/lib/currency";
import { isUsableMoney, MONEY_RANGE_ERROR, roundMoney } from "@/lib/utils";
import type { LiabilityRow } from "@/types/finance";
import { type LocalState, recomputeLiability } from "@/lib/api/local/state";
import { ratesOf, sumInBase } from "@/lib/api/local/money";
import { upsertTransaction } from "@/lib/api/local/ledger";

export function upsertLiability(state: LocalState, body: unknown, method: "POST" | "PUT") {
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
      return { settledAt: previous?.settledAt ?? todayDay() };
    })()
  };
  state.liabilities =
    method === "PUT"
      ? state.liabilities.map((item) => (item.id === stored.id ? stored : item))
      : [...state.liabilities, stored];
  return recomputeLiability(stored);
}

// Posts the monthly payment for every liability whose due day has arrived and
// that hasn't been charged this month yet (see lib/debts/auto-pay for the pure
// rules). Each posting creates a normal EXPENSE transaction — so budgets and
// analytics see it like any other spending — and reduces the outstanding
// balance. Idempotent: `lastPaidMonth` stops a second run in the same month.
/**
 * Платёж по долгу руками: трата со счёта и такое же уменьшение долга — как
 * автоплатёж, только на ту сумму и в тот день, которые назвал человек.
 *
 * Сумма — в валюте ДОЛГА, со счёта уходит её пересчёт в валюту счёта: платить
 * доллары по кредиту с рублёвой карты — обычное дело. Заплатили больше, чем
 * осталось, — долг просто станет нулевым; лишнее — те же проценты и комиссия,
 * и со счёта оно ушло на самом деле.
 */
export function payDebt(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const liability = state.liabilities.find((item) => item.id === input.id);
  if (!liability) throw new Error("Такого долга нет.");
  if (isSettledDebt(liability)) throw new Error("Этот долг уже закрыт.");
  const amount = Number(
    String(input.amount ?? "")
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".")
  );
  if (!isUsableMoney(amount)) throw new Error(MONEY_RANGE_ERROR);
  const account =
    state.accounts.find((item) => item.id === input.accountId && !item.isArchived) ??
    state.accounts.find((item) => item.id === liability.paymentAccountId && !item.isArchived);
  if (!account) throw new Error("Выберите счёт, с которого платите.");
  const category =
    state.categories.find(
      (item) => item.id === liability.paymentCategoryId && item.kind === "EXPENSE"
    ) ?? state.categories.find((item) => item.kind === "EXPENSE");
  if (!category) throw new Error("Нет категории расходов, под которую записать платёж.");

  const date = input.date ? String(input.date) : new Date().toISOString();
  const spent = roundMoney(convert(amount, liability.currency, account.currency, ratesOf(state)));
  const tx = upsertTransaction(
    state,
    {
      amount: String(spent),
      type: "EXPENSE",
      accountId: account.id,
      categoryId: category.id,
      date,
      description: liability.name,
      liabilityId: liability.id
    },
    "POST"
  );

  const balance = Math.max(0, roundMoney(liability.balance - amount));
  // Заплатили в этом месяце — автоплатёж второй раз не спишет.
  const month = tx.date.slice(0, 7);
  state.liabilities = state.liabilities.map((item) =>
    item.id === liability.id
      ? { ...item, balance, ...(month === monthKey(new Date()) ? { lastPaidMonth: month } : {}) }
      : item
  );
  return { paid: amount, balance, closed: balance === 0, transactionId: tx.id };
}

export function autoPayDebts(state: LocalState) {
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
    // Платёж — в валюте долга, со счёта уходит его пересчёт (как в payDebt):
    // долларовый кредит с рублёвой карты списывал 300 ₽ вместо 300 $.
    const currency = state.accounts.find((account) => account.id === accountId)?.currency;
    const spent = roundMoney(
      convert(amount, liability.currency, currency ?? liability.currency, ratesOf(state))
    );

    upsertTransaction(
      state,
      {
        amount: String(spent),
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

export function debtsPage(state: LocalState): LiabilitiesPageData {
  const liabilities = state.liabilities.map(recomputeLiability);
  const active = activeDebts(liabilities);
  const inAppCurrency = (amount: number, currency: string) =>
    convert(amount, currency, state.currency, ratesOf(state));
  const balance = sumInBase(state, active);
  const original = roundMoney(
    active.reduce(
      (sum, debt) => sum + inAppCurrency(debt.originalAmount || debt.balance, debt.currency),
      0
    )
  );
  // The nearest payment by the calendar, not the smallest day of the month:
  // on the 20th, debts due on the 5th and the 27th have the 27th coming next.
  const upcoming = plannedDebtPayments(active, new Date())[0];
  return {
    source: "database",
    liabilities,
    // Repaid debts stay in the list as history but are no longer owed.
    total: balance,
    currency: state.currency,
    totals: {
      balance,
      original,
      repaid: roundMoney(Math.max(0, original - balance)),
      monthly: roundMoney(
        active.reduce((sum, debt) => sum + inAppCurrency(debt.minPayment, debt.currency), 0)
      ),
      rate:
        balance > 0
          ? roundMoney(
              active.reduce(
                (sum, debt) => sum + debt.interestRate * inAppCurrency(debt.balance, debt.currency),
                0
              ) / balance
            )
          : 0,
      nextDue: upcoming ? { date: upcoming.dueDate, isDue: upcoming.isDue } : null
    }
  };
}
