// Таблица бюджета в книге: чтение и правки.
//
// Хранится четырьмя разделами строк, а не одним документом, — ради
// синхронизации: правка ячейки на телефоне и соседней на компьютере сливаются
// по ячейке (lib/sync/row-stamps: у каждой ячейки своя отметка), а не «кто
// последний сохранил таблицу целиком».

import {
  cellKey,
  isSavingsKind,
  orderedColumns,
  SHEET_COLUMN_KINDS,
  starterColumns,
  type SheetCell,
  type SheetColumn,
  type SheetColumnKind,
  type SheetTarget
} from "@/lib/sheet/model";
import type { Stamped } from "@/lib/sync/row-stamps";

export type SheetCellRow = SheetCell & { id: string };

/** Таблица до переноса из Excel — чтобы перенос можно было отменить. */
export type SheetBackup = {
  takenAt: string;
  columns: SheetColumn[];
  cells: SheetCellRow[];
  months: string[];
  targets: SheetTarget[];
};

export type SheetState = {
  sheetColumns?: Array<Stamped<SheetColumn>>;
  sheetCells?: Array<Stamped<SheetCellRow>>;
  sheetMonths?: Array<Stamped<{ id: string }>>;
  sheetTargets?: Array<Stamped<SheetTarget>>;
  sheetBackup?: SheetBackup | null;
};

export type SheetPageData = {
  columns: SheetColumn[];
  cells: SheetCell[];
  months: string[];
  targets: SheetTarget[];
  canUndoImport: boolean;
};

const MONTH = /^\d{4}-\d{2}$/;
const MAX_INPUT = 500;

function strip<T extends object>(row: Stamped<T>): T {
  const { updatedAt: _updatedAt, ...rest } = row as Stamped<T> & { updatedAt?: string };
  void _updatedAt;
  return rest as T;
}

export function readSheet(state: SheetState): SheetPageData {
  return {
    columns: orderedColumns((state.sheetColumns ?? []).map(strip)),
    cells: (state.sheetCells ?? []).map(({ month, columnId, input }) => ({
      month,
      columnId,
      input
    })),
    months: (state.sheetMonths ?? []).map((row) => row.id).sort(),
    targets: (state.sheetTargets ?? []).map(strip),
    canUndoImport: Boolean(state.sheetBackup)
  };
}

function month(value: unknown): string {
  const text = String(value ?? "");
  if (!MONTH.test(text)) throw new Error("Месяц должен быть в виде ГГГГ-ММ.");
  return text;
}

function kind(value: unknown): SheetColumnKind {
  const text = String(value ?? "") as SheetColumnKind;
  if (!SHEET_COLUMN_KINDS.includes(text)) throw new Error("Неизвестный вид столбца.");
  return text;
}

function name(value: unknown): string {
  const text = String(value ?? "")
    .trim()
    .slice(0, 80);
  if (!text) throw new Error("У столбца должно быть название.");
  return text;
}

function ensureMonth(state: SheetState, value: string) {
  const months = state.sheetMonths ?? [];
  if (!months.some((row) => row.id === value)) state.sheetMonths = [...months, { id: value }];
}

/** Порядок столбцов заново — шагом 10, чтобы вставка между не упиралась в дроби. */
function renumber(columns: Array<Stamped<SheetColumn>>): Array<Stamped<SheetColumn>> {
  return orderedColumns(columns).map((column, index) =>
    column.order === index * 10 ? column : { ...column, order: index * 10 }
  );
}

function setCell(state: SheetState, cell: { month: string; columnId: string; input: string }) {
  const id = cellKey(cell.month, cell.columnId);
  const input = cell.input.slice(0, MAX_INPUT);
  const rest = (state.sheetCells ?? []).filter((row) => row.id !== id);
  state.sheetCells = input.trim()
    ? [...rest, { id, month: cell.month, columnId: cell.columnId, input }]
    : rest;
  ensureMonth(state, cell.month);
}

type Body = Record<string, unknown>;

/**
 * Правка таблицы. `makeId` — от вызывающего: у книги свой способ выдавать
 * имена строкам. Категории для переноса из Excel заводит тоже вызывающий — у
 * него для этого есть всё, здесь нет.
 */
