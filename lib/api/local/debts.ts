// Долги: запись кредита или займа, платёж, автоплатежи и страница «Долги».

import type { LiabilitiesPageData } from "@/lib/data";
import { id, toFormObject } from "@/lib/api/local/helpers";
import { todayDay } from "@/lib/transactions/date";
import { dueLiabilities, monthKey, paymentAmount } from "@/lib/debts/auto-pay";
import { plannedDebtPayments } from "@/lib/debts/planned";
import { activeDebts, isSettledDebt } from "@/lib/debts/settled";
import { convert, isSupportedCurrency } from "@/lib/currency";
import { isUsableMoney, MAX_MONEY, roundMoney } from "@/lib/utils";
import { apiText, moneyRangeText } from "@/lib/i18n/api-text";
import type { LiabilityRow, TransactionRow } from "@/types/finance";
import { type LocalState, recomputeLiability } from "@/lib/api/local/state";
import { ratesOf, sumInBase } from "@/lib/api/local/money";
import { dataText } from "@/lib/i18n/data-text";
import { recordDebtApplied, upsertTransaction } from "@/lib/api/local/ledger";

/**
 * Сумма долга из формы: «1 000,50» с пробелами и запятой, пусто — ноль. Не
 * число — понятный отказ здесь: NaN доходил до проверки книги, и человек видел
 * «значение не подходит — поле liabilities.0.balance».
 */
function debtAmount(raw: string | undefined): number {
  const value = Number(
    String(raw ?? "")
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".") || 0
  );
  if (!Number.isFinite(value)) throw new Error(apiText("api.plan.amountRange"));
  // «1e308» — тоже число: долг такого размера делал капитал бесконечным, и
  // дальше не сохранялась ни одна запись. Предел тот же, что у операций.
  if (value > MAX_MONEY) throw new Error(apiText("api.debt.amountRange", { max: MAX_MONEY / 1e9 }));
  return Math.max(value, 0);
}

/**
 * Ставка из формы, в процентах годовых: пусто — ноль. Больше 1000 % ставок не
 * бывает — это опечатка, и бесконечная ставка ломала расчёт переплаты.
 */
function debtRate(raw: string | undefined): number {
  const value = Number(
    String(raw ?? "")
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".") || 0
  );
  if (!Number.isFinite(value) || value > 1000) throw new Error(apiText("api.debt.rateRange"));
  return Math.max(value, 0);
}

export function upsertLiability(state: LocalState, body: unknown, method: "POST" | "PUT") {
  const input = toFormObject(body);
  const kindInput = input.kind ?? "";
  const kind = (
    ["CREDIT_CARD", "LOAN", "MORTGAGE", "INSTALLMENT", "OTHER"].includes(kindInput)
      ? kindInput
      : "OTHER"
  ) as LiabilityRow["kind"];
  const balance = debtAmount(input.balance);
  const dueDayRaw = Number(input.dueDay);
  const stored: Omit<LiabilityRow, "progress"> = {
    id: method === "PUT" && input.id ? input.id : id("debt"),
    // Длиннее 100 знаков схема книги не примет — долг пропал бы при запуске.
    name: (input.name?.trim() || dataText("data.debt.new")).slice(0, 100),
    kind,
    balance,
    originalAmount: Math.max(debtAmount(input.originalAmount), balance),
    interestRate: debtRate(input.interestRate),
    minPayment: debtAmount(input.minPayment),
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
  if (!liability) throw new Error(apiText("api.debt.notFound"));
  if (isSettledDebt(liability)) throw new Error(apiText("api.debt.settled"));
  const amount = Number(
    String(input.amount ?? "")
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".")
  );
  if (!isUsableMoney(amount)) throw new Error(moneyRangeText());
  const account =
    state.accounts.find((item) => item.id === input.accountId && !item.isArchived) ??
    state.accounts.find((item) => item.id === liability.paymentAccountId && !item.isArchived);
  if (!account) throw new Error(apiText("api.debt.pickAccount"));
  const category =
    state.categories.find(
      (item) => item.id === liability.paymentCategoryId && item.kind === "EXPENSE"
    ) ?? state.categories.find((item) => item.kind === "EXPENSE");
  if (!category) throw new Error(apiText("api.debt.noCategory"));

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

  // Долг уменьшается не больше, чем его осталось, и платёж помнит, на сколько
  // именно: удаление переплаты вернёт долгу эту долю, а не всю сумму.
  const applied = roundMoney(Math.min(amount, Math.max(liability.balance, 0)));
  const balance = Math.max(0, roundMoney(liability.balance - applied));
  recordDebtApplied(state, tx.id, applied);
  // Заплатили в этом месяце — автоплатёж второй раз не спишет.
  const month = tx.date.slice(0, 7);
  state.liabilities = state.liabilities.map((item) =>
    item.id === liability.id
      ? { ...item, balance, ...(month === monthKey(new Date()) ? { lastPaidMonth: month } : {}) }
      : item
  );
  return { paid: amount, balance, closed: balance === 0, transactionId: tx.id };
}

