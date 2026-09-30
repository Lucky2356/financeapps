// Порядок строк в «Учёте»: новые сверху (как всегда), старые сверху, крупные
// сверху, мелкие сверху. Раньше порядка выбрать было нельзя — «найти самую
// большую трату месяца» значило выгружать таблицу.

export const TX_SORTS = ["date-desc", "date-asc", "amount-desc", "amount-asc"] as const;
export type TxSort = (typeof TX_SORTS)[number];

export function parseSort(raw: string | null | undefined): TxSort {
  return (TX_SORTS as readonly string[]).includes(raw ?? "") ? (raw as TxSort) : "date-desc";
}

/** Порядок по дате — только он делит список на дни. */
export const isDateSort = (sort: TxSort) => sort === "date-desc" || sort === "date-asc";

type Sortable = { date: string; createdAt?: string; amount: number };

/**
 * Отсортированная копия. При равенстве — по дате и времени записи, чтобы порядок
 * не прыгал от обновления к обновлению. `amountOf` — сумма в основной валюте:
 * доллары нельзя сравнивать с рублями «как есть».
 */
export function sortTransactions<T extends Sortable>(
  rows: readonly T[],
  sort: TxSort,
  amountOf: (row: T) => number = (row) => row.amount
): T[] {
  const byDate = (left: T, right: T) =>
    new Date(right.date).getTime() - new Date(left.date).getTime() ||
    // В пределах дня — сначала записанные позже. У старых строк отметки нет, и
    // свежая встаёт над ними.
    (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
  const copy = [...rows];
  switch (sort) {
    case "date-asc":
      return copy.sort((left, right) => byDate(right, left));
    case "amount-desc":
      return copy.sort((left, right) => amountOf(right) - amountOf(left) || byDate(left, right));
    case "amount-asc":
      return copy.sort((left, right) => amountOf(left) - amountOf(right) || byDate(left, right));
    default:
      return copy.sort(byDate);
  }
}
