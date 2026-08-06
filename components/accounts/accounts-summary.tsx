"use client";

import { Banknote, CreditCard, LineChart, PiggyBank } from "lucide-react";

import { HeroCard } from "@/components/ui/hero-card";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatTile } from "@/components/ui/stat-tile";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { AccountsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

// Head of the accounts screen: total balance, then the same money split by the
// kind of account it sits in. Reads its own copy of the page data because the
// static export ships an empty server snapshot.
export function AccountsSummary({ data }: { data: AccountsPageData }) {
  const { t } = useI18n();
  const { data: pageData } = useApiPageData(data, "/accounts");
  const currency = pageData.currency;

  // Balances are summed per kind. Multi-currency accounts are already converted
  // into the base currency by the API, so plain addition is right here.
  const sumOf = (types: string[]) =>
    pageData.accounts
      .filter((account) => types.includes(account.type))
      .reduce((sum, account) => sum + account.balance, 0);

  const tiles = [
    {
      key: "cash",
      label: t("accountType.CASH"),
      value: formatCurrency(sumOf(["CASH"]), currency),
      icon: Banknote
    },
    {
      key: "cards",
      label: t("accountType.DEBIT_CARD"),
      value: formatCurrency(sumOf(["DEBIT_CARD"]), currency),
      icon: CreditCard
    },
    {
      key: "savings",
      label: t("accountType.SAVINGS"),
      value: formatCurrency(sumOf(["SAVINGS"]), currency),
      icon: PiggyBank
    },
    {
      key: "brokerage",
      label: t("accountType.BROKERAGE"),
      value: formatCurrency(sumOf(["BROKERAGE"]), currency),
      icon: LineChart
    }
  ];

  return (
    <>
      <HeroCard
        label={t("acc.hero.label")}
        value={formatCurrency(pageData.totalBalance, currency)}
        caption={t("acc.hero.caption", { count: pageData.accounts.length })}
      />
      <StatGrid title={t("dash.widget.overview")}>
        {tiles.map((tile) => (
          <StatTile key={tile.key} label={tile.label} value={tile.value} icon={tile.icon} />
        ))}
      </StatGrid>
    </>
  );
}
