import { describe, expect, it } from "vitest";

import { effectiveLimit, rolloverCarry } from "@/lib/budget-rollover";

describe("rolloverCarry", () => {
  it("carries the previous month's positive remainder when enabled", () => {
    expect(rolloverCarry(true, 10000, 7000)).toBe(3000);
  });

  it("carries nothing when disabled", () => {
    expect(rolloverCarry(false, 10000, 7000)).toBe(0);
  });

  it("does not create negative headroom from an overspend", () => {
    expect(rolloverCarry(true, 10000, 13000)).toBe(0);
  });

  it("is zero when the previous month was spent exactly", () => {
    expect(rolloverCarry(true, 10000, 10000)).toBe(0);
  });
});

describe("effectiveLimit", () => {
  it("adds the carried amount to the base limit", () => {
    expect(effectiveLimit(10000, 3000)).toBe(13000);
  });

  it("equals the base limit when nothing is carried", () => {
    expect(effectiveLimit(10000, 0)).toBe(10000);
  });
});
