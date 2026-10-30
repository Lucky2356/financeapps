"use client";

import { format } from "date-fns";
import { enUS, ru } from "date-fns/locale";
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
//
// Месяц — тот, что выбран в списке ниже (BudgetsScreen). «Сколько можно в день»
// имеет смысл только для идущего месяца: у прошедшего дней не осталось, и на
// месте плитки — сколько в среднем уходило в день (плиток всегда четыре).
export function BudgetsSummary({ data, month }: { data: BudgetsPageData; month?: string }) {
  const { t, locale } = useI18n();
  const currentMonth = format(new Date(), "yyyy-MM");
  const selected = month ?? currentMonth;
  const isCurrent = selected === currentMonth;
  // Пока первое чтение не вернулось — заглушки вместо «0 ₽» (см. HeroCard).
  const { data: pageData, ready } = useApiPageData(data, `/budgets?month=${selected}`);
  const loading = !ready;
  const currency = pageData.currency;

  const withLimit = pageData.budgets.filter((budget) => budget.limitAmount > 0);
  const limit = withLimit.reduce((sum, budget) => sum + budget.limitAmount, 0);
  const spent = withLimit.reduce((sum, budget) => sum + budget.spent, 0);
  const left = limit - spent;
  const share = limit > 0 ? spent / limit : 0;
  const exceeded = withLimit.filter((budget) => budget.isExceeded);
  const perDay = left > 0 ? left / daysLeftInMonth() : 0;
  const [year, monthNumber] = selected.split("-").map(Number);
  const daysInSelected = new Date(year, monthNumber, 0).getDate();
  const monthLabel = format(new Date(year, monthNumber - 1, 1), "LLLL yyyy", {
    locale: locale === "en" ? enUS : ru
  });

  return (
    <>
      <HeroCard
        loading={loading}
        label={t("bud.hero.label")}
        value={formatCurrency(spent, currency)}
        caption={
          isCurrent
            ? t("bud.hero.caption", { limit: formatCurrency(limit, currency) })
            : t("bud.hero.captionMonth", {
                limit: formatCurrency(limit, currency),
                month: monthLabel
              })
        }
        changeLabel={limit > 0 ? `${Math.round(share * 100)}%` : undefined}
        progress={limit > 0 ? share : null}
      />
      <StatGrid title={t("dash.widget.overview")}>
        <StatTile
          loading={loading}
          label={t("bud.tile.limit")}
          hint="tip.bud.tile.limit"
          value={formatCurrency(limit, currency)}
          caption={t("bud.tile.limitCaption", { count: withLimit.length })}
          icon={Gauge}
        />
        <StatTile
          loading={loading}
          label={t("bud.tile.left")}
          hint="tip.bud.tile.left"
          value={formatCurrency(left, currency)}
          caption={t(isCurrent ? "bud.tile.leftCaption" : "bud.tile.leftCaptionPast")}
          icon={Wallet}
          tone={left >= 0 ? "success" : "danger"}
        />
        {isCurrent ? (
          <StatTile
            loading={loading}
            label={t("bud.tile.perDay")}
            hint="tip.bud.tile.perDay"
            value={formatCurrency(Math.round(perDay), currency)}
            caption={t("bud.tile.perDayCaption", { days: daysLeftInMonth() })}
            icon={CalendarDays}
          />
        ) : (
          <StatTile
            loading={loading}
            label={t("bud.tile.perDayPast")}
            value={formatCurrency(Math.round(spent / daysInSelected), currency)}
            caption={t("bud.tile.perDayPastCaption", { days: daysInSelected })}
            icon={CalendarDays}
          />
        )}
        <StatTile
          loading={loading}
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
