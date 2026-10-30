import { apiClient } from "@/lib/api/client";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";

export type BudgetWarning = { category: string; spent: number; limit: number };

/** Одна строка списка операций. */
export type TransactionRow = TransactionsPageData["transactions"][number];

/**
 * Только что записанная — подсвечивается при появлении (.flash-new): после
 * «Сохранить» видно, куда она встала. Подсветка играет один раз — когда строка
 * появляется в списке.
 */
export function isJustAdded(row: { createdAt?: string }): boolean {
  const at = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  return Number.isFinite(at) && Date.now() - at < 8000;
}

/**
 * Сумма строки для показа. Счета — из загруженных данных экрана: заготовка
 * страницы в статической сборке пустая, и по ней любая строка выходила в ₽.
 */
export function makeRowAmount(accounts: TransactionsPageData["accounts"], baseCurrency?: string) {
  // A row shows the money as it was actually paid. When the account keeps
  // another currency, what it is worth in the base one follows in brackets —
  // otherwise 100 $ would read as "100 ₽" beside totals that count 9 000.
  const currencyOfAccount = new Map(accounts.map((account) => [account.id, account.currency]));
  return (transaction: TransactionsPageData["transactions"][number]) => {
    const currency = currencyOfAccount.get(transaction.account.id) ?? baseCurrency ?? "RUB";
    const own = formatCurrency(transaction.amount, currency);
    if (transaction.baseAmount === undefined) return own;
    return `${own} (${formatCurrency(transaction.baseAmount, baseCurrency)})`;
  };
}

// PUT payload mirroring the edit dialog's fields, with an overridden category.
export function updatePayload(
  transaction: TransactionsPageData["transactions"][number],
  categoryId: string
) {
  return {
    id: transaction.id,
    amount: String(transaction.amount),
    type: transaction.type,
    date: formatInputDate(transaction.date),
    categoryId,
    accountId: transaction.account.id,
    description: transaction.description ?? "",
    // Метки — как есть: PUT без них прежде снимал все метки строки, и смена
    // категории (рукой, правилом или ИИ) молча стирала «работа», «отпуск»…
    tags: (transaction.tags ?? []).join(", ")
  };
}

/**
 * Сколько строк у каждой из разделённых покупок — по всей книге, а не по
 * странице. Покупка удаляется целиком (`?splitGroupId=`), а её части лежат
 * в разных днях и на разных страницах: счёт по странице обещал «удалить одну
 * операцию» там, где уходил весь чек. `null` — книгу прочитать не удалось.
 */
export async function splitPartCounts(
  groups: Iterable<string>
): Promise<Map<string, number> | null> {
  const wanted = new Set(groups);
  const counts = new Map<string, number>();
  if (wanted.size === 0) return counts;
  try {
    // `period=all` — за всё время, `limit=all` — одной страницей.
    const ledger = await apiClient.get("/transactions?period=all&limit=all");
    for (const row of ledger.transactions) {
      if (row.splitGroupId && wanted.has(row.splitGroupId)) {
        counts.set(row.splitGroupId, (counts.get(row.splitGroupId) ?? 0) + 1);
      }
    }
    return counts;
  } catch {
    return null;
  }
}
