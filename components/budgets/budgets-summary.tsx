"use client";

import { AlertTriangle, CalendarDays, Gauge, Wallet } from "lucide-react";

import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { BudgetsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

/** Days left in the current month, today included. */
function daysLeftInMonth(): number {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(1, last - now.getDate() + 1);
}

// Head of the budgets screen: how much of the month's limit is gone, and what
// that leaves per remaining day.
export function BudgetsSummary({ data }: { data: BudgetsPageData }) {
  const { t } = useI18n();
  const { data: pageData } = useApiPageData(data, "/budgets");
  const currency = pageData.currency;

  const withLimit = pageData.budgets.filter((budget) => budget.limitAmount > 0);
  const limit = withLimit.reduce((sum, budget) => sum + budget.limitAmount, 0);
  const spent = withLimit.reduce((sum, budget) => sum + budget.spent, 0);
  const left = limit - spent;
  const share = limit > 0 ? spent / limit : 0;
  const exceeded = withLimit.filter((budget) => budget.isExceeded);
  const perDay = left > 0 ? left / daysLeftInMonth() : 0;

  return (
    <>
      <HeroCard
        label={t("bud.hero.label")}
        value={formatCurrency(spent, currency)}
        caption={t("bud.hero.caption", { limit: formatCurrency(limit, currency) })}
        changeLabel={limit > 0 ? `${Math.round(share * 100)}%` : undefined}
        progress={limit > 0 ? share : null}
      />
      <StatGrid title={t("dash.widget.overview")}>
        <StatTile
          label={t("bud.tile.limit")}
          value={formatCurrency(limit, currency)}
          caption={t("bud.tile.limitCaption", { count: withLimit.length })}
          icon={Gauge}
        />
        <StatTile
          label={t("bud.tile.left")}
          value={formatCurrency(left, currency)}
          caption={t("bud.tile.leftCaption")}
          icon={Wallet}
          tone={left >= 0 ? "success" : "danger"}
        />
        <StatTile
          label={t("bud.tile.perDay")}
          value={formatCurrency(Math.round(perDay), currency)}
          caption={t("bud.tile.perDayCaption", { days: daysLeftInMonth() })}
          icon={CalendarDays}
        />
        <StatTile
          label={t("bud.tile.exceeded")}
          value={String(exceeded.length)}
          caption={exceeded[0]?.category ?? t("bud.tile.exceededNone")}
          icon={AlertTriangle}
          tone={exceeded.length > 0 ? "danger" : "default"}
        />
      </StatGrid>
    </>
  );
}
