// Перенос таблицы бюджета из Excel.
//
// Главное — чтобы человеку не пришлось ничего набирать заново. Он выделяет в
// Excel всю таблицу вместе с шапкой, копирует и вставляет (или даёт файл), а
// здесь угадывается всё, что можно угадать:
//
//   * где шапка — строка со словом «Месяц»;
//   * месяц каждой строки — «01.08.2026», «08.2026», «2026-08», «авг 2026»;
//   * что за столбец — по названию: «Остаток», «Доходы», «Итог», «Возврат на
//     вклад» (в сбережения), остальное — расходы;
//   * какая это категория учёта — по имени; нет такой — предлагается создать;
//   * «Подушка 31.08.2026 | 49653» над шапкой — сбережения на эту дату, а
//     дата за пределами таблицы — цель.
//
// И сверяется: Итог, который посчитает приложение, с Итогом из файла. Сошлось
// во всех месяцах — значит, столбцы поняты правильно; нет — видно где.

import Papa from "papaparse";

import { evaluate } from "@/lib/sheet/formula";
import { computeSheet, type SheetColumn, type SheetColumnKind } from "@/lib/sheet/model";

export type Grid = string[][];

/** Роль столбца в переносе: вид столбца таблицы, месяц, Итог для сверки или «не нужен». */
export type ImportRole = SheetColumnKind | "month" | "total" | "skip";

export type ImportColumn = {
  /** Номер столбца в файле. */
  index: number;
  name: string;
  role: ImportRole;
  categoryId: string | null;
  /** Категории нет — создать при переносе (доход или расход). */
  createCategory: "INCOME" | "EXPENSE" | null;
};

export type ImportRow = { month: string; cells: string[] };

export type ImportMarker = { label: string; date: string; amount: number };

export type ImportPlan = {
  columns: ImportColumn[];
  rows: ImportRow[];
  /** «Подушка 31.08.2026 = 49 653» и подобное над шапкой. */
  markers: ImportMarker[];
  warnings: string[];
};

export type CategoryRef = { id: string; label: string; kind: "INCOME" | "EXPENSE" };

/** Текст из буфера обмена или CSV-файла → клетки. Разделитель угадывается. */
export function gridFromText(text: string): Grid {
  const clean = text.replace(/^﻿/, "");
  const delimiter = clean.includes("\t") ? "\t" : clean.includes(";") ? ";" : ",";
  const parsed = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: false });
  return parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim()));
}

/** Клетки из xlsx (read-excel-file): даты и числа — в текст, как их видно в Excel. */
export function gridFromCells(rows: unknown[][]): Grid {
  return rows.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date) {
        const day = String(cell.getUTCDate()).padStart(2, "0");
        const month = String(cell.getUTCMonth() + 1).padStart(2, "0");
        return `${day}.${month}.${cell.getUTCFullYear()}`;
      }
      return String(cell).trim();
    })
  );
}

