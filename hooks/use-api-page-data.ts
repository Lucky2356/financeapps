"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api/client";

export function useApiPageData<T>(initialData: T, path: string) {
  const [data, setData] = useState(initialData);
  // Track the latest initialData for error fallback without adding it to
  // effect/callback dependency arrays — avoids a double-fetch on every
  // router.refresh() because that call creates a new object reference even
  // when the server data has not actually changed.
  const initialDataRef = useRef(initialData);
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  const reload = useCallback(async () => {
    try {
      setData(await apiClient.get<T>(path));
    } catch {
      setData(initialDataRef.current);
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextData = await apiClient.get<T>(path);
        if (!cancelled) setData(nextData);
      } catch {
        if (!cancelled) setData(initialDataRef.current);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, reload, setData };
}
