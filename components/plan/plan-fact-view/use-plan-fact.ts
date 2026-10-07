"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { DrilldownTarget } from "@/components/plan/plan-fact-view/helpers";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { transfersQuery, useIncludeTransfers } from "@/hooks/use-include-transfers";
import { apiClient } from "@/lib/api/client";
import { currencySign } from "@/lib/format";
import { areAmountsHidden } from "@/lib/preferences";
import { periodRange } from "@/lib/transactions/filter-chips";
import { transferKeyOf } from "@/lib/transactions/transfers";
import { useI18n } from "@/lib/i18n/context";
import type { PlanFactPageData, TransactionRow } from "@/types/finance";

/** Данные экрана план/факт, его период, расшифровка и запись в план. */
export function usePlanFact(initialData: PlanFactPageData) {
  const { t, locale } = useI18n();
  const [includeTransfers, setIncludeTransfers] = useIncludeTransfers();
  // Months with operations show up on their own. Any other month — next month
  // to plan ahead, or an earlier one to fill in by hand — is pinned into the
  // grid and stored with the data, so it is there on the next device too.
  const { data, reload } = useApiPageData(
    initialData,
    `/plan${transfersQuery(includeTransfers, "?")}`
  );
  const { run } = useApiMutation();
  const confirm = useConfirm();

  // Which months are on screen. The grid holds every month the ledger touches,
  // and after a year of use that is a long table to scroll through to reach the
  // one being planned — so it opens on the month in progress, the one the
  // question is nearly always about, rather than on all of them at once.
  //
  // The ends are dates, like every other period in the app, even though the
  // rows are months: a month is shown when the period touches any part of it.
  // Two month dropdowns made this the one screen where a period meant something
  // else than it does everywhere else.
  const thisMonth = periodRange("thisMonth");
  const [from, setFrom] = useState(thisMonth?.from ?? "");
  const [to, setTo] = useState(thisMonth?.to ?? "");

  // One dialog for the whole grid rather than one per cell: a month of a dozen
  // categories is a few hundred cells, and each carrying its own closed dialog
  // is a few hundred subscriptions for the one that gets opened.
  const [drill, setDrill] = useState<DrilldownTarget | null>(null);
  // Расшифровка показывает ровно то, из чего сложена цифра: перевод между
  // основными и сбережениями в доходы и расходы не входит (он в столбце «В
  // сбережения»), а итог одной группы — только операции её счетов.
  const drillPool = drill?.pool;
  const keepInDrill = useMemo(() => {
    const savings = new Set(data.savingsAccountIds ?? []);
    const crossPool = new Set(data.crossPoolTransfers ?? []);
    return (row: TransactionRow) => {
      const transfer = transferKeyOf(row);
      if (transfer && crossPool.has(transfer)) return false;
      if (!drillPool) return true;
      return savings.has(row.account.id) === (drillPool === "savings");
    };
  }, [data.savingsAccountIds, data.crossPoolTransfers, drillPool]);

  const income = data.columns.filter((column) => column.kind === "INCOME");
  const expense = data.columns.filter((column) => column.kind === "EXPENSE");

  const months = data.months.filter(
    (month) => (!from || month.month >= from.slice(0, 7)) && (!to || month.month <= to.slice(0, 7))
  );
  async function addMonth(month: string) {
    await run(() => apiClient.post("/plan", { action: "addMonth", month }), {
      success: t("plan.monthAdded"),
      error: t("plan.saveError"),
      onSuccess: reload
    });
  }

  async function removeMonth(month: string) {
    const confirmed = await confirm({
      title: t("plan.remove.title"),
      description: t("plan.remove.desc", { month: monthLabel(month) }),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) return;
    await run(
      () => apiClient.post<{ hasFacts?: boolean }>("/plan", { action: "removeMonth", month }),
      {
        success: t("plan.removed"),
        error: t("plan.saveError"),
        onSuccess: async (result) => {
          if (result?.hasFacts) toast.info(t("plan.removeKeptFacts"));
          await reload();
        }
      }
    );
  }

  async function save(body: Record<string, string>) {
    await run(() => apiClient.post("/plan", body), {
      success: t("plan.saved"),
      error: t("plan.saveError"),
      onSuccess: reload
    });
  }

  const monthLabel = (key: string) => {
    const [year, index] = key.split("-").map(Number);
    return new Date(year, index - 1, 1).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
      month: "long",
      year: "numeric"
    });
  };

  const money = (value: number) =>
    areAmountsHidden()
      ? "••••"
      : new Intl.NumberFormat(locale === "en" ? "en-US" : "ru-RU", {
          maximumFractionDigits: 0
        }).format(value);

  // The grid carries bare numbers — a currency sign in each of a few hundred
  // cells is noise — so the unit is stated once, above the table.
  const unit = currencySign(data.currency);

  return {
    data,
    includeTransfers,
    setIncludeTransfers,
    from,
    setFrom,
    to,
    setTo,
    drill,
    setDrill,
    keepInDrill,
    income,
    expense,
    months,
    addMonth,
    removeMonth,
    save,
    monthLabel,
    money,
    unit
  };
}
