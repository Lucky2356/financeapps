"use client";

import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import type { TransactionsPageData } from "@/lib/data";

/**
 * Своя копия списка операций: читается по адресу (фильтры в `paramsString`)
 * и перечитывается после любой записи.
 */
export function useTransactionsData(data: TransactionsPageData, paramsString: string) {
  const [pageData, setPageData] = useState(data);
  const loadTransactions = useCallback(
    async (forceApi = false) => {
      if (!paramsString && !forceApi) {
        setPageData(data);
        return;
      }

      try {
        const nextData = await apiClient.get(
          paramsString ? `/transactions?${paramsString}` : "/transactions"
        );
        setPageData(nextData);
      } catch {
        setPageData(data);
      }
    },
    [data, paramsString]
  );

  useEffect(() => {
    let cancelled = false;

    // Always load from the active API client (LocalApiClient on desktop) so the
    // page shows real data and the forms get real account/category options —
    // the server-rendered `data` is an empty placeholder on the static build.
    void (async () => {
      try {
        const nextData = await apiClient.get(
          paramsString ? `/transactions?${paramsString}` : "/transactions"
        );
        if (!cancelled) setPageData(nextData);
      } catch {
        if (!cancelled) setPageData(data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, paramsString]);

  // This screen keeps its own copy of the list (filters live in the URL), so it
  // subscribes to writes itself: an operation added from the quick-add button
  // must appear here without a manual reload.
  useEffect(() => onDataChanged(() => void loadTransactions(true)), [loadTransactions]);

  return { pageData, loadTransactions };
}
