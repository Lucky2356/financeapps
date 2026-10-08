"use client";

import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";

import { lastDay } from "@/components/sheet/budget-sheet/helpers";
import { monthLabel } from "@/components/sheet/sheet-text";
import type { Position, SheetFormat, SheetWords } from "@/components/sheet/sheet-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { ComputedRow } from "@/lib/sheet/model";

/** Месяц: что с ним можно сделать. */
export function MonthMenuDialog({
  monthMenu,
  setMonthMenu,
  rows,
  words,
  format,
  locale,
  copyFromPrevious,
  clearWholeMonth,
  setSelected,
  act
}: {
  monthMenu: string | null;
  setMonthMenu: Dispatch<SetStateAction<string | null>>;
  rows: ComputedRow[];
  words: SheetWords;
  format: SheetFormat;
  locale: string;
  copyFromPrevious: (month: string) => void;
  clearWholeMonth: (month: string) => void;
  setSelected: Dispatch<SetStateAction<Position | null>>;
  act: (body: Record<string, unknown>, done?: string) => Promise<unknown>;
}) {
  return (
    <Dialog open={monthMenu !== null} onOpenChange={(open) => !open && setMonthMenu(null)}>
      <DialogContent className="sm:max-w-sm">
        {monthMenu ? (
          <>
            <DialogHeader>
              <DialogTitle>{monthLabel(monthMenu, locale, "long")}</DialogTitle>
              <DialogDescription>{words.monthActions}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button asChild variant="outline" className="justify-start">
                <Link
                  href={`/transactions?from=${monthMenu}-01&to=${lastDay(monthMenu)}`}
                  onClick={() => setMonthMenu(null)}
                >
                  <ArrowUpRight className="size-4" />
                  {words.monthOperations}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={rows.findIndex((row) => row.month === monthMenu) < 1}
                onClick={() => {
                  copyFromPrevious(monthMenu);
                  setMonthMenu(null);
                }}
              >
                <ChevronDown className="size-4" />
                {words.copyFromPrev}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => {
                  clearWholeMonth(monthMenu);
                  setMonthMenu(null);
                }}
              >
                <X className="size-4" />
                {words.clearMonth}
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm">
                {format(words.deleteMonthConfirm, {
                  month: monthLabel(monthMenu, locale, "long")
                })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={async () => {
                  const month = monthMenu;
                  setMonthMenu(null);
                  setSelected(null);
                  if (month) await act({ action: "removeMonth", month });
                }}
              >
                {words.deleteMonth}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMonthMenu(null)}>
                {words.close}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
