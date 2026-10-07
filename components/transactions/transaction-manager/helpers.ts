import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";

export type BudgetWarning = { category: string; spent: number; limit: number };

/** Одна строка списка операций. */
export type TransactionRow = TransactionsPageData["transactions"][number];

/**
 * Только что записанная — подсвечивается при появлении (.flash-new): после
 * «Сохранить» видно, куда она встала. Подсветка играет один раз — когда строка
 * появляется в списке.
 */
export function isJustAdded(row: { createdAt?: string }): boolean {
  const at = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  return Number.isFinite(at) && Date.now() - at < 8000;
}

/**
 * Сумма строки для показа. Счета берутся из исходных `data`, как и раньше,
 * поэтому вызывается на каждом рендере со свежим списком.
 */
export function makeRowAmount(accounts: TransactionsPageData["accounts"]) {
  // A row shows the money as it was actually paid. When the account keeps
  // another currency, what it is worth in the base one follows in brackets —
  // otherwise 100 $ would read as "100 ₽" beside totals that count 9 000.
  const currencyOfAccount = new Map(accounts.map((account) => [account.id, account.currency]));
  return (transaction: TransactionsPageData["transactions"][number]) => {
    const currency = currencyOfAccount.get(transaction.account.id) ?? "RUB";
    const own = formatCurrency(transaction.amount, currency);
    if (transaction.baseAmount === undefined) return own;
    return `${own} (${formatCurrency(transaction.baseAmount)})`;
  };
}

// PUT payload mirroring the edit dialog's fields, with an overridden category.
export function updatePayload(
  transaction: TransactionsPageData["transactions"][number],
  categoryId: string
) {
  return {
    id: transaction.id,
    amount: String(transaction.amount),
    type: transaction.type,
    date: formatInputDate(transaction.date),
    categoryId,
    accountId: transaction.account.id,
    description: transaction.description ?? ""
  };
}
