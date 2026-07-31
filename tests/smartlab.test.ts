import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { metricValue, parseSmartLabFundamentals, smartLabUrl } from "@/lib/market/smartlab";

// Real markup captured from https://smart-lab.ru/q/ETLN/f/y/ (financials table
// only) so the parser is verified against the actual page, not a hand-written
// approximation.
const fixture = readFileSync(join(__dirname, "fixtures", "smartlab-etln.html"), "utf8");

describe("smartLabUrl", () => {
  it("builds the yearly-fundamentals URL and normalizes the ticker", () => {
    expect(smartLabUrl("etln")).toBe("https://smart-lab.ru/q/ETLN/f/y/");
    expect(smartLabUrl(" sber ")).toBe("https://smart-lab.ru/q/SBER/f/y/");
  });
});

describe("parseSmartLabFundamentals", () => {
  const data = parseSmartLabFundamentals(fixture, "ETLN");

  it("extracts metrics keyed by the machine field id", () => {
    expect(data.ticker).toBe("ETLN");
    expect(Object.keys(data.metrics).length).toBeGreaterThan(10);
    expect(data.metrics.debt_ebitda).toBeDefined();
  });

  it("reads Debt/EBITDA values oldest → newest and reports the latest", () => {
    const debt = data.metrics.debt_ebitda;
    // From the captured page: -1.17, 0.54, 1.74, 2.09, 3.80, LTM 3.80
    expect(debt.values).toContain(-1.17);
    expect(debt.values).toContain(3.8);
    expect(debt.latest).toBe(debt.values[debt.values.length - 1]);
  });

  it("exposes a convenience accessor that tolerates missing data", () => {
    expect(metricValue(data, "debt_ebitda")).toBe(data.metrics.debt_ebitda.latest);
    expect(metricValue(data, "no_such_metric")).toBeNull();
    expect(metricValue(null, "debt_ebitda")).toBeNull();
  });

  it("degrades to an empty result on unrelated or broken HTML", () => {
    expect(parseSmartLabFundamentals("<html><body>nope</body></html>", "X").metrics).toEqual({});
    expect(parseSmartLabFundamentals("", "X").metrics).toEqual({});
  });
});
