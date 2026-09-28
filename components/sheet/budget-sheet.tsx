"use client";

// «Таблица» — своя таблица бюджета, как у человека в Excel.
//
// Как в Excel и работает: ячейку выделяют нажатием, вводят двойным нажатием
// или просто начав печатать, Enter уводит вниз, Tab — вправо, стрелки ходят,
// Delete стирает, Ctrl+C/Ctrl+V копируют — в том числе целый блок прямо из
// Excel, Ctrl+Z отменяет. Остаток и Итог считаются сами (серым — посчитанное).
//
// Чем больше, чем Excel: статья, связанная с категорией, открывает свои
// операции в учёте — названием столбца за всё время, значком ↗ у ячейки — за
// её месяц. И «Сравнить с учётом» показывает под числом, сколько на самом деле
// ушло.
//
// На телефоне та же таблица (липкий месяц, прокрутка вбок), а ячейка
// правится в окне: в клетку шириной в палец формулу не напечатать.

import {
  ArrowUpRight,
  ChevronDown,
  Eye,
  FileDown,
  FileUp,
  Plus,
  Target,
  Undo2,
  X
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { toast } from "sonner";

import { ColumnDialog, type ColumnDraft } from "@/components/sheet/column-dialog";
import { SheetImportDialog } from "@/components/sheet/sheet-import-dialog";
import { monthLabel, useSheetText } from "@/components/sheet/sheet-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useApiPageData } from "@/hooks/use-api-page-data";
import { useMediaQuery } from "@/hooks/use-media-query";
import { apiClient } from "@/lib/api/client";
import type { SheetPageData } from "@/lib/api/local/sheet";
import type { ImportPageData } from "@/lib/data";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { formatCurrency } from "@/lib/format";
import { evaluate } from "@/lib/sheet/formula";
import { gridFromText } from "@/lib/sheet/import";
import {
  computeSheet,
  isSavingsKind,
  nextMonth,
  orderedColumns,
  type ComputedRow,
  type SheetColumn
} from "@/lib/sheet/model";
import { cn } from "@/lib/utils";

const EMPTY: SheetPageData = {
  columns: [],
  cells: [],
  months: [],
  targets: [],
  canUndoImport: false
};
const EMPTY_REFS = {
  source: "database",
  accounts: [],
  categories: []
} as unknown as ImportPageData;
const COMPARE_KEY = "sheet-compare";

/** Столбец таблицы на экране: настоящий или посчитанный итог. */
type DisplayColumn =
  | { type: "column"; column: SheetColumn }
  | { type: "total" }
  | { type: "savingsTotal" };

type Position = { row: number; col: number };
type CellChange = { month: string; columnId: string; input: string };

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastDay(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, index, 0).getDate()).padStart(2, "0")}`;
}

export function BudgetSheet() {
  const { words, format, locale } = useSheetText();
  const { data: loaded, reload } = useApiPageData<SheetPageData>(EMPTY, "/sheet");
  const { data: refs, reload: reloadRefs } = useApiPageData<ImportPageData>(EMPTY_REFS, "/import");
  const phone = useMediaQuery("(max-width: 767px)");

  // Правки видны сразу, а в книгу уходят следом — ждать ответа на каждую
  // клетку в таблице на 20 столбцов было бы мучением.
  const [sheet, setSheet] = useState<SheetPageData>(loaded);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheet(loaded);
  }, [loaded]);

  const [selected, setSelected] = useState<Position | null>(null);
  const [editing, setEditing] = useState<{ position: Position; draft: string } | null>(null);
  const [undo, setUndo] = useState<CellChange[][]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [compare, setCompare] = useState(false);
  const [facts, setFacts] = useState<Record<string, Record<string, number>>>({});
  const [columnDialog, setColumnDialog] = useState<ColumnDraft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [phoneCell, setPhoneCell] = useState<Position | null>(null);
  const [monthMenu, setMonthMenu] = useState<string | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  // На телефоне редкие действия — под «Ещё»: иначе панель занимала полэкрана,
  // а таблица начиналась ниже сгиба.
  const [more, setMore] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompare(localStorage.getItem(COMPARE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const computed = useMemo(() => computeSheet(sheet), [sheet]);
  const categories = refs.categories;
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const display = useMemo<DisplayColumn[]>(() => {
    const visible = orderedColumns(sheet.columns).filter((column) => showHidden || !column.hidden);
    const main = visible.filter((column) => !isSavingsKind(column.kind));
    const savings = visible.filter((column) => isSavingsKind(column.kind));
    return [
      ...main.map((column) => ({ type: "column" as const, column })),
      { type: "total" as const },
      ...savings.map((column) => ({ type: "column" as const, column })),
      { type: "savingsTotal" as const }
    ];
  }, [sheet.columns, showHidden]);

  const mainSpan = display.findIndex((item) => item.type === "total") + 1;
  const savingsSpan = display.length - mainSpan;
  const hiddenCount = sheet.columns.filter((column) => column.hidden).length;
  const current = thisMonth();

  useEffect(() => {
    if (!compare || computed.rows.length === 0) return;
    const from = computed.rows[0].month;
    const to = computed.rows[computed.rows.length - 1].month;
    let alive = true;
    apiClient
      .get<{ months: Record<string, Record<string, number>> }>(`/sheet/facts?from=${from}&to=${to}`)
      .then((result) => alive && setFacts(result.months))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [compare, computed.rows]);

  const money = (value: number) => formatCurrency(Math.round(value), "RUB");
  const plain = (value: number) =>
    value.toLocaleString(locale === "en" ? "en-GB" : "ru-RU", { maximumFractionDigits: 2 });

  // ── Запись ──────────────────────────────────────────────────────────────

  const save = useCallback(
    async (changes: CellChange[], options: { undoable?: boolean } = {}) => {
      if (changes.length === 0) return;
      if (options.undoable !== false) {
        const before = changes.map((change) => ({
          ...change,
          input:
            sheet.cells.find(
              (cell) => cell.month === change.month && cell.columnId === change.columnId
            )?.input ?? ""
        }));
        setUndo((stack) => [...stack.slice(-49), before]);
      }
      setSheet((was) => {
        let cells = was.cells;
        let months = was.months;
        for (const change of changes) {
          cells = cells.filter(
            (cell) => !(cell.month === change.month && cell.columnId === change.columnId)
          );
          if (change.input.trim()) cells = [...cells, change];
          if (!months.includes(change.month)) months = [...months, change.month].sort();
        }
        return { ...was, cells, months };
      });
      try {
        await apiClient.post("/sheet", { action: "setCells", cells: changes });
      } catch (cause) {
        toast.error((cause as Error).message);
        await reload();
      }
    },
    [sheet.cells, reload]
  );

  async function act(body: Record<string, unknown>, done?: string) {
    try {
      const result = await apiClient.post("/sheet", body);
      await reload();
      if (done) toast.success(done);
      return result;
    } catch (cause) {
      toast.error((cause as Error).message);
      return null;
    }
  }

  // ── Ячейки ──────────────────────────────────────────────────────────────

  function columnAt(col: number): SheetColumn | null {
    const item = display[col];
    return item?.type === "column" ? item.column : null;
  }

  function inputAt(position: Position): string {
    const column = columnAt(position.col);
    const row = computed.rows[position.row];
    if (!column || !row) return "";
    return row.cells[column.id]?.input ?? "";
  }

  function startEdit(position: Position, draft?: string) {
    if (!columnAt(position.col)) return;
    if (phone) {
      setPhoneCell(position);
      return;
    }
    setSelected(position);
    setEditing({ position, draft: draft ?? inputAt(position) });
  }

  function commit(next?: Position) {
    if (!editing) return;
    const column = columnAt(editing.position.col);
    const row = computed.rows[editing.position.row];
    if (column && row && editing.draft !== (row.cells[column.id]?.input ?? "")) {
      void save([{ month: row.month, columnId: column.id, input: editing.draft.trim() }]);
    }
    setEditing(null);
    if (next) setSelected(clamp(next));
    requestAnimationFrame(() => tableRef.current?.focus());
  }

  function clamp(position: Position): Position {
    return {
      row: Math.max(0, Math.min(computed.rows.length - 1, position.row)),
      col: Math.max(0, Math.min(display.length - 1, position.col))
    };
  }

  function move(position: Position, rows: number, cols: number): Position {
    return clamp({ row: position.row + rows, col: position.col + cols });
  }

  async function paste(text: string, at: Position) {
    const grid = gridFromText(text).filter((row) => row.some((cell) => cell !== ""));
    if (grid.length === 0) return;
    // Столбцы для вставки — только настоящие, итоги пропускаются, как в Excel
    // пропускались бы защищённые клетки.
    const targets: SheetColumn[] = [];
    for (let col = at.col; col < display.length; col += 1) {
      const column = columnAt(col);
      if (column) targets.push(column);
    }
    const months = computed.rows.map((row) => row.month);
    const changes: CellChange[] = [];
    grid.forEach((line, r) => {
      let month = months[at.row + r];
      if (!month) {
        // Вставка длиннее таблицы — таблица дорастает месяцами.
        const last = months[months.length - 1] ?? current;
        month = nextMonth(last);
        months.push(month);
      }
      line.forEach((value, c) => {
        const column = targets[c];
        if (column) changes.push({ month, columnId: column.id, input: value });
      });
    });
    await save(changes);
    toast.success(format(words.pasted, { count: changes.length }));
  }

  function fillDown(position: Position) {
    const column = columnAt(position.col);
    if (!column) return;
    const input = inputAt(position);
    const changes = computed.rows
      .slice(position.row + 1)
      .map((row) => ({ month: row.month, columnId: column.id, input }));
    void save(changes).then(() => toast.success(words.filled));
  }

  function undoLast() {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((stack) => stack.slice(0, -1));
    void save(last, { undoable: false });
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (editing || !selected) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLast();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "c") {
      event.preventDefault();
      const column = columnAt(selected.col);
      const row = computed.rows[selected.row];
      const cell = column && row ? row.cells[column.id] : null;
      const text =
        cell?.input ||
        (cell?.value !== null && cell?.value !== undefined ? String(cell.value) : "");
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Tab: [0, event.shiftKey ? -1 : 1]
    };
    if (moves[event.key]) {
      event.preventDefault();
      setSelected(move(selected, ...moves[event.key]));
      return;
    }
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEdit(selected);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const column = columnAt(selected.col);
      const row = computed.rows[selected.row];
      if (column && row) void save([{ month: row.month, columnId: column.id, input: "" }]);
      return;
    }
    // Начали печатать — ввод с этой буквы, как в Excel.
    if (!ctrl && !event.altKey && event.key.length === 1 && /[\d=+\-.,(]/.test(event.key)) {
      event.preventDefault();
      startEdit(selected, event.key);
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !selected) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    void paste(text, selected);
  }

  // ── Выгрузка ────────────────────────────────────────────────────────────

  async function exportCsv() {
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
    const lines = computed.rows.map((row) => [
      `01.${row.month.slice(5, 7)}.${row.month.slice(0, 4)}`,
      ...display.map((item) => {
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

  // ── Вид ─────────────────────────────────────────────────────────────────

  if (sheet.columns.length === 0) {
    return (
      <>
        <Card data-testid="sheet-empty">
          <CardContent className="space-y-4 p-6 text-center">
            <h2 className="text-lg font-semibold">{words.emptyTitle}</h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">{words.emptyLead}</p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <Button type="button" onClick={() => setImportOpen(true)}>
                <FileUp className="size-4" />
                {words.emptyImport}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void act({ action: "start", from: current })}
              >
                {words.emptyStart}
              </Button>
            </div>
          </CardContent>
        </Card>
        <SheetImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          categories={categories}
          hasSheet={false}
          onImported={async () => {
            await Promise.all([reload(), reloadRefs()]);
          }}
        />
      </>
    );
  }

  const selectedColumn = selected ? columnAt(selected.col) : null;
  const selectedRow = selected ? computed.rows[selected.row] : null;

  function cellValue(row: ComputedRow, item: DisplayColumn) {
    if (item.type === "total") return row.total;
    if (item.type === "savingsTotal") return row.savingsTotal;
    return row.cells[item.column.id]?.value ?? null;
  }

  function operationsHref(column: SheetColumn, month?: string) {
    if (!column.categoryId) return null;
    const params = new URLSearchParams({ categoryId: column.categoryId });
    if (month) {
      params.set("from", `${month}-01`);
      params.set("to", lastDay(month));
    }
    return `/transactions?${params.toString()}`;
  }

  const phoneColumn = phoneCell ? columnAt(phoneCell.col) : null;
  const phoneRow = phoneCell ? computed.rows[phoneCell.row] : null;

  return (
    <div className="space-y-3" data-testid="budget-sheet">
      {/* Панель: то, что делают с таблицей целиком. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setColumnDialog({})}>
          <Plus className="size-4" />
          {words.addColumn}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void act({
              action: "addMonth",
              month: nextMonth(sheet.months[sheet.months.length - 1] ?? current)
            })
          }
        >
          <Plus className="size-4" />
          {words.addMonth}
        </Button>
        {phone ? (
          <Button
            type="button"
            size="sm"
            variant={more ? "secondary" : "ghost"}
            aria-expanded={more}
            onClick={() => setMore((was) => !was)}
          >
            <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
            {words.more}
          </Button>
        ) : null}
        {!phone || more ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                void act({ action: "addMonth", month: previousMonth(sheet.months[0] ?? current) })
              }
            >
              {words.addMonthBefore}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setTargetOpen(true)}>
              <Target className="size-4" />
              {words.addTarget}
            </Button>
          </>
        ) : null}
        <label
          className={cn(
            "ml-auto items-center gap-2 text-sm",
            !phone || more ? "flex cursor-pointer" : "hidden"
          )}
        >
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={compare}
            onChange={(event) => {
              setCompare(event.target.checked);
              try {
                localStorage.setItem(COMPARE_KEY, event.target.checked ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
          />
          {words.compare}
        </label>
      </div>
      <div className={cn("flex-wrap items-center gap-2", !phone || more ? "flex" : "hidden")}>
        <Button type="button" size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
          <FileUp className="size-4" />
          {words.import}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void exportCsv()}>
          <FileDown className="size-4" />
          {words.export}
        </Button>
        {sheet.canUndoImport ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void act({ action: "undoImport" }, words.undone)}
          >
            <Undo2 className="size-4" />
            {words.undoImport}
          </Button>
        ) : null}
        {hiddenCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant={showHidden ? "secondary" : "ghost"}
            onClick={() => setShowHidden((was) => !was)}
          >
            <Eye className="size-4" />
            {words.showHidden} · {hiddenCount}
          </Button>
        ) : null}
        {!phone && selectedColumn && selectedRow ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => fillDown(selected!)}>
            <ChevronDown className="size-4" />
            {words.fillDown}
          </Button>
        ) : null}
      </div>

      <SheetTargets
        rows={computed.rows}
        targets={sheet.targets}
        money={money}
        onRemove={(id) => void act({ action: "removeTarget", id })}
      />

      {/* Сама таблица. Шапка и месяц липкие; прокрутка — внутри. */}
      <div
        ref={tableRef}
        tabIndex={0}
        role="grid"
        aria-label={words.emptyTitle}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="relative max-h-[calc(100svh-15rem)] overflow-auto rounded-lg border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="sheet-grid"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
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
                className="border-b border-r bg-primary/10 px-2 py-1 text-left text-xs font-semibold text-primary"
              >
                {words.main}
              </th>
              <th
                colSpan={savingsSpan}
                className="border-b bg-success/10 px-2 py-1 text-left text-xs font-semibold text-success"
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
                <tr key={row.month} data-month={row.month}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1.5 text-left text-xs font-medium",
                      now ? "bg-primary/15 text-primary" : "bg-card",
                      past && "text-muted-foreground"
                    )}
                  >
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => setMonthMenu(row.month)}
                    >
                      {monthLabel(row.month, locale)}
                    </button>
                  </th>
                  {display.map((item, col) => {
                    const isSelected = selected?.row === rowIndex && selected.col === col;
                    const isEditing =
                      editing?.position.row === rowIndex && editing.position.col === col;
                    const value = cellValue(row, item);
                    const cell = item.type === "column" ? row.cells[item.column.id] : null;
                    const fact =
                      compare && item.type === "column" && item.column.categoryId
                        ? facts[row.month]?.[item.column.categoryId]
                        : undefined;
                    const isTotal = item.type !== "column";
                    const href =
                      isSelected && item.type === "column"
                        ? operationsHref(item.column, row.month)
                        : null;
                    return (
                      <td
                        key={item.type === "column" ? item.column.id : item.type}
                        role="gridcell"
                        aria-selected={isSelected}
                        data-col={item.type === "column" ? item.column.name : item.type}
                        className={cn(
                          "relative min-w-[6.5rem] border-b border-r px-2 py-1.5 text-right tabular-nums",
                          isTotal && "bg-warning/10 font-semibold",
                          item.type === "column" && item.column.hidden && "opacity-50",
                          now && !isTotal && "bg-primary/5",
                          past && "text-muted-foreground",
                          isSelected && "outline outline-2 -outline-offset-2 outline-primary",
                          cell?.error && "text-destructive"
                        )}
                        title={
                          cell?.error
                            ? format(words.cellError, { error: cell.error })
                            : cell?.auto
                              ? words.auto
                              : cell?.input && cell.input !== String(value)
                                ? cell.input
                                : undefined
                        }
                        onClick={() => {
                          if (phone) {
                            if (item.type === "column") setPhoneCell({ row: rowIndex, col });
                            return;
                          }
                          if (editing && !isEditing) commit();
                          setSelected({ row: rowIndex, col });
                        }}
                        onDoubleClick={() => startEdit({ row: rowIndex, col })}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            aria-label={words.input}
                            className="absolute inset-0 w-full bg-background px-2 text-right outline-none"
                            value={editing.draft}
                            onChange={(event) =>
                              setEditing({ ...editing, draft: event.target.value })
                            }
                            onBlur={() => commit()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commit(move(editing.position, 1, 0));
                              } else if (event.key === "Tab") {
                                event.preventDefault();
                                commit(move(editing.position, 0, event.shiftKey ? -1 : 1));
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                setEditing(null);
                                requestAnimationFrame(() => tableRef.current?.focus());
                              }
                            }}
                          />
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
                                className="absolute left-0.5 top-0.5 rounded p-0.5 text-primary hover:bg-primary/10"
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
                    className="border-r border-t bg-muted px-2 py-1.5 text-right text-xs font-medium tabular-nums"
                  >
                    {item.type === "column" && computed.totals[item.column.id]?.filled
                      ? plain(computed.totals[item.column.id][kind])
                      : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      {!phone ? <p className="text-xs text-muted-foreground">{words.hint}</p> : null}

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
              categoryId: draft.categoryId ?? null,
              hidden: draft.hidden ?? false
            });
          } else {
            await act({
              action: "addColumn",
              name: draft.name,
              kind: draft.kind,
              categoryId: draft.categoryId ?? null
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
          const column = sheet.columns.find((item) => item.id === id);
          return column ? operationsHref(column) : null;
        }}
      />

      <SheetImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        categories={categories}
        hasSheet
        onImported={async () => {
          await Promise.all([reload(), reloadRefs()]);
        }}
      />

      {/* Ячейка на телефоне — в окне: поле во всю ширину, формула помещается. */}
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

      {/* Месяц: удалить строку. */}
      <Dialog open={monthMenu !== null} onOpenChange={(open) => !open && setMonthMenu(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{monthMenu ? monthLabel(monthMenu, locale, "long") : ""}</DialogTitle>
            <DialogDescription>
              {monthMenu
                ? format(words.deleteMonthConfirm, { month: monthLabel(monthMenu, locale, "long") })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMonthMenu(null)}>
              {words.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                const month = monthMenu;
                setMonthMenu(null);
                setSelected(null);
                if (month) await act({ action: "removeMonth", month });
              }}
            >
              {words.deleteMonth}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TargetDialog
        open={targetOpen}
        words={words}
        onClose={() => setTargetOpen(false)}
        onSave={async (target) => {
          await act({ action: "setTarget", ...target });
          setTargetOpen(false);
        }}
      />
    </div>
  );
}

function HeaderCell({
  item,
  last,
  words,
  href,
  categoryName,
  onOpen
}: {
  item: DisplayColumn;
  last: boolean;
  words: ReturnType<typeof useSheetText>["words"];
  href: string | null;
  categoryName?: string;
  onOpen: () => void;
}) {
  if (item.type !== "column") {
    return (
      <th
        className={cn(
          "border-b bg-warning/20 px-2 py-2 text-right text-xs font-semibold",
          !last && "border-r"
        )}
      >
        {item.type === "total" ? words.total : words.savingsTotal}
      </th>
    );
  }
  const { column } = item;
  return (
    <th
      className={cn(
        "max-w-[10rem] border-b border-r px-2 py-2 text-right align-bottom text-xs font-semibold",
        isSavingsKind(column.kind) ? "bg-success/10" : "bg-muted",
        column.hidden && "opacity-50"
      )}
      title={categoryName ? `${words.operations}: ${categoryName}` : words.kinds[column.kind]}
    >
      <span className="flex items-end justify-end gap-1">
        {href ? (
          <Link href={href} className="line-clamp-2 text-primary hover:underline">
            {column.name}
          </Link>
        ) : (
          <span className="line-clamp-2">{column.name}</span>
        )}
        <button
          type="button"
          aria-label={`${words.column}: ${column.name}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/10"
          onClick={onOpen}
        >
          <ChevronDown className="size-3.5" />
        </button>
      </span>
      {column.kind !== "expense" ? (
        <span className="block text-[10px] font-normal text-muted-foreground">
          {words.kinds[column.kind]}
        </span>
      ) : null}
    </th>
  );
}

