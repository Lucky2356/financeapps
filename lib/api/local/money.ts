// Деньги в базовой валюте: таблица курсов, суммы по счетам, пересчёт операций
// на чтение и движение баланса. На этом стоят все остальные разделы.

import { id } from "@/lib/api/local/helpers";
import { convert, DEFAULT_CURRENCY_RATES, type CurrencyRates } from "@/lib/currency";
import { roundMoney } from "@/lib/utils";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/categories/palette";
import {
  baseAmountContext,
  baseAmountOf,
  isSingleCurrency,
  toBaseRows
} from "@/lib/transactions/base-amount";
import { countableRows } from "@/lib/transactions/transfers";
import {
  type CategoryOption,
  type LocalState,
  DEFAULT_IMPORT_ACCOUNT
} from "@/lib/api/local/state";

export function applyBalance(state: LocalState, accountId: string, delta: number) {
  state.accounts = state.accounts.map((account) =>
    account.id === accountId
      ? { ...account, balance: roundMoney(account.balance + delta) }
      : account
  );
}

/**
 * The account a CSV row names, made if it is not there yet. Balances follow
 * from the operations posted onto it, so a new account starts at zero and
 * ends up holding exactly what was imported into it.
 */
export function findOrCreateAccount(state: LocalState, name: string) {
  const label = name.trim().slice(0, 60) || DEFAULT_IMPORT_ACCOUNT;
  const existing = state.accounts.find(
    (item) => !item.isArchived && item.name.toLowerCase() === label.toLowerCase()
  );
  if (existing) return existing;
  const account = {
    id: id("account"),
    name: label,
    type: "DEBIT_CARD" as const,
    balance: 0,
    currency: state.currency
  };
  state.accounts = [...state.accounts, account];
  return account;
}

export function findOrCreateCategory(state: LocalState, label: string, kind: "INCOME" | "EXPENSE") {
  const existing = state.categories.find(
    (item) => item.kind === kind && item.label.toLowerCase() === label.toLowerCase()
  );
  if (existing) return existing;
  const category = {
    id: id("cat"),
    label,
    kind,
    color: kind === "INCOME" ? "#7ed6b7" : DEFAULT_CATEGORY_COLOR
  } satisfies CategoryOption;
  state.categories = [...state.categories, category];
  return category;
}

// Cached FX table (RUB per unit) for cross-currency aggregation. Falls back to
// the built-in defaults if a refresh has not populated it yet.
export function ratesOf(state: LocalState): CurrencyRates {
  const rates = state.currencyRates;
  return rates && Object.keys(rates).length > 0 ? rates : DEFAULT_CURRENCY_RATES;
}

// Sums a list of {balance, currency} items into the base currency (RUB) so a
// mixed-currency total is a single honest number, not raw digits added up.
export function sumInBase(
  state: LocalState,
  items: Array<{ balance: number; currency: string }>
): number {
  const rates = ratesOf(state);
  return roundMoney(
    items.reduce(
      (sum, item) => sum + convert(item.balance, item.currency, state.currency, rates),
      0
    )
  );
}

// The same state with transfers between own accounts left out of the
// operations, so everything derived downstream — month totals, category
// breakdowns, budget spending, the health score — counts the same rows. The
// balances are untouched, and so is capital: a transfer never changed them.
/**
 * The same document with every operation's amount expressed in the base
 * currency.
 *
 * An operation is stored in the currency of its account — a dollar card keeps
 * 100, not what that is worth in roubles. Balances were converted before they
 * were summed; operations were not, so every total built on them added
 * dollars to roubles as though they were the same unit. The conversion
 * happens here, once, on the way into the read paths; a ledger already in one
 * currency is handed back untouched and pays nothing for this.
 */
export function inBase(state: LocalState): LocalState {
  const context = baseAmountContext(state.accounts, ratesOf(state), state.currency);
  if (isSingleCurrency(context)) return state;

  return {
    ...state,
    transactions: toBaseRows(state.transactions, context),
    // A recurring template spends from the same account, so it carries the
    // same currency and the forecast needs it converted too.
    recurringTransactions: state.recurringTransactions.map((row) => {
      const amount = baseAmountOf({ amount: row.amount, account: row.account }, context);
      return amount === row.amount ? row : { ...row, amount };
    })
  };
}

export function countingState(state: LocalState, includeTransfers: boolean): LocalState {
  if (includeTransfers) return state;
  return { ...state, transactions: countableRows(state.transactions, false) };
}
