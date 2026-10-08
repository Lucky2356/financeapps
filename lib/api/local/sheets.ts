// Книга таблиц: несколько листов, как в Excel.
//
// Владелец: «чтоб можно целый Excel вот так перенести со множеством таблиц и
// была возможность переключения между ними». Листы двух видов:
//   • бюджетный — та же таблица месяцев и статей, что и раньше (lib/sheet),
//     со своим остатком, итогами и связью с учётом;
//   • свободный — клетки как в Excel: всё, что на бюджет не похоже (списки,
//     расчёты, заметки), переносится как есть, со значениями и правкой.
//
// ГЛАВНАЯ ТАБЛИЦА. То, что было до листов, — лист «main». Её строки листа не
// носят вовсе: так прежние данные остаются ровно как были, без перекладывания.
//
// ОКНО НА ЛИСТ. Все правки бюджетной таблицы (lib/api/local/sheet.ts) написаны
// для одной таблицы. Чтобы не переписывать их, правка идёт через окно: из книги
// вырезается лист — только его столбцы, клетки, месяцы и цели, месяцы без
// приставки листа, — над ним работает прежний код, а результат вставляется
// обратно на место. Код таблицы и не знает, что листов много.

import { evaluate } from "@/lib/sheet/formula";
import {
  importSheet,
  readSheet,
  SHEET_ACTIONS,
  type SheetBackup,
  type SheetCellRow,
  type SheetImport,
  type SheetPageData,
  type SheetState
} from "@/lib/api/local/sheet";
import type { SheetColumn, SheetTarget } from "@/lib/sheet/model";
import type { Stamped } from "@/lib/sync/row-stamps";

export const MAIN_SHEET = "main";

export type SheetKind = "budget" | "free";

export type SheetRow = {
  id: string;
  name: string;
  kind: SheetKind;
  order: number;
  rows?: number;
  cols?: number;
};

export type FreeCellRow = { id: string; sheetId: string; r: number; c: number; input: string };

export type BookState = SheetState & {
  sheets?: Array<Stamped<SheetRow>>;
  freeCells?: Array<Stamped<FreeCellRow>>;
  sheetBackups?: Record<string, SheetBackup>;
};

export type SheetTab = { id: string; name: string; kind: SheetKind };

/** Свободный лист на экране: клетки, размер и посчитанные значения. */
export type FreeSheetData = {
  rows: number;
  cols: number;
  cells: Array<{ r: number; c: number; input: string; value: number | null; error: boolean }>;
};

export type WorkbookPage = {
  sheets: SheetTab[];
  sheet: SheetTab;
  budget: SheetPageData | null;
  free: FreeSheetData | null;
};

const FREE_ROWS = 30;
const FREE_COLS = 8;
const MAX_FREE_ROWS = 2000;
const MAX_FREE_COLS = 200;

type Body = Record<string, unknown>;

const DEFAULT_MAIN_NAME = "Бюджет";

function sheetName(value: unknown): string {
  const text = String(value ?? "")
    .trim()
    .slice(0, 60);
  if (!text) throw new Error("У листа должно быть название.");
  return text;
}

/** Листы по порядку. Главная таблица есть всегда — даже пустая. */
export function listSheets(state: BookState): SheetTab[] {
  const rows = state.sheets ?? [];
  const main = rows.find((row) => row.id === MAIN_SHEET);
  const ordered = [
    {
      id: MAIN_SHEET,
      name: main?.name ?? DEFAULT_MAIN_NAME,
      kind: "budget" as const,
      order: main?.order ?? 0
    },
    ...rows.filter((row) => row.id !== MAIN_SHEET)
  ].sort((a, b) => a.order - b.order);
  return ordered.map(({ id, name, kind }) => ({ id, name, kind }));
}

function findSheet(state: BookState, sheetId: string): SheetTab {
  const sheet = listSheets(state).find((item) => item.id === sheetId);
  if (!sheet) throw new Error("Такого листа нет — возможно, его удалили на другом устройстве.");
  return sheet;
}

const belongs = (sheetId: string, rowSheet: string | undefined) =>
  sheetId === MAIN_SHEET ? !rowSheet : rowSheet === sheetId;

const plainMonth = (id: string) => (id.includes("|") ? id.slice(id.indexOf("|") + 1) : id);

function withoutSheet<T extends { sheetId?: string }>(row: T): T {
  const { sheetId: _sheet, ...rest } = row;
  void _sheet;
  return rest as T;
}

