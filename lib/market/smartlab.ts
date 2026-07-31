// Reads company fundamentals from a smart-lab.ru quote page
// (https://smart-lab.ru/q/<TICKER>/f/y/) so the user can set alert flags on
// metrics like Debt/EBITDA. Pure string parsing — the HTTP call lives in the
// desktop-only fetcher, because the site sends no CORS headers.
//
// The page marks every metric row with a machine-readable attribute:
//   <tr field="debt_ebitda"> <th>…label…</th> … <td>-1.17</td> <td>0.54</td> …
// so we key off `field=` rather than the visible (localized) label — that is far
// more stable across redesigns. Values run oldest → newest; the last numeric
// cell is the current one (LTM).
//
// The parser is deliberately forgiving: an unknown/missing metric yields null
// instead of throwing, so a site redesign degrades to "no data" rather than a
// broken screen.

export type SmartLabMetric = {
  field: string;
  /** All numeric values found in the row, oldest → newest. */
  values: number[];
  /** The most recent value (LTM column when present). */
  latest: number | null;
};

export type SmartLabFundamentals = {
  ticker: string;
  metrics: Record<string, SmartLabMetric>;
  /** ISO timestamp of when this snapshot was parsed. */
  fetchedAt: string;
};

/** Metrics we surface in the UI (machine ids as used by smart-lab). */
export const SMARTLAB_FIELDS = [
  "debt_ebitda",
  "ev_ebitda",
  "p_e",
  "p_bv",
  "p_s",
  "roe",
  "net_debt",
  "revenue",
  "ebitda",
  "net_income",
  "div_yield",
  "market_cap"
] as const;

export function smartLabUrl(ticker: string): string {
  const clean = ticker
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return `https://smart-lab.ru/q/${clean}/f/y/`;
}

// "1 234,5" / "-1.17" / "12%" → number; anything non-numeric → null.
function toNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/&nbsp;| /g, " ")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

export function parseSmartLabFundamentals(html: string, ticker: string): SmartLabFundamentals {
  const metrics: Record<string, SmartLabMetric> = {};

  // Each metric row: <tr field="x"> … </tr>
  const rowPattern = /<tr\s+field="([a-z0-9_]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const field = match[1];
    const body = match[2];

    // Only data cells: skip the chart-icon and LTM-spacer columns.
    const cellPattern = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    const values: number[] = [];
    let cell: RegExpExecArray | null;
    while ((cell = cellPattern.exec(body)) !== null) {
      const attrs = cell[1] ?? "";
      if (/chartrow|ltm_spc/i.test(attrs)) continue;
      const value = toNumber(stripTags(cell[2]));
      if (value !== null) values.push(value);
    }

    if (values.length > 0) {
      metrics[field] = { field, values, latest: values[values.length - 1] };
    }
  }

  return {
    ticker: ticker.trim().toUpperCase(),
    metrics,
    fetchedAt: new Date().toISOString()
  };
}

/** Convenience: current value of one metric, or null when unavailable. */
export function metricValue(data: SmartLabFundamentals | null, field: string): number | null {
  return data?.metrics[field]?.latest ?? null;
}
