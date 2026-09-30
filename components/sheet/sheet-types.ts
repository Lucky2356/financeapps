import type { SheetColumn } from "@/lib/sheet/model";

/** Столбец таблицы на экране: настоящий или посчитанный итог. */
export type DisplayColumn =
  | { type: "column"; column: SheetColumn }
  | { type: "total" }
  | { type: "savingsTotal" };

export type Position = { row: number; col: number };

export type SheetWords = ReturnType<
  typeof import("@/components/sheet/sheet-text").useSheetText
>["words"];
export type SheetFormat = ReturnType<
  typeof import("@/components/sheet/sheet-text").useSheetText
>["format"];