export function writeSheet(state: SheetState, body: Body, makeId: () => string): unknown {
  const action = String(body.action ?? "");
  const columns = state.sheetColumns ?? [];

  switch (action) {
    case "start": {
      // Пустой лист: Остаток, Доходы, подушка — и год вперёд с этого месяца.
      if (columns.length === 0) state.sheetColumns = renumber(starterColumns(makeId));
      let at = month(body.from);
      for (let index = 0; index < 12; index += 1) {
        ensureMonth(state, at);
        const [year, m] = at.split("-").map(Number);
        const next = new Date(year, m, 1);
        at = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
      }
      return readSheet(state);
    }

    case "setCells": {
      const cells = Array.isArray(body.cells) ? body.cells : [];
      const known = new Set(columns.map((column) => column.id));
      for (const raw of cells as Body[]) {
        const columnId = String(raw.columnId ?? "");
        if (!known.has(columnId)) continue;
        setCell(state, { month: month(raw.month), columnId, input: String(raw.input ?? "") });
      }
      return { saved: cells.length };
    }

    case "addColumn": {
      const column: SheetColumn = {
        id: makeId(),
        name: name(body.name),
        kind: kind(body.kind),
        categoryId: body.categoryId ? String(body.categoryId) : null,
        // Вставка после указанного столбца или в конец своего раздела.
        order: 0
      };
      const ordered = orderedColumns(columns);
      const after = ordered.find((item) => item.id === body.afterId);
      if (after) {
        column.order = after.order + 5;
      } else {
        const section = ordered.filter(
          (item) => isSavingsKind(item.kind) === isSavingsKind(column.kind)
        );
        const last = section[section.length - 1];
        column.order = last ? last.order + 5 : isSavingsKind(column.kind) ? 10_000 : -5;
      }
      state.sheetColumns = renumber([...columns, column]);
      return column;
    }

    case "updateColumn": {
      const id = String(body.id ?? "");
      if (!columns.some((column) => column.id === id)) throw new Error("Такого столбца нет.");
      state.sheetColumns = columns.map((column) => {
        if (column.id !== id) return column;
        const next = { ...column };
        if (body.name !== undefined) next.name = name(body.name);
        if (body.kind !== undefined) next.kind = kind(body.kind);
        if (body.categoryId !== undefined)
          next.categoryId = body.categoryId ? String(body.categoryId) : null;
        if (body.hidden !== undefined) next.hidden = Boolean(body.hidden);
        return next;
      });
      return { saved: true };
    }

    case "moveColumn": {
      const ordered = orderedColumns(columns);
      const index = ordered.findIndex((column) => column.id === body.id);
      const step = Number(body.direction) < 0 ? -1 : 1;
      const target = index + step;
      if (index < 0 || target < 0 || target >= ordered.length) return { saved: false };
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      state.sheetColumns = ordered.map((column, position) =>
        column.order === position * 10 ? column : { ...column, order: position * 10 }
      );
      return { saved: true };
    }

    case "removeColumn": {
      const id = String(body.id ?? "");
      state.sheetColumns = columns.filter((column) => column.id !== id);
      state.sheetCells = (state.sheetCells ?? []).filter((cell) => cell.columnId !== id);
      return { saved: true };
    }

    case "addMonth": {
      ensureMonth(state, month(body.month));
      return { saved: true };
    }

    case "removeMonth": {
      const value = month(body.month);
      state.sheetMonths = (state.sheetMonths ?? []).filter((row) => row.id !== value);
      state.sheetCells = (state.sheetCells ?? []).filter((cell) => cell.month !== value);
      return { saved: true };
    }

    case "setTarget": {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) throw new Error("Сумма цели — число.");
      const target: SheetTarget = {
        id: body.id ? String(body.id) : makeId(),
        label: name(body.label),
        date: String(body.date ?? "").slice(0, 10),
        amount
      };
      state.sheetTargets = [
        ...(state.sheetTargets ?? []).filter((row) => row.id !== target.id),
        target
      ];
      return target;
    }

    case "removeTarget": {
      state.sheetTargets = (state.sheetTargets ?? []).filter((row) => row.id !== body.id);
      return { saved: true };
    }

    case "undoImport": {
      const backup = state.sheetBackup;
      if (!backup) throw new Error("Отменять нечего.");
      state.sheetColumns = backup.columns;
      state.sheetCells = backup.cells;
      state.sheetMonths = backup.months.map((id) => ({ id }));
      state.sheetTargets = backup.targets;
      state.sheetBackup = null;
      return readSheet(state);
    }

    default:
      throw new Error(`Неизвестное действие с таблицей: ${action}`);
  }
}

/** Столбец переноса из Excel: как назван, чем считается и с какой категорией. */
export type SheetImportColumn = {
  key: string;
  name: string;
  kind: SheetColumnKind;
  categoryId?: string | null;
};

export type SheetImport = {
  columns: SheetImportColumn[];
  /** Строки: месяц и ввод по ключу столбца. */
  rows: Array<{ month: string; values: Record<string, string> }>;
  targets?: Array<Omit<SheetTarget, "id">>;
};

/**
 * Перенос из Excel: таблица заменяется целиком, прежняя откладывается —
 * «Отменить перенос» возвращает её как была.
 */
export function importSheet(
  state: SheetState,
  payload: SheetImport,
  makeId: () => string,
  now: string
): SheetPageData {
  state.sheetBackup = {
    takenAt: now,
    columns: (state.sheetColumns ?? []).map(strip),
    cells: (state.sheetCells ?? []).map(strip),
    months: (state.sheetMonths ?? []).map((row) => row.id),
    targets: (state.sheetTargets ?? []).map(strip)
  };

  const ids = new Map<string, string>();
  const columns: SheetColumn[] = payload.columns.map((column, index) => {
    const id = makeId();
    ids.set(column.key, id);
    return {
      id,
      name: name(column.name),
      kind: kind(column.kind),
      categoryId: column.categoryId ?? null,
      order: (isSavingsKind(column.kind) ? 1000 : 0) + index * 10
    };
  });
  state.sheetColumns = renumber(columns);
  state.sheetCells = [];
  state.sheetMonths = [];
  for (const row of payload.rows) {
    const at = month(row.month);
    ensureMonth(state, at);
    for (const [key, input] of Object.entries(row.values)) {
      const columnId = ids.get(key);
      if (columnId && input.trim()) setCell(state, { month: at, columnId, input });
    }
  }
  state.sheetTargets = (payload.targets ?? []).map((target) => ({ ...target, id: makeId() }));
  return readSheet(state);
}