/** Вырезать бюджетный лист из книги — в том виде, в каком его ждёт sheet.ts. */
export function sheetScope(state: BookState, sheetId: string): SheetState {
  const columns = (state.sheetColumns ?? []).filter((column) =>
    belongs(sheetId, (column as SheetColumn & { sheetId?: string }).sheetId)
  );
  const ids = new Set(columns.map((column) => column.id));
  return {
    sheetColumns: columns.map((column) =>
      withoutSheet(column as Stamped<SheetColumn> & { sheetId?: string })
    ),
    sheetCells: (state.sheetCells ?? []).filter((cell) => ids.has(cell.columnId)),
    sheetMonths: (state.sheetMonths ?? [])
      .filter((row) => belongs(sheetId, (row as { sheetId?: string }).sheetId))
      .map((row) => ({
        ...withoutSheet(row as Stamped<{ id: string }> & { sheetId?: string }),
        id: plainMonth(row.id)
      })),
    sheetTargets: (state.sheetTargets ?? [])
      .filter((row) => belongs(sheetId, (row as SheetTarget & { sheetId?: string }).sheetId))
      .map((row) => withoutSheet(row as Stamped<SheetTarget> & { sheetId?: string })),
    sheetBackup:
      sheetId === MAIN_SHEET ? (state.sheetBackup ?? null) : (state.sheetBackups?.[sheetId] ?? null)
  };
}

/** Вставить лист обратно на место его прежних строк. */
export function putScope(state: BookState, sheetId: string, scoped: SheetState): void {
  const main = sheetId === MAIN_SHEET;
  const mark = <T extends object>(row: T): T => (main ? row : ({ ...row, sheetId } as T));

  const before = sheetScope(state, sheetId);
  const oldColumns = new Set((before.sheetColumns ?? []).map((column) => column.id));

  state.sheetColumns = [
    ...(state.sheetColumns ?? []).filter((column) => !oldColumns.has(column.id)),
    ...(scoped.sheetColumns ?? []).map(mark)
  ];
  const newColumns = new Set((scoped.sheetColumns ?? []).map((column) => column.id));
  state.sheetCells = [
    ...(state.sheetCells ?? []).filter(
      (cell) => !oldColumns.has(cell.columnId) && !newColumns.has(cell.columnId)
    ),
    ...(scoped.sheetCells ?? [])
  ] as Array<Stamped<SheetCellRow>>;
  state.sheetMonths = [
    ...(state.sheetMonths ?? []).filter(
      (row) => !belongs(sheetId, (row as { sheetId?: string }).sheetId)
    ),
    ...(scoped.sheetMonths ?? []).map((row) =>
      main ? row : { ...row, id: `${sheetId}|${row.id}`, sheetId }
    )
  ];
  state.sheetTargets = [
    ...(state.sheetTargets ?? []).filter(
      (row) => !belongs(sheetId, (row as SheetTarget & { sheetId?: string }).sheetId)
    ),
    ...(scoped.sheetTargets ?? []).map(mark)
  ];
  if (main) {
    state.sheetBackup = scoped.sheetBackup ?? null;
  } else {
    const backups = { ...(state.sheetBackups ?? {}) };
    if (scoped.sheetBackup) backups[sheetId] = scoped.sheetBackup;
    else delete backups[sheetId];
    state.sheetBackups = backups;
  }
}

/** Свободный лист: клетки и посчитанное. */
export function readFree(state: BookState, sheetId: string): FreeSheetData {
  const row = (state.sheets ?? []).find((item) => item.id === sheetId);
  const cells = (state.freeCells ?? []).filter((cell) => cell.sheetId === sheetId);
  const rows = Math.max(row?.rows ?? FREE_ROWS, ...cells.map((cell) => cell.r + 1), 1);
  const cols = Math.max(row?.cols ?? FREE_COLS, ...cells.map((cell) => cell.c + 1), 1);
  return {
    rows,
    cols,
    cells: cells
      .map((cell) => {
        const shown = freeValue(cell.input);
        return { r: cell.r, c: cell.c, input: cell.input, value: shown.value, error: shown.error };
      })
      .sort((a, b) => a.r - b.r || a.c - b.c)
  };
}

/**
 * Что показать в клетке свободного листа. Число и формула (`=СУММ(…)`,
 * `1200*3`) — числом; всё прочее — текстом как есть. Ошибка — только у того,
 * что явно задумано формулой (начинается с «=») и не считается.
 */
