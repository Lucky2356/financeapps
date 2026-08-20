import { DEFAULT_CATEGORY_COLOR } from "@/lib/categories/palette";
import { roundMoney } from "@/lib/utils";

// Splitting a month's money by category — the shape both pie charts are drawn
// from. Expenses already had one (built from the budget rows); income did not,
// which is why the dashboard could show where money went but never where it
// came from.

export type CategorySlice = { name: string; value: number; fill: string };

type Row = {
  type: string;
  amount: number;
  date: string;
  category: { id: string; label: string };
};

/**
 * Totals one month of one kind of operation per category, largest first.
 *
 * Categories with nothing in them are left out rather than drawn as zero-width
 * slices, and a category whose colour is missing falls back to the neutral one
 * so a slice is never invisible.
 */
export function categoryBreakdown(
  rows: Row[],
  options: {
    type: "INCOME" | "EXPENSE";
    /** Month prefix, "YYYY-MM". Omit to count every row given. */
    month?: string;
    colorOf: (categoryId: string) => string | undefined;
  }
): CategorySlice[] {
  const totals = new Map<string, { name: string; value: number; fill: string }>();

  for (const row of rows) {
    if (row.type !== options.type) continue;
    if (options.month && !row.date.startsWith(options.month)) continue;
    if (!(row.amount > 0)) continue;

    const key = row.category.id;
    const existing = totals.get(key);
    if (existing) existing.value += row.amount;
    else {
      totals.set(key, {
        name: row.category.label,
        value: row.amount,
        fill: options.colorOf(key) || DEFAULT_CATEGORY_COLOR
      });
    }
  }

  return [...totals.values()]
    .map((slice) => ({ ...slice, value: roundMoney(slice.value) }))
    .sort((a, b) => b.value - a.value);
}

export type RankedCategory = {
  categoryId: string;
  category: string;
  color: string;
  total: number;
  /** Percentage of the period's total for this kind, one decimal. */
  share: number;
};

/**
 * The analytics view's ranking: same totals, plus each category's share of the
 * period and a cap on how many are listed. Rows are filtered from `since`
 * onwards (an ISO date prefix, compared as text like the rest of the storage
 * layer does).
 */
export function topCategories(
  rows: Row[],
  options: {
    type: "INCOME" | "EXPENSE";
    since: string;
    /**
     * Exclusive upper end of the window. Without one the ranking counted rows
     * dated beyond the period it claims to cover — a future-dated operation
     * took a share of a six-month total it does not belong to.
     */
    until?: string;
    colorOf: (categoryId: string) => string | undefined;
    limit?: number;
  }
): RankedCategory[] {
  const matching = rows.filter(
    (row) =>
      row.type === options.type &&
      row.date >= options.since &&
      (!options.until || row.date < options.until) &&
      row.amount > 0
  );
  const total = matching.reduce((sum, row) => sum + row.amount, 0);

  const totals = new Map<string, RankedCategory>();
  for (const row of matching) {
    const existing = totals.get(row.category.id);
    if (existing) existing.total += row.amount;
    else {
      totals.set(row.category.id, {
        categoryId: row.category.id,
        category: row.category.label,
        color: options.colorOf(row.category.id) || DEFAULT_CATEGORY_COLOR,
        total: row.amount,
        share: 0
      });
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, options.limit ?? 6)
    .map((item) => ({
      ...item,
      total: roundMoney(item.total),
      share: total > 0 ? Math.round((item.total / total) * 1000) / 10 : 0
    }));
}
