"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { InfoHint } from "@/components/info-hint";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { InvestmentData } from "@/types/finance";

// The "home screen" of the investments page: the one number an investor wants
// first (portfolio market value), today's move in big colored type, and three
// supporting figures (P/L, invested, return). Reuses the same math the old flat
// summary did; the value-over-time chart sits right below it in the Overview tab.
export function PortfolioHero({
  portfolio,
  currency,
  dayChangeByTicker
}: {
  portfolio: InvestmentData["portfolio"];
  currency: string;
  dayChangeByTicker: Map<string, number>;
}) {
  const { t } = useI18n();

  const cost = portfolio.reduce((sum, p) => sum + p.quantity * p.averageBuyPrice, 0);
  const value = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
  const pnl = value - cost;
  const returnPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const pnlPositive = pnl >= 0;

  // Today's absolute move = Σ position value × its day-change%; only positions
  // with a known day-change contribute (best-effort, from board/watchlist).
  let dayAbs = 0;
  let dayBase = 0;
  for (const p of portfolio) {
    const ch = dayChangeByTicker.get(p.ticker);
    if (ch === undefined) continue;
    dayAbs += p.currentValue * (ch / 100);
    dayBase += p.currentValue;
  }
  const dayPct = dayBase > 0 ? (dayAbs / dayBase) * 100 : 0;
  const dayPositive = dayAbs >= 0;
  const toneClass = (positive: boolean) =>
    positive ? "text-success-foreground" : "text-destructive";

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="text-sm text-muted-foreground">{t("inv.hero.value")}</p>
          <p className="mt-0.5 text-3xl font-bold tracking-tight sm:text-4xl">
            {formatCurrency(value, currency)}
          </p>
          {dayBase > 0 ? (
            <p
              className={cn(
                "mt-1.5 flex flex-wrap items-center gap-1 text-sm font-medium",
                toneClass(dayPositive)
              )}
            >
              {dayPositive ? (
                <ArrowUpRight className="size-4" />
              ) : (
                <ArrowDownRight className="size-4" />
              )}
              {dayPositive ? "+" : ""}
              {formatCurrency(dayAbs, currency)} ({dayPositive ? "+" : ""}
              {dayPct.toFixed(2)}%)
              <span className="text-muted-foreground">{t("inv.hero.today")}</span>
              <InfoHint text="hint.dayChange" />
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-3 gap-3 border-t pt-4">
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              {t("inv.pnlLabel")}
              <InfoHint text="hint.pnl" />
            </dt>
            <dd className={cn("mt-1 text-sm font-semibold sm:text-base", toneClass(pnlPositive))}>
              {pnlPositive ? "+" : ""}
              {formatCurrency(pnl, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("inv.invested")}</dt>
            <dd className="mt-1 text-sm font-semibold sm:text-base">
              {formatCurrency(cost, currency)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              {t("inv.returnLabel")}
              <InfoHint text="hint.return" />
            </dt>
            <dd className={cn("mt-1 text-sm font-semibold sm:text-base", toneClass(pnlPositive))}>
              {pnlPositive ? "+" : ""}
              {returnPct.toFixed(1)}%
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
