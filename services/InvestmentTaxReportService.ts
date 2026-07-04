import { roundMoney } from "@/lib/utils";
import { progressiveInvestmentTax } from "@/services/InvestmentTaxService";

// Year-by-year realized-income tax report from a ledger of realized events
// (sells and dividends). This is a genuine "what was realized" report (unlike
// the unrealized "if sold now" estimate in InvestmentTaxService), but still an
// estimate: it applies the RU 13%/15% scale to the combined base and does not
// model the long-term-holding exemption, loss carry-forward across years, or
// tax already withheld by a broker.

export type RealizedEvent = {
  type: "SELL" | "DIVIDEND";
  date: string; // YYYY-MM-DD
  quantity: number;
  sellPrice: number;
  buyPrice: number;
  amount: number; // dividend gross
  fee: number;
};

export type YearTaxReport = {
  year: number;
  realizedGain: number; // net capital gains (may be negative)
  dividends: number;
  taxableBase: number; // max(realizedGain, 0) + dividends
  estimatedTax: number;
};

export type RealizedTaxReport = {
  years: YearTaxReport[];
  totalTax: number;
};

// Realized capital gain of a single SELL: qty × (sell − buy) − fee.
export function sellGain(event: RealizedEvent): number {
  return event.quantity * (event.sellPrice - event.buyPrice) - event.fee;
}

export function buildRealizedTaxReport(events: RealizedEvent[]): RealizedTaxReport {
  const byYear = new Map<number, { gain: number; dividends: number }>();

  for (const event of events) {
    const year = Number(event.date.slice(0, 4));
    if (!Number.isFinite(year) || year < 1970) continue;
    const bucket = byYear.get(year) ?? { gain: 0, dividends: 0 };
    if (event.type === "SELL") bucket.gain += sellGain(event);
    else bucket.dividends += event.amount;
    byYear.set(year, bucket);
  }

  const years: YearTaxReport[] = [...byYear.entries()]
    .map(([year, { gain, dividends }]) => {
      const taxableBase = Math.max(gain, 0) + dividends;
      return {
        year,
        realizedGain: roundMoney(gain),
        dividends: roundMoney(dividends),
        taxableBase: roundMoney(taxableBase),
        estimatedTax: roundMoney(progressiveInvestmentTax(taxableBase))
      };
    })
    .sort((a, b) => b.year - a.year);

  return { years, totalTax: roundMoney(years.reduce((sum, y) => sum + y.estimatedTax, 0)) };
}
