import { describe, expect, it } from "vitest";

import { compareToIndex } from "@/lib/market/compare-series";

describe("сравнение с индексом", () => {
  it("обе кривые — в % от первого общего дня, пропуски — последним значением", () => {
    const series = compareToIndex(
      [
        { date: "2026-09-01T00:00:00Z", price: 100 },
        { date: "2026-09-02T00:00:00Z", price: 110 },
        { date: "2026-09-04T00:00:00Z", price: 121 }
      ],
      [
        { date: "2026-09-01", price: 3000 },
        { date: "2026-09-03", price: 3150 },
        { date: "2026-09-04", price: 2850 }
      ]
    );
    expect(series).toEqual([
      { date: "2026-09-01", a: 0, b: 0 },
      { date: "2026-09-02", a: 10, b: 0 },
      { date: "2026-09-03", a: 10, b: 5 },
      { date: "2026-09-04", a: 21, b: -5 }
    ]);
  });

  it("нет общего дня — сравнивать нечего", () => {
    expect(compareToIndex([{ date: "2026-09-01", price: 1 }], [])).toEqual([]);
  });
});
