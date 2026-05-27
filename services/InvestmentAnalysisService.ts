import type { RiskProfileCode } from "@prisma/client";

import type { PortfolioRow, RecommendationView } from "@/types/finance";

type HistoricalSeries = Record<string, number[]>;

const profileLimits: Record<RiskProfileCode, { highRiskShare: number; singlePositionShare: number }> = {
  CONSERVATIVE: { highRiskShare: 15, singlePositionShare: 25 },
  MODERATE: { highRiskShare: 30, singlePositionShare: 35 },
  AGGRESSIVE: { highRiskShare: 45, singlePositionShare: 45 }
};

export class InvestmentAnalysisService {
  analyze(
    portfolio: PortfolioRow[],
    riskProfile: RiskProfileCode,
    historicalPrices: HistoricalSeries = {}
  ): { risks: RecommendationView[]; education: RecommendationView[] } {
    const total = portfolio.reduce((sum, row) => sum + row.currentValue, 0);
    const largest = portfolio.reduce<PortfolioRow | null>((max, row) => (!max || row.share > max.share ? row : max), null);
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
            title: "Портфель пуст",
            description: "Добавьте позиции, чтобы увидеть анализ структуры и рисков.",
            severity: "INFO"
          }
        ],
        education: this.education()
      };
    }

    if (largest && largest.share > limits.singlePositionShare) {
      risks.push({
        id: "single-position-concentration",
        title: "Высокая доля одной бумаги",
        description: `${largest.ticker} занимает ${largest.share.toFixed(1)}% портфеля. Такая концентрация повышает зависимость результата от одного эмитента.`,
        severity: largest.share > 50 ? "CRITICAL" : "WARNING"
      });
    }

    if (highRiskShare > limits.highRiskShare) {
      risks.push({
        id: "high-risk-share",
        title: "Доля высокорисковых бумаг выше профиля",
        description: `Высокорисковые инструменты занимают ${highRiskShare.toFixed(1)}% портфеля. Для выбранного профиля это может быть рискованным.`,
        severity: "WARNING"
      });
    }

    if (portfolio.length < 5) {
      risks.push({
        id: "diversification",
        title: "Диверсификация ограничена",
        description: "В портфеле меньше пяти бумаг. Результат сильнее зависит от отдельных компаний и секторов.",
        severity: "INFO"
      });
    }

    const sectorShares = this.sectorShares(portfolio);
    const largestSector = sectorShares[0];
    if (largestSector && largestSector.share > 55) {
      risks.push({
        id: "sector-concentration",
        title: "Высокая концентрация в одном секторе",
        description: `${largestSector.sector} занимает ${largestSector.share.toFixed(1)}% портфеля. Такая структура повышает чувствительность к отраслевым событиям и регулированию.`,
        severity: largestSector.share > 70 ? "CRITICAL" : "WARNING"
      });
    }

    const volatileTickers = portfolio
      .map((row) => ({ row, volatility: this.volatility(historicalPrices[row.ticker] ?? []) }))
      .filter((item) => item.volatility > 3);

    for (const item of volatileTickers.slice(0, 2)) {
      risks.push({
        id: `volatility-${item.row.ticker}`,
        title: `${item.row.ticker}: повышенная волатильность`,
        description: `Исторические колебания за период составляют около ${item.volatility.toFixed(1)}% в день. Можно рассмотреть дополнительное изучение факторов риска.`,
        severity: "INFO"
      });
    }

    const drawdown = this.maxDrawdown(Object.values(historicalPrices).flat());
    if (drawdown < -12) {
      risks.push({
        id: "drawdown",
        title: "Заметная просадка по историческим данным",
        description: `Максимальная просадка по доступному ряду около ${drawdown.toFixed(1)}%. Это полезно учитывать при оценке устойчивости портфеля.`,
        severity: "WARNING"
      });
    }

    if (risks.length === 0) {
      risks.push({
        id: "risk-balanced",
        title: "Критичных концентраций не найдено",
        description: "По текущим демо-данным структура портфеля выглядит сбалансированной относительно выбранного риск-профиля.",
        severity: "SUCCESS"
      });
    }

    return {
      risks,
      education: this.education()
    };
  }

  private education(): RecommendationView[] {
    return [
      {
        id: "education-risk",
        title: "Риск связан не только с просадкой цены",
        description: "Учитывайте ликвидность, сектор, долговую нагрузку, валютную чувствительность и новостной фон эмитента.",
        severity: "INFO"
      },
      {
        id: "education-diversification",
        title: "Диверсификация снижает зависимость от одного сценария",
        description: "Разные отрасли и инструменты могут по-разному реагировать на ставки, инфляцию и корпоративные события.",
        severity: "INFO"
      },
      {
        id: "education-sector",
        title: "Секторная структура важна не меньше тикеров",
        description: "Даже несколько бумаг могут вести себя похоже, если они зависят от одних сырьевых цен, ставок или регуляторных факторов.",
        severity: "INFO"
      },
      {
        id: "education-profile",
        title: "Риск-профиль помогает задать рамки",
        description: "Для консервативного профиля инструмент с высокой волатильностью может быть рискованным даже при привлекательных показателях роста.",
        severity: "INFO"
      }
    ];
  }

  private volatility(values: number[]) {
    if (values.length < 2) return 0;

    const returns = values.slice(1).map((value, index) => ((value - values[index]) / values[index]) * 100);
    const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length;

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
