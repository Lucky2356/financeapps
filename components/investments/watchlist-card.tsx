"use client";

import { ChevronDown, Trash2 } from "lucide-react";

import { InlineStockChart } from "@/components/investments/inline-stock-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { InvestmentData } from "@/types/finance";

const riskVariant = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive"
} as const;

// A watchlist row as a tap-to-expand card, matching the portfolio holdings so the
// Market tab reads consistently. Shows price, today's and 30-day moves, risk and
// comment; expanding reveals the price chart.
export function WatchlistCard({
  security,
  currency,
  expanded,
  onToggle,
  onRemove
}: {
  security: InvestmentData["watchlist"][number];
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const toneClass = (positive: boolean) =>
    positive ? "text-success-foreground" : "text-destructive";

  return (
    <div className={cn("rounded-xl border bg-card", expanded && "ring-1 ring-primary/30")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/40"
        title={t("inv.expandChart")}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{security.ticker}</p>
          <p className="truncate text-xs text-muted-foreground">
            {security.name} · {security.sector}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="font-semibold leading-tight">{formatCurrency(security.price, currency)}</p>
          <p className="flex items-center gap-2 text-xs">
            <span className={cn("font-medium", toneClass(security.changeDay >= 0))}>
              {t("inv.col.day")} {security.changeDay >= 0 ? "+" : ""}
              {security.changeDay.toFixed(2)}%
            </span>
            <span className={cn("font-medium", toneClass(security.change30d >= 0))}>
              {t("inv.col.30d")} {security.change30d >= 0 ? "+" : ""}
              {security.change30d.toFixed(2)}%
            </span>
          </p>
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Badge variant={riskVariant[security.risk]}>{t(`riskLevel.${security.risk}`)}</Badge>
        {security.comment ? (
          <span className="text-xs text-muted-foreground">{security.comment}</span>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t p-4">
          <InlineStockChart seed={security} currency={currency} />
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={onRemove}>
              <Trash2 className="size-4 text-destructive" />
              {t("common.delete")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
