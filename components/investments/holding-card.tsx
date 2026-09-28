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
  const toneClass = (positive: boolean) => (positive ? "text-success" : "text-destructive");

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
          {/* Тикер и движение за день — рядом: «что это» и «что с ним сегодня». */}
          <p className="flex items-center gap-2 font-semibold leading-tight">
            {position.ticker}
            {dayKnown ? (
              <span className={cn("text-xs font-medium tabular-nums", toneClass(dayPositive))}>
                {dayPositive ? "▲" : "▼"} {Math.abs(dayChange ?? 0).toFixed(2)}%
              </span>
            ) : null}
          </p>
          {/* Средняя цена покупки — на виду, а не в развёрнутой карточке: по ней
              человек решает, докупать ли, и сверяет с ценой сейчас. Прятать её
              за нажатие значило заставлять раскрывать каждую бумагу по очереди. */}
          <p
            className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground"
            data-testid="holding-average"
          >
            {t("inv.card.average", {
              qty: position.quantity.toLocaleString(),
              avg: formatCurrency(position.averageBuyPrice, currency)
            })}
          </p>
          {/* Kind before name: a bond and a share behave nothing alike, and the
              ticker alone does not say which one you are looking at. */}
          <p className="truncate text-xs text-muted-foreground">
            {t(`inv.kind.${position.assetKind ?? "STOCK"}`)} · {position.name}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="font-semibold leading-tight">
            {formatCurrency(position.currentValue, currency)}
          </p>
          <p className={cn("mt-0.5 text-xs font-medium", toneClass(pnlPositive))}>
            {pnlPositive ? "+" : ""}
            {formatCurrency(position.pnl, currency)}
          </p>
          <p className={cn("text-xs", toneClass(pnlPositive))}>
            {pnlPositive ? "+" : ""}
            {returnPct.toFixed(1)}%
          </p>
        </div>
      </button>
      {/* Доля в портфеле — полоской: «сколько места занимает» видно без цифр. */}
      <div className="mx-4 -mt-2 mb-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${Math.min(Math.max(position.share, 0), 100)}%` }}
        />
      </div>

      {expanded ? (
        <div className="border-t p-4 duration-200 animate-in fade-in-0 slide-in-from-top-1">
          <HoldingDetails
            position={position}
            currency={currency}
            dayChange={dayChange}
            onEdit={onEdit}
            onRemove={onRemove}
          />
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

/**
 * Подробности позиции: цифры, график, покупки и действия. Одни и те же в
 * карточке на телефоне и в раскрытой строке таблицы на ПК.
 */
export function HoldingDetails({
  position,
  currency,
  dayChange,
  onEdit,
  onRemove
}: {
  position: InvestmentData["portfolio"][number];
  currency: string;
  dayChange?: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const lots = [...(position.lots ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
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
        {position.accruedInterest ? (
          <Detail
            label={t("inv.col.accrued")}
            value={formatCurrency(position.accruedInterest * position.quantity, currency)}
          />
        ) : null}
      </dl>
      {lots.length > 0 ? (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("inv.lotsTitle")}</p>
          <ul className="space-y-1 text-sm tabular-nums">
            {lots.map((lot, index) => (
              <li key={`${lot.date}-${index}`} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {new Date(`${lot.date}T12:00:00`).toLocaleDateString("ru-RU")}
                </span>
                <span>
                  {lot.quantity.toLocaleString()} × {formatCurrency(lot.price, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
    </>
  );
}
