"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  monthKeyOf,
  monthRange,
  type DrilldownTarget
} from "@/components/plan/plan-fact-view/helpers";
import {
  DrillFigure,
  Figure,
  NoteField,
  PlanCell,
  diffTone
} from "@/components/plan/plan-fact-view/table-cells";
import {
  OPENING_BALANCE_ID,
  SAVINGS_BALANCE_ID,
  SAVINGS_TRANSFER_ID
} from "@/lib/api/LocalApiClient";
import { useI18n } from "@/lib/i18n/context";
import type { PlanFactCell, PlanFactColumn, PlanFactMonth } from "@/types/finance";

/**
 * План/факт на телефоне — один месяц за раз.
 *
 * Широкая сетка «месяцы × категории» на экране в 360 точек превращалась в
 * окошко, которое листаешь вбок, не видя ни названия статьи, ни месяца, а
 * клетку плана в ней было не попасть пальцем. Здесь то же самое — план, факт
 * и разница каждой статьи — сложено столбиком: статья, под ней её цифры, и
 * поле плана, в которое пальцем попадаешь.
 */
export function PlanFactMobile({
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
  const current = monthKeyOf(new Date());
  // Открывается на текущем месяце, а если его ещё нет — на последнем прошедшем.
  const initial = (() => {
    const exact = months.findIndex((month) => month.month === current);
    if (exact >= 0) return exact;
    const past = months.filter((month) => month.month < current).length;
    return Math.max(0, past - 1);
  })();
  const [picked, setPicked] = useState<string | null>(null);
  const index = Math.min(
    Math.max(0, picked ? months.findIndex((month) => month.month === picked) : initial),
    months.length - 1
  );
  const month = months[index];
  if (!month) return null;
  const range = monthRange(month.month);
  const empty: PlanFactCell = { plan: 0, fact: 0, diff: 0 };

  const drillTo = (title: string, categoryIds: string[]) =>
    onDrill({
      title,
      subtitle: monthLabel(month.month),
      query: new URLSearchParams({
        from: range.from,
        to: range.to,
        categoryId: categoryIds.join(",")
      }).toString()
    });

  const saveFor = (categoryId: string) => (amount: number) =>
    onSave({ month: month.month, categoryId, amount: String(amount) });

  const categoryRows = (columns: PlanFactColumn[]) =>
    columns.map((column) => {
      const cell = month.cells[column.categoryId] ?? empty;
      return (
        <MobileRow
          key={column.categoryId}
          label={column.label}
          color={column.color}
          icon={column.icon}
          cell={cell}
          money={money}
          goodWhenNegative={column.kind === "INCOME"}
          onSave={saveFor(column.categoryId)}
          onDrill={() => drillTo(column.label, [column.categoryId])}
        />
      );
    });

  return (
    <div className="space-y-3" data-testid="plan-mobile" data-month={month.month}>
      <Card>
        <CardContent className="flex items-center gap-1 p-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("plan.m.prev")}
            disabled={index === 0}
            onClick={() => setPicked(months[index - 1].month)}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-center font-semibold capitalize">
            {monthLabel(month.month)}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("plan.m.next")}
            disabled={index === months.length - 1}
            onClick={() => setPicked(months[index + 1].month)}
          >
            <ChevronRight className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${t("plan.removeMonth")}: ${monthLabel(month.month)}`}
            title={t("plan.removeMonth")}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(month.month)}
          >
            <X className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Итог месяца — первым: чем кончился месяц, спрашивают чаще всего. */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
          <SummaryFigure
            label={t("plan.income")}
            fact={month.income.fact}
            plan={month.income.plan}
            money={money}
          />
          <SummaryFigure
            label={t("plan.expense")}
            fact={month.expense.fact}
            plan={month.expense.plan}
            money={money}
          />
          <p className="col-span-2 -mb-1 border-t pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("plan.result")}
          </p>
          <SummaryFigure
            label={t("plan.opening.main")}
            fact={month.resultBy.main.fact}
            plan={month.resultBy.main.plan}
            money={money}
          />
          <SummaryFigure
            label={t("plan.opening.savings")}
            fact={month.resultBy.savings.fact}
            plan={month.resultBy.savings.plan}
            money={money}
          />
        </CardContent>
      </Card>

      <MobileSection title={t("plan.opening")}>
        <MobileRow
          label={t("plan.opening.main")}
          cell={month.opening}
          money={money}
          onSave={saveFor(OPENING_BALANCE_ID)}
        />
        <MobileRow
          label={t("plan.opening.savings")}
          cell={month.savings}
          money={money}
          onSave={saveFor(SAVINGS_BALANCE_ID)}
        />
      </MobileSection>

      {income.length > 0 ? (
        <MobileSection title={t("plan.income")}>{categoryRows(income)}</MobileSection>
      ) : null}
      {expense.length > 0 ? (
        <MobileSection title={t("plan.expense")}>{categoryRows(expense)}</MobileSection>
      ) : null}

      <MobileSection title={t("plan.toSavings")}>
        <MobileRow
          label={t("plan.toSavings")}
          cell={month.toSavings}
          money={money}
          goodWhenNegative={true}
          onSave={saveFor(SAVINGS_TRANSFER_ID)}
        />
      </MobileSection>

      <MobileSection title={t("plan.note")}>
        <div className="px-4 py-3">
          <NoteField
            key={`plan-${month.month}`}
            initial={month.note}
            placeholder={t("plan.note.placeholder")}
            className="w-full"
            onSave={(note) => void onSave({ month: month.month, note })}
          />
        </div>
      </MobileSection>
    </div>
  );
}

function MobileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-0">
        <p className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className="divide-y">{children}</div>
      </CardContent>
    </Card>
  );
}

function SummaryFigure({
  label,
  fact,
  plan,
  money
}: {
  label: string;
  fact: number;
  plan: number;
  money: (value: number) => string;
}) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="num text-base font-semibold">{money(fact)}</p>
      <p className="num text-xs text-muted-foreground">
        {t("plan.plan")} {money(plan)}
      </p>
    </div>
  );
}

/**
 * Одна статья: название и факт в первой строке, план с полем и разница — во
 * второй. Поле плана — то же, что в сетке, только шире, под палец.
 */
function MobileRow({
  label,
  color,
  icon,
  cell,
  money,
  goodWhenNegative = false,
  onSave,
  onDrill
}: {
  label: string;
  color?: string;
  icon?: string;
  cell: PlanFactCell;
  money: (value: number) => string;
  goodWhenNegative?: boolean;
  onSave: (amount: number) => void;
  onDrill?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {color ? (
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: color }}
          >
            <CategoryIcon name={icon} className="size-3" />
          </span>
        ) : null}
        <span className="truncate text-sm font-medium">{label}</span>
      </div>
      <div className="num text-right text-sm font-semibold">
        {onDrill ? (
          <DrillFigure value={cell.fact} money={money} onOpen={onDrill} />
        ) : (
          <Figure value={cell.fact} money={money} />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">{t("plan.plan")}</span>
        <div className="w-36">
          <PlanCell value={cell.plan} money={money} onSave={onSave} align="left" />
        </div>
      </div>
      <div className="num text-right text-xs">
        <Figure value={cell.diff} money={money} tone={diffTone(cell, goodWhenNegative)} />
      </div>
    </div>
  );
}
