"use client";

import { ArrowDownLeft, ArrowUpRight, Scale, Tag } from "lucide-react";

import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { DashboardData } from "@/types/finance";

// Only the three fields this block reads — the endpoint returns the whole
// dashboard payload, but naming the slice keeps the empty fallback honest.
type Summary = Pick<DashboardData, "currency" | "monthlyCashflow" | "categoryExpenses">;

const EMPTY: Summary = { currency: "RUB", monthlyCashflow: [], categoryExpenses: [] };

// Head of the operations screen: this month's spending against last month's,
// with the month's flow underneath. Built from the dashboard endpoint, which
// already aggregates whole months — the operations list itself is paginated and
// would only see a page of them.
export function TransactionsSummary() {
  const { t } = useI18n();
  const { data } = useApiPageData<Summary>(EMPTY, "/dashboard");
  const currency = data.currency;

  const months = data.monthlyCashflow;
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const income = current?.income ?? 0;
  const expense = current?.expense ?? 0;
  const changePercent =
    previous && previous.expense > 0
      ? ((expense - previous.expense) / previous.expense) * 100
      : null;
  const biggest = [...data.categoryExpenses].sort((a, b) => b.value - a.value)[0];

  return (
    <>
      <HeroCard
        label={t("tx.hero.label")}
        value={formatCurrency(expense, currency)}
        caption={t("tx.hero.caption")}
        changePercent={changePercent}
        higherIsBetter={false}
        trend={months.map((month) => month.expense)}
      />
      <StatGrid title={t("dash.widget.overview")}>
        <StatTile
          label={t("tx.tile.income")}
          value={formatCurrency(income, currency)}
          caption={t("tx.hero.caption")}
          icon={ArrowDownLeft}
          tone="success"
        />
        <StatTile
          label={t("tx.tile.expense")}
          value={formatCurrency(expense, currency)}
          caption={t("tx.hero.caption")}
          icon={ArrowUpRight}
          tone="warning"
        />
        <StatTile
          label={t("tx.tile.net")}
          value={formatCurrency(income - expense, currency)}
          caption={t("tx.tile.netCaption")}
          icon={Scale}
          tone={income - expense >= 0 ? "success" : "danger"}
        />
        <StatTile
          label={t("tx.tile.biggest")}
          value={biggest ? formatCurrency(biggest.value, currency) : "—"}
          caption={biggest ? biggest.name : t("tx.tile.biggestNone")}
          icon={Tag}
        />
      </StatGrid>
    </>
  );
}
