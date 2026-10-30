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

import { evaluate, roundHalfAway } from "@/lib/sheet/formula";
import { computeSheet, type SheetColumn, type SheetColumnKind } from "@/lib/sheet/model";
import { dataKeyOf, dataText, dataVariants, isDataLabel, labelKey } from "@/lib/i18n/data-text";
import { parseImportedAmount } from "@/services/import/CsvParsing";

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

/**
 * Разделитель CSV-файла — по первой непустой строке, и только вне кавычек.
 * Раньше хватало одной точки с запятой где угодно в файле: «"кофе; торт"» в
 * комментарии делал разделителем «;», и файл с запятыми разваливался.
 */
function guessDelimiter(text: string): "\t" | ";" | "," {
  const line = text.split(/\r?\n/).find((item) => item.trim()) ?? "";
  const counts = { "\t": 0, ";": 0, ",": 0 };
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  if (counts["\t"] > 0) return "\t";
  return counts[";"] >= counts[","] && counts[";"] > 0 ? ";" : ",";
}

/** Пустые строки и столбцы в конце: Excel дописывает перевод строки после блока. */
function trimGrid(grid: Grid): Grid {
  const rows = [...grid];
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === "")) rows.pop();
  // Циклом, а не Math.max(...): разворот в аргументы падал с RangeError на
  // вставке в пару сотен тысяч строк.
  let width = 0;
  for (const row of rows) {
    let end = row.length;
    while (end > 0 && row[end - 1] === "") end -= 1;
    if (end > width) width = end;
  }
  return rows.map((row) => row.slice(0, width));
}

/** CSV-файл → клетки. Разделитель угадывается. */
export function gridFromText(text: string): Grid {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = guessDelimiter(clean);
  const parsed = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: false });
  return parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim()));
}

/**
 * Вставка из буфера обмена → клетки. Excel и Google Таблицы разделяют клетки
 * табуляцией — и только ею: запятая в «1500,50» или в «молоко, хлеб» — часть
 * значения, а не граница клетки. Пустые строки в конце (Excel добавляет
 * перевод строки после блока) отбрасываются, в середине — остаются: пустая
 * клетка в скопированном столбце должна попасть в свой месяц, а не сдвинуть
 * всё, что ниже.
 */
export function gridFromClipboard(text: string): Grid {
  const clean = text.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(clean, { delimiter: "\t", skipEmptyLines: false });
  return trimGrid(parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim())));
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
  // Месяц — только 1–12: «15.13.2026» не месяц, а опечатка, и пропускать её
  // в таблицу значило бы завести строку «2026-13».
  const valid = (year: number, month: number) =>
    month >= 1 && month <= 12 ? `${year}-${pad(month)}` : null;
  let match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/.exec(text);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const first = Number(match[1]);
    const second = Number(match[2]);
    // «08/15/2026» — американский порядок: месяц впереди, день за ним.
    if (second > 12 && first <= 12) return valid(year, first);
    return valid(year, second);
  }
  match = /^(\d{4})[./-](\d{1,2})/.exec(text);
  if (match) return valid(Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})[./](\d{4})$/.exec(text);
  if (match) return valid(Number(match[2]), Number(match[1]));
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

/**
 * Число из клетки: «12 396», «12 396,00 ₽», «-500», «(500)», «12,345.67»,
 * «1.234,56», «4.440892098500626e-16». Пусто или не число — null.
 *
 * Скобки — бухгалтерский минус, разряды через точку или запятую, экспонента
 * (так Excel отдаёт остаток вроде 4e-16 после вычитаний). Раньше всё это
 * не считалось числом и уходило в таблицу как формула — с ошибкой, а «(500)»
 * формулой давало +500. Какой разделитель десятичный — решает тот же разбор,
 * что у выписок (parseImportedAmount); здесь только проверяется, что в клетке
 * нет ничего, кроме числа.
 */
const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)?$/;
/** «12,345.67», «1.234,56», «1.234.567» — разряды по три, дробь другим знаком. */
const GROUPED_NUMBER = /^-?\d{1,3}(?:(?:,\d{3})+(?:\.\d+)?|(?:\.\d{3})+(?:,\d+)?)$/;