function PhoneCellEditor({
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
  const preview = evaluate(draft);
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
          {preview && !preview.ok
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
        <Button type="button" size="sm" variant="ghost" onClick={onFill}>
          <ChevronDown className="size-4" />
          {words.fillDown}
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

function SheetTargets({
  rows,
  targets,
  money,
  onRemove
}: {
  rows: ComputedRow[];
  targets: SheetPageData["targets"];
  money: (value: number) => string;
  onRemove: (id: string) => void;
}) {
  const { words, format, locale } = useSheetText();
  if (targets.length === 0 || rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="sheet-targets">
      {targets.map((target) => {
        const month = target.date.slice(0, 7);
        const reached = [...rows].reverse().find((row) => row.month <= month) ?? null;
        const last = rows[rows.length - 1];
        const progress = reached
          ? Math.max(0, Math.min(1, reached.savingsTotal / target.amount))
          : 0;
        let line: string;
        if (reached && reached.month === month) {
          line =
            reached.savingsTotal >= target.amount
              ? format(words.targetReached, { amount: money(reached.savingsTotal) })
              : format(words.targetOnTrack, {
                  month: monthLabel(reached.month, locale),
                  amount: money(reached.savingsTotal),
                  perMonth: money(target.amount - reached.savingsTotal)
                });
        } else if (last.month < month) {
          const [ly, lm] = last.month.split("-").map(Number);
          const [ty, tm] = month.split("-").map(Number);
          const left = Math.max(1, (ty - ly) * 12 + (tm - lm));
          line = format(words.targetOnTrack, {
            month: monthLabel(last.month, locale),
            amount: money(last.savingsTotal),
            perMonth: money(Math.max(0, (target.amount - last.savingsTotal) / left))
          });
        } else {
          line = words.targetNoRows;
        }
        const date = new Date(`${target.date}T12:00:00`).toLocaleDateString(
          locale === "en" ? "en-GB" : "ru-RU"
        );
        return (
          <div
            key={target.id}
            className="min-w-[16rem] flex-1 rounded-lg border bg-card p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {format(words.targetBy, {
                  label: target.label,
                  date,
                  amount: money(target.amount)
                })}
              </p>
              <button
                type="button"
                aria-label={words.delete}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => onRemove(target.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-success" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{line}</p>
          </div>
        );
      })}
    </div>
  );
}

function TargetDialog({
  open,
  words,
  onClose,
  onSave
}: {
  open: boolean;
  words: ReturnType<typeof useSheetText>["words"];
  onClose: () => void;
  onSave: (target: { label: string; date: string; amount: number }) => void;
}) {
  const [label, setLabel] = useState("Подушка");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const value = evaluate(amount);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!value || !value.ok || !date) return;
            onSave({ label, date, amount: value.value });
          }}
        >
          <DialogHeader>
            <DialogTitle>{words.addTarget}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="target-label">{words.targetLabel}</Label>
            <Input
              id="target-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-date">{words.targetDate}</Label>
            <Input
              id="target-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-amount">{words.targetAmount}</Label>
            <Input
              id="target-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {words.cancel}
            </Button>
            <Button type="submit" disabled={!value || !value.ok || !date || !label.trim()}>
              {words.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
