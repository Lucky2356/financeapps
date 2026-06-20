import { describe, expect, it } from "vitest";

import { filterForecastEvents, forecastFilterOptions } from "@/lib/forecast-filter";
import type { ForecastEvent } from "@/types/finance";

const events: ForecastEvent[] = [
  {
    id: "1",
    date: "2026-07-01",
    title: "Зарплата",
    amount: 200000,
    type: "INCOME",
    category: "Зарплата",
    account: "Карта"
  },
  {
    id: "2",
    date: "2026-07-05",
    title: "Аренда",
    amount: 50000,
    type: "EXPENSE",
    category: "Жильё",
    account: "Карта"
  },
  {
    id: "3",
    date: "2026-07-10",
    title: "Продукты",
    amount: 8000,
    type: "EXPENSE",
    category: "Еда",
    account: "Наличные"
  }
];

describe("forecastFilterOptions", () => {
  it("returns distinct, sorted accounts and categories", () => {
    const { accounts, categories } = forecastFilterOptions(events);
    expect(accounts).toEqual(["Карта", "Наличные"]);
    expect(categories).toEqual(["Еда", "Жильё", "Зарплата"]);
  });
});

describe("filterForecastEvents", () => {
  it("returns all events when no filter is set", () => {
    expect(filterForecastEvents(events, { account: "", category: "" })).toHaveLength(3);
  });

  it("filters by account", () => {
    const result = filterForecastEvents(events, { account: "Наличные", category: "" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("filters by category", () => {
    const result = filterForecastEvents(events, { account: "", category: "Жильё" });
    expect(result.map((event) => event.id)).toEqual(["2"]);
  });

  it("combines account and category filters", () => {
    expect(filterForecastEvents(events, { account: "Карта", category: "Еда" })).toHaveLength(0);
    expect(filterForecastEvents(events, { account: "Карта", category: "Жильё" })).toHaveLength(1);
  });
});
