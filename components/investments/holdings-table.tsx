"use client";

// Позиции на ПК — таблицей с сортировкой.
//
// На телефоне карточки удобнее пальцу, а на широком экране десять бумаг
// карточками — это прокрутка ради того, что помещается одним взглядом. Нажатие
// на заголовок сортирует, на строку — раскрывает под ней подробности: те же,
// что в карточке на телефоне.

import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { HoldingDetails } from "@/components/investments/holding-card";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { InvestmentData } from "@/types/finance";

type Row = InvestmentData["portfolio"][number];
type SortKey = "ticker" | "value" | "share" | "pnl" | "day";

export function HoldingsTable({
  portfolio,
  currency,
  dayChangeByTicker,
  expandedTicker,
  onToggle,
  onEdit,
  onRemove
}: {
  portfolio: Row[];
  currency: string;
  dayChangeByTicker: Map<string, number>;
  expandedTicker: string | null;
  onToggle: (ticker: string) => void;
  onEdit: (position: Row) => void;
  onRemove: (ticker: string) => void;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "value", desc: true });

  const returnPct = (row: Row) => {
    const cost = row.quantity * row.averageBuyPrice;
    return cost > 0 ? (row.pnl / cost) * 100 : 0;
  };

  const rows = useMemo(() => {
    const value = (row: Row): number | string => {
      switch (sort.key) {
        case "ticker":
          return row.ticker;
        case "share":
          return row.share;
        case "pnl":
          return returnPct(row);
        case "day":
          return dayChangeByTicker.get(row.ticker) ?? -Infinity;
        default:
          return row.currentValue;
      }
    };
    return [...portfolio].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const order =
        typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
      return sort.desc ? -order : order;
    });
  }, [portfolio, sort, dayChangeByTicker]);

  function header(key: SortKey, label: string, align: "left" | "right" = "right") {
    const active = sort.key === key;
    const Arrow = sort.desc ? ArrowDown : ArrowUp;
    return (
      <th
        className={cn("py-2 font-medium", align === "right" ? "text-right" : "text-left")}
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
      >
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            active && "text-foreground"
          )}
          onClick={() =>
            setSort((was) => ({ key, desc: was.key === key ? !was.desc : key !== "ticker" }))
          }
        >
          {label}
          {active ? <Arrow className="size-3" /> : null}
        </button>
      </th>
    );
  }

  const tone = (positive: boolean) => (positive ? "text-success" : "text-destructive");

  return (
    <div className="overflow-x-auto" data-testid="holdings-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {header("ticker", t("inv.col.security"), "left")}
            <th className="py-2 text-right font-medium">{t("inv.col.qty")}</th>
            <th className="py-2 text-right font-medium">{t("inv.col.avg")}</th>
            <th className="py-2 text-right font-medium">{t("inv.col.current")}</th>
            {header("value", t("inv.col.value"))}
            {header("share", t("inv.col.share"))}
            {header("pnl", t("inv.col.pnl"))}
            {header("day", t("inv.col.day"))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const day = dayChangeByTicker.get(row.ticker);
            const open = expandedTicker === row.ticker;
            const pct = returnPct(row);
            return (
              <Fragment key={row.ticker}>
                <tr
                  className={cn(
                    "cursor-pointer border-b transition-colors hover:bg-muted/40",
                    open && "bg-muted/30"
                  )}
                  onClick={() => onToggle(row.ticker)}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight">{row.ticker}</p>
                        <p className="max-w-[14rem] truncate text-xs text-muted-foreground">
                          {row.name} · {row.sector}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {row.quantity.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatCurrency(row.averageBuyPrice, currency)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatCurrency(row.currentPrice, currency)}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums">
                    {formatCurrency(row.currentValue, currency)}
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">
                    <div className="ml-auto flex w-24 items-center justify-end gap-2">
                      <div
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                        aria-hidden
                      >
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${Math.min(Math.max(row.share, 0), 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right">{row.share.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className={cn("py-2.5 text-right tabular-nums", tone(row.pnl >= 0))}>
                    <p>
                      {row.pnl >= 0 ? "+" : ""}
                      {formatCurrency(row.pnl, currency)}
                    </p>
                    <p className="text-xs">
                      {pct >= 0 ? "+" : ""}
                      {pct.toFixed(1)}%
                    </p>
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right tabular-nums",
                      day === undefined ? "text-muted-foreground" : tone(day >= 0)
                    )}
                  >
                    {day === undefined ? "—" : `${day >= 0 ? "+" : ""}${day.toFixed(2)}%`}
                  </td>
                </tr>
                {open ? (
                  <tr className="border-b">
                    <td colSpan={8} className="bg-muted/10 p-4">
                      <HoldingDetails
                        position={row}
                        currency={currency}
                        dayChange={day}
                        onEdit={() => onEdit(row)}
                        onRemove={() => onRemove(row.ticker)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
