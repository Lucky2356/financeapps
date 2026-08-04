import { describe, expect, it } from "vitest";

import { calculatedValue, evaluateExpression } from "@/lib/calculator/evaluate";

function value(input: string) {
  const result = evaluateExpression(input);
  return "value" in result ? result.value : result.error;
}

describe("evaluateExpression", () => {
  it("does the arithmetic anyone reaches for while entering an amount", () => {
    expect(value("1200*3")).toBe(3600);
    expect(value("2300+890+140")).toBe(3330);
    expect(value("5000-1250")).toBe(3750);
    expect(value("1000/4")).toBe(250);
  });

  it("respects operator precedence and parentheses", () => {
    expect(value("2+2*2")).toBe(6);
    expect(value("(2+2)*2")).toBe(8);
    expect(value("100-10*2+5")).toBe(85);
    expect(value("((1+2)*(3+4))")).toBe(21);
  });

  it("handles a leading minus as a sign, not a missing operand", () => {
    expect(value("-500+700")).toBe(200);
    expect(value("(-5)*3")).toBe(-15);
    expect(value("+250")).toBe(250);
  });

  it("treats percent the way a phone calculator does", () => {
    // The whole point: "5400 минус 15%" must be 4590, not 5399.85.
    expect(value("5400-15%")).toBe(4590);
    expect(value("1000+10%")).toBe(1100);
    expect(value("1000*10%")).toBe(100);
    expect(value("1000/10%")).toBe(10000);
    // With nothing in front, a percent is just a hundredth.
    expect(value("50%")).toBe(0.5);
  });

  it("accepts a comma as the decimal separator and keypad signs", () => {
    expect(value("1234,56+0,44")).toBe(1235);
    expect(value("100 × 3")).toBe(300);
    expect(value("100 ÷ 4")).toBe(25);
    expect(value("100 − 40")).toBe(60);
    expect(value(",5*4")).toBe(2);
  });

  it("parses an amount pasted in the app's own formatting", () => {
    // formatCurrency renders "1 234,56" with a non-breaking space.
    expect(value("1 234,56")).toBe(1234.56);
    expect(value("1 234 567")).toBe(1234567);
    expect(value("12 000+3 500")).toBe(15500);
  });

  it("rounds the result to kopecks", () => {
    expect(value("10/3")).toBe(3.33);
    expect(value("0,1+0,2")).toBe(0.3);
  });

  it("reports errors instead of throwing", () => {
    expect(value("")).toBe("empty");
    expect(value("   ")).toBe("empty");
    expect(value("100/0")).toBe("divide-by-zero");
    expect(value("100+")).toBe("syntax");
    expect(value("(100+2")).toBe("syntax");
    expect(value("100+2)")).toBe("syntax");
    expect(value("100 2")).toBe("syntax");
    expect(value("1.2.3")).toBe("syntax");
    expect(value("сумма")).toBe("syntax");
    expect(value("%")).toBe("syntax");
    expect(value(".")).toBe("syntax");
  });

  it("never evaluates anything but arithmetic", () => {
    // Whatever a stray paste contains, it is either a number or an error.
    expect(value("alert(1)")).toBe("syntax");
    expect(value("2**3")).toBe("syntax");
    expect(value("[1]+[2]")).toBe("syntax");
  });

  it("exposes a null-returning helper for the UI", () => {
    expect(calculatedValue("2+2")).toBe(4);
    expect(calculatedValue("2+")).toBeNull();
    expect(calculatedValue("")).toBeNull();
  });
});
