"use client";

import { useEffect, useState } from "react";

import { StockPriceChart, type StockPricePoint } from "@/components/charts/stock-price-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { combinePortfolioValue } from "@/lib/market/portfolio-value-series";
import type { PortfolioRow } from "@/types/finance";

const RANGES = [
  { id: "1m", labelKey: "inv.range.1m" },
  { id: "3m", labelKey: "inv.range.3m" },
  { id: "6m", labelKey: "inv.range.6m" },
  { id: "1y", labelKey: "inv.range.1y" },
  { id: "5y", labelKey: "inv.range.5y" }
];

// Portfolio value over time: pulls each holding's MOEX close history (the same
// dual-mode endpoint the per-stock chart uses) and sums quantity × close per day.
export function PortfolioValueChart({ portfolio }: { portfolio: PortfolioRow[] }) {
  const { t } = useI18n();
  const [range, setRange] = useState("6m");
  const [points, setPoints] = useState<StockPricePoint[]>([]);
  const [loading, setLoading] = useState(false);

  // Stable dependency: re-fetch only when the holdings (ticker/qty) or range change,
  // not on every parent re-render (the portfolio array identity is unstable).
  const holdingsKey = portfolio.map((p) => `${p.ticker}:${p.quantity}`).join(",");

  useEffect(() => {
    // Nothing to plot for an empty portfolio (the component renders null below).
    if (portfolio.length === 0) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const series = await Promise.all(
          portfolio.map((position) =>
            apiClient
              .get<{ points: StockPricePoint[] }>(
                `/investments/history?ticker=${encodeURIComponent(position.ticker)}&range=${range}`
              )
              .then((res) => ({ quantity: position.quantity, points: res.points ?? [] }))
              .catch(() => ({ quantity: position.quantity, points: [] }))
          )
        );
        if (!cancelled) setPoints(combinePortfolioValue(series));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [holdingsKey, range]); // eslint-disable-line react-hooks/exhaustive-deps

  if (portfolio.length === 0) return null;

  const up = points.length >= 2 ? points[points.length - 1].price >= points[0].price : true;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{t("inv.valueChartTitle")}</CardTitle>
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
      </CardHeader>
      <CardContent>
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
        <p className="mt-2 text-xs text-muted-foreground">{t("inv.valueChartHint")}</p>
      </CardContent>
    </Card>
  );
}
