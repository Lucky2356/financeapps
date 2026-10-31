"use client";

import type { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { useI18n } from "@/lib/i18n/context";

const REFRESH_INTERVAL_MS = 45_000;

/** Котировки: обновить по кнопке, при открытии экрана и, пока он виден, по таймеру. */
export function useMarketRefresh({
  hasMarketData,
  reload,
  router,
  t
}: {
  hasMarketData: boolean;
  reload: () => Promise<unknown>;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useI18n>["t"];
}) {
  // Silent: refresh prices in the background without a toast on every visit.
  const refreshSilently = useEffectEvent(() => void refreshMarketPrices(true));

  // Auto-refresh only when the user has investments to update (avoids confusing
  // "updated 10 stocks" toast when user has never added any data). Once per
  // visit: the data present when the screen opened decides.
  const autoRefreshed = useRef(false);
  const refreshOnOpen = useEffectEvent(() => {
    if (hasMarketData) refreshSilently();
  });
  useEffect(() => {
    if (autoRefreshed.current) return;
    autoRefreshed.current = true;
    refreshOnOpen();
  }, []);

  // Real-time updates: keep prices fresh while the page is VISIBLE. Polling is
  // paused when the tab/window is hidden (other tab, minimized desktop) to save
  // network and battery, and resumes — with an immediate refresh — on return.
  useEffect(() => {
    if (!hasMarketData) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(() => refreshSilently(), REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshSilently();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasMarketData]);

  async function refreshMarketPrices(silent = false) {
    try {
      const result = await apiClient.post("/investments", {
        action: "refreshMarket"
      });
      if (!silent) {
        toast.success(t("inv.toast.marketRefreshed", { n: result.updated, source: result.source }));
      }
      await reload();
      router.refresh();
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : t("inv.toast.marketRefreshError"));
      }
    }
  }

  return { refreshMarketPrices };
}
