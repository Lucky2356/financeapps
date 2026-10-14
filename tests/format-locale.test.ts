import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseShownNumber } from "@/components/ui/animated-value";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatMonth,
  formatPercent
} from "@/lib/format";
import { displayLocale, intlLocale, setDisplayLocale } from "@/lib/i18n/display-locale";
import { buildNetWorthTrend } from "@/lib/net-worth";
import { setKopecksShown } from "@/lib/preferences";

// Даты, суммы и проценты — на языке экрана. Раньше всё это было по-русски и в
// английском режиме: «01 сент. 2026» и «1 234 ₽» среди английского текста.
//
// Дни хранения — те же, что в stored-day-format.test.ts: полночь UTC и голый
// день показываются тем же числом и к западу от Гринвича.
const ZONES = ["Europe/Moscow", "America/New_York"] as const;
const originalZone = process.env.TZ;
// Узкий неразрывный пробел (U+202F) и обычный неразрывный (U+00A0) — Intl
// ставит их по-разному в разных версиях ICU; сравниваем без них.
const plain = (text: string) => text.replace(/[  ]/g, " ");

afterEach(() => {
  setDisplayLocale("ru");
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});

describe("язык экрана", () => {
  it("по умолчанию русский; тег Intl — ru-RU / en-GB", () => {
    expect(displayLocale()).toBe("ru");
    expect(intlLocale("ru")).toBe("ru-RU");
    expect(intlLocale("en")).toBe("en-GB");
    setDisplayLocale("en");
    expect(intlLocale()).toBe("en-GB");
  });
});

describe.each(ZONES)("даты в %s", (zone) => {
  it("по-русски — как прежде", () => {
    process.env.TZ = zone;
    expect(formatDate("2026-09-01T00:00:00.000Z")).toBe("01 сент. 2026");
    expect(formatDate("2026-09-01")).toBe("01 сент. 2026");
    expect(formatMonth("2026-09-01T00:00:00.000Z")).toBe("сент. 2026");
  });

  it("по-английски — тот же день, английский месяц", () => {
    process.env.TZ = zone;
    setDisplayLocale("en");
    expect(formatDate("2026-09-01T00:00:00.000Z")).toBe("01 Sep 2026");
    expect(formatDate("2026-09-01")).toBe("01 Sep 2026");
    expect(formatMonth("2026-09-01T00:00:00Z")).toBe("Sep 2026");
    expect(formatDate("2026-05-31")).toBe("31 May 2026");
  });

  it("явный язык важнее языка экрана", () => {
    process.env.TZ = zone;
    setDisplayLocale("en");
    expect(formatDate("2026-09-01", "ru")).toBe("01 сент. 2026");
    setDisplayLocale("ru");
    expect(formatMonth("2026-10-01", "en")).toBe("Oct 2026");
  });
});

describe("суммы и проценты", () => {
  // Копейки по умолчанию спрятаны; здесь проверяется и разделитель дроби.
  beforeEach(() => setKopecksShown(true));
  afterEach(() => setKopecksShown(false));

  it("по-русски: «1 234,50 ₽», «12,5 %»", () => {
    expect(plain(formatCurrency(1234.5, "RUB"))).toBe("1 234,50 ₽");
    expect(plain(formatCurrency(-1500, "RUB"))).toBe("-1 500 ₽");
    expect(plain(formatPercent(12.5))).toBe("12,5 %");
    expect(plain(formatCompactCurrency(1_234_567, "RUB"))).toBe("1,2 млн ₽");
  });

  it("по-английски: знак впереди, узкий; запятая — тысячи, точка — дробь", () => {
    setDisplayLocale("en");
    expect(formatCurrency(1234.5, "RUB")).toBe("₽1,234.50");
    expect(formatCurrency(-1500, "RUB")).toBe("-₽1,500");
    expect(formatCurrency(20, "USD")).toBe("$20");
    expect(formatPercent(12.5)).toBe("12.5%");
    expect(formatCompactCurrency(1_234_567, "RUB")).toBe("₽1.2M");
    // −0 без минуса и по-английски.
    expect(formatCurrency(-0.004, "RUB")).toBe("₽0");
  });

  it("явный язык у суммы", () => {
    expect(formatCurrency(1234.5, "RUB", "en")).toBe("₽1,234.50");
    setDisplayLocale("en");
    expect(plain(formatCurrency(1234.5, "RUB", "ru"))).toBe("1 234,50 ₽");
  });
});

describe("число из готовой строки по языку", () => {
  beforeEach(() => setKopecksShown(true));
  afterEach(() => setKopecksShown(false));

  it("по-английски «₽1,234.50» — это 1234.5, а не 1.234", () => {
    expect(parseShownNumber("₽1,234.50", "en")).toMatchObject({
      value: 1234.5,
      fraction: 2,
      before: "₽",
      after: "",
      signFirst: false
    });
    expect(parseShownNumber("12.5%", "en")).toMatchObject({ value: 12.5, after: "%" });
  });

  it("минус перед знаком валюты", () => {
    expect(parseShownNumber("-₽1,500", "en")).toMatchObject({
      value: -1500,
      before: "₽",
      signFirst: true
    });
  });

  it("русские строки читаются как прежде", () => {
    expect(parseShownNumber("12 396,50 ₽", "ru")?.value).toBe(12396.5);
    expect(parseShownNumber("Норма −23 %", "ru")).toMatchObject({
      value: -23,
      before: "Норма ",
      signFirst: false
    });
  });

  it("сам берёт язык экрана", () => {
    setDisplayLocale("en");
    expect(parseShownNumber(formatCurrency(1234.5, "RUB"))?.value).toBe(1234.5);
    setDisplayLocale("ru");
    expect(parseShownNumber(formatCurrency(1234.5, "RUB"))?.value).toBe(1234.5);
  });
});

describe("подписи месяцев на графике капитала", () => {
  it("на языке, который передали", () => {
    const now = new Date(2026, 9, 13);
    const en = buildNetWorthTrend({
      currentNetWorth: 1000,
      transactions: [],
      now,
      monthsBack: 2,
      locale: "en"
    });
    expect(en.map((point) => point.month)).toEqual(["Sept", "Oct"]);
    const ru = buildNetWorthTrend({ currentNetWorth: 1000, transactions: [], now, monthsBack: 2 });
    expect(ru.map((point) => point.month)).toEqual(["сент.", "окт."]);
  });
});
