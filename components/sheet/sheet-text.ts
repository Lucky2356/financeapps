"use client";

// Слова экрана «Таблица». Свой маленький словарь рядом с экраном, а не в общем
// каталоге: их много, и живут они только здесь.

import { useI18n } from "@/lib/i18n/context";
import type { SheetColumnKind } from "@/lib/sheet/model";

const RU = {
  main: "Основные",
  savings: "Сбережения",
  month: "Месяц",
  total: "Итог",
  savingsTotal: "Итог сбережений",
  sum: "Всего",
  average: "В среднем",
  addColumn: "Столбец",
  addMonth: "Месяц",
  addMonthBefore: "Месяц раньше",
  import: "Перенести из Excel",
  export: "Выгрузить в Excel",
  exported: "Таблица выгружена.",
  compare: "Сравнить с учётом",
  compareHint: "Под числом — сколько на самом деле ушло по этой категории в учёте.",
  fact: "факт",
  undoImport: "Отменить перенос",
  undone: "Таблица вернулась как была до переноса.",
  showHidden: "Скрытые столбцы",
  fillDown: "Заполнить вниз",
  more: "Ещё",
  filled: "Заполнено до конца таблицы.",
  operations: "Операции в учёте",
  operationsFor: "Операции за {month}",
  emptyTitle: "Своя таблица, как в Excel",
  emptyLead:
    "Месяцы — строками, статьи — столбцами. Остаток и Итог таблица считает сама, основные деньги и сбережения — раздельно. Нажмёте на статью — откроются её операции в учёте.",
  emptyStart: "Начать с чистого листа",
  emptyImport: "Перенести мою таблицу из Excel",
  hint: "Двойное нажатие или любая цифра — ввод. Enter — вниз, Tab — вправо, Ctrl+V — вставить блок из Excel, Ctrl+Z — отменить.",
  cellError: "Не посчиталось: {error}",
  auto: "посчитано из прошлого месяца",
  save: "Сохранить",
  clear: "Очистить",
  cancel: "Отмена",
  close: "Закрыть",
  delete: "Удалить",
  column: "Столбец",
  columnNew: "Новый столбец",
  columnName: "Название",
  columnKind: "Что это",
  columnCategory: "Категория в учёте",
  noCategory: "Без категории",
  moveLeft: "Левее",
  moveRight: "Правее",
  hide: "Скрыть",
  unhide: "Показать",
  deleteColumn: "Удалить столбец",
  deleteColumnConfirm: "Удалить столбец «{name}» и все его числа?",
  deleteMonth: "Удалить строку",
  deleteMonthConfirm: "Удалить {month} из таблицы?",
  targets: "Цели",
  addTarget: "Цель",
  targetLabel: "Название",
  targetDate: "К какой дате",
  targetAmount: "Сумма",
  targetBy: "{label} к {date}: {amount}",
  targetReached: "по таблице будет {amount} — цель достигнута",
  targetOnTrack: "{month}: в сбережениях будет {amount}; до цели — по {perMonth} в месяц",
  targetNoRows: "добавьте месяцы до этой даты — таблица посчитает, хватит ли",
  input: "Число или формула",
  inputHint: "Можно как в Excel: 20000+1500, =СУММ(1000;2000), =45000*13%",
  saved: "Сохранено.",
  pasted: "Вставлено: {count}.",
  kinds: {
    opening: "Остаток на начало",
    income: "Доход",
    expense: "Расход",
    toSavings: "В сбережения",
    fromSavings: "Из сбережений",
    savingsOpening: "Подушка на начало",
    savingsIncome: "Проценты по вкладу"
  } satisfies Record<SheetColumnKind, string>,
  // Перенос из Excel
  importTitle: "Перенести таблицу из Excel",
  importLead:
    "Выделите в Excel всю таблицу вместе с шапкой и строкой «Подушка» над ней, скопируйте (Ctrl+C) и вставьте сюда (Ctrl+V). Или выберите файл .xlsx / .csv.",
  importPaste: "Вставьте таблицу сюда",
  importFile: "Выбрать файл",
  importSheetPick: "Лист",
  importNothing: "Здесь пока пусто — вставьте таблицу или выберите файл.",
  importColumns: "Что где",
  importRole: "Чем считать",
  importMonthCol: "месяц",
  importTotalCol: "Итог — только сверить",
  importSkip: "Не переносить",
  importCreate: "Создать «{name}»",
  importFound: "Нашлось: {months} мес. — с {from} по {to}, столбцов: {columns}.",
  importTotalsOk: "Итоги сошлись с Excel во всех {count} мес. — столбцы поняты правильно.",
  importTotalsBad:
    "Итоги не сошлись в {count} мес. (например, {month}: в Excel {file}, у нас {ours}). Проверьте, чем считаются столбцы.",
  importMarkers: "Над таблицей: {items}",
  importReplace:
    "Нынешняя таблица заменится этой. Передумаете — «Отменить перенос» вернёт её как была.",
  importGo: "Перенести",
  imported: "Таблица перенесена: {months} мес.",
  importBadFile: "Не получилось прочитать файл: {error}"
};

