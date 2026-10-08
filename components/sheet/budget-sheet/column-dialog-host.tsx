"use client";

import type { Dispatch, SetStateAction } from "react";

import { operationsHref } from "@/components/sheet/budget-sheet/helpers";
import { ColumnDialog, type ColumnDraft } from "@/components/sheet/column-dialog";
import type { ImportPageData } from "@/lib/data";
import type { SheetColumn } from "@/lib/sheet/model";

/** Окно статьи: новая или правка существующей — запись в книгу. */
export function SheetColumnDialog({
  columnDialog,
  setColumnDialog,
  categories,
  columns,
  act
}: {
  columnDialog: ColumnDraft | null;
  setColumnDialog: Dispatch<SetStateAction<ColumnDraft | null>>;
  categories: ImportPageData["categories"];
  columns: SheetColumn[];
  act: (body: Record<string, unknown>, done?: string) => Promise<unknown>;
}) {
  return (
    <ColumnDialog
      draft={columnDialog}
      categories={categories}
      onClose={() => setColumnDialog(null)}
      onSave={async (draft) => {
        if (draft.id) {
          await act({
            action: "updateColumn",
            id: draft.id,
            name: draft.name,
            kind: draft.kind,
            categoryId: draft.kind === "note" ? null : (draft.categoryId ?? null),
            hidden: draft.hidden ?? false
          });
        } else {
          await act({
            action: "addColumn",
            name: draft.name,
            kind: draft.kind,
            categoryId: draft.kind === "note" ? null : (draft.categoryId ?? null)
          });
        }
        setColumnDialog(null);
      }}
      onMove={(id, direction) => void act({ action: "moveColumn", id, direction })}
      onRemove={async (id) => {
        await act({ action: "removeColumn", id });
        setColumnDialog(null);
      }}
      operationsHref={(id) => {
        const column = columns.find((item) => item.id === id);
        return column ? operationsHref(column) : null;
      }}
    />
  );
}
