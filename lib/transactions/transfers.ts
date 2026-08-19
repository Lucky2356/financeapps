import type { TransactionRow } from "@/types/finance";

// Moving money between your own accounts is not income and not spending — the
// total you own does not change. The app records it as a pair of ordinary
// operations (one out, one in) so both balances move, which is right for the
// balances and wrong for every total built on top of them: a month with a large
// transfer showed "Переводы" as the biggest category on both sides at once.
//
// Rows created since 1.10.0 carry `transferId`. Older ones only have the marker
// the transfer writer left in the description, so both are recognised here.

/**
 * The category both halves of a transfer are filed under. The pair has to live
 * somewhere, and this is the name the transfer writer creates on first use — so
 * screens that list every category (plan/fact) can leave it out when transfers
 * are not being counted.
 */
export const TRANSFER_CATEGORY_LABEL = "Переводы";

const LEGACY_MARKER = /\[transfer:[^\]]+\]/;

export function isTransfer(row: Pick<TransactionRow, "description"> & { transferId?: string }) {
  if (row.transferId) return true;
  return typeof row.description === "string" && LEGACY_MARKER.test(row.description);
}

/** The same rows with both halves of every transfer removed. */
export function withoutTransfers<T extends Pick<TransactionRow, "description">>(rows: T[]): T[] {
  return rows.filter((row) => !isTransfer(row));
}

/**
 * Rows to count in a total, given the reader's choice. Keeping the decision in
 * one function means a screen cannot forget to honour the setting.
 */
export function countableRows<T extends Pick<TransactionRow, "description">>(
  rows: T[],
  includeTransfers: boolean
): T[] {
  return includeTransfers ? rows : withoutTransfers(rows);
}
