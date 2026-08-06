"use client";

import { Coins, Percent, TrendingUp, Wallet } from "lucide-react";

import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { InvestmentData } from "@/types/finance";

// The head of the investments screen, in the same shape as every other screen:
// market value with today's move beside it, then the four supporting figures.
// The maths is unchanged from the flat summary this replaced.
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

  return (
    <>
      <HeroCard
        label={t("inv.hero.value")}
        value={formatCurrency(value, currency)}
        caption={t("inv.hero.caption", { count: portfolio.length })}
        changePercent={dayBase > 0 ? dayPct : null}
        trend={portfolio.length > 1 ? portfolio.map((p) => p.currentValue) : undefined}
      />
      <StatGrid title={t("dash.widget.overview")}>
        <StatTile
          label={t("inv.pnlLabel")}
          value={`${pnl >= 0 ? "+" : ""}${formatCurrency(pnl, currency)}`}
          caption={t("inv.tile.pnlCaption")}
          icon={TrendingUp}
          tone={pnl >= 0 ? "success" : "danger"}
        />
        <StatTile
          label={t("inv.invested")}
          value={formatCurrency(cost, currency)}
          caption={t("inv.tile.investedCaption")}
          icon={Coins}
        />
        <StatTile
          label={t("inv.returnLabel")}
          value={`${pnl >= 0 ? "+" : ""}${returnPct.toFixed(1)}%`}
          caption={t("inv.tile.returnCaption")}
          icon={Percent}
          tone={pnl >= 0 ? "success" : "danger"}
        />
        <StatTile
          label={t("inv.tile.today")}
          value={dayBase > 0 ? `${dayAbs >= 0 ? "+" : ""}${formatCurrency(dayAbs, currency)}` : "—"}
          caption={
            dayBase > 0 ? `${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}%` : t("inv.tile.todayNone")
          }
          icon={Wallet}
          tone={dayBase > 0 ? (dayAbs >= 0 ? "success" : "danger") : "default"}
        />
      </StatGrid>
    </>
  );
}
