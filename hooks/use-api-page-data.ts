"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { runtimeConfig } from "@/lib/platform/env";

const STATIC_EXPORT_COMPAT_PATHS = new Set(["/analytics", "/dashboard", "/forecast"]);

function shouldRefetchFromApi(path: string) {
  if (runtimeConfig.platform === "desktop" && runtimeConfig.desktopDataMode === "local")
    return true;
  if (runtimeConfig.apiMode === "local" || runtimeConfig.apiMode === "mock") return true;

  const pathname = path.split("?")[0];
  // These read-only API routes stay `force-static` so `NEXT_OUTPUT=export`
  // can build the desktop shell. In web/cloud mode the server-rendered page
  // data is fresher than the static route snapshot, so do not overwrite it.
  return !STATIC_EXPORT_COMPAT_PATHS.has(pathname);
}

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
    if (!shouldRefetchFromApi(path)) {
      setData(initialDataRef.current);
      return;
    }

    try {
      setData(await apiClient.get<T>(path));
    } catch {
      setData(initialDataRef.current);
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;

    if (!shouldRefetchFromApi(path)) {
      setData(initialDataRef.current);
      return () => {
        cancelled = true;
      };
    }

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