export function freeValue(input: string): { value: number | null; error: boolean } {
  const text = input.trim();
  if (!text) return { value: null, error: false };
  const looksLikeMath = /^[=+\-]?[\d\s.,()+\-*/%=;А-Яа-яA-Za-z]*$/.test(text) && /\d/.test(text);
  if (!text.startsWith("=") && !looksLikeMath) return { value: null, error: false };
  const result = evaluate(text);
  if (!result) return { value: null, error: false };
  if (result.ok) return { value: result.value, error: false };
  return { value: null, error: text.startsWith("=") };
}

function makeSheetId(state: BookState, makeId: () => string): string {
  const taken = new Set((state.sheets ?? []).map((row) => row.id));
  let candidate =
    makeId()
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 40) || "sheet";
  while (taken.has(candidate) || candidate === MAIN_SHEET) candidate = `${candidate}x`;
  return candidate;
}

function nextOrder(state: BookState): number {
  const orders = listSheets(state).map((_, index) => index);
  return (orders.length + 1) * 10;
}

/** Новый лист в конце. */
export function createSheet(
  state: BookState,
  input: { name: unknown; kind: unknown; rows?: number; cols?: number },
  makeId: () => string
): SheetTab {
  const kind: SheetKind = input.kind === "free" ? "free" : "budget";
  const row: SheetRow = {
    id: makeSheetId(state, makeId),
    name: sheetName(input.name),
    kind,
    order: nextOrder(state)
  };
  if (kind === "free") {
    row.rows = Math.min(MAX_FREE_ROWS, Math.max(1, input.rows ?? FREE_ROWS));
    row.cols = Math.min(MAX_FREE_COLS, Math.max(1, input.cols ?? FREE_COLS));
  }
  ensureOrders(state);
  state.sheets = [...(state.sheets ?? []), row];
  return { id: row.id, name: row.name, kind: row.kind };
}

/**
 * Порядок листов записан у каждого листа. У главной строки листа может не
 * быть — тогда её заводим, как только порядок или имя впервые понадобились.
 */
function ensureOrders(state: BookState) {
  const rows = state.sheets ?? [];
  if (!rows.some((row) => row.id === MAIN_SHEET)) {
    state.sheets = [{ id: MAIN_SHEET, name: DEFAULT_MAIN_NAME, kind: "budget", order: 0 }, ...rows];
  }
}

function setFreeCells(state: BookState, sheetId: string, cells: Body[]) {
  const byId = new Map((state.freeCells ?? []).map((cell) => [cell.id, cell]));
  const row = (state.sheets ?? []).find((item) => item.id === sheetId);
  let rows = row?.rows ?? FREE_ROWS;
  let cols = row?.cols ?? FREE_COLS;
  for (const raw of cells) {
    const r = Math.trunc(Number(raw.r));
    const c = Math.trunc(Number(raw.c));
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
    if (r < 0 || c < 0 || r >= MAX_FREE_ROWS || c >= MAX_FREE_COLS) continue;
    const input = String(raw.input ?? "").slice(0, 500);
    const id = `${sheetId}|${r}|${c}`;
    if (input.trim()) byId.set(id, { id, sheetId, r, c, input });
    else byId.delete(id);
    rows = Math.max(rows, r + 1);
    cols = Math.max(cols, c + 1);
  }
  state.freeCells = Array.from(byId.values());
  if (row && (row.rows !== rows || row.cols !== cols)) {
    state.sheets = (state.sheets ?? []).map((item) =>
      item.id === sheetId ? { ...item, rows, cols } : item
    );
  }
}

/** Убрать строку или столбец свободного листа — остальные сдвигаются. */
function removeFreeLine(state: BookState, sheetId: string, axis: "r" | "c", index: number) {
  const other = (state.freeCells ?? []).filter((cell) => cell.sheetId !== sheetId);
  const mine = (state.freeCells ?? [])
    .filter((cell) => cell.sheetId === sheetId && cell[axis] !== index)
    .map((cell) => {
      if (cell[axis] < index) return cell;
      const moved = { ...cell, [axis]: cell[axis] - 1 };
      return { ...moved, id: `${sheetId}|${moved.r}|${moved.c}` };
    });
  state.freeCells = [...other, ...mine];
  state.sheets = (state.sheets ?? []).map((item) => {
    if (item.id !== sheetId) return item;
    const key = axis === "r" ? "rows" : "cols";
    const size = item[key] ?? (axis === "r" ? FREE_ROWS : FREE_COLS);
    return { ...item, [key]: Math.max(1, size - 1) };
  });
}

