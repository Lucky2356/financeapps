"use client";

import { useEffect, useState } from "react";

import { StockPriceChart } from "@/components/charts/lazy";
import type { StockPricePoint } from "@/components/charts/stock-price-chart";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export type StockDetailSeed = {
  ticker: string;
  name?: string;
  price?: number;
  changeDay?: number;
  change30d?: number;
  sector?: string;
};

const RANGES: { id: string; labelKey: string }[] = [
  { id: "1m", labelKey: "inv.range.1m" },
  { id: "3m", labelKey: "inv.range.3m" },
  { id: "6m", labelKey: "inv.range.6m" },
  { id: "1y", labelKey: "inv.range.1y" },
  { id: "5y", labelKey: "inv.range.5y" }
];

function ChangeBadge({ value, suffix }: { value: number; suffix: string }) {
  const up = value >= 0;
  return (
    <span className={up ? "text-success-foreground" : "text-destructive"}>
      {up ? "+" : ""}
      {value.toFixed(2)}% <span className="text-xs text-muted-foreground">{suffix}</span>
    </span>
  );
}

// Per-security price detail rendered INLINE under a table/card row (no modal):
// real MOEX history chart + range switcher + key figures. Opened by expanding a
// row in the portfolio or watchlist.
export function InlineStockChart({ seed, currency }: { seed: StockDetailSeed; currency: string }) {
  const { t } = useI18n();
  const [range, setRange] = useState("6m");
  const [points, setPoints] = useState<StockPricePoint[]>([]);
  const [loading, setLoading] = useState(false);

  const ticker = seed.ticker;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<{ points: StockPricePoint[] }>(
          `/investments/history?ticker=${encodeURIComponent(ticker)}&range=${range}`
        );
        if (!cancelled) setPoints(data.points ?? []);
      } catch {
        if (!cancelled) setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker, range]);

  const up =
    points.length >= 2
      ? points[points.length - 1].price >= points[0].price
      : (seed.changeDay ?? 0) >= 0;

  return (
    <div className="space-y-3 rounded-lg bg-muted/20 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-lg font-bold">{seed.ticker}</span>
        {seed.name ? <span className="text-sm text-muted-foreground">{seed.name}</span> : null}
        {seed.price ? (
          <span className="text-xl font-semibold">{formatCurrency(seed.price, currency)}</span>
        ) : null}
        {seed.changeDay !== undefined ? (
          <ChangeBadge value={seed.changeDay} suffix={t("inv.day")} />
        ) : null}
        {seed.change30d ? <ChangeBadge value={seed.change30d} suffix={t("inv.30days")} /> : null}
        {seed.sector ? (
          <span className="text-xs text-muted-foreground">· {seed.sector}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <Button
            key={r.id}
            type="button"
            size="sm"
            variant={range === r.id ? "default" : "outline"}
            className="min-w-11"
            onClick={() => setRange(r.id)}
          >
            {t(r.labelKey)}
          </Button>
        ))}
      </div>

      {loading && points.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          {t("inv.loadingQuotes")}
        </div>
      ) : points.length >= 2 ? (
        <StockPriceChart data={points} up={up} />
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          {t("inv.noQuotes")}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("inv.disclaimer")}</p>
    </div>
  );
}
