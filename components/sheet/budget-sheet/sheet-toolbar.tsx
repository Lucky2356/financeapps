"use client";

import {
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Eye,
  FileDown,
  FileUp,
  Plus,
  Sparkles,
  Target,
  Undo2
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import {
  COMPARE_KEY,
  DENSITY_KEY,
  HELP_KEY,
  previousMonth,
  remember,
  type Density
} from "@/components/sheet/budget-sheet/helpers";
import type { ColumnDraft } from "@/components/sheet/column-dialog";
import { QUIET_BUTTON, type SheetWords } from "@/components/sheet/sheet-types";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { SheetPageData } from "@/lib/api/local/sheet";
import { nextMonth, type ComputedRow } from "@/lib/sheet/model";
import { cn } from "@/lib/utils";

/** Панель: то, что делают с таблицей целиком. Редкое — во второй строке, под «Ещё». */
export function SheetToolbar({
  words,
  phone,
  sheet,
  current,
  focus,
  hiddenCount,
  helpOpen,
  setHelpOpen,
  more,
  setMore,
  density,
  setDensity,
  showHidden,
  setShowHidden,
  compare,
  setCompare,
  setColumnDialog,
  setTargetOpen,
  setImportOpen,
  act,
  fillFromLedger,
  goToMonth,
  addMonthsAfter,
  exportCsv
}: {
  words: SheetWords;
  phone: boolean;
  sheet: SheetPageData;
  current: string;
  focus: ComputedRow | null;
  hiddenCount: number;
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  more: boolean;
  setMore: Dispatch<SetStateAction<boolean>>;
  density: Density;
  setDensity: Dispatch<SetStateAction<Density>>;
  showHidden: boolean;
  setShowHidden: Dispatch<SetStateAction<boolean>>;
  compare: boolean;
  setCompare: Dispatch<SetStateAction<boolean>>;
  setColumnDialog: Dispatch<SetStateAction<ColumnDraft | null>>;
  setTargetOpen: Dispatch<SetStateAction<boolean>>;
  setImportOpen: Dispatch<SetStateAction<boolean>>;
  act: (body: Record<string, unknown>, done?: string) => Promise<unknown>;
  fillFromLedger: () => Promise<void>;
  goToMonth: (month: string) => void;
  addMonthsAfter: (count: number) => Promise<void>;
  exportCsv: () => Promise<void>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          title={words.addColumnTitle}
          onClick={() => setColumnDialog({})}
        >
          <Plus className="size-4" />
          {words.addColumn}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void act({
              action: "addMonth",
              month: nextMonth(sheet.months[sheet.months.length - 1] ?? current)
            })
          }
        >
          <Plus className="size-4" />
          {words.addMonth}
        </Button>
        {!phone ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              title={words.fillFromLedgerHint}
              onClick={() => void fillFromLedger()}
            >
              <Sparkles className="size-4" />
              {words.fillFromLedger}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={QUIET_BUTTON}
              onClick={() => focus && goToMonth(focus.month)}
            >
              <CalendarDays className="size-4" />
              {words.today}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={helpOpen ? "secondary" : "ghost"}
          className={QUIET_BUTTON}
          aria-pressed={helpOpen}
          onClick={() => {
            setHelpOpen((was) => {
              if (was) remember(HELP_KEY, "1");
              return !was;
            });
          }}
        >
          <CircleHelp className="size-4" />
          {words.help}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={more ? "secondary" : "ghost"}
          className={QUIET_BUTTON}
          aria-expanded={more}
          onClick={() => setMore((was) => !was)}
        >
          <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
          {words.more}
        </Button>
        {!phone ? (
          <Segmented<Density>
            ariaLabel={words.density}
            className="ml-auto w-56"
            value={density}
            options={[
              { value: "comfort", label: words.densityComfort },
              { value: "compact", label: words.densityCompact }
            ]}
            onChange={(next) => {
              setDensity(next);
              remember(DENSITY_KEY, next);
            }}
          />
        ) : null}
      </div>
      <div className={cn("flex-wrap items-center gap-2", more ? "flex" : "hidden")}>
        {phone ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={QUIET_BUTTON}
              title={words.fillFromLedgerHint}
              onClick={() => void fillFromLedger()}
            >
              <Sparkles className="size-4" />
              {words.fillFromLedger}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() =>
            void act({ action: "addMonth", month: previousMonth(sheet.months[0] ?? current) })
          }
        >
          {words.addMonthBefore}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() => void addMonthsAfter(3)}
        >
          {words.addThree}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() => void addMonthsAfter(12)}
        >
          {words.addYear}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() => setTargetOpen(true)}
        >
          <Target className="size-4" />
          {words.addTarget}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() => setImportOpen(true)}
        >
          <FileUp className="size-4" />
          {words.import}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() => void exportCsv()}
        >
          <FileDown className="size-4" />
          {words.export}
        </Button>
        {sheet.canUndoImport ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={QUIET_BUTTON}
            onClick={() => void act({ action: "undoImport" }, words.undone)}
          >
            <Undo2 className="size-4" />
            {words.undoImport}
          </Button>
        ) : null}
        {hiddenCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant={showHidden ? "secondary" : "ghost"}
            className={QUIET_BUTTON}
            onClick={() => setShowHidden((was) => !was)}
          >
            <Eye className="size-4" />
            {words.showHidden} · {hiddenCount}
          </Button>
        ) : null}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={compare}
            onChange={(event) => {
              setCompare(event.target.checked);
              remember(COMPARE_KEY, event.target.checked ? "1" : "0");
            }}
          />
          {words.compare}
        </label>
      </div>
    </>
  );
}
