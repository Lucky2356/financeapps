import { describe, expect, it } from "vitest";

import { fetchCbrRates, parseCbrRates } from "@/services/market/FxRatesProvider";

const SAMPLE = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="04.07.2026" name="Foreign Currency Market">
  <Valute ID="R01235"><CharCode>USD</CharCode><Nominal>1</Nominal><Value>90,50</Value></Valute>
  <Valute ID="R01239"><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>100,20</Value></Valute>
  <Valute ID="R01375"><CharCode>CNY</CharCode><Nominal>1</Nominal><Value>12,40</Value></Valute>
  <Valute ID="R01335"><CharCode>KZT</CharCode><Nominal>100</Nominal><Value>18,00</Value></Valute>
  <Valute ID="R01700"><CharCode>XYZ</CharCode><Nominal>1</Nominal><Value>5,00</Value></Valute>
</ValCurs>`;

describe("parseCbrRates", () => {
  it("parses supported currencies as RUB-per-unit and pins RUB to 1", () => {
    const rates = parseCbrRates(SAMPLE);
    expect(rates.RUB).toBe(1);
    expect(rates.USD).toBeCloseTo(90.5);
    expect(rates.EUR).toBeCloseTo(100.2);
    expect(rates.CNY).toBeCloseTo(12.4);
  });

  it("divides by the nominal (e.g. KZT is quoted per 100)", () => {
    const rates = parseCbrRates(SAMPLE);
    expect(rates.KZT).toBeCloseTo(0.18);
  });

  it("ignores unsupported currency codes", () => {
    const rates = parseCbrRates(SAMPLE) as Record<string, number>;
    expect(rates.XYZ).toBeUndefined();
  });

  it("skips malformed entries without throwing", () => {
    const rates = parseCbrRates(
      `<Valute><CharCode>USD</CharCode><Nominal>0</Nominal><Value>90,0</Value></Valute>`
    );
    expect(rates.USD).toBeUndefined();
    expect(rates.RUB).toBe(1);
  });
});

describe("fetchCbrRates", () => {
  it("fetches and parses via the injected fetch", async () => {
    const rates = await fetchCbrRates(async () => ({ ok: true, text: async () => SAMPLE }));
    expect(rates.USD).toBeCloseTo(90.5);
  });

  it("throws on an HTTP error", async () => {
    await expect(
      fetchCbrRates(async () => ({ ok: false, text: async () => "" }))
    ).rejects.toThrow();
  });

  it("throws when the feed has no usable rates", async () => {
    await expect(
      fetchCbrRates(async () => ({ ok: true, text: async () => "<ValCurs></ValCurs>" }))
    ).rejects.toThrow();
  });
});
