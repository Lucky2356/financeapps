// Корзина: удалённое — не пропавшее.
//
// Владелец: «один применил — и у всех всё поменялось»; «чтоб не удалялись просто
// так». Удаление на одном устройстве честно доезжает до всех остальных — так и
// должно быть, иначе синхронизация врала бы. Но каждое устройство, теряя запись,
// откладывает её себе в корзину на 30 дней: удалили здесь — корзина здесь,
// удалили на телефоне — корзина есть и на компьютере. Вернуть можно с любого.
//
// ПОЧЕМУ КОРЗИНА МЕСТНАЯ, А НЕ ОБЩАЯ. Общая корзина — это вторая книга, которая
// сама синхронизируется и сама может что-то потерять. Местная получается даром:
// каждое устройство видит, что запись исчезла из ЕГО книги, — неважно, по чьей
// воле, — и кладёт её к себе. Возврат — обычная правка, она и уедет ко всем.
//
// Здесь только чистые функции; хранит и зовёт их lib/api/LocalApiClient.ts.

import { indexRows, STAMPED, type Identity } from "@/lib/sync/row-stamps";

/** Сколько лежит в корзине. */
export const TRASH_DAYS = 30;

/** Сколько записей держать самое большее — чтобы корзина не стала второй книгой. */
export const TRASH_LIMIT = 2000;

/**
 * Что попадает в корзину: то, что человек сам заводил и о чём пожалеет. Клетки
 * таблицы, курсы, снимки капитала и прочее служебное — нет: их «удаление» —
 * обычная правка, и корзина утонула бы в шуме.
 */
export const TRASHED_COLLECTIONS = [
  "transactions",
  "accounts",
  "categories",
  "budgets",
  "goals",
  "recurringTransactions",
  "liabilities",
  "rules",
  "sheetColumns",
  "sheetTargets",
  "cashbackRules",
  "trips",
  "sheets"
] as const;

export type TrashedCollection = (typeof TRASHED_COLLECTIONS)[number];

export type TrashOrigin = "here" | "elsewhere";

export type TrashEntry = {
  id: string;
  collection: TrashedCollection;
  /** Опознание строки в своём разделе — у всех здесь это id. */
  key: string;
  row: Record<string, unknown>;
  deletedAt: string;
  /** Удалили на этом устройстве или пришло с другого. */
  origin: TrashOrigin;
};

const IDENTITY = new Map<string, Identity>(STAMPED);

/** Строки, которые были в `before` и которых нет в `after`. */
export function vanishedRows(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>
): Array<{ collection: TrashedCollection; key: string; row: Record<string, unknown> }> {
  if (!before) return [];
  const gone: Array<{ collection: TrashedCollection; key: string; row: Record<string, unknown> }> =
    [];
  for (const collection of TRASHED_COLLECTIONS) {
    const identify = IDENTITY.get(collection);
    if (!identify) continue;
    const now = indexRows(after[collection], identify);
    for (const [key, row] of indexRows(before[collection], identify)) {
      if (!now.has(key)) gone.push({ collection, key, row });
    }
  }
  // Удалённый лист — одна запись корзины со всем, что на нём было: столбцы,
  // клетки, месяцы, цели. Вернуть лист без содержимого было бы насмешкой, а
  // показывать его столбцы отдельными записями — шумом.
  const sheets = new Set(
    gone.filter((item) => item.collection === "sheets").map((item) => item.key)
  );
  if (sheets.size === 0) return gone;
  const ofSheet = (row: unknown) =>
    typeof (row as { sheetId?: unknown })?.sheetId === "string" &&
    sheets.has((row as { sheetId: string }).sheetId);
  const rowsOf = (collection: string) =>
    Array.isArray(before[collection]) ? (before[collection] as Array<Record<string, unknown>>) : [];
  return gone
    .filter((item) => !(item.collection !== "sheets" && ofSheet(item.row)))
    .map((item) => {
      if (item.collection !== "sheets") return item;
      const mine = (row: unknown) => (row as { sheetId?: unknown })?.sheetId === item.key;
      const columns = rowsOf("sheetColumns").filter(mine);
      const columnIds = new Set(columns.map((column) => column.id));
      return {
        ...item,
        row: {
          ...item.row,
          [SHEET_ARCHIVE]: {
            sheetColumns: columns,
            sheetCells: rowsOf("sheetCells").filter((cell) => columnIds.has(cell.columnId)),
            sheetMonths: rowsOf("sheetMonths").filter(mine),
            sheetTargets: rowsOf("sheetTargets").filter(mine),
            freeCells: rowsOf("freeCells").filter(mine)
          }
        }
      };
    });
}

/** Где в записи удалённого листа лежит его содержимое. */
export const SHEET_ARCHIVE = "__sheetContent";

/**
 * Положить исчезнувшее в корзину. Свежее — первым; старше 30 дней и сверх
 * предела — выбрасывается. Одна и та же строка дважды не лежит: новое удаление
 * замещает прежнее (её успели вернуть и снова удалить).
 */
export function addToTrash(
  trash: TrashEntry[],
  gone: ReturnType<typeof vanishedRows>,
  now: string,
  origin: TrashOrigin,
  makeId: () => string
): TrashEntry[] {
  const fresh: TrashEntry[] = gone.map((item) => ({
    id: makeId(),
    collection: item.collection,
    key: item.key,
    row: item.row,
    deletedAt: now,
    origin
  }));
  const replaced = new Set(fresh.map((entry) => `${entry.collection}|${entry.key}`));
  return pruneTrash(
    [...fresh, ...trash.filter((entry) => !replaced.has(`${entry.collection}|${entry.key}`))],
    now
  );
}

/** Выбросить просроченное и лишнее. */
export function pruneTrash(trash: TrashEntry[], now: string): TrashEntry[] {
  const cutoff = Date.parse(now) - TRASH_DAYS * 24 * 60 * 60 * 1000;
  return trash
    .filter((entry) => {
      const at = Date.parse(entry.deletedAt);
      return Number.isFinite(at) && at >= cutoff;
    })
    .slice(0, TRASH_LIMIT);
}

/** Прочитать сохранённую корзину, не доверяя её виду. */
export function readTrash(stored: unknown): TrashEntry[] {
  const list = (stored as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry): entry is TrashEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as TrashEntry).id === "string" &&
      (TRASHED_COLLECTIONS as readonly string[]).includes((entry as TrashEntry).collection) &&
      typeof (entry as TrashEntry).key === "string" &&
      typeof (entry as TrashEntry).row === "object" &&
      (entry as TrashEntry).row !== null &&
      typeof (entry as TrashEntry).deletedAt === "string"
  );
}

/** По чему запись узнают в списке корзины. */
export function trashTitle(entry: TrashEntry): string {
  const row = entry.row;
  for (const field of ["description", "name", "title", "label", "match", "category"]) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      const label = (value as { label?: unknown }).label;
      if (typeof label === "string" && label.trim()) return label;
    }
  }
  return "";
}

/** Сумма записи, если она у неё есть. */
export function trashAmount(entry: TrashEntry): number | null {
  for (const field of ["amount", "limitAmount", "targetAmount", "balance"]) {
    const value = entry.row[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
