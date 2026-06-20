import { describe, expect, it } from "vitest";

import {
  BASE_CURRENCY,
  convert,
  DEFAULT_CURRENCY_RATES,
  isSupportedCurrency,
  rateFor,
  toBaseAmount
} from "@/lib/currency";

describe("currency helpers", () => {
  it("treats the base currency as rate 1", () => {
    expect(BASE_CURRENCY).toBe("RUB");
    expect(rateFor("RUB")).toBe(1);
    expect(toBaseAmount(1000, "RUB")).toBe(1000);
  });

  it("converts a foreign amount to the base using the rate table", () => {
    expect(toBaseAmount(100, "USD", { USD: 90 })).toBe(9000);
    expect(toBaseAmount(10, "EUR", DEFAULT_CURRENCY_RATES)).toBe(1000);
  });

  it("falls back to rate 1 for unknown or non-positive rates (never zeroes money)", () => {
    expect(rateFor("XXX")).toBe(1);
    expect(rateFor("USD", { USD: 0 })).toBe(1);
    expect(rateFor("USD", { USD: -5 })).toBe(1);
    expect(toBaseAmount(50, "XXX")).toBe(50);
  });

  it("convert returns the same amount when currencies match", () => {
    expect(convert(123, "USD", "USD")).toBe(123);
  });

  it("convert goes through the base currency", () => {
    // 90 USD -> 8100 RUB -> 81 EUR at rate 100.
    expect(convert(90, "USD", "EUR", { USD: 90, EUR: 100 })).toBeCloseTo(81, 5);
  });

  it("recognizes supported currency codes", () => {
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("ZZZ")).toBe(false);
  });
});
