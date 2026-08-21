import { toBaseAmount, type CurrencyCode, type CurrencyRates } from "@/lib/currency";
import { roundMoney } from "@/lib/utils";

// An operation is recorded in the currency of the account it happened on: a
// card in dollars stores 100, not the roubles that is worth. Balances have
// always been converted before they were added up; the operations were not, so
// every total built on them — income, spending, category shares, budgets, the
// plan — added dollars to roubles as if they were the same unit.
//
// The conversion belongs in one place, applied once as the data is read, rather
// than in each of the two dozen places that sum something up.

export type AmountRow = { amount: number; account: { id: string } };

export type BaseAmountContext = {
  /** Account id → the currency that account keeps. */
  currencyOf: Map<string, CurrencyCode>;
  rates: CurrencyRates;
  base: CurrencyCode;
};

export function baseAmountContext(
  accounts: Array<{ id: string; currency: string }>,
  rates: CurrencyRates,
  base: string
): BaseAmountContext {
  return {
    currencyOf: new Map(accounts.map((account) => [account.id, account.currency as CurrencyCode])),
    rates,
    base: base as CurrencyCode
  };
}

/** True when every account already keeps the base currency — the usual case. */
export function isSingleCurrency(context: BaseAmountContext): boolean {
  for (const currency of context.currencyOf.values()) if (currency !== context.base) return false;
  return true;
}

/**
 * The figure to add up. A row read from the API carries `baseAmount` when its
 * account keeps another currency; everything that sums rows uses this rather
 * than `amount`, which is the money as it was recorded.
 */
export function countableAmount(row: { amount: number; baseAmount?: number }): number {
  return row.baseAmount ?? row.amount;
}

/** One row's amount in the base currency. */
export function baseAmountOf(row: AmountRow, context: BaseAmountContext): number {
  const currency = context.currencyOf.get(row.account.id) ?? context.base;
  if (currency === context.base) return row.amount;
  return roundMoney(toBaseAmount(row.amount, currency, context.rates));
}

/**
 * The same rows with every amount expressed in the base currency.
 *
 * Returns the array untouched when there is nothing to convert, so a ledger in
 * one currency — which is most of them — pays nothing for this.
 */
export function toBaseRows<T extends AmountRow>(rows: T[], context: BaseAmountContext): T[] {
  if (isSingleCurrency(context)) return rows;
  return rows.map((row) => {
    const amount = baseAmountOf(row, context);
    return amount === row.amount ? row : { ...row, amount };
  });
}
