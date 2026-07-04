import { roundMoney } from "@/lib/utils";

// Estimates the personal income tax (НДФЛ) on the portfolio's UNREALIZED gains
// as if every position were sold today. The app tracks positions (not a trade
// ledger), so this is an "if you sold now" estimate — not a filing-ready report:
// it excludes the long-term-holding exemption (ЛДВ), broker commissions,
// dividends and already-realized trades. Losses offset gains in the base.
//
// RU 2025 scale for investment income: 13% on the base up to 2.4M ₽, 15% above.

const THRESHOLD_RUB = 2_400_000;
const RATE_LOW = 0.13;
const RATE_HIGH = 0.15;

export type InvestmentTaxEstimate = {
  totalGain: number;
  totalLoss: number;
  taxableBase: number;
  estimatedTax: number;
  effectiveRate: number;
  hasGains: boolean;
  currency: string;
};

export function computeInvestmentTaxEstimate(
  positions: Array<{ pnl: number }>,
  currency = "RUB"
): InvestmentTaxEstimate {
  let totalGain = 0;
  let totalLoss = 0;
  for (const position of positions) {
    if (!Number.isFinite(position.pnl)) continue;
    if (position.pnl > 0) totalGain += position.pnl;
    else totalLoss += -position.pnl;
  }

  const taxableBase = Math.max(totalGain - totalLoss, 0);
  const lower = Math.min(taxableBase, THRESHOLD_RUB);
  const upper = Math.max(taxableBase - THRESHOLD_RUB, 0);
  const estimatedTax = lower * RATE_LOW + upper * RATE_HIGH;

  return {
    totalGain: roundMoney(totalGain),
    totalLoss: roundMoney(totalLoss),
    taxableBase: roundMoney(taxableBase),
    estimatedTax: roundMoney(estimatedTax),
    effectiveRate: taxableBase > 0 ? estimatedTax / taxableBase : 0,
    hasGains: totalGain > 0,
    currency
  };
}
