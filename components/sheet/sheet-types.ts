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

/**
 * Тихая кнопка таблицы. Обычная «призрачная» кнопка приложения фиолетовая, а
 * фиолетовым по тёмному в таблице читать тяжело (жалоба владельца): здесь
 * кнопки — цветом текста, цвет остаётся за смыслом (доход, сбережения, нехватка).
 */
export const QUIET_BUTTON =
  "text-foreground hover:bg-foreground/[0.07] active:bg-foreground/[0.14]";
