"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { MarketSecurity } from "@/services/market/MarketDataService";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { ASSET_KINDS, type AssetKind } from "@/types/enums";

// Live search over the whole MOEX universe so the user can add ANY listed
// security. It used to look at the shares board alone, which is why a bond
// could not be found at all — the app was searching a list it was never on.
export function SecuritySearch({
  currency,
  onSelect,
  placeholder
}: {
  currency: string;
  onSelect: (security: MarketSecurity) => void;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [results, setResults] = useState<MarketSecurity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const data = await apiClient.get<{ results: MarketSecurity[] }>(
            `/investments/search?q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ""}`
          );
          if (!cancelled) setResults(data.results ?? []);
        } catch {
          if (!cancelled) setResults([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, kind]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? t("inv.searchPlaceholder")}
          className="pl-9"
          autoFocus
        />
      </div>
      {/* Narrowing by kind matters most where the list is longest: there are
          thousands of bonds, and a plain text search over all of them buries
          the one you hold. */}
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("inv.kind.label")}
        data-testid="asset-kind-filter"
      >
        {[null, ...ASSET_KINDS.filter((item) => item !== "OTHER")].map((item) => (
          <button
            key={item ?? "all"}
            type="button"
            aria-pressed={kind === item}
            onClick={() => setKind(item)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              kind === item
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            {item ? t(`inv.kind.${item}`) : t("inv.kind.all")}
          </button>
        ))}
      </div>
      {query.trim().length >= 1 ? (
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {loading && results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t("inv.searching")}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t("cmd.nothingFound")}
            </p>
          ) : (
            results.map((security) => (
              <button
                key={security.ticker}
                type="button"
                onClick={() => onSelect(security)}
                className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="font-semibold">{security.ticker}</span>{" "}
                  <span className="text-muted-foreground">{security.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`inv.kind.${security.assetKind}`)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-medium">
                    {formatCurrency(security.price, currency)}
                  </span>
                  <span
                    className={
                      security.changeDay >= 0 ? "text-xs text-success" : "text-xs text-destructive"
                    }
                  >
                    {security.changeDay >= 0 ? "+" : ""}
                    {security.changeDay.toFixed(2)}%
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
