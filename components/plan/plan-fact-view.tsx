"use client";

import { X } from "lucide-react";

import { AmountDrilldown } from "@/components/drilldown/amount-drilldown";
import { TransfersToggle } from "@/components/analytics/transfers-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddMonthDialog } from "@/components/plan/plan-fact-view/add-month-dialog";
import { PlanFactGrid } from "@/components/plan/plan-fact-view/grid";
import { PlanFactMobile } from "@/components/plan/plan-fact-view/mobile";
import { usePlanFact } from "@/components/plan/plan-fact-view/use-plan-fact";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { PlanFactPageData } from "@/types/finance";

// Plan against fact, laid out like the spreadsheet this screen replaces: every
// category is a column, every month a row, in three bands — plan, fact and the
// gap between them. Only the plan band is typed in; the other two are read off
// the ledger, so the table cannot drift from the operations behind it.
export function PlanFactView({ initialData }: { initialData: PlanFactPageData }) {
  const { t } = useI18n();
  const {
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
  } = usePlanFact(initialData);
  // На телефоне — свой вид: месяц за раз, статьи столбиком.
  const phone = useMediaQuery("(max-width: 767px)");

  if (data.columns.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("plan.empty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("plan.units", { currency: unit })}</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Which months to show, in the app's own controls: the native month
              fields were the only two OS-drawn widgets on the screen, and they
              looked it. The lists carry the months the grid actually has.
              На телефоне месяц листается стрелками, и период не нужен.
              Даты держатся одной строкой: переносясь, вторая уезжала под
              первую. */}
          <div className={cn("flex flex-nowrap items-center gap-1.5", phone && "hidden")}>
            <span className="text-xs text-muted-foreground">{t("plan.period")}</span>
            <Input
              type="date"
              aria-label={t("plan.periodFrom")}
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-[9.5rem] px-2"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              aria-label={t("plan.periodTo")}
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              className="h-9 w-[9.5rem] px-2"
            />
            {from || to ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t("plan.periodReset")}
                title={t("plan.periodReset")}
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>

          <TransfersToggle checked={includeTransfers} onChange={setIncludeTransfers} />

          {/* One button, and the months to choose from underneath it — instead
              of a date field to fill in before pressing it. */}
          <AddMonthDialog
            present={new Set(data.months.map((month) => month.month))}
            onPick={(month) => void addMonth(month)}
          />
        </div>
      </div>

      {phone && data.months.length > 0 ? (
        <PlanFactMobile
          months={data.months}
          income={income}
          expense={expense}
          money={money}
          monthLabel={monthLabel}
          onSave={save}
          onRemove={(month) => void removeMonth(month)}
          onDrill={setDrill}
        />
      ) : months.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("plan.noMonths")}
          </CardContent>
        </Card>
      ) : (
        <PlanFactGrid
          months={months}
          income={income}
          expense={expense}
          money={money}
          monthLabel={monthLabel}
          onSave={save}
          onRemove={(month) => void removeMonth(month)}
          onDrill={setDrill}
        />
      )}

      {/* What a fact figure is made of. Opened from the grid, closed back to it
          — the ledger itself is a screen away and rebuilding these filters by
          hand is where the answer used to get lost. */}
      <AmountDrilldown
        open={drill !== null}
        onOpenChange={(next) => {
          if (!next) setDrill(null);
        }}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        query={drill?.query ?? ""}
        excludeTransfers={!includeTransfers}
        keep={keepInDrill}
        currency={data.currency}
      />
    </div>
  );
}
