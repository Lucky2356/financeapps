// A repaid debt must disappear from every calculation at once — capital, the
// health score, planned payments, auto-payment and the forecast all read the
// same list, so the "is it still owed?" question lives here rather than being
// re-implemented at each call site.

type SettleableDebt = { settledAt?: string };

/** True once the owner ticked «Погашен» on the debts screen. */
export function isSettledDebt<T extends SettleableDebt>(liability: T): boolean {
  return Boolean(liability.settledAt);
}

/** The debts that are still owed — the only ones any calculation may use. */
export function activeDebts<T extends SettleableDebt>(liabilities: readonly T[]): T[] {
  return liabilities.filter((liability) => !isSettledDebt(liability));
}

/** The repaid ones, newest first — shown as history on the debts screen. */
export function settledDebts<T extends SettleableDebt>(liabilities: readonly T[]): T[] {
  return liabilities
    .filter(isSettledDebt)
    .sort((a, b) => (b.settledAt ?? "").localeCompare(a.settledAt ?? ""));
}