/** Страница листа: вкладки и сам лист. */
export function readWorkbook(state: BookState, sheetId: string | null): WorkbookPage {
  const sheets = listSheets(state);
  const sheet = sheets.find((item) => item.id === sheetId) ?? sheets[0];
  return {
    sheets,
    sheet,
    budget: sheet.kind === "budget" ? readSheet(sheetScope(state, sheet.id)) : null,
    free: sheet.kind === "free" ? readFree(state, sheet.id) : null
  };
}

/** Лист, к которому обращена правка: `sheetId` в теле, без него — главный. */
function targetSheet(body: Body): string {
  return body.sheetId ? String(body.sheetId) : MAIN_SHEET;
}

/**
 * Дело бюджетного листа — на его срезе книги. Свободному листу оно не по
 * адресу.
 */
function onBudgetSheet<Result>(
  run: (state: SheetState, body: Body, makeId: () => string) => Result
) {
  return (state: BookState, body: Body, makeId: () => string): Result => {
    const sheetId = targetSheet(body);
    if (findSheet(state, sheetId).kind === "free")
      throw new Error("Это действие — для бюджетного листа.");
    const scoped = sheetScope(state, sheetId);
    const result = run(scoped, body, makeId);
    putScope(state, sheetId, scoped);
    return result;
  };
}

/** Дело свободного листа. Бюджетному оно незнакомо. */
function onFreeSheet<Result>(run: (state: BookState, sheetId: string, body: Body) => Result) {
  return (state: BookState, body: Body): Result => {
    const sheetId = targetSheet(body);
    if (findSheet(state, sheetId).kind !== "free")
      throw new Error(`Неизвестное действие с таблицей: ${String(body.action ?? "")}`);
    return run(state, sheetId, body);
  };
}

type WorkbookAction = (state: BookState, body: Body, makeId: () => string) => unknown;

/**
 * Правка листа — по полю `action` в теле. Бюджетные действия идут через окно,
 * свободные — здесь.
 */
export const WORKBOOK_ACTIONS = {
  setFree: onFreeSheet((state, sheetId, body) => {
    setFreeCells(state, sheetId, Array.isArray(body.cells) ? (body.cells as Body[]) : []);
    return readFree(state, sheetId);
  }),
  resizeFree: onFreeSheet((state, sheetId, body) => {
    const rows = Math.min(MAX_FREE_ROWS, Math.max(1, Math.trunc(Number(body.rows) || 0)));
    const cols = Math.min(MAX_FREE_COLS, Math.max(1, Math.trunc(Number(body.cols) || 0)));
    state.sheets = (state.sheets ?? []).map((item) =>
      item.id === sheetId ? { ...item, rows, cols } : item
    );
    return readFree(state, sheetId);
  }),
  removeFreeRow: onFreeSheet((state, sheetId, body) => {
    removeFreeLine(state, sheetId, "r", Math.trunc(Number(body.index)));
    return readFree(state, sheetId);
  }),
  removeFreeCol: onFreeSheet((state, sheetId, body) => {
    removeFreeLine(state, sheetId, "c", Math.trunc(Number(body.index)));
    return readFree(state, sheetId);
  }),
  start: onBudgetSheet(SHEET_ACTIONS.start),
  setCells: onBudgetSheet(SHEET_ACTIONS.setCells),
  addColumn: onBudgetSheet(SHEET_ACTIONS.addColumn),
  updateColumn: onBudgetSheet(SHEET_ACTIONS.updateColumn),
  moveColumn: onBudgetSheet(SHEET_ACTIONS.moveColumn),
  removeColumn: onBudgetSheet(SHEET_ACTIONS.removeColumn),
  addMonth: onBudgetSheet(SHEET_ACTIONS.addMonth),
  removeMonth: onBudgetSheet(SHEET_ACTIONS.removeMonth),
  setTarget: onBudgetSheet(SHEET_ACTIONS.setTarget),
  removeTarget: onBudgetSheet(SHEET_ACTIONS.removeTarget),
  undoImport: onBudgetSheet(SHEET_ACTIONS.undoImport)
} satisfies Record<keyof typeof SHEET_ACTIONS, WorkbookAction> & Record<string, WorkbookAction>;

/** Действие, которого нет ни у одного листа, — та же ошибка, что и прежде. */
export function unknownWorkbookAction(state: BookState, body: Body): never {
  if (findSheet(state, targetSheet(body)).kind === "free")
    throw new Error("Это действие — для бюджетного листа.");
  throw new Error(`Неизвестное действие с таблицей: ${String(body.action ?? "")}`);
}

