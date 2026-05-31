import type { RiskProfileCode, SecurityRisk } from "@prisma/client";

import type { PortfolioRow, WatchlistRow } from "@/types/finance";

export type InvestmentSuggestion = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  risk: SecurityRisk;
  suggestedQuantity: number;
  suggestedAmount: number;
  rationale: string;
};

// Risk tolerance per profile and a stability weight (lower-risk securities are
// preferred for a more resilient portfolio).
const ALLOWED_RISK: Record<RiskProfileCode, SecurityRisk[]> = {
  CONSERVATIVE: ["LOW"],
  MODERATE: ["LOW", "MEDIUM"],
  AGGRESSIVE: ["LOW", "MEDIUM", "HIGH"]
};
const RISK_STABILITY: Record<SecurityRisk, number> = { LOW: 1, MEDIUM: 0.65, HIGH: 0.35 };
const RISK_LABEL: Record<SecurityRisk, string> = { LOW: "низкий риск", MEDIUM: "умеренный риск", HIGH: "высокий риск" };

// Recommends which securities to add to make the portfolio more diversified and
// resilient for a given monthly budget and risk profile. Allocates the budget
// across the best-fitting picks (whole shares only). Pure & deterministic.
export class InvestmentSuggestionService {
  suggest(params: {
    budget: number;
    riskProfile: RiskProfileCode;
    portfolio: PortfolioRow[];
    securities: WatchlistRow[];
  }): InvestmentSuggestion[] {
    const { budget, riskProfile, portfolio, securities } = params;
    if (!Number.isFinite(budget) || budget <= 0) return [];

    const allowed = ALLOWED_RISK[riskProfile] ?? ALLOWED_RISK.MODERATE;
    const totalValue = portfolio.reduce((sum, position) => sum + position.currentValue, 0);
    const sectorShare = new Map<string, number>();
    for (const position of portfolio) {
      const share = totalValue > 0 ? position.currentValue / totalValue : 0;
      sectorShare.set(position.sector, (sectorShare.get(position.sector) ?? 0) + share);
    }
    const heldTickers = new Set(portfolio.map((position) => position.ticker));

    const affordable = securities.filter((security) => allowed.includes(security.risk) && security.price <= budget);
    const candidates = affordable.length > 0 ? affordable : securities.filter((security) => allowed.includes(security.risk));

    const scored = candidates
      .map((security) => {
        const existingShare = sectorShare.get(security.sector) ?? 0;
        const isNewSector = !sectorShare.has(security.sector);
        const diversification = 1 - existingShare; // bigger when the sector is underweight
        const newSectorBonus = isNewSector ? 0.5 : 0;
        const momentum = Math.max(-0.3, Math.min(0.3, security.change30d / 100)); // mild profitability tilt
        const stability = RISK_STABILITY[security.risk] * 0.3;
        const alreadyHeldPenalty = heldTickers.has(security.ticker) ? -0.6 : 0;
        const score = diversification + newSectorBonus + momentum + stability + alreadyHeldPenalty;
        return { security, score, isNewSector };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);

    if (scored.length === 0) return [];
    const scoreSum = scored.reduce((sum, item) => sum + item.score, 0);

    return scored
      .map(({ security, score, isNewSector }) => {
        const amount = budget * (score / scoreSum);
        const suggestedQuantity = Math.floor(amount / security.price);
        const reasons: string[] = [];
        if (isNewSector) reasons.push(`добавляет новый сектор «${security.sector}»`);
        else reasons.push(`усиливает диверсификацию в секторе «${security.sector}»`);
        reasons.push(RISK_LABEL[security.risk]);
        if (security.change30d > 0) reasons.push(`рост за 30 дней +${security.change30d.toFixed(1)}%`);
        return {
          ticker: security.ticker,
          name: security.name,
          sector: security.sector,
          price: security.price,
          risk: security.risk,
          suggestedQuantity,
          suggestedAmount: Math.round(suggestedQuantity * security.price),
          rationale: reasons.join(", ")
        };
      })
      .filter((suggestion) => suggestion.suggestedQuantity >= 1);
  }
}
