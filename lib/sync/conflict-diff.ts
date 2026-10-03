// «В чём не сходится»: две версии одной записи — поле за полем.
//
// Раньше окно спора выкладывало строку как есть: `amount`, `categoryId`, номера
// вместо названий. Человек видел две простыни и не понимал, чем они отличаются.
// Здесь — только то, что человек сам вводил, по-русски, и отличия первыми.
//
// Выбирают по-прежнему версию целиком (см. components/sync/sync-status.tsx):
// поля здесь — чтобы понять, ЧТО выбираешь, а не чтобы собрать запись по кусочку.

import { sameValue } from "@/lib/sync/row-stamps";

type Row = Record<string, unknown>;

/**
 * Поля, которые человек не вводил: служебные и посчитанные приложением. Спор о
 * них — не спор: они пересчитаются сами, а показывать их значило бы прятать
 * настоящее отличие среди шума.
 */
const HIDDEN = new Set([
  "id",
  "updatedAt",
  "createdAt",
  "progress",
  "spent",
  "isExceeded",
  "suggestedLimit",
  "rolloverAmount",
  "daysUntilNext",
  "isDue",
  "monthlyContribution",
  "lastTransactionId",
  "splitGroupId",
  "transferId",
  "recurringId",
  "photo",
  // Где запись лежит в таблице — это её адрес, а не то, что человек вводил:
  // лист, столбец, порядок, клетка свободного листа, размер листа.
  "sheetId",
  "columnId",
  "order",
  "r",
  "c",
  "rows",
  "cols",
  // Метка поездки выводится из её названия.
  "tag"
]);

/** Порядок, в котором поля читаются глазами: сначала то, по чему запись узнают. */
const ORDER = [
  "description",
  "title",
  "name",
  "label",
  "category",
  "amount",
  "limitAmount",
  "targetAmount",
  "currentAmount",
  "balance",
  "type",
  "kind",
  "date",
  "month",
  "deadline",
  "account",
  "tags",
  "note",
  "text"
];

export type FieldDiff = {
  field: string;
  here: unknown;
  there: unknown;
  differs: boolean;
};

/**
 * Поля двух версий записи. Отличающиеся — первыми; у удалённой версии
 * (`null`) все поля другой версии считаются отличающимися.
 */
export function diffConflict(mine: Row | null, theirs: Row | null): FieldDiff[] {
  const fields = new Set<string>();
  for (const row of [mine, theirs]) {
    if (!row) continue;
    for (const field of Object.keys(row)) if (!HIDDEN.has(field)) fields.add(field);
  }
  const rank = (field: string) => {
    const at = ORDER.indexOf(field);
    return at === -1 ? ORDER.length : at;
  };
  return Array.from(fields)
    .map((field) => {
      const here = mine ? mine[field] : undefined;
      const there = theirs ? theirs[field] : undefined;
      const differs = !mine || !theirs || !sameValue(empty(here), empty(there));
      return { field, here, there, differs };
    })
    .filter((item) => !(isEmpty(item.here) && isEmpty(item.there)))
    .sort((a, b) => Number(b.differs) - Number(a.differs) || rank(a.field) - rank(b.field));
}

/**
 * Спор, в котором человеку нечего выбирать: обе версии расходятся только в
 * служебном (отметки времени, посчитанное) — или это служебная запись без
 * единого поля, которое человек вводил сам (месяц таблицы — один номер).
 * Такой спор решается сам: в данных уже лежит версия без потерь (см. merge).
 */
export function isTrivialConflict(mine: Row | null, theirs: Row | null): boolean {
  return diffConflict(mine, theirs).every((item) => !item.differs);
}

/** Пустое по смыслу: нет значения, пустая строка, пустой список. */
function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** `undefined`, `null` и `""` — одно и то же «не указано»; спор о них — не спор. */
function empty(value: unknown): unknown {
  return isEmpty(value) ? null : value;
}

const MONEY_FIELDS = new Set([
  "amount",
  "limitAmount",
  "targetAmount",
  "currentAmount",
  "balance",
  "originalAmount",
  "minPayment",
  "plannedContribution"
]);

/**
 * Значение поля словами. `t` — словарь, `money` — сумма с валютой. Ссылки
 * (`account`, `category`) уже несут название внутри записи, номер не нужен.
 */
export function describeValue(
  field: string,
  value: unknown,
  t: (key: string) => string,
  money: (amount: number) => string
): string {
  if (isEmpty(value)) return "—";
  if (typeof value === "boolean") return t(value ? "common.yes" : "common.no");
  if (typeof value === "number" && MONEY_FIELDS.has(field)) return money(value);
  if (field === "type" && typeof value === "string") {
    const key = `tx.type.${value.toLowerCase()}`;
    const word = t(key);
    return word === key ? value : word;
  }
  if (Array.isArray(value))
    return value.map((item) => describeValue(field, item, t, money)).join(", ");
  if (typeof value === "object" && value !== null) {
    const named = value as { label?: unknown; name?: unknown; title?: unknown };
    for (const text of [named.label, named.name, named.title]) {
      if (typeof text === "string" && text.trim()) return text;
    }
    return "…";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-");
    return `${day}.${month}.${year}`;
  }
  return String(value);
}

/** Название поля по-человечески; незнакомое — как есть. */
export function fieldLabel(field: string, t: (key: string) => string): string {
  const key = `sync.field.${field}`;
  const word = t(key);
  return word === key ? field : word;
}
