// The filter bar's brain: which period preset the URL currently describes, and
// which filters are active as removable chips.
//
// The URL is the single source of truth for filtering (see `filter.ts`), so
// everything here is a pure transformation of `URLSearchParams`. The bar itself
// only renders what this module returns and navigates to the strings it hands
// back — which is what makes "remove this one filter" a one-line operation
// instead of rebuilding the whole query by hand.

import {
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears
} from "date-fns";

import { parseCategoryIds } from "@/lib/transactions/filter";

/** Named ranges offered in the bar; "custom" means the dates match none of them. */
export type PeriodPresetId =
  | "all"
  | "thisMonth"
  | "prevMonth"
  | "threeMonths"
  | "thisYear"
  | "prevYear"
  | "custom";

/** The presets the bar offers, in the order it shows them. "custom" is not offered. */
export const PERIOD_PRESETS: Exclude<PeriodPresetId, "custom">[] = [
  "all",
  "thisMonth",
  "prevMonth",
  "threeMonths",
  "thisYear",
  "prevYear"
];

const ISO = "yyyy-MM-dd";

/** The from/to pair a preset stands for. `all` clears both. */
export function periodRange(
  id: Exclude<PeriodPresetId, "custom">,
  today: Date = new Date()
): { from: string; to: string } | null {
  switch (id) {
    case "all":
      return null;
    case "thisMonth":
      return { from: format(startOfMonth(today), ISO), to: format(endOfMonth(today), ISO) };
    case "prevMonth": {
      const previous = subMonths(today, 1);
      return { from: format(startOfMonth(previous), ISO), to: format(endOfMonth(previous), ISO) };
    }
    case "threeMonths":
      return {
        from: format(startOfMonth(subMonths(today, 2)), ISO),
        to: format(endOfMonth(today), ISO)
      };
    case "thisYear":
      return { from: format(startOfYear(today), ISO), to: format(endOfYear(today), ISO) };
    case "prevYear": {
      const previous = subYears(today, 1);
      return { from: format(startOfYear(previous), ISO), to: format(endOfYear(previous), ISO) };
    }
  }
}

/** Which preset (if any) the current from/to describe. */
export function periodPresetOf(params: URLSearchParams, today: Date = new Date()): PeriodPresetId {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!from && !to) return "all";
  for (const id of PERIOD_PRESETS) {
    const range = periodRange(id, today);
    if (range && range.from === from && range.to === to) return id;
  }
  return "custom";
}

/**
 * A copy of the params with a preset's dates written in. Paging is dropped:
 * page 4 of the old result set means nothing in the new one.
 *
 * "Всё" writes `period=all` rather than simply clearing the dates: an empty
 * period is also what a freshly opened screen has, and the screen fills that in
 * with the current month. The marker is how asking for everything is told apart
 * from having asked for nothing yet.
 */
export function applyPeriodPreset(
  params: URLSearchParams,
  id: Exclude<PeriodPresetId, "custom">,
  today: Date = new Date()
): URLSearchParams {
  const next = new URLSearchParams(params);
  const range = periodRange(id, today);
  if (range) {
    next.set("from", range.from);
    next.set("to", range.to);
    next.delete("period");
  } else {
    next.delete("from");
    next.delete("to");
    next.set("period", "all");
  }
  next.delete("page");
  return next;
}

/**
 * True when the URL says nothing about a period at all — no dates and no "всё".
 * The operations screen starts on the current month, so this is the question it
 * asks before writing that month in.
 */
export function periodIsUnset(params: URLSearchParams): boolean {
  if (params.get("from") || params.get("to") || params.get("period") === "all") return false;
  // A link that already says what to show has said everything it meant to. The
  // ring on the analytics screen covers six months and links a category into
  // this list; filling the current month in behind it opened «Долги 55 347 ₽»
  // on a list of 4 000 ₽ — the same disagreement between a figure and the rows
  // under it that this screen is supposed to settle. A month is a sensible
  // default only for an address that asks for nothing in particular.
  for (const key of ["categoryId", "accountId", "q", "type", "tag", "minAmount", "maxAmount"]) {
    if (params.get(key)) return false;
  }
  return true;
}

