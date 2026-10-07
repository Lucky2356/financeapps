"use client";

import { X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { BandRow } from "@/components/plan/plan-fact-view/band-row";
import type { DrilldownTarget } from "@/components/plan/plan-fact-view/helpers";
import { ColumnHead, Head, TotalHead } from "@/components/plan/plan-fact-view/table-head";
import { useI18n } from "@/lib/i18n/context";
import type { PlanFactColumn, PlanFactMonth } from "@/types/finance";

/** Сетка для компьютера: месяцы строками, статьи столбцами. */
export function PlanFactGrid({
  months,
  income,
  expense,
  money,
  monthLabel,
  onSave,
  onRemove,
  onDrill
}: {
  months: PlanFactMonth[];
  income: PlanFactColumn[];
  expense: PlanFactColumn[];
  money: (value: number) => string;
  monthLabel: (key: string) => string;
  onSave: (body: Record<string, string>) => Promise<void>;
  onRemove: (month: string) => void;
  onDrill: (target: DrilldownTarget) => void;
}) {
  const { t } = useI18n();
  // month + opening(2) + income cols + income total(2) + expense cols +
  // expense total(2) + result(2) + note
  const width = income.length + expense.length + 10;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto" data-testid="plan-grid">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <Head rowSpan={2} className="sticky left-0 z-20 text-left">
                  {t("plan.month")}
                </Head>
                <Head colSpan={2} className="border-l text-center" title={t("plan.opening.hint")}>
                  {t("plan.opening")}
                </Head>
                <Head colSpan={income.length + 2} className="border-l text-center">
                  {t("plan.income")}
                </Head>
                <Head colSpan={expense.length + 2} className="border-l text-center">
                  {t("plan.expense")}
                </Head>
                <Head rowSpan={2} className="border-l text-right" title={t("plan.toSavings.hint")}>
                  {t("plan.toSavings")}
                </Head>
                <Head colSpan={2} className="border-l text-center" title={t("plan.result.hint")}>
                  {t("plan.result")}
                </Head>
                <Head rowSpan={2} className="border-l text-left">
                  {t("plan.note")}
                </Head>
              </tr>
              <tr>
                <Head className="border-l text-right">{t("plan.opening.main")}</Head>
                <Head className="text-right">{t("plan.opening.savings")}</Head>
                {income.map((column, index) => (
                  <ColumnHead
                    key={column.categoryId}
                    column={column}
                    className={index === 0 ? "border-l" : undefined}
                  />
                ))}
                <TotalHead />
                {expense.map((column, index) => (
                  <ColumnHead
                    key={column.categoryId}
                    column={column}
                    className={index === 0 ? "border-l" : undefined}
                  />
                ))}
                <TotalHead />
                <Head className="border-l text-right">{t("plan.opening.main")}</Head>
                <Head className="text-right">{t("plan.opening.savings")}</Head>
              </tr>
            </thead>

            {/* Grouped by month, not by band. Three bands each listing every
                month put a month's plan at the top of the table and its
                difference two screens below — the one comparison the screen
                exists to make was the one thing you could not see at once.
                Now each month carries its own plan, fact and difference,
                directly under each other. */}
            {months.map((month) => (
              <tbody key={month.month} data-month={month.month}>
                <tr>
                  <th
                    scope="rowgroup"
                    className="sticky left-0 z-20 whitespace-nowrap border-y bg-muted px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide"
                  >
                    <span className="flex items-center gap-1.5">
                      {monthLabel(month.month)}
                      <button
                        type="button"
                        aria-label={`${t("plan.removeMonth")}: ${monthLabel(month.month)}`}
                        title={t("plan.removeMonth")}
                        onClick={() => onRemove(month.month)}
                        className="tap-target inline-flex items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  </th>
                  <td className="border-y bg-muted" colSpan={width - 1} />
                </tr>
                {(["plan", "fact", "diff"] as const).map((band) => (
                  <BandRow
                    key={`${band}-${month.month}`}
                    band={band}
                    month={month}
                    income={income}
                    expense={expense}
                    label={t(`plan.${band}`)}
                    monthLabel={monthLabel(month.month)}
                    money={money}
                    onSave={onSave}
                    onDrill={onDrill}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
