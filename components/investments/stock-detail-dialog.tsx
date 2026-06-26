"use client";

import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { StockPriceChart } from "@/components/charts/lazy";
import type { StockPricePoint } from "@/components/charts/stock-price-chart";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

export type StockDetailSeed = {
  ticker: string;
  name?: string;
  price?: number;
  changeDay?: number;
  change30d?: number;
  sector?: string;
};

const RANGES: { id: string; label: string }[] = [
  { id: "1m", label: "1М" },
  { id: "3m", label: "3М" },
  { id: "6m", label: "6М" },
  { id: "1y", label: "1Г" },
  { id: "5y", label: "5Л" }
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

// Per-stock detail modal: real MOEX price history chart + key figures. Opened by
// clicking a ticker in the securities/watchlist/portfolio tables.
export function StockDetailDialog({
  seed,
  currency,
  onClose
}: {
  seed: StockDetailSeed | null;
  currency: string;
  onClose: () => void;
}) {
  const [range, setRange] = useState("6m");
  const [points, setPoints] = useState<StockPricePoint[]>([]);
  const [loading, setLoading] = useState(false);

  const ticker = seed?.ticker;

  useEffect(() => {
    if (!ticker) return;
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
      : (seed?.changeDay ?? 0) >= 0;

  return (
    <Dialog open={seed !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {seed ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-lg font-bold">{seed.ticker}</span>
                {seed.name ? (
                  <span className="text-sm font-normal text-muted-foreground">{seed.name}</span>
                ) : null}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {seed.price ? (
                <span className="text-2xl font-semibold">
                  {formatCurrency(seed.price, currency)}
                </span>
              ) : null}
              {seed.changeDay !== undefined ? (
                <ChangeBadge value={seed.changeDay} suffix="день" />
              ) : null}
              {seed.change30d ? <ChangeBadge value={seed.change30d} suffix="30 дней" /> : null}
              {seed.sector ? (
                <span className="text-xs text-muted-foreground">· {seed.sector}</span>
              ) : null}
            </div>

            <div className="flex gap-1.5">
              {RANGES.map((r) => (
                <Button
                  key={r.id}
                  type="button"
                  size="sm"
                  variant={range === r.id ? "default" : "outline"}
                  className="min-w-11"
                  onClick={() => setRange(r.id)}
                >
                  {r.label}
                </Button>
              ))}
            </div>

            {loading && points.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Загрузка котировок…
              </div>
            ) : points.length >= 2 ? (
              <StockPriceChart data={points} up={up} />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Нет данных котировок за выбранный период.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Котировки — Московская биржа (MOEX). Данные носят информационный характер и не
              являются индивидуальной инвестиционной рекомендацией.
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