export function parseAmount(raw: string): number | null {
  let text = raw.replace(/[\s ₽руб.]+$/giu, "").replace(/[\s  ]/g, "");
  if (!text) return null;
  const bracketed = /^\((.+)\)$/.exec(text);
  if (bracketed) text = bracketed[1];
  text = text.replace(/^[\u2212\u2013]/, "-");
  let value: number | null;
  if (/^-?\d+(?:\.\d+)?e[-+]?\d+$/i.test(text)) value = Number(text);
  else if (PLAIN_NUMBER.test(text) || GROUPED_NUMBER.test(text)) value = parseImportedAmount(text);
  else return null;
  if (value === null || !Number.isFinite(value)) return null;
  return bracketed ? -Math.abs(value) : value;
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

/**
 * Столбцы, которые заводит само приложение (lib/sheet/templates.ts, пустой
 * лист в lib/sheet/model.ts), — с тем видом, что у них в шаблоне. Своя же
 * таблица, выгруженная и загруженная обратно, иначе читалась по словам:
 * «Подушка на начало» — как «в сбережения», а английские «Balance»,
 * «Cushion at start», «Saving per month» — все как расходы.
 */
const TEMPLATE_ROLES: Record<string, SheetColumnKind> = {
  "data.sheet.col.opening": "opening",
  "data.sheet.col.income": "income",
  "data.sheet.col.cushionOpening": "savingsOpening",
  "data.sheet.col.toSavings": "toSavings",
  "data.sheet.col.salary": "income",
  "data.sheet.col.otherIncome": "income",
  "data.sheet.col.notes": "note",
  "data.sheet.col.depositInterest": "savingsIncome",
  "data.sheet.col.renovationSaved": "opening",
  "data.sheet.col.savePerMonth": "income",
  "data.sheet.col.done": "note",
  "data.sheet.col.vacationSaved": "opening"
};

/**
 * Написание (на любом языке) → вид. Собирается один раз: guessRole зовут на
 * каждую клетку при поиске шапки, и обход всего словаря на каждую клетку
 * большой вставки занимал бы секунды.
 */
let templateRoles: Map<string, SheetColumnKind> | null = null;

function templateRole(name: string): SheetColumnKind | undefined {
  if (!templateRoles) {
    templateRoles = new Map();
    for (const [key, kind] of Object.entries(TEMPLATE_ROLES)) {
      for (const variant of dataVariants(key)) templateRoles.set(labelKey(variant), kind);
    }
  }
  return templateRoles.get(labelKey(name));
}

/** Роль столбца по названию: сначала имена самого приложения, потом по словам. */
export function guessRole(name: string): ImportRole {
  const text = normalize(name);
  if (!text) return "skip";
  const template = templateRole(name);
  if (template) return template;
  if (/^(месяц|дата|month|период)/.test(text)) return "month";
  if (/^(итог|итого|остаток на конец|на конец|total)/.test(text)) return "total";
  // Английские основы — для таблиц, заведённых по-английски не из шаблона.
  if (/^(остаток|на начало|начало|opening|balance)/.test(text)) return "opening";
  if (/(комментар|коммент|заметк|примечан|пометк|описан|note|comment|memo)/.test(text))
    return "note";
  if (/(снят|с вклада|из сбереж|из подушк|from saving|withdraw)/.test(text)) return "fromSavings";
  if (/(процент.*вклад|вклад.*процент|кешбэк на остаток|interest)/.test(text))
    return "savingsIncome";
  if (/(вклад|сбереж|подушк|накоп|копилк|отложить|инвест|saving|cushion|deposit|invest)/.test(text))
    return "toSavings";
  if (/(доход|зарплат|^зп|аванс|премия|income|salary)/.test(text)) return "income";
  return "expense";
}

/** В столбце в основном слова, а не суммы: больше половины непустых клеток не числа. */
function mostlyText(values: readonly string[]): boolean {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  if (filled.length === 0) return false;
  const words = filled.filter((value) => {
    // «1 234,00р.» и «500 руб.» — суммы, хоть формулой и не считаются.
    if (parseAmount(value) !== null) return false;
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
  // Русская таблица в книге, заведённой по-английски (и наоборот): столбец
  // «Продукты» находит стандартные «Groceries» по общему ключу словаря данных.
  const key = dataKeyOf(name, "data.cat.");
  const twin = key ? own.find((category) => isDataLabel(category.label, key)) : undefined;
  if (twin) return twin.id;
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
      warnings: [dataText("data.sheetImport.noMonths")]
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
      warnings.push(dataText("data.sheetImport.duplicateMonth", undefined, { month }));
      continue;
    }
    rows.push({ month, cells: row });
  }

  // Циклом: Math.max(...) с разворотом падал с RangeError на ~200 000 строк.
  let width = 0;
  for (let index = header; index < grid.length; index += 1) {
    if (grid[index].length > width) width = grid[index].length;
  }
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
    const generic = role === "income" && /^(доход|income)/.test(normalize(name));
    columns.push({
      index,
      name: name || dataText("data.sheetImport.column", undefined, { n: index + 1 }),
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
      const label =
        cell.replace(/(\d{1,2})[./](\d{1,2})[./](\d{4})/, "").trim() ||
        dataText("data.sheetImport.target");
      markers.push({ label, date, amount });
    });
  }

  if (rows.length === 0) warnings.push(dataText("data.sheetImport.noRows"));
  // Таблицу ведут и сверху вниз, и свежим месяцем вверх. Дальше всё — Остаток
  // из прошлого Итога, сверка с Итогом файла, отметки сбережений — считает
  // строки по порядку, и порядок должен быть порядком месяцев.
  rows.sort((a, b) => a.month.localeCompare(b.month));
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
      name: savingsAt[0]?.label || dataText("data.sheet.col.cushionOpening"),
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
    rows[index].values[key] = String(roundHalfAway(marker.amount - movement));
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