const MONTH_NAMES: Record<string, number> = {
  янв: 1,
  фев: 2,
  мар: 3,
  апр: 4,
  май: 5,
  мая: 5,
  июн: 6,
  июл: 7,
  авг: 8,
  сен: 9,
  окт: 10,
  ноя: 11,
  дек: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Месяц строки: «01.08.2026», «08.2026», «2026-08», «авг 2026», «Август 26». */
export function parseMonth(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  let match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(text);
  if (match) return `${match[3]}-${pad(Number(match[2]))}`;
  match = /^(\d{4})[./-](\d{1,2})/.exec(text);
  if (match) return `${match[1]}-${pad(Number(match[2]))}`;
  match = /^(\d{1,2})[./](\d{4})$/.exec(text);
  if (match) return `${match[2]}-${pad(Number(match[1]))}`;
  match = /^([a-zа-яё]+)\.?\s*[’']?(\d{2,4})/.exec(text);
  if (match) {
    const index = MONTH_NAMES[match[1].slice(0, 3)];
    if (!index) return null;
    const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
    return `${year}-${pad(index)}`;
  }
  // Excel иногда отдаёт дату числом дней с 1900 года.
  if (/^\d{5}$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86_400_000);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
  }
  return null;
}

/** Число из клетки: «12 396», «12 396,00 ₽», «-500». Пусто или не число — null. */
export function parseAmount(raw: string): number | null {
  const text = raw.replace(/[\s ₽руб.]+$/giu, "").replace(/[\s ]/g, "");
  if (!text) return null;
  const normalized = text.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function dateOf(raw: string): string | null {
  const match = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(raw);
  if (!match) return null;
  return `${match[3]}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Роль столбца по названию. */
export function guessRole(name: string): ImportRole {
  const text = normalize(name);
  if (!text) return "skip";
  if (/^(месяц|дата|month|период)/.test(text)) return "month";
  if (/^(итог|итого|остаток на конец|на конец|total)/.test(text)) return "total";
  if (/^(остаток|на начало|начало|opening)/.test(text)) return "opening";
  if (/(комментар|коммент|заметк|примечан|пометк|описан|note|comment|memo)/.test(text))
    return "note";
  if (/(снят|с вклада|из сбереж|из подушк)/.test(text)) return "fromSavings";
  if (/(процент.*вклад|вклад.*процент|кешбэк на остаток)/.test(text)) return "savingsIncome";
  if (/(вклад|сбереж|подушк|накоп|копилк|отложить|инвест)/.test(text)) return "toSavings";
  if (/(доход|зарплат|^зп|аванс|премия|income|salary)/.test(text)) return "income";
  return "expense";
}

/** В столбце в основном слова, а не суммы: больше половины непустых клеток не числа. */
function mostlyText(values: readonly string[]): boolean {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  if (filled.length === 0) return false;
  const words = filled.filter((value) => {
    const result = evaluate(value);
    return !result || !result.ok;
  });
  return words.length * 2 > filled.length;
}

/** Категория учёта по имени столбца: точное совпадение, потом по началу слов. */
export function matchCategory(
  name: string,
  kind: "INCOME" | "EXPENSE",
  categories: readonly CategoryRef[]
): string | null {
  const target = normalize(name);
  const own = categories.filter((category) => category.kind === kind);
  const exact = own.find((category) => normalize(category.label) === target);
  if (exact) return exact.id;
  const stem = (text: string) => normalize(text).split(" ")[0]?.slice(0, 5) ?? "";
  const head = stem(name);
  if (head.length < 4) return null;
  return own.find((category) => stem(category.label) === head)?.id ?? null;
}

/** Разобрать клетки в план переноса: шапка, роли, месяцы, «Подушка …» сверху. */
export function planImport(grid: Grid, categories: readonly CategoryRef[]): ImportPlan {
  const warnings: string[] = [];
  let header = grid.findIndex((row) => row.some((cell) => guessRole(cell) === "month"));
  if (header < 0) {
    // Шапки со словом «Месяц» нет — шапка та строка, под которой начинаются даты.
    header = grid.findIndex((row, index) => {
      const next = grid[index + 1];
      return row.some(Boolean) && next && next.some((cell) => parseMonth(cell) !== null);
    });
  }
  if (header < 0) {
    return {
      columns: [],
      rows: [],
      markers: [],
      warnings: ["Не нашлось строки с месяцами. Скопируйте таблицу вместе с шапкой."]
    };
  }

  const names = grid[header];
  let monthIndex = names.findIndex((cell) => guessRole(cell) === "month");
  if (monthIndex < 0) monthIndex = 0;

  const rows: ImportRow[] = [];
  for (const row of grid.slice(header + 1)) {
    const month = parseMonth(row[monthIndex] ?? "");
    if (!month) continue;
    if (rows.some((item) => item.month === month)) {
      warnings.push(`Месяц ${month} встречается дважды — взята первая строка.`);
      continue;
    }
    rows.push({ month, cells: row });
  }

  const width = Math.max(...grid.slice(header).map((row) => row.length));
  const columns: ImportColumn[] = [];
  for (let index = 0; index < width; index += 1) {
    const name = (names[index] ?? "").trim();
    let role: ImportRole = index === monthIndex ? "month" : guessRole(name);
    const empty = rows.every((row) => !(row.cells[index] ?? "").trim());
    // Столбец с неизвестным названием, где сплошной текст, — заметки, а не
    // расход: иначе каждая строка превратилась бы в ошибку формулы.
    if (role === "expense" && mostlyText(rows.map((row) => row.cells[index] ?? ""))) role = "note";
    if (!name && empty) continue;
    if (!name) role = "skip";
    const categoryKind = role === "income" ? "INCOME" : role === "expense" ? "EXPENSE" : null;
    const categoryId = categoryKind ? matchCategory(name, categoryKind, categories) : null;
    // «Доходы» — сумма всех доходов, а не статья: заводить под неё категорию
    // незачем (а «Зарплата» или «Подработка» — пожалуйста).
    const generic = role === "income" && /^доход/.test(normalize(name));
    columns.push({
      index,
      name: name || `Столбец ${index + 1}`,
      role,
      categoryId,
      createCategory: categoryKind && !categoryId && !generic ? categoryKind : null
    });
  }

  // Над шапкой: «Подушка 31.08.2026 | 49653». Дата — в тексте, сумма — в
  // следующей непустой клетке.
  const markers: ImportMarker[] = [];
  for (const row of grid.slice(0, header)) {
    row.forEach((cell, index) => {
      const date = dateOf(cell);
      if (!date) return;
      const next = row.slice(index + 1).find((value) => value.trim());
      const amount = next ? parseAmount(next) : null;
      if (amount === null) return;
      const label = cell.replace(/(\d{1,2})[./](\d{1,2})[./](\d{4})/, "").trim() || "Цель";
      markers.push({ label, date, amount });
    });
  }

  if (rows.length === 0) warnings.push("Под шапкой не нашлось ни одного месяца.");
  return { columns, rows, markers, warnings };
}

/** Что уйдёт в книгу: столбцы с категориями, ячейки и цели. */
export type ImportPayload = {
  columns: Array<{
    key: string;
    name: string;
    kind: SheetColumnKind;
    categoryId: string | null;
    createCategory?: "INCOME" | "EXPENSE";
  }>;
  rows: Array<{ month: string; values: Record<string, string> }>;
  targets: Array<{ label: string; date: string; amount: number }>;
};

const SAVINGS_OPENING_KEY = "__savings_opening__";

/**
 * Собрать перенос.
 *
 * Остаток пишется только там, где он не следует из прошлого Итога, — обычно
 * в первой строке. Иначе таблица, где Остаток вписан числом в каждой строке,
 * перестала бы пересчитываться при правке, и правка в сентябре не доходила бы
 * до декабря. Там, где в Excel Остаток поправлен руками, он переносится.
 */
export function buildPayload(plan: ImportPlan): ImportPayload {
  const kept = plan.columns.filter(
    (column) => column.role !== "month" && column.role !== "total" && column.role !== "skip"
  );
  const columns: ImportPayload["columns"] = kept.map((column) => ({
    key: String(column.index),
    name: column.name,
    kind: column.role as SheetColumnKind,
    categoryId: column.categoryId,
    ...(column.createCategory && !column.categoryId
      ? { createCategory: column.createCategory }
      : {})
  }));

  const firstMonth = plan.rows[0]?.month ?? "";
  const lastMonth = plan.rows[plan.rows.length - 1]?.month ?? "";
  const savingsAt = plan.markers.filter(
    (marker) => marker.date.slice(0, 7) >= firstMonth && marker.date.slice(0, 7) <= lastMonth
  );
  const targets = plan.markers.filter((marker) => !savingsAt.includes(marker));
  const hasSavingsOpening = columns.some((column) => column.kind === "savingsOpening");
  if (!hasSavingsOpening) {
    columns.push({
      key: SAVINGS_OPENING_KEY,
      name: savingsAt[0]?.label || "Подушка на начало",
      kind: "savingsOpening",
      categoryId: null
    });
  }

  const rows: ImportPayload["rows"] = plan.rows.map((row) => {
    const values: Record<string, string> = {};
    for (const column of kept) {
      const raw = (row.cells[column.index] ?? "").trim();
      if (!raw) continue;
      const amount = parseAmount(raw);
      values[String(column.index)] = amount === null ? raw : String(amount);
    }
    return { month: row.month, values };
  });

  // Остаток — только там, где он не равен посчитанному из прошлого Итога.
  const openingKeys = columns.filter((column) => column.kind === "opening").map((c) => c.key);
  for (let index = 1; index < rows.length; index += 1) {
    const computed = computeSheet(toSheet(columns, rows.slice(0, index + 1)));
    const expected = computed.rows[index - 1]?.total ?? 0;
    for (const key of openingKeys) {
      const value = parseAmount(rows[index].values[key] ?? "");
      if (value !== null && Math.abs(value - expected) < 0.5) delete rows[index].values[key];
    }
  }

  // Сбережения на дату: подушка на конец того месяца = отметке. Начало месяца
  // — это отметка минус то, что в этом месяце в сбережения ушло.
  for (const marker of savingsAt.slice(0, 1)) {
    const monthKey = marker.date.slice(0, 7);
    const index = rows.findIndex((row) => row.month === monthKey);
    if (index < 0) continue;
    const computed = computeSheet(toSheet(columns, rows.slice(0, index + 1)));
    const row = computed.rows[index];
    const movement = row.toSavings + row.savingsIncome - row.fromSavings;
    const key = hasSavingsOpening
      ? columns.find((column) => column.kind === "savingsOpening")!.key
      : SAVINGS_OPENING_KEY;
    rows[index].values[key] = String(Math.round((marker.amount - movement) * 100) / 100);
  }

  return { columns, rows, targets };
}

function toSheet(columns: ImportPayload["columns"], rows: ImportPayload["rows"]) {
  const sheetColumns: SheetColumn[] = columns.map((column, order) => ({
    id: column.key,
    name: column.name,
    kind: column.kind,
    order
  }));
  return {
    columns: sheetColumns,
    months: rows.map((row) => row.month),
    cells: rows.flatMap((row) =>
      Object.entries(row.values).map(([columnId, input]) => ({
        month: row.month,
        columnId,
        input
      }))
    )
  };
}

/** Сверка с Итогом из файла: сколько месяцев сошлось и где нет. */
export function checkTotals(plan: ImportPlan, payload: ImportPayload) {
  const totalColumn = plan.columns.find((column) => column.role === "total");
  if (!totalColumn) return { checked: 0, matched: 0, mismatched: [] as MismatchedTotal[] };
  const computed = computeSheet(toSheet(payload.columns, payload.rows));
  const mismatched: MismatchedTotal[] = [];
  let checked = 0;
  plan.rows.forEach((row, index) => {
    const file = parseAmount(row.cells[totalColumn.index] ?? "");
    if (file === null) return;
    checked += 1;
    const ours = computed.rows[index]?.total ?? 0;
    if (Math.abs(ours - file) >= 1) mismatched.push({ month: row.month, file, ours });
  });
  return { checked, matched: checked - mismatched.length, mismatched };
}

export type MismatchedTotal = { month: string; file: number; ours: number };
