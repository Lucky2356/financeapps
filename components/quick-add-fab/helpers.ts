import type { ImportPageData, TransactionsPageData } from "@/lib/data";

export type AccountOption = ImportPageData["accounts"][number];
export type CategoryOption = ImportPageData["categories"][number];

export type QuickAddType = "INCOME" | "EXPENSE" | "TRANSFER";

/** Одна дополнительная часть разделённой покупки. */
export type SplitPart = { categoryId: string; amount: string };

/**
 * Последняя операция этого типа — верхняя строка журнала, отсортированного по
 * дате. Переводы в счёт не идут: у них нет категории.
 */
export function lastOfType(ledger: TransactionsPageData | null, type: QuickAddType) {
  if (type === "TRANSFER") return undefined;
  return ledger?.transactions.find(
    (transaction) => !transaction.transferId && transaction.type === type
  );
}

export function toNumber(value: string): number {
  const parsed = Number(String(value).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Сколько остаётся основной категории, когда остальные части вписаны. */
export function splitRemainder(total: string, parts: ReadonlyArray<{ amount: string }>): number {
  const rest = parts.reduce((sum, part) => sum - toNumber(part.amount), toNumber(total));
  return Math.round(rest * 100) / 100;
}
