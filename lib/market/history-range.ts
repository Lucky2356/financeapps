import { subMonths, subYears } from "date-fns";

// Start date for a price-history range key, shared by the web route and the
// desktop LocalApiClient so the per-stock chart behaves identically.
export function historyRangeStart(range: string): Date {
  const now = new Date();
  switch (range) {
    case "1m":
      return subMonths(now, 1);
    case "3m":
      return subMonths(now, 3);
    case "1y":
      return subYears(now, 1);
    case "5y":
      return subYears(now, 5);
    default:
      return subMonths(now, 6);
  }
}
