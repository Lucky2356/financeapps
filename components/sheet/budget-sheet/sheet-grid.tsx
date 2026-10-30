"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type {
  ClipboardEvent,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  SetStateAction
} from "react";

import { HeaderCell } from "@/components/sheet/budget-sheet/header-cell";
import {
  NEGATIVE_TOTAL,
  PINNED_TOTAL,
  TINT,
  cellValue,
  operationsHref,
  type Density,
  type Editing,
  type Facts
} from "@/components/sheet/budget-sheet/helpers";
import type { ColumnDraft } from "@/components/sheet/column-dialog";
import { monthLabel } from "@/components/sheet/sheet-text";
import type {
  DisplayColumn,
  Position,
  SheetFormat,
  SheetWords
} from "@/components/sheet/sheet-types";
import type { ImportPageData } from "@/lib/data";
import type { AboveUsual } from "@/lib/sheet/highlight";
import { cellKey, isBalanceKind, type ComputedSheet } from "@/lib/sheet/model";
import { cn } from "@/lib/utils";

/** Сама таблица: шапка и месяц липкие, прокрутка — внутри. */
export function SheetGrid({
  tableRef,
  words,
  format,
  locale,
  showTable,
  display,
  computed,
  current,
  density,
  compare,
  facts,
  phone,
  categoryById,
  selected,
  selectCell,
  selectRange,
  range,
  editing,
  setEditing,
  setColumnDialog,
  setMonthMenu,
  setPhoneCell,
  startEdit,
  commit,
  onKeyDown,
  onPaste,
  onEditKeyDown,
  plain,
  money,
  unusual
}: {
  tableRef: RefObject<HTMLDivElement | null>;
  words: SheetWords;
  format: SheetFormat;
  locale: string;
  showTable: boolean;
  display: DisplayColumn[];
  computed: ComputedSheet;
  current: string;
  density: Density;
  compare: boolean;
  facts: Facts;
  phone: boolean;
  categoryById: Map<string, ImportPageData["categories"][number]>;
  selected: Position | null;
  /** Выбрать клетку; `extend` — растянуть выделение до неё. */
  selectCell: (position: Position, extend?: boolean) => void;
  selectRange: (anchor: Position, focus: Position) => void;
  /** Выделенный прямоугольник, если выделено больше одной клетки. */
  range: { top: number; bottom: number; left: number; right: number } | null;
  editing: Editing | null;
  setEditing: Dispatch<SetStateAction<Editing | null>>;
  setColumnDialog: Dispatch<SetStateAction<ColumnDraft | null>>;
  setMonthMenu: Dispatch<SetStateAction<string | null>>;
  setPhoneCell: Dispatch<SetStateAction<Position | null>>;
  startEdit: (position: Position, draft?: string) => void;
  commit: (next?: Position) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  onEditKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  plain: (value: number) => string;
  money: (value: number) => string;
  /** Клетки расходов выше обычного — `cellKey(месяц, столбец)`. */
  unusual: Map<string, AboveUsual>;
}) {
  // Протяжка мышью: где нажали, и было ли движение (тогда нажатие в конце
  // протяжки — не новый выбор одной клетки).
  const dragFrom = useRef<Position | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    const up = () => {
      dragFrom.current = null;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const mainSpan = display.findIndex((item) => item.type === "total") + 1;
  const savingsSpan = display.length - mainSpan;
  const pad = density === "comfort" ? "px-3 py-2.5 text-[15px]" : "px-2 py-1.5 text-sm";

  return (
    <div
      ref={tableRef}
      tabIndex={0}
      role="grid"
      aria-label={words.emptyTitle}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={cn(
        "relative max-h-[calc(100svh-15rem)] select-none overflow-auto rounded-lg border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !showTable && "hidden"
      )}
      data-testid="sheet-grid"
    >
      <table className="w-max min-w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-20">
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-30 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold"
            >
              {words.month}
            </th>
            <th
              colSpan={mainSpan}
              className={cn(
                "border-b border-r px-2 py-1.5 text-left text-xs font-semibold text-foreground",
                TINT.ink06
              )}
            >
              {words.main}
            </th>
            <th
              colSpan={savingsSpan}
              className={cn(
                "border-b px-2 py-1.5 text-left text-xs font-semibold text-success",
                TINT.success15
              )}
            >
              {words.savings}
            </th>
          </tr>
          <tr>
            {display.map((item, index) => (
              <HeaderCell
                key={item.type === "column" ? item.column.id : item.type}
                item={item}
                last={index === display.length - 1}
                active={selected?.col === index}
                words={words}
                href={item.type === "column" ? operationsHref(item.column) : null}
                categoryName={
                  item.type === "column" && item.column.categoryId
                    ? categoryById.get(item.column.categoryId)?.label
                    : undefined
                }
                onOpen={() =>
                  item.type === "column" &&
                  setColumnDialog({
                    id: item.column.id,
                    name: item.column.name,
                    kind: item.column.kind,
                    categoryId: item.column.categoryId ?? null,
                    hidden: item.column.hidden
                  })
                }
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {computed.rows.map((row, rowIndex) => {
            const past = row.month < current;
            const now = row.month === current;
            return (
              <tr key={row.month} data-month={row.month} className="hover:bg-muted/40">
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 text-left text-[13px] font-semibold",
                    density === "comfort" ? "py-2.5" : "py-1.5",
                    now ? cn(TINT.ink10, "font-bold text-foreground") : "bg-card",
                    past && "text-foreground/70",
                    selected?.row === rowIndex && cn(TINT.ink14, "text-foreground")
                  )}
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 hover:underline"
                    onClick={() => setMonthMenu(row.month)}
                  >
                    {monthLabel(row.month, locale)}
                    {now ? (
                      <span
                        className="inline-block size-1.5 rounded-full bg-foreground"
                        title={words.legendNow}
                      />
                    ) : null}
                  </button>
                </th>
                {display.map((item, col) => {
                  const isSelected = selected?.row === rowIndex && selected.col === col;
                  const inRange =
                    !!range &&
                    rowIndex >= range.top &&
                    rowIndex <= range.bottom &&
                    col >= range.left &&
                    col <= range.right;
                  const isEditing =
                    editing?.source === "cell" &&
                    editing.position.row === rowIndex &&
                    editing.position.col === col;
                  const value = cellValue(row, item);
                  const cell = item.type === "column" ? row.cells[item.column.id] : null;
                  const wordy = item.type === "column" && item.column.kind === "note";
                  const fact =
                    compare && item.type === "column" && item.column.categoryId
                      ? facts[row.month]?.[item.column.categoryId]
                      : undefined;
                  const isTotal = item.type !== "column";
                  const href =
                    isSelected && item.type === "column"
                      ? operationsHref(item.column, row.month)
                      : null;
                  const crosshair =
                    !range && !isSelected && (selected?.row === rowIndex || selected?.col === col);
                  const above =
                    item.type === "column" ? unusual.get(cellKey(row.month, item.column.id)) : null;
                  const aboveText = above
                    ? format(words.aboveUsual, {
                        percent: above.percent,
                        usual: money(above.usual)
                      })
                    : null;
                  const baseTitle = cell?.error
                    ? format(words.cellError, { error: cell.error })
                    : cell?.auto
                      ? words.auto
                      : wordy && cell?.input
                        ? cell.input
                        : cell?.input && cell.input !== String(value)
                          ? cell.input
                          : undefined;
                  return (
                    <td
                      key={item.type === "column" ? item.column.id : item.type}
                      role="gridcell"
                      aria-selected={isSelected || inRange}
                      data-pos={`${rowIndex}:${col}`}
                      data-col={item.type === "column" ? item.column.name : item.type}
                      data-above={above ? above.percent : undefined}
                      className={cn(
                        "relative min-w-[6.5rem] border-b border-r tabular-nums",
                        pad,
                        wordy ? "min-w-[11rem] max-w-[16rem] text-left" : "text-right",
                        !isTotal && "cursor-cell",
                        isTotal && cn(TINT.warning10, "font-semibold"),
                        item.type === "total" && cn(PINNED_TOTAL, "md:z-[6]"),
                        item.type === "column" && item.column.hidden && "opacity-50",
                        // Выше обычного: лёгкая янтарная подложка и уголок, как у
                        // примечания в Excel, — подсказка, а не тревога.
                        above &&
                          cn(
                            TINT.warning10,
                            "after:pointer-events-none after:absolute after:right-0 after:top-0 after:border-[5px] after:border-transparent after:border-r-warning after:border-t-warning after:content-['']"
                          ),
                        now && !isTotal && "bg-foreground/[0.04]",
                        crosshair && !isTotal && "bg-foreground/[0.07]",
                        item.type === "column" &&
                          item.column.kind === "income" &&
                          value !== null &&
                          "font-medium text-success",
                        value === 0 && !isTotal && "text-muted-foreground/50",
                        isTotal && value !== null && value < 0 && NEGATIVE_TOTAL,
                        inRange && !isSelected && "bg-primary/10",
                        isSelected && "outline outline-2 -outline-offset-2 outline-foreground",
                        cell?.error && "text-destructive"
                      )}
                      title={
                        aboveText
                          ? baseTitle
                            ? `${aboveText}\n${baseTitle}`
                            : aboveText
                          : baseTitle
                      }
                      onClick={(event) => {
                        if (phone) {
                          if (item.type === "column") setPhoneCell({ row: rowIndex, col });
                          return;
                        }
                        if (editing && !isEditing) commit();
                        // Протяжка уже выделила — нажатие в её конце выбор не сбивает.
                        if (dragged.current) {
                          dragged.current = false;
                          return;
                        }
                        selectCell({ row: rowIndex, col }, event.shiftKey);
                      }}
                      onPointerDown={(event) => {
                        if (phone || event.button !== 0 || event.shiftKey || isEditing) return;
                        dragFrom.current = { row: rowIndex, col };
                        dragged.current = false;
                      }}
                      onPointerEnter={() => {
                        const from = dragFrom.current;
                        if (!from || (from.row === rowIndex && from.col === col)) return;
                        // Протяжка мышью — выделение от клетки, где нажали.
                        dragged.current = true;
                        selectRange(from, { row: rowIndex, col });
                      }}
                      onDoubleClick={() => startEdit({ row: rowIndex, col })}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          aria-label={words.input}
                          className={cn(
                            "absolute inset-0 z-[5] w-full bg-background px-2 outline-none",
                            wordy ? "text-left" : "text-right"
                          )}
                          value={editing.draft}
                          onChange={(event) =>
                            setEditing({ ...editing, draft: event.target.value })
                          }
                          onBlur={() => commit()}
                          onKeyDown={onEditKeyDown}
                        />
                      ) : wordy ? (
                        <span className="block truncate">{cell?.input}</span>
                      ) : (
                        <>
                          <span className={cn(cell?.auto && "italic text-muted-foreground")}>
                            {cell?.error ? "#!" : value === null ? "" : plain(value)}
                          </span>
                          {fact !== undefined ? (
                            <span
                              className={cn(
                                "block text-[11px] font-normal",
                                item.type === "column" &&
                                  item.column.kind === "expense" &&
                                  value !== null &&
                                  fact > value
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              )}
                            >
                              {words.fact} {plain(fact)}
                            </span>
                          ) : null}
                          {href ? (
                            <Link
                              href={href}
                              aria-label={format(words.operationsFor, {
                                month: monthLabel(row.month, locale, "long")
                              })}
                              className="absolute left-0.5 top-0.5 rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ArrowUpRight className="size-3" />
                            </Link>
                          ) : null}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 z-20">
          {(["sum", "average"] as const).map((kind) => (
            <tr key={kind}>
              <th className="sticky left-0 z-30 border-t bg-muted px-3 py-1.5 text-left text-xs font-semibold">
                {kind === "sum" ? words.sum : words.average}
              </th>
              {display.map((item) => (
                <td
                  key={item.type === "column" ? item.column.id : item.type}
                  className={cn(
                    "border-r border-t bg-muted px-2 py-1.5 text-right text-xs font-semibold tabular-nums",
                    item.type === "total" && cn(PINNED_TOTAL, "md:z-[6]")
                  )}
                >
                  {item.type === "column" &&
                  !isBalanceKind(item.column.kind) &&
                  computed.totals[item.column.id]?.filled
                    ? plain(computed.totals[item.column.id][kind])
                    : ""}
                </td>
              ))}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