type Text = typeof RU;

const EN: Text = {
  ...RU,
  main: "Main",
  savings: "Savings",
  month: "Month",
  total: "Total",
  savingsTotal: "Savings total",
  sum: "Sum",
  average: "Average",
  addColumn: "Column",
  addMonth: "Month",
  addMonthBefore: "Earlier month",
  import: "Import from Excel",
  export: "Export to Excel",
  exported: "Sheet exported.",
  compare: "Compare with ledger",
  compareHint: "Below each number — what was actually spent in this category.",
  fact: "actual",
  undoImport: "Undo import",
  undone: "The sheet is back as it was before the import.",
  showHidden: "Hidden columns",
  fillDown: "Fill down",
  more: "More",
  filled: "Filled to the end of the sheet.",
  operations: "Operations in ledger",
  operationsFor: "Operations for {month}",
  emptyTitle: "Your own sheet, like in Excel",
  emptyLead:
    "Months as rows, items as columns. Opening balance and total are calculated for you; main money and savings are kept apart. Tap an item to see its operations.",
  emptyStart: "Start from scratch",
  emptyImport: "Import my sheet from Excel",
  hint: "Double-click or type a digit to edit. Enter — down, Tab — right, Ctrl+V — paste a block from Excel, Ctrl+Z — undo.",
  cellError: "Could not calculate: {error}",
  auto: "carried over from last month",
  save: "Save",
  clear: "Clear",
  cancel: "Cancel",
  close: "Close",
  delete: "Delete",
  column: "Column",
  columnNew: "New column",
  columnName: "Name",
  columnKind: "What it is",
  columnCategory: "Ledger category",
  noCategory: "No category",
  moveLeft: "Left",
  moveRight: "Right",
  hide: "Hide",
  unhide: "Show",
  deleteColumn: "Delete column",
  deleteColumnConfirm: "Delete column “{name}” and all its numbers?",
  deleteMonth: "Delete row",
  deleteMonthConfirm: "Delete {month} from the sheet?",
  targets: "Targets",
  addTarget: "Target",
  targetLabel: "Name",
  targetDate: "By date",
  targetAmount: "Amount",
  input: "Number or formula",
  inputHint: "Excel style works: 20000+1500, =SUM(1000;2000), =45000*13%",
  saved: "Saved.",
  pasted: "Pasted: {count}.",
  kinds: {
    opening: "Opening balance",
    income: "Income",
    expense: "Expense",
    toSavings: "To savings",
    fromSavings: "From savings",
    savingsOpening: "Savings at start",
    savingsIncome: "Deposit interest"
  },
  importTitle: "Import a sheet from Excel",
  importLead:
    "Select the whole table in Excel with its header, copy (Ctrl+C) and paste here (Ctrl+V). Or choose an .xlsx / .csv file.",
  importPaste: "Paste the table here",
  importFile: "Choose file",
  importSheetPick: "Sheet",
  importNothing: "Nothing here yet — paste a table or choose a file.",
  importColumns: "Columns",
  importRole: "Treat as",
  importMonthCol: "month",
  importTotalCol: "Total — check only",
  importSkip: "Skip",
  importCreate: "Create “{name}”",
  importReplace:
    "The current sheet will be replaced. Changed your mind — “Undo import” brings it back.",
  importGo: "Import",
  imported: "Sheet imported: {months} months.",
  importBadFile: "Could not read the file: {error}"
};

export type SheetText = Text;

export function useSheetText() {
  const { locale } = useI18n();
  const words = locale === "en" ? EN : RU;
  const format = (template: string, values: Record<string, string | number> = {}) =>
    template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
  return { words, format, locale };
}

/** «2026-08» → «авг 2026». */
export function monthLabel(month: string, locale: string, style: "short" | "long" = "short") {
  const [year, index] = month.split("-").map(Number);
  const text = new Date(year, index - 1, 1)
    .toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", { month: style, year: "numeric" })
    .replace(/\s*г\.?$/, "")
    .replace(".", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
