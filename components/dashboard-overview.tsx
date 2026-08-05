"use client";

import { PiggyBank, TrendingDown, TrendingUp, WalletCards, type LucideIcon } from "lucide-react";

import { HealthGauge } from "@/components/charts/health-gauge";
import { HeroCard } from "@/components/dashboard/hero-card";
import { StatTile, type StatTone } from "@/components/dashboard/stat-tile";
import type { DashboardData } from "@/types/finance";
import { useCountUp } from "@/hooks/use-count-up";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

const METRIC_ICON: Record<string, LucideIcon | undefined> = {
  totalBalance: WalletCards,
  monthIncome: TrendingUp,
  monthExpense: TrendingDown,
  freeCash: PiggyBank
};

export function DashboardOverview({ data }: { data: DashboardData }) {
  const { t } = useI18n();
  const netWorthValue = useCountUp(data.netWorth);
  const healthTone =
    data.health.score >= 75 ? "good" : data.health.score >= 50 ? "warning" : "critical";

  const trend = data.netWorthTrend.map((point) => point.value);
  // Change across the whole trend window. Guarded against a zero or negative
  // starting point, where a percentage says nothing useful.
  const first = trend[0];
  const changePercent =
    trend.length >= 2 && typeof first === "number" && first > 0
      ? ((data.netWorth - first) / first) * 100
      : null;

  // Net worth is the headline; the month's four figures fill the overview grid
  // beneath it. Icons are matched by metric key, so a metric the API stops
  // sending simply drops out of the grid instead of showing the wrong glyph.
  const tiles = data.metrics
    .map((metric) => {
      const icon = METRIC_ICON[metric.key ?? ""];
      return icon ? { ...metric, icon } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 4);

  const healthLabel =
    healthTone === "good"
      ? t("dash.health.good")
      : healthTone === "warning"
        ? t("dash.health.warning")
        : t("dash.health.critical");

  return (
    <section className="space-y-5">
      <HeroCard
        label={t("dash.netWorth")}
        value={formatCurrency(Math.round(netWorthValue), data.currency)}
        caption={t("dash.netWorthDesc")}
        changePercent={changePercent}
        trend={trend}
      />

      <div>
        <h2 className="mb-3 text-base font-semibold">{t("dash.widget.overview")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile
              key={tile.title}
              label={tile.title}
              value={tile.value}
              caption={tile.detail}
              icon={tile.icon}
              tone={toTone(tile.tone)}
            />
          ))}
        </div>
      </div>

      {/* Health keeps its dial: the score is a judgement, not a figure, and the
          sentence under it is what makes it actionable. */}
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-soft sm:p-5">
        <HealthGauge score={data.health.score} tone={healthTone} size={92} strokeWidth={8} />
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">{t("dash.health")}</p>
          <p className="mt-0.5 text-base font-semibold">{healthLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.health.summary}</p>
        </div>
      </div>
    </section>
  );
}

function toTone(tone: DashboardData["metrics"][number]["tone"]): StatTone {
  return tone === "success" || tone === "warning" || tone === "danger" ? tone : "default";
}
