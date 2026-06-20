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
