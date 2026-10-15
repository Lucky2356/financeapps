// Multi-currency foundation (plan C7). The app's base/display currency is RUB;
// accounts may hold other currencies, and balances are converted to the base
// using a user-maintained rate table so net worth stays a single, honest number.
//
// Rates are expressed as "how many RUB is 1 unit of the currency" (RUB itself is
// always 1). They are user-editable defaults, not a live feed — a finance tool
// must never silently invent exchange rates.

export const BASE_CURRENCY = "RUB" as const;

// Single source of truth for the supported set (also feeds z.enum via a tuple).
export const CURRENCY_CODES = ["RUB", "USD", "EUR", "GBP", "CNY", "KZT"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type CurrencyMeta = {
  code: CurrencyCode;
  label: string;
};

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: "RUB", label: "₽ Рубль" },
  { code: "USD", label: "$ Доллар США" },
  { code: "EUR", label: "€ Евро" },
  { code: "GBP", label: "£ Фунт стерлингов" },
  { code: "CNY", label: "¥ Юань" },
  { code: "KZT", label: "₸ Тенге" }
];

export const SUPPORTED_CURRENCY_CODES: readonly CurrencyCode[] = CURRENCY_CODES;

/** Знак валюты из подписи: «₽ Рубль» → «₽». */
function currencySymbolOf(code: string): string {
  const meta = SUPPORTED_CURRENCIES.find((item) => item.code === code);
  return meta ? meta.label.split(" ")[0] : "";
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

function currencyNames(locale: string): Intl.DisplayNames | null {
  if (!displayNames.has(locale)) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: "currency", fallback: "none" });
    } catch {
      // Старый движок без Intl.DisplayNames — останется код валюты.
    }
    displayNames.set(locale, names);
  }
  return displayNames.get(locale) ?? null;
}

/**
 * Подпись валюты в выборе — на языке экрана: «₽ Рубль» / «₽ Russian Ruble».
 *
 * Русские подписи — свои, короткие («Юань», а не «китайский юань», как у Intl).
 * Английские — от Intl.DisplayNames: он знает названия всех валют, и новая
 * валюта в списке не потребует перевода. Если движок названия не знает, —
 * знак и код: «¥ CNY», но не русское слово среди английского.
 */
export function currencyLabel(code: string, locale: "ru" | "en"): string {
  if (locale === "ru") {
    return SUPPORTED_CURRENCIES.find((item) => item.code === code)?.label ?? code;
  }
  const name = currencyNames("en")?.of(code) ?? code;
  const symbol = currencySymbolOf(code);
  return symbol ? `${symbol} ${name}` : name;
}

export type CurrencyRates = Partial<Record<CurrencyCode, number>>;

// Starting rates (RUB per 1 unit). Deliberately round, user-editable defaults.
export const DEFAULT_CURRENCY_RATES: CurrencyRates = {
  RUB: 1,
  USD: 90,
  EUR: 100,
  GBP: 115,
  CNY: 12,
  KZT: 0.2
};

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCY_CODES as string[]).includes(code);
}

// RUB per 1 unit of `code`. Falls back to 1 for the base or unknown codes so a
// missing rate degrades to "treat as base" rather than zeroing out money.
export function rateFor(code: string, rates: CurrencyRates = DEFAULT_CURRENCY_RATES): number {
  if (code === BASE_CURRENCY) return 1;
  const rate = isSupportedCurrency(code) ? rates[code] : undefined;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
}

// Converts an amount in `code` into the base currency (RUB).
export function toBaseAmount(
  amount: number,
  code: string,
  rates: CurrencyRates = DEFAULT_CURRENCY_RATES
): number {
  return amount * rateFor(code, rates);
}

// Converts between two arbitrary supported currencies via the base.
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: CurrencyRates = DEFAULT_CURRENCY_RATES
): number {
  if (from === to) return amount;
  const base = toBaseAmount(amount, from, rates);
  return base / rateFor(to, rates);
}
