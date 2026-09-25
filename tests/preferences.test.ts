// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { currencySign, formatCompactCurrency, formatCurrency } from "@/lib/format";
import {
  PREFERENCES_CHANGED,
  readStartScreen,
  setAmountsHidden,
  setKopecksShown,
  setStartScreen
} from "@/lib/preferences";

// Пробелы в числах Intl ставит неразрывные — сравниваем без них.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("житейские настройки", () => {
  afterEach(() => {
    setAmountsHidden(false);
    setKopecksShown(false);
    setStartScreen("/");
  });

  it("скрывает суммы точками одной длины, оставляя знак валюты", () => {
    setAmountsHidden(true);
    expect(formatCurrency(150)).toBe("•••• ₽");
    expect(formatCurrency(1_250_000)).toBe("•••• ₽");
    expect(formatCompactCurrency(1_250_000, "USD")).toBe(`•••• ${currencySign("USD")}`);
  });

  it("показывает копейки только там, где они есть", () => {
    expect(plain(formatCurrency(149.9))).toBe("150 ₽");
    setKopecksShown(true);
    expect(plain(formatCurrency(149.9))).toBe("149,90 ₽");
    expect(plain(formatCurrency(150))).toBe("150 ₽");
  });

  it("сообщает экранам, что вид сумм поменялся", () => {
    let heard = 0;
    const listener = () => heard++;
    window.addEventListener(PREFERENCES_CHANGED, listener);
    setAmountsHidden(true);
    setKopecksShown(true);
    window.removeEventListener(PREFERENCES_CHANGED, listener);
    expect(heard).toBe(2);
  });

  it("помнит экран запуска и не принимает чужой", () => {
    expect(readStartScreen()).toBe("/");
    setStartScreen("/transactions");
    expect(readStartScreen()).toBe("/transactions");
    window.localStorage.setItem("start-screen", "/settings");
    expect(readStartScreen()).toBe("/");
  });
});
