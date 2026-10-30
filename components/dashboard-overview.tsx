"use client";

import { PiggyBank, TrendingDown, TrendingUp, WalletCards, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { HealthGauge } from "@/components/charts/health-gauge";
import { metricDetail, metricTitle } from "@/components/metric-text";
import { Skeleton } from "@/components/ui/skeleton";
import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile, type StatTone } from "@/components/ui/stat-tile";
import type { DashboardData } from "@/types/finance";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { periodRange } from "@/lib/transactions/filter-chips";

const METRIC_ICON: Record<string, LucideIcon | undefined> = {
  totalBalance: WalletCards,
  monthIncome: TrendingUp,
  monthExpense: TrendingDown,
  freeCash: PiggyBank
};

// Every figure on the overview grid comes from somewhere the owner can open —
// tapping the number is the fastest way to ask "made of what?".
//
// Доход и расход — за месяц, и ссылка несёт его даты: `?type=INCOME` без
// периода «Учёт» читает как явный запрос и показывает всё время — под плиткой
// «доход месяца» открывался доход за годы.
export function metricHref(key: string, today: Date = new Date()): string | undefined {
  const month = periodRange("thisMonth", today);
  const monthOf = (type: "INCOME" | "EXPENSE") =>
    `/transactions?${new URLSearchParams({ type, from: month?.from ?? "", to: month?.to ?? "" })}`;
  switch (key) {
    case "totalBalance":
      return "/accounts";
    case "monthIncome":
      return monthOf("INCOME");
    case "monthExpense":
      return monthOf("EXPENSE");
    case "freeCash":
      return "/transactions";
    default:
      return undefined;
  }
}

// `loading` — первое чтение ещё не вернулось, в `data` заготовка сборки: нули и
// русские подписи. Вместо них — заглушки той же формы, чтобы экран не прыгал.
export function DashboardOverview({
  data,
  loading = false
}: {
  data: DashboardData;
  loading?: boolean;
}) {
  const { t } = useI18n();
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
    <section className="space-y-4">
      {/* The one painted card in the app — the home screen's privilege. */}
      <HeroCard
        variant="accent"
        label={t("dash.netWorth")}
        value={formatCurrency(data.netWorth, data.currency)}
        caption={t("dash.netWorthDesc")}
        changePercent={changePercent}
        trend={trend}
        loading={loading}
      />

      <StatGrid title={t("dash.widget.overview")}>
        {tiles.map((tile) => (
          <StatTile
            key={tile.key ?? tile.title}
            label={metricTitle(tile, t)}
            value={tile.value}
            caption={metricDetail(tile, t)}
            loading={loading}
            icon={tile.icon}
            tone={toTone(tile.tone)}
            href={metricHref(tile.key ?? "")}
          />
        ))}
      </StatGrid>

      {/* Health keeps its dial: the score is a judgement, not a figure, and the
          sentence under it is what makes it actionable. Tapping it opens the
          analysis the sentence is drawn from. */}
      {loading ? (
        <div
          data-testid="health-skeleton"
          className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-soft sm:p-5"
        >
          <Skeleton className="size-[92px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[13px] text-muted-foreground">{t("dash.health")}</p>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
        </div>
      ) : (
        <Link
          href="/analytics"
          className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-soft transition-colors hover:border-primary/40 hover:bg-foreground/[0.03] sm:p-5"
        >
          {data.health.noData ? (
            // Nothing to score yet: a dash is honest, a full dial saying "100 —
            // stable" for an empty ledger is not.
            <span className="flex size-[92px] shrink-0 items-center justify-center rounded-full border border-dashed text-2xl text-muted-foreground">
              —
            </span>
          ) : (
            <HealthGauge score={data.health.score} tone={healthTone} size={92} strokeWidth={8} />
          )}
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">{t("dash.health")}</p>
            <p className="mt-0.5 text-base font-semibold">
              {data.health.noData ? t("dash.health.noData") : healthLabel}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{data.health.summary}</p>
          </div>
        </Link>
      )}
    </section>
  );
}

function toTone(tone: DashboardData["metrics"][number]["tone"]): StatTone {
  return tone === "success" || tone === "warning" || tone === "danger" ? tone : "default";
}
