"use client";

import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useState, type Dispatch, type SetStateAction } from "react";

import {
  operationsHref,
  type CellChange,
  type Facts
} from "@/components/sheet/budget-sheet/helpers";

import { monthLabel, type useSheetText } from "@/components/sheet/sheet-text";
import { QUIET_BUTTON, type Position } from "@/components/sheet/sheet-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluate } from "@/lib/sheet/formula";
import type { ComputedRow, SheetColumn } from "@/lib/sheet/model";

export function PhoneCellEditor({
  column,
  row,
  words,
  format,
  locale,
  fact,
  href,
  onSave,
  onFill
}: {
  column: SheetColumn;
  row: ComputedRow;
  words: ReturnType<typeof useSheetText>["words"];
  format: ReturnType<typeof useSheetText>["format"];
  locale: string;
  fact?: number;
  href: string | null;
  onSave: (input: string) => void;
  onFill: () => void;
}) {
  const cell = row.cells[column.id];
  const [draft, setDraft] = useState(cell?.input ?? "");
  const wordy = column.kind === "note";
  const preview = wordy ? null : evaluate(draft);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>{column.name}</DialogTitle>
        <DialogDescription>{monthLabel(row.month, locale, "long")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="sheet-cell">{words.input}</Label>
        <Input
          id="sheet-cell"
          autoFocus
          inputMode="text"
          value={draft}
          placeholder={cell?.auto && cell.value !== null ? String(cell.value) : ""}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {wordy
            ? words.kindHints.note
            : preview && !preview.ok
              ? format(words.cellError, { error: preview.error })
              : preview && preview.ok && draft.trim() !== String(preview.value)
                ? `= ${preview.value.toLocaleString("ru-RU")}`
                : words.inputHint}
        </p>
        {fact !== undefined ? (
          <p className="text-xs text-muted-foreground">
            {words.fact}: {fact.toLocaleString("ru-RU")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" className={QUIET_BUTTON} onClick={onFill}>
          <ChevronDown className="size-4" />
          {words.fillDown}
        </Button>
        {href ? (
          <Button asChild size="sm" variant="ghost" className={QUIET_BUTTON}>
            <Link href={href}>
              <ArrowUpRight className="size-4" />
              {words.operations}
            </Link>
          </Button>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onSave("")}>
          <X className="size-4" />
          {words.clear}
        </Button>
        <Button type="submit">{words.save}</Button>
      </DialogFooter>
    </form>
  );
}

/** Ячейка на телефоне — в окне: поле во всю ширину, формула помещается. */
export function PhoneCellDialog({
  phoneCell,
  setPhoneCell,
  columnAt,
  rows,
  words,
  format,
  locale,
  facts,
  save,
  fillDown
}: {
  phoneCell: Position | null;
  setPhoneCell: Dispatch<SetStateAction<Position | null>>;
  columnAt: (col: number) => SheetColumn | null;
  rows: ComputedRow[];
  words: ReturnType<typeof useSheetText>["words"];
  format: ReturnType<typeof useSheetText>["format"];
  locale: string;
  facts: Facts;
  save: (changes: CellChange[]) => Promise<void>;
  fillDown: (position: Position) => void;
}) {
  const phoneColumn = phoneCell ? columnAt(phoneCell.col) : null;
  const phoneRow = phoneCell ? rows[phoneCell.row] : null;
  return (
    <Dialog open={phoneCell !== null} onOpenChange={(open) => !open && setPhoneCell(null)}>
      <DialogContent className="sm:max-w-sm">
        {phoneColumn && phoneRow && phoneCell ? (
          <PhoneCellEditor
            key={`${phoneRow.month}|${phoneColumn.id}`}
            column={phoneColumn}
            row={phoneRow}
            words={words}
            format={format}
            locale={locale}
            fact={
              phoneColumn.categoryId ? facts[phoneRow.month]?.[phoneColumn.categoryId] : undefined
            }
            href={operationsHref(phoneColumn, phoneRow.month)}
            onSave={(input) => {
              void save([{ month: phoneRow.month, columnId: phoneColumn.id, input }]);
              setPhoneCell(null);
            }}
            onFill={() => {
              fillDown(phoneCell);
              setPhoneCell(null);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