/**
 * Платёж по долгу удалили — месяц снова открыт для автоплатежа, если в нём не
 * осталось другого платежа по этому долгу.
 *
 * Ручной платёж (и автоплатёж) отмечает месяц оплаченным (`lastPaidMonth`), а
 * удаление платежа отметку не снимало: деньги вернулись на счёт, долг снова
 * больше, а автоплатёж считал месяц закрытым и пропускал его. Отметка
 * возвращается к последнему месяцу, где платёж остался, — или снимается.
 * Зовётся после того, как строка уже снята с книги.
 */
export function reopenPaidMonth(
  state: LocalState,
  row: Pick<TransactionRow, "liabilityId" | "type" | "date" | "autoPaid">
) {
  // Удалён платёж, который записал сам автоплатёж, — человек так говорит, что
  // этот месяц оплачен иначе (или не нужен). Повторять его автоплатёж не должен:
  // удалённое создавалось бы снова при каждом запуске.
  if (!row.liabilityId || row.type !== "EXPENSE" || row.autoPaid) return;
  const liability = state.liabilities.find((item) => item.id === row.liabilityId);
  const month = row.date.slice(0, 7);
  if (!liability || liability.lastPaidMonth !== month) return;
  const paidMonths = state.transactions
    .filter((item) => item.liabilityId === liability.id && item.type === "EXPENSE")
    .map((item) => item.date.slice(0, 7));
  if (paidMonths.includes(month)) return;
  const earlier = paidMonths.filter((item) => item < month).sort();
  const previous = earlier[earlier.length - 1];
  state.liabilities = state.liabilities.map((item) => {
    if (item.id !== liability.id) return item;
    const { lastPaidMonth: _was, ...rest } = item;
    void _was;
    return previous ? { ...rest, lastPaidMonth: previous } : rest;
  });
}

export function autoPayDebts(state: LocalState) {
  const today = new Date();
  const due = dueLiabilities(state.liabilities, today);
  if (due.length === 0) return { posted: 0 };

  const fallbackAccount = state.accounts.find((account) => !account.isArchived);
  const fallbackCategory = state.categories.find((category) => category.kind === "EXPENSE");
  let posted = 0;

  for (const liability of due) {
    // Запасной счёт и категория — только для долга, у которого они не выбраны.
    // Выбранный счёт ушёл в архив (категорию удалили) — платёж не проводится:
    // раньше он молча списывался с первого попавшегося счёта, хотя человек
    // назвал другой, и деньги уходили не оттуда, откуда он их ждал.
    const accountId = liability.paymentAccountId
      ? state.accounts.find(
          (account) => account.id === liability.paymentAccountId && !account.isArchived
        )?.id
      : fallbackAccount?.id;
    const categoryId = liability.paymentCategoryId
      ? state.categories.find(
          (category) => category.id === liability.paymentCategoryId && category.kind === "EXPENSE"
        )?.id
      : fallbackCategory?.id;
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

    const tx = upsertTransaction(
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
    // paymentAmount не больше остатка — платёж снимает с долга всю сумму.
    recordDebtApplied(state, tx.id, amount);
    state.transactions = state.transactions.map((row) =>
      row.id === tx.id ? { ...row, autoPaid: true } : row
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
