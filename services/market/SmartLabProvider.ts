// Desktop-only fetcher for smart-lab.ru company fundamentals.
//
// The request goes through the Tauri HTTP plugin (Rust side), because the site
// sends no CORS headers — a plain browser fetch from the webview would be
// blocked. The allowed URLs are pinned to https://smart-lab.ru/* in
// src-tauri/capabilities/default.json, and the parsing itself is the pure code
// in lib/market/smartlab.
//
// Everything here is best-effort: any network/parse problem returns null so the
// UI shows "no data" instead of breaking.

import {
  parseSmartLabFundamentals,
  smartLabUrl,
  type SmartLabFundamentals
} from "@/lib/market/smartlab";

export async function fetchSmartLabFundamentals(
  ticker: string
): Promise<SmartLabFundamentals | null> {
  const url = smartLabUrl(ticker);
  if (!url.startsWith("https://smart-lab.ru/")) return null;

  try {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const response = await tauriFetch(url, {
      method: "GET",
      headers: { Accept: "text/html" }
    });
    if (!response.ok) return null;
    const html = await response.text();
    const data = parseSmartLabFundamentals(html, ticker);
    // No recognizable metrics → treat as "no data" (e.g. unknown ticker or a
    // site redesign) rather than returning an empty shell that looks valid.
    return Object.keys(data.metrics).length > 0 ? data : null;
  } catch {
    return null;
  }
}

/** Fetches several tickers sequentially (gentle on the site). */
export async function fetchManySmartLab(
  tickers: string[]
): Promise<Record<string, SmartLabFundamentals | null>> {
  const result: Record<string, SmartLabFundamentals | null> = {};
  for (const ticker of tickers) {
    result[ticker.toUpperCase()] = await fetchSmartLabFundamentals(ticker);
  }
  return result;
}
