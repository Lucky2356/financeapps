// Таблица бюджета — своя, как у человека в Excel, и отдельная от план/факта.
//
// Строки — месяцы, столбцы — статьи. Ячейку человек заполняет сам (числом
// или формулой). Две вещи таблица считает сама, как считали формулы в его
// Excel:
//
//   Итог     = Остаток + доходы − расходы − в сбережения + из сбережений
//   Остаток  = Итог прошлого месяца (если не вписан руками — как первая строка)
//
// И то же отдельно для сбережений: «Подушка на начало» → «Итог сбережений».
// Основные деньги и сбережения разведены, как в план/факте: перевод «в
// сбережения» уменьшает основной Итог и увеличивает подушку.

import { evaluate } from "@/lib/sheet/formula";

export const SHEET_COLUMN_KINDS = [
  "opening",
  "income",
  "expense",
  "toSavings",
  "fromSavings",
  "savingsOpening",
  "savingsIncome"
] as const;

export type SheetColumnKind = (typeof SHEET_COLUMN_KINDS)[number];

/** Какие столбцы в каком разделе стоят. */
export const SAVINGS_KINDS: readonly SheetColumnKind[] = [
  "savingsOpening",
  "toSavings",
  "savingsIncome",
  "fromSavings"
];

export type SheetColumn = {
  id: string;
  name: string;
  kind: SheetColumnKind;
  /** Категория учёта — по ней «Продукты» открывают операции. */
  categoryId?: string | null;
  order: number;
  hidden?: boolean;
};

export type SheetCell = { month: string; columnId: string; input: string };

export type SheetTarget = { id: string; label: string; date: string; amount: number };

export type ComputedCell = {
  /** Что набрано (формула или число); пусто — ячейку не заполняли. */
  input: string;
  value: number | null;
  error?: string;
  /** Посчитано таблицей, а не вписано: Остаток из прошлого Итога. */
  auto?: boolean;
};

export type ComputedRow = {
  month: string;
  cells: Record<string, ComputedCell>;
  opening: number;
  income: number;
  expense: number;
  toSavings: number;
  fromSavings: number;
  /** Итог основных денег на конец месяца. */
  total: number;
  savingsOpening: number;
  savingsIncome: number;
  savingsTotal: number;
};

export type ColumnTotals = Record<string, { sum: number; average: number; filled: number }>;

export type ComputedSheet = {
  rows: ComputedRow[];
  totals: ColumnTotals;
};

export const cellKey = (month: string, columnId: string) => `${month}|${columnId}`;

const round = (value: number) => Math.round(value * 100) / 100;

/** Столбцы в порядке показа. */
export function orderedColumns(columns: readonly SheetColumn[]): SheetColumn[] {
  return [...columns].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function isSavingsKind(kind: SheetColumnKind): boolean {
  return SAVINGS_KINDS.includes(kind);
}

/** «2026-08» → «2026-09». */
export function nextMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function computeSheet(input: {
  columns: readonly SheetColumn[];
  cells: readonly SheetCell[];
  months: readonly string[];
}): ComputedSheet {
  const columns = orderedColumns(input.columns);
  const byKey = new Map(input.cells.map((cell) => [cellKey(cell.month, cell.columnId), cell]));
  const months = [...new Set(input.months)].sort();

  const rows: ComputedRow[] = [];
  let previousTotal: number | null = null;
  let previousSavings: number | null = null;

  for (const month of months) {
    const cells: Record<string, ComputedCell> = {};
    const sums = {
      income: 0,
      expense: 0,
      toSavings: 0,
      fromSavings: 0,
      savingsIncome: 0
    };
    let opening: number | null = null;
    let savingsOpening: number | null = null;
    let openingColumn: string | null = null;
    let savingsOpeningColumn: string | null = null;

    for (const column of columns) {
      const cell = byKey.get(cellKey(month, column.id));
      const raw = cell?.input ?? "";
      const result = evaluate(raw);
      const computed: ComputedCell = {
        input: raw,
        value: result && result.ok ? result.value : null,
        ...(result && !result.ok ? { error: result.error } : {})
      };
      cells[column.id] = computed;
      const value = computed.value ?? 0;
      switch (column.kind) {
        case "opening":
          openingColumn = column.id;
          if (computed.value !== null) opening = (opening ?? 0) + computed.value;
          break;
        case "savingsOpening":
          savingsOpeningColumn = column.id;
          if (computed.value !== null) savingsOpening = (savingsOpening ?? 0) + computed.value;
          break;
        default:
          sums[column.kind] += value;
      }
    }

    // Остаток не вписан — берётся Итог прошлого месяца, как формула «=Итог»
    // в Excel. Первая строка без Остатка начинается с нуля.
    const openingValue = opening ?? previousTotal ?? 0;
    if (opening === null && openingColumn) {
      cells[openingColumn] = { input: "", value: openingValue, auto: true };
    }
    const savingsOpeningValue = savingsOpening ?? previousSavings ?? 0;
    if (savingsOpening === null && savingsOpeningColumn) {
      cells[savingsOpeningColumn] = { input: "", value: savingsOpeningValue, auto: true };
    }

    const total = round(
      openingValue + sums.income - sums.expense - sums.toSavings + sums.fromSavings
    );
    const savingsTotal = round(
      savingsOpeningValue + sums.toSavings + sums.savingsIncome - sums.fromSavings
    );

    rows.push({
      month,
      cells,
      opening: round(openingValue),
      income: round(sums.income),
      expense: round(sums.expense),
      toSavings: round(sums.toSavings),
      fromSavings: round(sums.fromSavings),
      total,
      savingsOpening: round(savingsOpeningValue),
      savingsIncome: round(sums.savingsIncome),
      savingsTotal
    });
    previousTotal = total;
    previousSavings = savingsTotal;
  }

  const totals: ColumnTotals = {};
  for (const column of columns) {
    let sum = 0;
    let filled = 0;
    for (const row of rows) {
      const cell = row.cells[column.id];
      if (cell?.value === null || cell?.value === undefined || cell.auto) continue;
      sum += cell.value;
      filled += 1;
    }
    totals[column.id] = {
      sum: round(sum),
      average: filled ? round(sum / filled) : 0,
      filled
    };
  }

  return { rows, totals };
}

/** Столбцы новой таблицы: Остаток, Доходы — и подушка в сбережениях. */
export function starterColumns(makeId: () => string): SheetColumn[] {
  return [
    { id: makeId(), name: "Остаток", kind: "opening", order: 0 },
    { id: makeId(), name: "Доходы", kind: "income", order: 1 },
    { id: makeId(), name: "Подушка на начало", kind: "savingsOpening", order: 1000 }
  ];
}