/** Перенос из Excel в бюджетный лист — через то же окно. */
export function importIntoSheet(
  state: BookState,
  sheetId: string,
  payload: SheetImport,
  makeId: () => string,
  now: string
): SheetPageData {
  const scoped = sheetScope(state, sheetId);
  const result = importSheet(scoped, payload, makeId, now);
  putScope(state, sheetId, scoped);
  return result;
}

/** Действия с самими листами: завести, переименовать, сдвинуть, удалить. */
/** Дела с листами книги — по полю `action` в теле. */
export const SHEETS_ACTIONS = {
  create: (state: BookState, body: Body, makeId: () => string) => {
    return createSheet(state, { name: body.name, kind: body.kind }, makeId);
  },

  rename: (state: BookState, body: Body) => {
    const id = String(body.id ?? "");
    findSheet(state, id);
    ensureOrders(state);
    const name = sheetName(body.name);
    state.sheets = (state.sheets ?? []).map((row) => (row.id === id ? { ...row, name } : row));
    return { saved: true };
  },

  move: (state: BookState, body: Body) => {
    ensureOrders(state);
    const ordered = [...(state.sheets ?? [])].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((row) => row.id === body.id);
    const target = index + (Number(body.direction) < 0 ? -1 : 1);
    if (index < 0 || target < 0 || target >= ordered.length) return { saved: false };
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    state.sheets = ordered.map((row, position) =>
      row.order === position * 10 ? row : { ...row, order: position * 10 }
    );
    return { saved: true };
  },

  remove: (state: BookState, body: Body) => {
    const id = String(body.id ?? "");
    if (id === MAIN_SHEET) throw new Error("Главную таблицу удалить нельзя — её можно очистить.");
    findSheet(state, id);
    // Всё, что принадлежит листу, уходит вместе с ним; корзина (lib/trash)
    // соберёт это в одну запись «лист», чтобы вернуть целиком.
    putScope(state, id, {
      sheetColumns: [],
      sheetCells: [],
      sheetMonths: [],
      sheetTargets: [],
      sheetBackup: null
    });
    state.freeCells = (state.freeCells ?? []).filter((cell) => cell.sheetId !== id);
    state.sheets = (state.sheets ?? []).filter((row) => row.id !== id);
    const backups = { ...(state.sheetBackups ?? {}) };
    delete backups[id];
    state.sheetBackups = backups;
    return { removed: true };
  }
};

/** Действие с листами, которого нет. */
export function unknownSheetsAction(body: Body): never {
  throw new Error(`Неизвестное действие с листами: ${String(body.action ?? "")}`);
}

/** Лист из Excel для переноса книги целиком. */
export type WorkbookImportSheet =
  | { name: string; kind: "budget"; payload: SheetImport }
  | { name: string; kind: "free"; grid: string[][] };

/**
 * Перенести книгу Excel целиком: каждый лист — своим листом. Если главная
 * таблица пуста, первый бюджетный лист ложится в неё — иначе у человека стало
 * бы два «бюджета», один из них пустой.
 */
export function importWorkbook(
  state: BookState,
  sheets: WorkbookImportSheet[],
  makeId: () => string,
  now: string
): { created: SheetTab[] } {
  const created: SheetTab[] = [];
  const mainEmpty = (sheetScope(state, MAIN_SHEET).sheetColumns ?? []).length === 0;
  let usedMain = false;
  for (const item of sheets) {
    if (item.kind === "budget") {
      if (mainEmpty && !usedMain) {
        usedMain = true;
        importIntoSheet(state, MAIN_SHEET, item.payload, makeId, now);
        ensureOrders(state);
        state.sheets = (state.sheets ?? []).map((row) =>
          row.id === MAIN_SHEET ? { ...row, name: sheetName(item.name) } : row
        );
        created.push({ id: MAIN_SHEET, name: sheetName(item.name), kind: "budget" });
        continue;
      }
      const tab = createSheet(state, { name: item.name, kind: "budget" }, makeId);
      importIntoSheet(state, tab.id, item.payload, makeId, now);
      created.push(tab);
    } else {
      const rows = Math.max(item.grid.length, 1);
      const cols = Math.max(...item.grid.map((line) => line.length), 1);
      const tab = createSheet(state, { name: item.name, kind: "free", rows, cols }, makeId);
      const cells: Body[] = [];
      item.grid.forEach((line, r) =>
        line.forEach((input, c) => {
          if (String(input ?? "").trim()) cells.push({ r, c, input: String(input) });
        })
      );
      setFreeCells(state, tab.id, cells);
      created.push(tab);
    }
  }
  return { created };
}

/** Буква столбца, как в Excel: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
