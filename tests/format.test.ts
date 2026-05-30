import { describe, expect, it } from "vitest";
import { formatCurrency, formatPercent } from "@/lib/format";
import { clamp, percent, roundMoney, toNumber } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats positive RUB value", () => {
    const result = formatCurrency(1500, "RUB");
    expect(result).toContain("1");
    expect(result).toContain("500");
  });

  it("formats zero as 0 ₽", () => {
    const result = formatCurrency(0, "RUB");
    expect(result).toContain("0");
  });

  it("formats negative value with minus sign", () => {
    const result = formatCurrency(-500, "RUB");
    // Intl may use hyphen-minus or Unicode minus depending on environment
    expect(result).toMatch(/[-−]/);
    expect(result).toContain("500");
  });
});

describe("formatPercent", () => {
  it("formats 50 as ~50%", () => {
    const result = formatPercent(50);
    expect(result).toContain("50");
    expect(result).toContain("%");
  });

  it("formats 0 as 0%", () => {
    expect(formatPercent(0)).toContain("0");
  });
});

describe("clamp", () => {
  it("clamps below minimum", () => expect(clamp(-5, 0, 100)).toBe(0));
  it("clamps above maximum", () => expect(clamp(150, 0, 100)).toBe(100));
  it("returns value within range", () => expect(clamp(50, 0, 100)).toBe(50));
});

describe("percent", () => {
  it("returns percentage", () => expect(percent(25, 100)).toBe(25));
  it("handles zero total", () => expect(percent(10, 0)).toBe(0));
  it("handles equal values", () => expect(percent(50, 50)).toBe(100));
});

describe("roundMoney", () => {
  it("rounds to 2 decimal places", () => expect(roundMoney(1.005)).toBe(1.01));
  it("handles whole numbers", () => expect(roundMoney(100)).toBe(100));
  it("handles floating point", () => {
    const result = roundMoney(0.1 + 0.2);
    expect(result).toBeCloseTo(0.3, 2);
  });
});

describe("toNumber", () => {
  it("converts string to number", () => expect(toNumber("42.5")).toBe(42.5));
  it("handles comma decimal", () => expect(toNumber("1,5")).toBe(1.5));
  it("handles number passthrough", () => expect(toNumber(99)).toBe(99));
  it("handles null", () => expect(toNumber(null)).toBe(0));
});
