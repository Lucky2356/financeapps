import { toast } from "sonner";

import type { DisplayColumn, SheetWords } from "@/components/sheet/sheet-types";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import type { ComputedRow } from "@/lib/sheet/model";

/** Таблица как на экране — в CSV для Excel: «;» между клетками, запятая в числах. */
export async function exportCsv(display: DisplayColumn[], rows: ComputedRow[], words: SheetWords) {
  const header = [
    words.month,
    ...display.map((item) =>
      item.type === "column"
        ? item.column.name
        : item.type === "total"
          ? words.total
          : words.savingsTotal
    )
  ];
  const lines = rows.map((row) => [
    `01.${row.month.slice(5, 7)}.${row.month.slice(0, 4)}`,
    ...display.map((item) => {
      if (item.type === "column" && item.column.kind === "note") {
        // Текст в CSV — в кавычках, а то «;» и перевод строки внутри развалили бы строку.
        return `"${(row.cells[item.column.id]?.input ?? "").replace(/"/g, '""')}"`;
      }
      const value =
        item.type === "total"
          ? row.total
          : item.type === "savingsTotal"
            ? row.savingsTotal
            : row.cells[item.column.id]?.value;
      return value === null || value === undefined ? "" : String(value).replace(".", ",");
    })
  ]);
  const csv = "﻿" + [header, ...lines].map((line) => line.join(";")).join("\r\n");
  const saved = await createFileSystemAdapter().saveTextFile(
    "tablica-byudzheta.csv",
    csv,
    "text/csv;charset=utf-8"
  );
  if (saved) toast.success(words.exported);
}
