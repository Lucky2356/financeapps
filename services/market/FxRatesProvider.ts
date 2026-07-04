import {
  CURRENCY_CODES,
  isSupportedCurrency,
  type CurrencyCode,
  type CurrencyRates
} from "@/lib/currency";

// Live FX rates from the Central Bank of Russia (CBR) daily feed. Returns rates
// as "RUB per 1 unit of the currency" — the same shape the app uses everywhere
// (see lib/currency.ts). The result is a partial map: only supported currencies
// present in the feed are included, and RUB is always 1.
//
// The feed is plain XML with comma decimals and a per-currency nominal, e.g.:
//   <Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>90,50</Value></Valute>
//   <Valute><CharCode>KZT</CharCode><Nominal>100</Nominal><Value>18,20</Value></Valute>
// so the per-unit rate is Value / Nominal.

export const CBR_DAILY_URL = "https://www.cbr.ru/scripts/XML_daily.asp";

type FetchLike = (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;

// Parses the CBR XML string into a supported-currency rate map. Pure and unit-
// testable — no network. Malformed/absent entries are skipped, never guessed.
export function parseCbrRates(xml: string): CurrencyRates {
  const rates: CurrencyRates = { RUB: 1 };
  const valuteRe = /<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g;
  let match: RegExpExecArray | null;
  while ((match = valuteRe.exec(xml)) !== null) {
    const block = match[1];
    const code = tag(block, "CharCode")?.toUpperCase();
    if (!code || !isSupportedCurrency(code) || code === "RUB") continue;
    const nominal = Number((tag(block, "Nominal") ?? "1").replace(/\s/g, "").replace(",", "."));
    const value = Number((tag(block, "Value") ?? "").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(nominal) || nominal <= 0 || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    rates[code as CurrencyCode] = value / nominal;
  }
  return rates;
}

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  return m?.[1]?.trim();
}

// Fetches and parses the current CBR rates. `fetchImpl` is injectable for tests;
// defaults to the global fetch (works in the Tauri webview with the CBR host
// allow-listed in the CSP). Throws on a network/HTTP error so callers can keep
// the last-known cached rates.
export async function fetchCbrRates(fetchImpl: FetchLike = fetch): Promise<CurrencyRates> {
  const response = await fetchImpl(CBR_DAILY_URL);
  if (!response.ok) throw new Error(`CBR feed returned an error (${CBR_DAILY_URL}).`);
  const xml = await response.text();
  const rates = parseCbrRates(xml);
  // Sanity: require at least one non-base currency, else treat as a bad payload.
  const hasForeign = CURRENCY_CODES.some((code) => code !== "RUB" && rates[code] !== undefined);
  if (!hasForeign) throw new Error("CBR feed contained no usable rates.");
  return rates;
}
