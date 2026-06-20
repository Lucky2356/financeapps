import type { ForecastEvent } from "@/types/finance";

export type ForecastEventFilter = {
  account: string;
  category: string;
};

export const EMPTY_FORECAST_FILTER: ForecastEventFilter = { account: "", category: "" };

// Distinct account and category names present in the planned events, sorted for
// stable dropdown options. Pure so the forecast drill-down UI stays testable.
export function forecastFilterOptions(events: ForecastEvent[]) {
  const accounts = [...new Set(events.map((event) => event.account))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
  const categories = [...new Set(events.map((event) => event.category))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
  return { accounts, categories };
}

// Applies the account/category filter; an empty string means "all".
export function filterForecastEvents(
  events: ForecastEvent[],
  filter: ForecastEventFilter
): ForecastEvent[] {
  return events.filter(
    (event) =>
      (!filter.account || event.account === filter.account) &&
      (!filter.category || event.category === filter.category)
  );
}
