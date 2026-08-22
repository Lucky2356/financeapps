// Shared, pure transaction-filter logic. Used by both the desktop LocalApiClient
// (server-side paging) and the transactions UI (client-side re-filter of the
// current page) so the two never drift. Extended beyond the original
// date/type/category/account/text filters with an amount range and multiple
// categories.

import { isTransfer } from "@/lib/transactions/transfers";

export type TxFilterCriteria = {
  from?: string;
  to?: string;
  /**
   * "TRANSFER" is not a type a row carries: both halves of a transfer are
   * ordinary income/expense rows. It selects the pair (see `transfers.ts`).
   */
  type?: "ALL" | "INCOME" | "EXPENSE" | "TRANSFER";
  /** One or more category ids (OR-combined). Empty = any category. */
  categoryIds?: string[];
  accountId?: string;
  q?: string;
  minAmount?: number;
  maxAmount?: number;
  /** Match transactions carrying this tag (case-insensitive). */
  tag?: string;
};

// Minimal structural shape every transaction row satisfies (TransactionRow and
// the demo rows both match), so this stays decoupled from the full type.
export type FilterableTransaction = {
  date: string;
  type: string;
  amount: number;
  description?: string | null;
  /** Present on transfer halves recorded since 1.10.0. */
  transferId?: string;
  account: { id: string; label: string };
  category: { id: string; label: string };
  tags?: string[];
};

/** Parses a `categoryId` query value that may hold a comma-separated list. */
export function parseCategoryIds(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Reads filter criteria from URL search params (single source of truth). */
export function criteriaFromParams(params: URLSearchParams): TxFilterCriteria {
  const min = params.get("minAmount");
  const max = params.get("maxAmount");
  const type = params.get("type");
  return {
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    type: type === "INCOME" || type === "EXPENSE" || type === "TRANSFER" ? type : "ALL",
    categoryIds: parseCategoryIds(params.get("categoryId")),
    accountId: params.get("accountId") || undefined,
    q: params.get("q") || undefined,
    minAmount: min ? Number(min) : undefined,
    maxAmount: max ? Number(max) : undefined,
    tag: params.get("tag") || undefined
  };
}

/** True when a transaction passes every active criterion. */
export function matchesCriteria(
  transaction: FilterableTransaction,
  criteria: TxFilterCriteria
): boolean {
  const date = transaction.date.slice(0, 10);
  if (criteria.from && date < criteria.from) return false;
  if (criteria.to && date > criteria.to) return false;
  if (criteria.type === "TRANSFER") {
    if (
      !isTransfer({
        description: transaction.description ?? null,
        transferId: transaction.transferId
      })
    ) {
      return false;
    }
  } else if (criteria.type && criteria.type !== "ALL" && transaction.type !== criteria.type) {
    return false;
  }
  if (criteria.categoryIds && criteria.categoryIds.length > 0) {
    if (!criteria.categoryIds.includes(transaction.category.id)) return false;
  }
  if (criteria.accountId && transaction.account.id !== criteria.accountId) return false;
  if (typeof criteria.minAmount === "number" && !Number.isNaN(criteria.minAmount)) {
    if (transaction.amount < criteria.minAmount) return false;
  }
  if (typeof criteria.maxAmount === "number" && !Number.isNaN(criteria.maxAmount)) {
    if (transaction.amount > criteria.maxAmount) return false;
  }
  if (criteria.tag) {
    const wanted = criteria.tag.toLowerCase();
    const tags = (transaction.tags ?? []).map((tag) => tag.toLowerCase());
    if (!tags.includes(wanted)) return false;
  }
  if (criteria.q) {
    const query = criteria.q.toLowerCase();
    const haystack =
      `${transaction.description ?? ""} ${transaction.account.label} ${transaction.category.label} ${(transaction.tags ?? []).join(" ")}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

/** Convenience: filter a list in place-safe manner. */
export function filterTransactions<T extends FilterableTransaction>(
  transactions: T[],
  criteria: TxFilterCriteria
): T[] {
  return transactions.filter((transaction) => matchesCriteria(transaction, criteria));
}
