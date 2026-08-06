"use client";

import { CalendarClock, Flag, PiggyBank, Target } from "lucide-react";

import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { GoalsPageData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

// Head of the goals screen: everything saved so far against everything aimed
// at, then the goal whose deadline is closest.
export function GoalsSummary({ data }: { data: GoalsPageData }) {
  const { t } = useI18n();
  const { data: pageData } = useApiPageData(data, "/goals");
  const currency = pageData.currency;

  const saved = pageData.goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const target = pageData.goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const left = Math.max(0, target - saved);
  const share = target > 0 ? saved / target : 0;
  const monthly = pageData.goals.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
  const nearest = [...pageData.goals]
    .filter((goal) => goal.currentAmount < goal.targetAmount)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];

  return (
    <>
      <HeroCard
        label={t("goal.hero.label")}
        value={formatCurrency(saved, currency)}
        caption={t("goal.hero.caption", { target: formatCurrency(target, currency) })}
        changeLabel={target > 0 ? `${Math.round(share * 100)}%` : undefined}
        progress={target > 0 ? share : null}
      />
      <StatGrid title={t("dash.widget.overview")}>
        <StatTile
          label={t("goal.tile.count")}
          value={String(pageData.goals.length)}
          caption={t("goal.tile.countCaption")}
          icon={Target}
        />
        <StatTile
          label={t("goal.tile.left")}
          value={formatCurrency(left, currency)}
          caption={t("goal.tile.leftCaption")}
          icon={Flag}
        />
        <StatTile
          label={t("goal.tile.monthly")}
          value={formatCurrency(monthly, currency)}
          caption={t("goal.tile.monthlyCaption")}
          icon={PiggyBank}
          tone="success"
        />
        <StatTile
          label={t("goal.tile.nearest")}
          value={nearest ? nearest.title : "—"}
          caption={nearest ? formatDate(nearest.deadline) : t("goal.tile.nearestNone")}
          icon={CalendarClock}
        />
      </StatGrid>
    </>
  );
}
