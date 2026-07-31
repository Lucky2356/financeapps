import { describe, expect, it } from "vitest";

import { NO_MONTH, pickBestWorstMonth } from "@/lib/analytics/best-month";

describe("pickBestWorstMonth", () => {
  it("returns an em dash when there is no activity at all", () => {
    // Empty profile: every month is zero — reporting "март" here looked like
    // real data to users.
    const rows = ["янв.", "февр.", "март", "апр."].map((month) => ({
      month,
      income: 0,
      expense: 0,
      savings: 0
    }));
    expect(pickBestWorstMonth(rows)).toEqual({ best: NO_MONTH, worst: NO_MONTH });
  });

  it("returns an em dash when every month has identical savings", () => {
    const rows = ["янв.", "февр."].map((month) => ({
      month,
      income: 1000,
      expense: 500,
      savings: 500
    }));
    expect(pickBestWorstMonth(rows)).toEqual({ best: NO_MONTH, worst: NO_MONTH });
  });

  it("picks the highest and lowest savings months", () => {
    const rows = [
      { month: "янв.", income: 1000, expense: 900, savings: 100 },
      { month: "февр.", income: 1000, expense: 200, savings: 800 },
      { month: "март", income: 1000, expense: 1500, savings: -500 }
    ];
    expect(pickBestWorstMonth(rows)).toEqual({ best: "февр.", worst: "март" });
  });

  it("handles an empty list", () => {
    expect(pickBestWorstMonth([])).toEqual({ best: NO_MONTH, worst: NO_MONTH });
  });
});
