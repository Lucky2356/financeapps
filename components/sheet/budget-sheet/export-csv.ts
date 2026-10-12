import { toast } from "sonner";

import type { DisplayColumn, SheetWords } from "@/components/sheet/sheet-types";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import type { ComputedRow } from "@/lib/sheet/model";

/**
 * Текст для клетки CSV. В кавычках всегда: «;», кавычка или перевод строки в
 * названии статьи («Еда; кафе») иначе сдвигали все столбцы правее. Текст,
 * начатый с «= + - @», Excel принял бы за формулу и выполнил — апостроф
 * впереди делает его просто текстом.
 */
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Таблица как на экране — в CSV для Excel: «;» между клетками, запятая в числах. */
export function sheetCsv(display: DisplayColumn[], rows: ComputedRow[], words: SheetWords): string {
  const header = [
    words.month,
    ...display.map((item) =>
      item.type === "column"
        ? item.column.name
        : item.type === "total"
          ? words.total
          : words.savingsTotal
    )
  ].map(csvText);
  const lines = rows.map((row) => [
    `01.${row.month.slice(5, 7)}.${row.month.slice(0, 4)}`,
    ...display.map((item) => {
      if (item.type === "column" && item.column.kind === "note") {
        return csvText(row.cells[item.column.id]?.input ?? "");
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
  return "\uFEFF" + [header, ...lines].map((line) => line.join(";")).join("\r\n");
}

export async function exportCsv(display: DisplayColumn[], rows: ComputedRow[], words: SheetWords) {
  const saved = await createFileSystemAdapter().saveTextFile(
    "tablica-byudzheta.csv",
    sheetCsv(display, rows, words),
    "text/csv;charset=utf-8"
  );
  if (saved) toast.success(words.exported);
}
