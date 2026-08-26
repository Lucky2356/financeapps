"use client";

import { CalendarClock, Landmark, Percent, Wallet } from "lucide-react";

import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { LiabilitiesPageData } from "@/lib/data";
import { activeDebts } from "@/lib/debts/settled";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

// Head of the debts screen. Settled debts keep their record but count nowhere,
// so every figure here is built from the active ones only.
export function DebtsSummary({ data }: { data: LiabilitiesPageData }) {
  const { t } = useI18n();
  const { data: pageData } = useApiPageData(data, "/debts");
  const currency = pageData.currency;

  const active = activeDebts(pageData.liabilities);
  // Totalled by the API, where the exchange rates are: debts are kept each in
  // its own currency, and the rate is weighted by what is still owed so a big
  // cheap loan and a small expensive one do not average into something that
  // describes neither.
  const totals = pageData.totals;
  const balance = totals?.balance ?? 0;
  const original = totals?.original ?? 0;
  const repaid = totals?.repaid ?? 0;
  const share = original > 0 ? repaid / original : 0;
  const monthly = totals?.monthly ?? 0;
  const rate = totals?.rate ?? 0;
  const nextDue = totals?.nextDue ?? null;

  return (
    <>
      <HeroCard
        label={t("debt.hero.label")}
        value={formatCurrency(balance, currency)}
        caption={t("debt.hero.caption", { count: active.length })}
        changeLabel={
          original > 0 ? t("debt.hero.repaid", { percent: Math.round(share * 100) }) : undefined
        }
        progress={original > 0 ? share : null}
      />
      <StatGrid title={t("dash.widget.overview")}>
        <StatTile
          label={t("debt.tile.monthly")}
          value={formatCurrency(monthly, currency)}
          caption={t("debt.tile.monthlyCaption")}
          icon={Wallet}
        />
        <StatTile
          label={t("debt.tile.rate")}
          value={`${rate.toFixed(1)}%`}
          caption={t("debt.tile.rateCaption")}
          icon={Percent}
          tone={rate >= 20 ? "danger" : "default"}
        />
        <StatTile
          label={t("debt.tile.due")}
          value={nextDue ? (nextDue.isDue ? t("debt.tile.dueNow") : formatDate(nextDue.date)) : "—"}
          caption={nextDue?.isDue ? t("debt.tile.dueNowCaption") : t("debt.tile.dueCaption")}
          icon={CalendarClock}
          tone={nextDue?.isDue ? "danger" : "default"}
        />
        <StatTile
          label={t("debt.tile.repaid")}
          value={formatCurrency(repaid, currency)}
          caption={t("debt.tile.repaidCaption")}
          icon={Landmark}
          tone="success"
        />
      </StatGrid>
    </>
  );
}
