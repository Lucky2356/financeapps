"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { AccountsPageData, SettingsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { Button } from "@/components/ui/button";

// Desktop-only note showing how fresh the cached CBR exchange rates are, with a
// manual refresh. Only relevant when the user holds a non-RUB account — with a
// single currency there is nothing to convert. On web it renders nothing (the
// browser can't fetch the CBR feed cross-origin; rates aren't used there).
export function FxRatesNote({ accounts }: { accounts: AccountsPageData["accounts"] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const hasForeign = accounts.some((a) => a.currency && a.currency !== "RUB");

  useEffect(() => {
    if (!isLocalDesktopMode || !hasForeign) return;
    let cancelled = false;
    apiClient
      .get<SettingsPageData>("/settings")
      .then((data) => {
        if (!cancelled) setUpdatedAt(data.currencyRatesUpdatedAt ?? null);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [hasForeign]);

  if (!isLocalDesktopMode || !hasForeign) return null;

  async function refresh() {
    setRefreshing(true);
    try {
      const { fetchCbrRates } = await import("@/services/market/FxRatesProvider");
      const rates = await fetchCbrRates();
      const res = await apiClient.post<{ updatedAt: string }>("/fx", { rates });
      setUpdatedAt(res.updatedAt);
      toast.success(t("fx.refreshed"));
      router.refresh();
    } catch {
      toast.error(t("fx.refreshFail"));
    } finally {
      setRefreshing(false);
    }
  }

  const when = updatedAt
    ? new Date(updatedAt).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
        day: "numeric",
        month: "long"
      })
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <span>{when ? t("fx.updatedOn", { date: when }) : t("fx.notLoaded")}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2"
        onClick={() => void refresh()}
        disabled={refreshing}
      >
        <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
        {t("fx.refresh")}
      </Button>
    </div>
  );
}
