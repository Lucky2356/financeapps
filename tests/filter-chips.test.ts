import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  applyPeriodPreset,
  describeFilters,
  periodPresetOf,
  periodRange,
  withFilter,
  withoutFilter
} from "@/lib/transactions/filter-chips";

// A fixed "today" so the named periods are checkable: 14 August 2026.
const TODAY = new Date(2026, 7, 14);

const CONTEXT = {
  categories: [
    { id: "cat-food", label: "Продукты" },
    { id: "cat-fun", label: "Развлечения" }
  ],
  accounts: [{ id: "acc-cash", label: "Наличные" }],
  label: (kind: string, value: string) => `${kind}:${value}`
};

describe("period presets", () => {
  it("spans the whole of the named month, not just up to today", () => {
    expect(periodRange("thisMonth", TODAY)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(periodRange("prevMonth", TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("counts three months back inclusive of the current one", () => {
    expect(periodRange("threeMonths", TODAY)).toEqual({ from: "2026-06-01", to: "2026-08-31" });
  });

  it("recognises the dates it wrote", () => {
    const params = applyPeriodPreset(new URLSearchParams(), "prevMonth", TODAY);
    expect(periodPresetOf(params, TODAY)).toBe("prevMonth");
  });

  it("calls dates that match no preset a custom range", () => {
    const params = new URLSearchParams("from=2026-03-05&to=2026-04-17");
    expect(periodPresetOf(params, TODAY)).toBe("custom");
  });

  it("means all time when there are no dates at all", () => {
    expect(periodPresetOf(new URLSearchParams(), TODAY)).toBe("all");
    const cleared = applyPeriodPreset(new URLSearchParams("from=2026-01-01"), "all", TODAY);
    expect(cleared.has("from")).toBe(false);
  });

  it("drops paging: page 4 of the old result set means nothing in the new one", () => {
    const params = new URLSearchParams("page=4&q=кофе");
    expect(applyPeriodPreset(params, "thisMonth", TODAY).has("page")).toBe(false);
    expect(withFilter(params, "type", "INCOME").has("page")).toBe(false);
    expect(withoutFilter(params, "q").has("page")).toBe(false);
  });
});

describe("removing one filter", () => {
  it("takes a single category out of the list and leaves the rest", () => {
    const params = new URLSearchParams("categoryId=cat-food,cat-fun&type=EXPENSE");
    const next = withoutFilter(params, "categoryId", "cat-food");
    expect(next.get("categoryId")).toBe("cat-fun");
    expect(next.get("type")).toBe("EXPENSE");
  });

  it("removes the parameter entirely once its last category goes", () => {
    const params = new URLSearchParams("categoryId=cat-food");
    expect(withoutFilter(params, "categoryId", "cat-food").has("categoryId")).toBe(false);
  });

  it("treats the period as one filter — both dates go together", () => {
    const params = new URLSearchParams("from=2026-08-01&to=2026-08-31&q=кофе");
    const next = withoutFilter(params, "period");
    expect(next.has("from")).toBe(false);
    expect(next.has("to")).toBe(false);
    expect(next.get("q")).toBe("кофе");
  });
});

describe("the count on the button", () => {
  it("ignores paging and the all-types default", () => {
    const params = new URLSearchParams("page=2&limit=50&type=ALL");
    expect(activeFilterCount(params)).toBe(0);
  });

  it("counts each picked category, and the period once", () => {
    const params = new URLSearchParams(
      "from=2026-08-01&to=2026-08-31&categoryId=cat-food,cat-fun&type=EXPENSE&q=кофе"
    );
    // period + two categories + type + search, judged from a day outside that
    // period so it is a chosen one rather than the screen's own default.
    expect(activeFilterCount(params, new Date(2026, 10, 15))).toBe(5);
  });

  it("does not count the month the screen opens on", () => {
    // Every visit starts on the current month, so counting it would leave the
    // badge stuck at one with nothing actually filtered.
    const today = new Date(2026, 7, 20);
    const params = new URLSearchParams("from=2026-08-01&to=2026-08-31");
    expect(activeFilterCount(params, today)).toBe(0);
    params.set("type", "EXPENSE");
    expect(activeFilterCount(params, today)).toBe(1);
  });
});

describe("the chips", () => {
  it("names a category by its name, not its id", () => {
    const chips = describeFilters(new URLSearchParams("categoryId=cat-food"), CONTEXT);
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe("category:Продукты");
  });

  it("hands each chip the query it navigates to, with only its own filter gone", () => {
    const chips = describeFilters(
      new URLSearchParams("q=кофе&categoryId=cat-food&accountId=acc-cash"),
      CONTEXT
    );
    const account = chips.find((chip) => chip.id === "account");
    const next = new URLSearchParams(account?.next ?? "");
    expect(next.has("accountId")).toBe(false);
    expect(next.get("q")).toBe("кофе");
    expect(next.get("categoryId")).toBe("cat-food");
  });

  it("says nothing when nothing is filtered", () => {
    expect(describeFilters(new URLSearchParams("page=3"), CONTEXT)).toEqual([]);
  });

  it("falls back to the id when a category was deleted under the filter", () => {
    const chips = describeFilters(new URLSearchParams("categoryId=cat-gone"), CONTEXT);
    expect(chips[0].label).toBe("category:cat-gone");
  });
});
