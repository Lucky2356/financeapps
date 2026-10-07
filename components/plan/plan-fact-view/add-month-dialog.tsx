"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { monthKeyOf } from "@/components/plan/plan-fact-view/helpers";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/**
 * "Добавить месяц" and the months to choose from. A year forward and a year and
 * a half back, minus the ones already in the grid: pressing the button used to
 * add whatever a date field beside it happened to hold.
 */
// Adding a month is choosing a month and a year, so the picker says so: the
// year on a stepper, its twelve months as a grid. The list it replaced could
// only offer the months around today — a plan for a year out meant scrolling a
// column of names, and the years were nowhere to be seen.
export function AddMonthDialog({
  present,
  onPick
}: {
  present: Set<string>;
  onPick: (month: string) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());

  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Date(2020, index, 1).toLocaleDateString(locale === "en" ? "en" : "ru", { month: "short" })
  );
  const key = (index: number) => `${year}-${String(index + 1).padStart(2, "0")}`;
  const currentKey = monthKeyOf(today);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setYear(today.getFullYear());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          {t("plan.addMonth")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" data-testid="add-month-dialog">
        <DialogHeader>
          <DialogTitle>{t("plan.addMonth.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("plan.addMonth.prevYear")}
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="num text-base font-semibold">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("plan.addMonth.nextYear")}
            onClick={() => setYear((value) => value + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Три колонки на 360 px дают 89 px под «сентябрь» — по два на узком,
            по три от 420 px, как в шагах знакомства рядом. */}
        <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
          {monthNames.map((name, index) => {
            const month = key(index);
            const already = present.has(month);
            return (
              <button
                key={month}
                type="button"
                disabled={already}
                onClick={() => {
                  setOpen(false);
                  onPick(month);
                }}
                title={already ? t("plan.addMonth.already") : undefined}
                className={cn(
                  "rounded-md border px-2 py-2 text-sm capitalize transition-colors",
                  already
                    ? "cursor-not-allowed border-dashed text-muted-foreground/60"
                    : "hover:border-primary hover:bg-primary/10 hover:text-primary",
                  month === currentKey && !already && "border-primary/60 font-medium"
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
