import { describe, expect, it } from "vitest";

import { currencyLabel, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { MARKET_SECTORS, sectorLabel } from "@/lib/market/sectors";

// Подписи в выборах — на языке экрана. В английском режиме выбор валюты
// показывал «USD — $ Доллар США», а выбор отрасли — «Нефть/Газ».

describe("подпись валюты", () => {
  it("по-русски — свои короткие названия, как прежде", () => {
    expect(currencyLabel("RUB", "ru")).toBe("₽ Рубль");
    expect(currencyLabel("CNY", "ru")).toBe("¥ Юань");
  });

  it("по-английски — название от Intl, знак впереди", () => {
    expect(currencyLabel("RUB", "en")).toBe("₽ Russian Ruble");
    expect(currencyLabel("USD", "en")).toBe("$ US Dollar");
    expect(currencyLabel("KZT", "en")).toBe("₸ Kazakhstani Tenge");
  });

  it("ни одной русской буквы в английском списке", () => {
    for (const { code } of SUPPORTED_CURRENCIES) {
      expect(currencyLabel(code, "en")).not.toMatch(/[А-Яа-яЁё]/);
    }
  });

  it("неизвестный код — сам код, без выдумок", () => {
    expect(currencyLabel("XXZ", "en")).toBe("XXZ");
    expect(currencyLabel("XXZ", "ru")).toBe("XXZ");
  });
});

describe("подпись отрасли", () => {
  it("по-русски — как записано", () => {
    expect(sectorLabel("Нефть/Газ", "ru")).toBe("Нефть/Газ");
  });

  it("по-английски — у каждой отрасли из списка есть перевод", () => {
    expect(sectorLabel("Нефть/Газ", "en")).toBe("Oil & Gas");
    for (const sector of MARKET_SECTORS) {
      expect(sectorLabel(sector, "en")).not.toMatch(/[А-Яа-яЁё]/);
    }
  });

  it("отрасль, вписанная руками, показывается как есть", () => {
    expect(sectorLabel("Моя отрасль", "en")).toBe("Моя отрасль");
  });
});
