"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { MarketSecurity } from "@/services/market/MarketDataService";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

// Live search over the whole MOEX universe so the user can add ANY listed stock.
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
            `/investments/search?q=${encodeURIComponent(q)}`
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
  }, [query]);

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
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-medium">
                    {formatCurrency(security.price, currency)}
                  </span>
                  <span
                    className={
                      security.changeDay >= 0
                        ? "text-xs text-success-foreground"
                        : "text-xs text-destructive"
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
