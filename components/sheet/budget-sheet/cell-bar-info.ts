import { operationsHref, type Editing, type Facts } from "@/components/sheet/budget-sheet/helpers";
import type { CellBarInfo } from "@/components/sheet/sheet-cell-bar";
import { monthLabel } from "@/components/sheet/sheet-text";
import type {
  DisplayColumn,
  Position,
  SheetFormat,
  SheetWords
} from "@/components/sheet/sheet-types";
import { evaluate, isFormula } from "@/lib/sheet/formula";
import type { ComputedRow } from "@/lib/sheet/model";

/** Что показать в строке выбранной клетки. */
export function cellBarInfo({
  phone,
  selected,
  selectedRow,
  display,
  editing,
  facts,
  words,
  format,
  locale,
  money,
  plain
}: {
  phone: boolean;
  selected: Position | null;
  selectedRow: ComputedRow | null;
  display: DisplayColumn[];
  editing: Editing | null;
  facts: Facts;
  words: SheetWords;
  format: SheetFormat;
  locale: string;
  money: (value: number) => string;
  plain: (value: number) => string;
}): CellBarInfo | null {
  if (phone || !selected || !selectedRow) return null;
  const item = display[selected.col];
  if (!item) return null;
  const when = monthLabel(selectedRow.month, locale);
  if (item.type !== "column") {
    const value = item.type === "total" ? selectedRow.total : selectedRow.savingsTotal;
    return {
      title: `${item.type === "total" ? words.total : words.savingsTotal} · ${when}`,
      editable: false,
      value: "",
      auto: null,
      error: null,
      preview: null,
      fact: null,
      href: null,
      totalValue: plain(value),
      text: false
    };
  }
  const { column } = item;
  const cell = selectedRow.cells[column.id];
  const typed =
    editing && editing.position.row === selected.row && editing.position.col === selected.col
      ? editing.draft
      : (cell?.input ?? "");
  const text = column.kind === "note";
  const result = text ? null : evaluate(typed);
  const fact = column.categoryId ? facts[selectedRow.month]?.[column.categoryId] : undefined;
  let factInfo: CellBarInfo["fact"] = null;
  if (fact !== undefined && (column.kind === "expense" || column.kind === "income")) {
    let delta: string | null = null;
    let bad = false;
    const plan = cell?.value ?? null;
    if (plan !== null && !cell?.auto) {
      const diff = Math.round((fact - plan) * 100) / 100;
      if (diff !== 0) {
        delta = format(diff > 0 ? words.barOver : words.barUnder, {
          amount: money(Math.abs(diff))
        });
        // Расход больше плана — плохо; доход меньше плана — тоже.
        bad = column.kind === "expense" ? diff > 0 : diff < 0;
      }
    }
    factInfo = { text: money(fact), delta, over: bad };
  }
  return {
    title: format(words.barCell, { column: column.name, month: when }),
    editable: true,
    value: cell?.input ?? "",
    auto: cell?.auto && cell.value !== null ? plain(cell.value) : null,
    error: result && !result.ok ? result.error : null,
    preview: result && result.ok && isFormula(typed) ? `= ${plain(result.value)}` : null,
    fact: factInfo,
    href: operationsHref(column, selectedRow.month),
    totalValue: null,
    text
  };
}
