import { describe, expect, it } from "vitest";

import { roundMoney } from "@/lib/utils";

// Rounding to the kopeck, with halves going away from zero — the rule a person
// applies on paper. The `+ Number.EPSILON` this replaced was asymmetric: it
// rescued 1.005 but not 8.165, and it pulled negatives toward zero, so −1.005
// came out as −1 while +1.005 came out as 1.01.
describe("roundMoney", () => {
  it.each([
    [1.005, 1.01],
    [2.675, 2.68],
    [8.165, 8.17],
    [1.015, 1.02],
    [1.045, 1.05],
    [1.055, 1.06],
    [0.615, 0.62],
    [10.235, 10.24],
    [1234.565, 1234.57],
    [0.005, 0.01]
  ])("округляет %d вверх до %d", (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });

  // The half that used to go the other way.
  it.each([
    [-1.005, -1.01],
    [-2.675, -2.68],
    [-8.165, -8.17],
    [-0.005, -0.01]
  ])("округляет %d от нуля до %d", (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });

  it("не трогает то, что уже в копейках", () => {
    expect(roundMoney(1234.56)).toBe(1234.56);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(-42)).toBe(-42);
  });

  it("убирает двоичный шум сложения", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  // Ста тысяч операций хватало, чтобы прежняя версия разошлась с точной суммой.
  it("не накапливает расхождение на длинной истории", () => {
    let sum = 0;
    for (let i = 0; i < 100_000; i += 1) sum = roundMoney(sum + 0.07);
    expect(sum).toBe(7000);
  });

  it("держит суммы до верхней границы книги", () => {
    expect(roundMoney(999_999_999_999.005)).toBe(999_999_999_999.01);
  });

  it("возвращает нечисло как есть, а не как NaN-копейки", () => {
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(roundMoney(Number.NaN))).toBe(true);
  });
});
