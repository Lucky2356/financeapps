import { describe, expect, it } from "vitest";

import { firstOf, id, monthKeyOf, normalizePath, toFormObject } from "@/lib/api/local/helpers";

describe("local helpers", () => {
  it("id produces a prefixed, reasonably unique value", () => {
    const a = id("acc");
    const b = id("acc");
    expect(a.startsWith("acc-")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("monthKeyOf formats a date as YYYY-MM", () => {
    expect(monthKeyOf(new Date("2026-06-09T12:00:00"))).toBe("2026-06");
    expect(monthKeyOf(new Date("2026-12-31T00:00:00"))).toBe("2026-12");
  });

  it("firstOf returns the first element of an array or the value itself", () => {
    expect(firstOf(["a", "b"])).toBe("a");
    expect(firstOf("solo")).toBe("solo");
    expect(firstOf(undefined)).toBeUndefined();
  });

  it("normalizePath splits pathname and query params", () => {
    const { pathname, searchParams } = normalizePath("/transactions?page=2&type=EXPENSE");
    expect(pathname).toBe("/transactions");
    expect(searchParams.get("page")).toBe("2");
    expect(searchParams.get("type")).toBe("EXPENSE");
  });

  it("toFormObject flattens a body to a string record, taking first of arrays", () => {
    expect(toFormObject({ name: "Карта", tags: ["a", "b"] })).toEqual({ name: "Карта", tags: "a" });
    expect(toFormObject(null)).toEqual({});
  });
});
