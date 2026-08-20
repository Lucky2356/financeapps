import { describe, expect, it } from "vitest";

import { axisMoney } from "@/lib/charts/format";

// Axis labels are read as magnitudes, not as sums. "220 тыс. ₽" did not fit the
// width the axis reserves and wrapped onto two lines — every tick on the home
// screen was broken in half.
describe("axisMoney", () => {
  it("keeps thousands short", () => {
    expect(axisMoney(220_000, "ru")).toBe("220 тыс.");
    expect(axisMoney(220_000, "en")).toBe("220 k");
  });

  it("switches to millions before the label grows", () => {
    expect(axisMoney(1_200_000, "ru")).toBe("1,2 млн");
    expect(axisMoney(1_000_000, "ru")).toBe("1 млн");
    expect(axisMoney(12_000_000, "ru")).toBe("12 млн");
    expect(axisMoney(1_200_000, "en")).toBe("1.2 M");
  });

  it("leaves small numbers alone, including zero and negatives", () => {
    expect(axisMoney(0, "ru")).toBe("0");
    expect(axisMoney(940, "ru")).toBe("940");
    expect(axisMoney(-15_000, "ru")).toBe("-15 тыс.");
  });

  it("never returns a label long enough to wrap the axis", () => {
    for (const value of [0, 950, 12_345, 220_000, 999_999, 1_200_000, 87_600_000])
      expect(axisMoney(value, "ru").length).toBeLessThanOrEqual(9);
  });
});