/** A copy with one filter written in (empty value removes it), paging reset. */
export function withFilter(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  // Emptying a date by hand is a period of its own — an open end — so the
  // screen must not read it as "nothing chosen yet" and fill the month back in.
  if ((key === "from" || key === "to") && !next.get("from") && !next.get("to")) {
    next.set("period", "all");
  } else if (key === "from" || key === "to") {
    next.delete("period");
  }
  next.delete("page");
  return next;
}

/**
 * A copy without one filter. For `categoryId` — which holds a comma-separated
 * list — `value` names the single id to drop; the rest of the list stays.
 */
export function withoutFilter(
  params: URLSearchParams,
  key: string,
  value?: string
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (key === "categoryId" && value) {
    const rest = parseCategoryIds(next.get("categoryId")).filter((id) => id !== value);
    if (rest.length > 0) next.set("categoryId", rest.join(","));
    else next.delete("categoryId");
  } else if (key === "period") {
    next.delete("from");
    next.delete("to");
    // Taking the period off means "за всё время", not "back to the default".
    next.set("period", "all");
  } else {
    next.delete(key);
  }
  next.delete("page");
  return next;
}

/**
 * Everything except paging and the defaults — the count on the button.
 *
 * The current month is where the screen starts, so it is not something the
 * reader turned on: counting it would leave the badge permanently at one and
 * say nothing about what is actually narrowing the list.
 */
export function activeFilterCount(params: URLSearchParams, today: Date = new Date()): number {
  let count = 0;
  for (const key of ["q", "accountId", "minAmount", "maxAmount", "tag"]) {
    if (params.get(key)) count += 1;
  }
  const type = params.get("type");
  if (type === "INCOME" || type === "EXPENSE" || type === "TRANSFER") count += 1;
  if ((params.get("from") || params.get("to")) && periodPresetOf(params, today) !== "thisMonth") {
    count += 1;
  }
  count += parseCategoryIds(params.get("categoryId")).length;
  return count;
}

/** One removable filter as the bar draws it. */
export type FilterChip = {
  /** Stable identity for React keys and tests. */
  id: string;
  label: string;
  /** The query string to navigate to when this chip's ✕ is pressed. */
  next: string;
};

/** Names the bar cannot know: labels come from i18n, ids from the page data. */
export type ChipContext = {
  categories: Array<{ id: string; label: string }>;
  accounts: Array<{ id: string; label: string }>;
  /** Renders a chip's text, e.g. ("minAmount", "1000") → "от 1 000 ₽". */
  label: (kind: ChipKind, value: string) => string;
};

export type ChipKind =
  | "q"
  | "period"
  | "type"
  | "category"
  | "account"
  | "minAmount"
  | "maxAmount"
  | "tag";

/** The active filters, in the order the bar shows them. */
export function describeFilters(params: URLSearchParams, context: ChipContext): FilterChip[] {
  const chips: FilterChip[] = [];
  const push = (id: string, kind: ChipKind, value: string, key: string, dropped?: string) => {
    chips.push({
      id,
      label: context.label(kind, value),
      next: withoutFilter(params, key, dropped).toString()
    });
  };

  const query = params.get("q");
  if (query) push("q", "q", query, "q");

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (from || to) push("period", "period", `${from}→${to}`, "period");

  const type = params.get("type");
  if (type === "INCOME" || type === "EXPENSE" || type === "TRANSFER")
    push("type", "type", type, "type");

  for (const id of parseCategoryIds(params.get("categoryId"))) {
    const name = context.categories.find((category) => category.id === id)?.label ?? id;
    push(`category:${id}`, "category", name, "categoryId", id);
  }

  const accountId = params.get("accountId");
  if (accountId) {
    const name = context.accounts.find((account) => account.id === accountId)?.label ?? accountId;
    push("account", "account", name, "accountId");
  }

  const min = params.get("minAmount");
  if (min) push("minAmount", "minAmount", min, "minAmount");
  const max = params.get("maxAmount");
  if (max) push("maxAmount", "maxAmount", max, "maxAmount");

  const tag = params.get("tag");
  if (tag) push("tag", "tag", tag, "tag");

  return chips;
}
