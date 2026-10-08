"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction
} from "react";
import { toast } from "sonner";

import type { CellChange, Editing, PhoneView } from "@/components/sheet/budget-sheet/helpers";
import type {
  DisplayColumn,
  Position,
  SheetFormat,
  SheetWords
} from "@/components/sheet/sheet-types";
import { gridFromText } from "@/lib/sheet/import";
import { nextMonth, type ComputedSheet, type SheetColumn } from "@/lib/sheet/model";

/**
 * Клетки как в Excel: выбор, ввод, клавиши, вставка блока, заполнение вниз и
 * прокрутка к выбранной клетке.
 */
export function useSheetEdits({
  display,
  computed,
  phone,
  view,
  current,
  words,
  format,
  save,
  undoLast,
  setPhoneCell,
  setMonthIndex
}: {
  display: DisplayColumn[];
  computed: ComputedSheet;
  phone: boolean;
  view: PhoneView;
  current: string;
  words: SheetWords;
  format: SheetFormat;
  save: (changes: CellChange[], options?: { undoable?: boolean }) => Promise<void>;
  undoLast: () => void;
  setPhoneCell: Dispatch<SetStateAction<Position | null>>;
  setMonthIndex: Dispatch<SetStateAction<number | null>>;
}) {
  const [selected, setSelected] = useState<Position | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const scrolledToNow = useRef(false);

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
    setEditing({ position, draft: draft ?? inputAt(position), source: "cell" });
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
    if (ctrl && event.key.toLowerCase() === "d") {
      event.preventDefault();
      fillDown(selected);
      return;
    }
    // Начали печатать — ввод с этой буквы, как в Excel. В текстовом столбце
    // начинать можно с любого знака: там не числа, а слова.
    const wordy = columnAt(selected.col)?.kind === "note";
    if (
      !ctrl &&
      !event.altKey &&
      event.key.length === 1 &&
      (wordy ? event.key.trim() !== "" : /[\d=+\-.,(]/.test(event.key))
    ) {
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

  /** Клавиши поля ввода — одни и те же в клетке и в строке над таблицей. */
  function onEditKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!editing) return;
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
  }

  // Строка над таблицей: тот же ввод в выбранную клетку, только сверху.
  function onBarFocus() {
    if (!editing && selected) {
      setEditing({ position: selected, draft: inputAt(selected), source: "bar" });
    }
  }

  function onBarChange(value: string) {
    if (!selected) return;
    setEditing((was) => ({
      position: was?.position ?? selected,
      draft: value,
      source: was?.source ?? "bar"
    }));
  }

  const barDraft =
    editing &&
    selected &&
    editing.position.row === selected.row &&
    editing.position.col === selected.col
      ? editing.draft
      : null;

  // ── Прокрутка ───────────────────────────────────────────────────────────

  /**
   * Показать выбранную клетку целиком.
   *
   * Клетка, которую выбрали стрелкой или ввели с клавиатуры, могла уехать под
   * липкий столбец «Месяц» или за край: поле ввода тогда рисовалось поверх
   * названия месяца, а самой клетки не было видно. Слева и сверху вычитается то,
   * что перекрывает таблицу постоянно — столбец с месяцами и шапка, снизу —
   * строки «Всего» и «В среднем».
   */
  const reveal = useCallback((position: Position) => {
    const box = tableRef.current;
    const cell = box?.querySelector<HTMLElement>(`[data-pos="${position.row}:${position.col}"]`);
    if (!box || !cell) return;
    const frame = box.getBoundingClientRect();
    const at = cell.getBoundingClientRect();
    const left = box.querySelector("tbody th")?.getBoundingClientRect().width ?? 0;
    const top = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const bottom = box.querySelector("tfoot")?.getBoundingClientRect().height ?? 0;
    const gap = 8;
    if (at.left < frame.left + left) box.scrollLeft -= frame.left + left - at.left + gap;
    else if (at.right > frame.right) box.scrollLeft += at.right - frame.right + gap;
    if (at.top < frame.top + top) box.scrollTop -= frame.top + top - at.top + gap;
    else if (at.bottom > frame.bottom - bottom)
      box.scrollTop += at.bottom - (frame.bottom - bottom) + gap;
  }, []);

  useEffect(() => {
    if (selected) reveal(selected);
  }, [selected, reveal]);

  // Открыли таблицу — она стоит на нынешнем месяце, а не на августе прошлого года.
  useEffect(() => {
    if (scrolledToNow.current || computed.rows.length === 0) return;
    const box = tableRef.current;
    const row = box?.querySelector<HTMLElement>(`tr[data-month="${current}"]`);
    if (!box || !row) return;
    scrolledToNow.current = true;
    const head = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    box.scrollTop =
      row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - head - 48;
  }, [computed.rows.length, current, view, phone]);

  /** К месяцу: строка таблицы выделяется и показывается, в «По месяцам» — открывается карточка. */
  function goToMonth(month: string) {
    const row = computed.rows.findIndex((item) => item.month === month);
    if (row < 0) return;
    setMonthIndex(row);
    if (!phone || view === "table") {
      const col = Math.max(
        0,
        display.findIndex((item) => item.type === "column")
      );
      setSelected({ row, col: selected?.col ?? col });
    }
  }

  /** То же число — в клетку следующего месяца, и выбор переезжает туда. */
  function copyToNextMonth(position: Position) {
    const column = columnAt(position.col);
    const next = computed.rows[position.row + 1];
    if (!column || !next) return;
    void save([{ month: next.month, columnId: column.id, input: inputAt(position) }]);
    setSelected({ row: position.row + 1, col: position.col });
  }

  function clearSelected(position: Position) {
    const column = columnAt(position.col);
    const row = computed.rows[position.row];
    if (column && row) void save([{ month: row.month, columnId: column.id, input: "" }]);
  }

  return {
    selected,
    setSelected,
    editing,
    setEditing,
    tableRef,
    columnAt,
    startEdit,
    commit,
    fillDown,
    onKeyDown,
    onPaste,
    onEditKeyDown,
    onBarFocus,
    onBarChange,
    barDraft,
    goToMonth,
    copyToNextMonth,
    clearSelected
  };
}
