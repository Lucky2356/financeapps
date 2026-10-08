"use client";

import { useEffect, useState } from "react";

import type { TransactionRow } from "@/components/transactions/transaction-manager/helpers";

/** Отмеченные галочками строки для действия над несколькими сразу. */
export function useTransactionSelection(
  visibleTransactions: TransactionRow[],
  paramsString: string
) {
  // Bulk selection: ids of transactions ticked for a batch action.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset the batch selection whenever the filter/page changes so a stale tick
  // never targets a row the user can no longer see.
  useEffect(() => {
    void Promise.resolve().then(() => setSelectedIds(new Set()));
  }, [paramsString]);

  // Bulk selection helpers.
  const allVisibleSelected =
    visibleTransactions.length > 0 && visibleTransactions.every((tx) => selectedIds.has(tx.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(() =>
      allVisibleSelected ? new Set() : new Set(visibleTransactions.map((tx) => tx.id))
    );
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return { selectedIds, allVisibleSelected, toggleSelect, toggleSelectAll, clearSelection };
}
