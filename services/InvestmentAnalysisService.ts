import type { RiskProfileCode } from "@prisma/client";

import type { PortfolioRow, RecommendationView } from "@/types/finance";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n/catalog";

type HistoricalSeries = Record<string, number[]>;

const profileLimits: Record<
  RiskProfileCode,
  { highRiskShare: number; singlePositionShare: number }
> = {
  CONSERVATIVE: { highRiskShare: 15, singlePositionShare: 25 },
  MODERATE: { highRiskShare: 30, singlePositionShare: 35 },
  AGGRESSIVE: { highRiskShare: 45, singlePositionShare: 45 }
};

export class InvestmentAnalysisService {
  analyze(
    portfolio: PortfolioRow[],
    riskProfile: RiskProfileCode,
    historicalPrices: HistoricalSeries = {},
    locale: Locale = DEFAULT_LOCALE
  ): { risks: RecommendationView[]; education: RecommendationView[] } {
    const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
    const total = portfolio.reduce((sum, row) => sum + row.currentValue, 0);
    const largest = portfolio.reduce<PortfolioRow | null>(
      (max, row) => (!max || row.share > max.share ? row : max),
      null
    );
    const highRiskShare = portfolio
      .filter((row) => row.risk === "HIGH")
      .reduce((sum, row) => sum + row.share, 0);
    const limits = profileLimits[riskProfile];
    const risks: RecommendationView[] = [];

    if (portfolio.length === 0 || total === 0) {
      return {
        risks: [
          {
            id: "portfolio-empty",
            title: t("svc.inv.empty.title"),
            description: t("svc.inv.empty.desc"),
            severity: "INFO"
          }
        ],
        education: this.education(locale)
      };
    }

    if (largest && largest.share > limits.singlePositionShare) {
      risks.push({
        id: "single-position-concentration",
        title: t("svc.inv.singlePos.title"),
        description: t("svc.inv.singlePos.desc", {
          ticker: largest.ticker,
          share: largest.share.toFixed(1)
        }),
        severity: largest.share > 50 ? "CRITICAL" : "WARNING"
      });
    }

    if (highRiskShare > limits.highRiskShare) {
      risks.push({
        id: "high-risk-share",
        title: t("svc.inv.highRisk.title"),
        description: t("svc.inv.highRisk.desc", { share: highRiskShare.toFixed(1) }),
        severity: "WARNING"
      });
    }

    if (portfolio.length < 5) {
      risks.push({
        id: "diversification",
        title: t("svc.inv.diversification.title"),
        description: t("svc.inv.diversification.desc"),
        severity: "INFO"
      });
    }

    const sectorShares = this.sectorShares(portfolio);
    const largestSector = sectorShares[0];
    if (largestSector && largestSector.share > 55) {
      risks.push({
        id: "sector-concentration",
        title: t("svc.inv.sector.title"),
        description: t("svc.inv.sector.desc", {
          sector: largestSector.sector,
          share: largestSector.share.toFixed(1)
        }),
        severity: largestSector.share > 70 ? "CRITICAL" : "WARNING"
      });
    }

    const volatileTickers = portfolio
      .map((row) => ({ row, volatility: this.volatility(historicalPrices[row.ticker] ?? []) }))
      .filter((item) => item.volatility > 3);

    for (const item of volatileTickers.slice(0, 2)) {
      risks.push({
        id: `volatility-${item.row.ticker}`,
        title: t("svc.inv.volatility.title", { ticker: item.row.ticker }),
        description: t("svc.inv.volatility.desc", { pct: item.volatility.toFixed(1) }),
        severity: "INFO"
      });
    }

    const drawdown = this.maxDrawdown(Object.values(historicalPrices).flat());
    if (drawdown < -12) {
      risks.push({
        id: "drawdown",
        title: t("svc.inv.drawdown.title"),
        description: t("svc.inv.drawdown.desc", { pct: drawdown.toFixed(1) }),
        severity: "WARNING"
      });
    }

    if (risks.length === 0) {
      risks.push({
        id: "risk-balanced",
        title: t("svc.inv.balanced.title"),
        description: t("svc.inv.balanced.desc"),
        severity: "SUCCESS"
      });
    }

    return {
      risks,
      education: this.education(locale)
    };
  }

  private education(locale: Locale = DEFAULT_LOCALE): RecommendationView[] {
    const t = (key: string) => translate(locale, key);
    return [
      {
        id: "education-risk",
        title: t("svc.inv.edu.risk.title"),
        description: t("svc.inv.edu.risk.desc"),
        severity: "INFO"
      },
      {
        id: "education-diversification",
        title: t("svc.inv.edu.div.title"),
        description: t("svc.inv.edu.div.desc"),
        severity: "INFO"
      },
      {
        id: "education-sector",
        title: t("svc.inv.edu.sector.title"),
        description: t("svc.inv.edu.sector.desc"),
        severity: "INFO"
      },
      {
        id: "education-profile",
        title: t("svc.inv.edu.profile.title"),
        description: t("svc.inv.edu.profile.desc"),
        severity: "INFO"
      }
    ];
  }

  private volatility(values: number[]) {
    if (values.length < 2) return 0;

    const returns = values
      .slice(1)
      .map((value, index) => ((value - values[index]) / values[index]) * 100);
    const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length;

    return Math.sqrt(variance);
  }

  private maxDrawdown(values: number[]) {
    if (values.length < 2) return 0;

    let peak = values[0];
    let maxDrop = 0;
    for (const value of values) {
      peak = Math.max(peak, value);
      maxDrop = Math.min(maxDrop, ((value - peak) / peak) * 100);
    }

    return maxDrop;
  }

  private sectorShares(portfolio: PortfolioRow[]) {
    const total = portfolio.reduce((sum, row) => sum + row.currentValue, 0);
    if (total === 0) return [];

    const shares = new Map<string, number>();
    for (const row of portfolio) {
      shares.set(row.sector, (shares.get(row.sector) ?? 0) + row.currentValue);
    }

    return [...shares.entries()]
      .map(([sector, value]) => ({ sector, share: (value / total) * 100 }))
      .sort((left, right) => right.share - left.share);
  }
}
