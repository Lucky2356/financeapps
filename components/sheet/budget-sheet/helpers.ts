import type { DisplayColumn, Position } from "@/components/sheet/sheet-types";
import type { SheetPageData } from "@/lib/api/local/sheet";
import type { ImportPageData } from "@/lib/data";
import type { ComputedRow, SheetColumn } from "@/lib/sheet/model";

export const EMPTY: SheetPageData = {
  columns: [],
  cells: [],
  months: [],
  targets: [],
  canUndoImport: false
};
export const EMPTY_REFS = {
  source: "database",
  accounts: [],
  categories: []
} as unknown as ImportPageData;
export const COMPARE_KEY = "sheet-compare";
export const DENSITY_KEY = "sheet-density";
export const VIEW_KEY = "sheet-view";
export const HELP_KEY = "sheet-help-seen";

/**
 * Оттенок ПОВЕРХ непрозрачной основы, а не прозрачный фон.
 *
 * Шапка и столбец «Месяц» липкие: под ними при прокрутке едут числа. Фон
 * `bg-primary/15` пропускает их насквозь — цифры остатка проступали поверх
 * названия месяца, и строка выглядела сломанной. Основа `bg-card` (или
 * `bg-muted`) закрывает то, что под ней, а оттенок — это картинка-градиент на
 * той же основе.
 */
export const TINT = {
  // Нейтральные подложки: цветом текста поверх карточки — на тёмной теме
  // светлее, на светлой темнее. Фиолетовый в таблице владелец назвал тяжёлым
  // на тёмном фоне; цвет в таблице теперь только смысловой (доход, сбережения,
  // нехватка), а выделение и группы — серые.
  ink06:
    "bg-card [background-image:linear-gradient(hsl(var(--foreground)/0.06),hsl(var(--foreground)/0.06))]",
  ink10:
    "bg-card [background-image:linear-gradient(hsl(var(--foreground)/0.1),hsl(var(--foreground)/0.1))]",
  ink14:
    "bg-card [background-image:linear-gradient(hsl(var(--foreground)/0.14),hsl(var(--foreground)/0.14))]",
  success10:
    "bg-card [background-image:linear-gradient(hsl(var(--success)/0.1),hsl(var(--success)/0.1))]",
  success15:
    "bg-card [background-image:linear-gradient(hsl(var(--success)/0.15),hsl(var(--success)/0.15))]",
  warning25:
    "bg-card [background-image:linear-gradient(hsl(var(--warning)/0.25),hsl(var(--warning)/0.25))]"
} as const;

export type Density = "comfort" | "compact";
export type PhoneView = "table" | "months";

export type CellChange = { month: string; columnId: string; input: string };

/** Факт из учёта: месяц → категория → сумма. */
export type Facts = Record<string, Record<string, number>>;

// Откуда вводят: из самой клетки или из строки выбранной клетки над таблицей.
export type Editing = {
  position: Position;
  draft: string;
  source: "cell" | "bar";
};

export function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function previousMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function lastDay(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, index, 0).getDate()).padStart(2, "0")}`;
}

export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function cellValue(row: ComputedRow, item: DisplayColumn) {
  if (item.type === "total") return row.total;
  if (item.type === "savingsTotal") return row.savingsTotal;
  return row.cells[item.column.id]?.value ?? null;
}

export function operationsHref(column: SheetColumn, month?: string) {
  if (!column.categoryId) return null;
  const params = new URLSearchParams({ categoryId: column.categoryId });
  if (month) {
    params.set("from", `${month}-01`);
    params.set("to", lastDay(month));
  }
  return `/transactions?${params.toString()}`;
}
