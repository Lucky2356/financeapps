"use client";

import type { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { useApiMutation } from "@/hooks/use-api-mutation";
import { apiClient } from "@/lib/api/client";
import type { useI18n } from "@/lib/i18n/context";
import type { InvestmentData } from "@/types/finance";

/** Позиции и список наблюдения: окна добавления и правки, запись и удаление. */
export function useInvestmentActions({
  reload,
  router,
  run,
  t
}: {
  reload: () => Promise<unknown>;
  router: ReturnType<typeof useRouter>;
  run: ReturnType<typeof useApiMutation>["run"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<
    InvestmentData["portfolio"][number] | null
  >(null);

  async function refresh() {
    await reload();
    router.refresh();
  }

  async function submitPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    await run(() => apiClient.post("/investments", payload), {
      success: t("inv.toast.positionSaved"),
      error: t("inv.toast.positionSaveError"),
      onSuccess: async () => {
        setAddPositionOpen(false);
        setEditingPosition(null);
        await refresh();
      }
    });
  }

  async function removePosition(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "delete", ticker }), {
      success: t("inv.toast.positionRemoved"),
      error: t("inv.toast.positionRemoveError"),
      onSuccess: refresh
    });
  }

  async function addWatchlistTicker(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "addWatchlist", ticker }), {
      success: t("inv.toast.watchlistAdded", { ticker }),
      error: t("inv.toast.watchlistAddError"),
      onSuccess: async () => {
        setWatchlistOpen(false);
        await refresh();
      }
    });
  }

  async function removeWatchlistItem(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "removeWatchlist", ticker }), {
      success: t("inv.toast.watchlistRemoved"),
      error: t("inv.toast.watchlistRemoveError"),
      onSuccess: refresh
    });
  }

  return {
    watchlistOpen,
    setWatchlistOpen,
    addPositionOpen,
    setAddPositionOpen,
    editingPosition,
    setEditingPosition,
    refresh,
    submitPosition,
    removePosition,
    addWatchlistTicker,
    removeWatchlistItem
  };
}
