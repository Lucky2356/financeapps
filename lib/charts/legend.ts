/**
 * Splits an ordered list into columns that read DOWN each one in turn.
 *
 * A two-column CSS grid lays items out across the rows: first, second, then
 * third under the first. For a ranked legend that is the wrong shape — the
 * second-largest ends up at the top of the right column and neither column is
 * a ranking on its own. Handing the halves to two stacks keeps "largest first"
 * true down the left column and then down the right.
 *
 * The first column takes the extra item when the count is odd, so the left one
 * is never shorter than the right.
 */
export function legendColumns<T>(items: readonly T[], columns = 2): T[][] {
  if (columns < 2 || items.length === 0) return [[...items]];

  const perColumn = Math.ceil(items.length / columns);
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += perColumn) {
    result.push(items.slice(start, start + perColumn));
  }
  return result;
}
