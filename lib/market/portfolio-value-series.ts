import type { StockPricePoint } from "@/components/charts/stock-price-chart";

export type PortfolioHoldingSeries = { quantity: number; points: StockPricePoint[] };

// Combines per-holding historical close prices into a single portfolio-value
// series: for each trading day, value = Σ quantity × close. A holding without a
// trade on a given day carries its last known price forward, so the total stays
// consistent across days where only some tickers traded. Dates are normalized to
// YYYY-MM-DD so series from different tickers align.
//
// NOTE: this values the CURRENT holdings over the whole window — it does not
// reconstruct past position sizes (a "what is my portfolio worth over time" view,
// not a transaction-accurate P/L history).
export function combinePortfolioValue(holdings: PortfolioHoldingSeries[]): StockPricePoint[] {
  const maps = holdings.map((holding) => ({
    quantity: holding.quantity,
    byDate: new Map(holding.points.map((p) => [p.date.slice(0, 10), p.price]))
  }));

  const allDates = [...new Set(maps.flatMap((m) => [...m.byDate.keys()]))].sort();
  const lastPrice = maps.map(() => 0);
  const result: StockPricePoint[] = [];

  for (const date of allDates) {
    let value = 0;
    let hasAny = false;
    maps.forEach((m, i) => {
      const price = m.byDate.get(date);
      if (price !== undefined && price > 0) lastPrice[i] = price;
      if (lastPrice[i] > 0) {
        value += m.quantity * lastPrice[i];
        hasAny = true;
      }
    });
    if (hasAny) result.push({ date, price: Number(value.toFixed(2)) });
  }

  return result;
}
