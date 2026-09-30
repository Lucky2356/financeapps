"use client";

// Столбец таблицы: название, что это (доход, расход, в сбережения…) и с какой
// категорией учёта связан — по ней столбец открывает свои операции.

import { ArrowLeft, ArrowRight, ArrowUpRight, EyeOff, Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useSheetText } from "@/components/sheet/sheet-text";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { ImportPageData } from "@/lib/data";
import { SHEET_COLUMN_KINDS, type SheetColumnKind } from "@/lib/sheet/model";

export type ColumnDraft = {
  id?: string;
  name?: string;
  kind?: SheetColumnKind;
  categoryId?: string | null;
  hidden?: boolean;
};

const NONE = "__none__";

export function ColumnDialog({
  draft,
  categories,
  onClose,
  onSave,
  onMove,
  onRemove,
  operationsHref
}: {
  draft: ColumnDraft | null;
  categories: ImportPageData["categories"];
  onClose: () => void;
  onSave: (draft: Required<Pick<ColumnDraft, "name" | "kind">> & ColumnDraft) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  operationsHref: (id: string) => string | null;
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {draft ? (
          <ColumnForm
            key={draft.id ?? "new"}
            draft={draft}
            categories={categories}
            onClose={onClose}
            onSave={onSave}
            onMove={onMove}
            onRemove={onRemove}
            href={draft.id ? operationsHref(draft.id) : null}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ColumnForm({
  draft,
  categories,
  onClose,
  onSave,
  onMove,
  onRemove,
  href
}: {
  draft: ColumnDraft;
  categories: ImportPageData["categories"];
  onClose: () => void;
  onSave: (draft: Required<Pick<ColumnDraft, "name" | "kind">> & ColumnDraft) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  href: string | null;
}) {
  const { words, format } = useSheetText();
  const [name, setName] = useState(draft.name ?? "");
  const [kind, setKind] = useState<SheetColumnKind>(draft.kind ?? "expense");
  const [categoryId, setCategoryId] = useState<string>(draft.categoryId ?? NONE);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const categoryKind = kind === "income" ? "INCOME" : kind === "expense" ? "EXPENSE" : null;
  const options = categories.filter((category) => !categoryKind || category.kind === categoryKind);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onSave({
          ...draft,
          name: name.trim(),
          kind,
          categoryId: categoryId === NONE ? null : categoryId
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{draft.id ? draft.name : words.columnNew}</DialogTitle>
        <DialogDescription>{words.kindHints[kind]}</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="sheet-column-name">{words.columnName}</Label>
        <Input
          id="sheet-column-name"
          autoFocus={!draft.id}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{words.columnKind}</Label>
        <Select value={kind} onValueChange={(value) => value && setKind(value as SheetColumnKind)}>
          <SelectTrigger aria-label={words.columnKind}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHEET_COLUMN_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {words.kinds[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {kind === "note" ? null : (
        <div className="space-y-1.5">
          <Label>{words.columnCategory}</Label>
          <Select value={categoryId} onValueChange={(value) => value && setCategoryId(value)}>
            <SelectTrigger aria-label={words.columnCategory}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{words.noCategory}</SelectItem>
              {options.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {draft.id ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onMove(draft.id!, -1)}>
            <ArrowLeft className="size-4" />
            {words.moveLeft}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onMove(draft.id!, 1)}>
            <ArrowRight className="size-4" />
            {words.moveRight}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onSave({
                ...draft,
                name: name.trim() || draft.name || "",
                kind,
                categoryId: categoryId === NONE ? null : categoryId,
                hidden: !draft.hidden
              })
            }
          >
            {draft.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {draft.hidden ? words.unhide : words.hide}
          </Button>
          {href ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={href}>
                <ArrowUpRight className="size-4" />
                {words.operations}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {confirmRemove && draft.id ? (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm">{format(words.deleteColumnConfirm, { name: draft.name ?? "" })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onRemove(draft.id!)}
            >
              {words.deleteColumn}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
              {words.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      <DialogFooter className="gap-2">
        {draft.id && !confirmRemove ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive sm:mr-auto"
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 className="size-4" />
            {words.deleteColumn}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose}>
          {words.cancel}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {words.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
