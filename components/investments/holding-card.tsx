"use client";

import { ChevronDown, Edit2, Trash2 } from "lucide-react";

import { InlineStockChart } from "@/components/investments/inline-stock-chart";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { InvestmentData } from "@/types/finance";

// A friendly, tap-to-expand card for one portfolio position. The collapsed state
// shows only what matters at a glance — value, today's move, P/L — so a newcomer
// isn't faced with a 10-column table. Expanding reveals the price chart plus the
// finer details (quantity, average price, current price, weight) and actions.
export function HoldingCard({
  position,
  currency,
  dayChange,
  expanded,
  onToggle,
  onEdit,
  onRemove
}: {
  position: InvestmentData["portfolio"][number];
  currency: string;
  dayChange?: number;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const cost = position.quantity * position.averageBuyPrice;
  const returnPct = cost > 0 ? (position.pnl / cost) * 100 : 0;
  const pnlPositive = position.pnl >= 0;
  const dayKnown = dayChange !== undefined;
  const dayPositive = (dayChange ?? 0) >= 0;
  const toneClass = (positive: boolean) =>
    positive ? "text-success-foreground" : "text-destructive";

  return (
    <div className={cn("rounded-xl border bg-card", expanded && "ring-1 ring-primary/30")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/40"
        title={t("inv.expandChart")}
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{position.ticker}</p>
          <p className="truncate text-xs text-muted-foreground">{position.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold leading-tight">
            {formatCurrency(position.currentValue, currency)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center justify-end gap-x-1.5 text-xs">
            {dayKnown ? (
              <span className={cn("font-medium", toneClass(dayPositive))}>
                {dayPositive ? "▲" : "▼"} {Math.abs(dayChange ?? 0).toFixed(2)}%
              </span>
            ) : null}
            <span className={cn("font-medium", toneClass(pnlPositive))}>
              {t("inv.col.pnl")} {pnlPositive ? "+" : ""}
              {formatCurrency(position.pnl, currency)} ({pnlPositive ? "+" : ""}
              {returnPct.toFixed(1)}%)
            </span>
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="border-t p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Detail label={t("inv.col.qty")} value={position.quantity.toLocaleString()} />
            <Detail
              label={t("inv.col.avg")}
              value={formatCurrency(position.averageBuyPrice, currency)}
            />
            <Detail
              label={t("inv.col.current")}
              value={formatCurrency(position.currentPrice, currency)}
            />
            <Detail label={t("inv.col.share")} value={formatPercent(position.share)} />
          </dl>
          <div className="mt-4">
            <InlineStockChart
              seed={{
                ticker: position.ticker,
                name: position.name,
                price: position.currentPrice,
                changeDay: dayChange,
                sector: position.sector
              }}
              currency={currency}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit2 className="size-4" />
              {t("common.edit")}
            </Button>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
