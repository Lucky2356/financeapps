import { describe, expect, it } from "vitest";

import { InvestmentAnalysisService } from "@/services/InvestmentAnalysisService";
import type { PortfolioRow, RecommendationView } from "@/types/finance";

const forbiddenPhrases = [
  ["поку", "пай"],
  ["про", "давай"],
  ["лучше", " вложить", " сюда"],
  ["точка", " входа"],
  ["точка", " выхода"]
].map((parts) => parts.join(""));

function portfolio(overrides: Partial<PortfolioRow>[] = []): PortfolioRow[] {
  const rows: PortfolioRow[] = [
    {
      ticker: "SBER",
      name: "Сбербанк",
      quantity: 100,
      averageBuyPrice: 250,
      currentPrice: 320,
      currentValue: 32000,
      pnl: 7000,
      share: 55,
      risk: "MEDIUM"
    },
    {
      ticker: "YNDX",
      name: "Яндекс",
      quantity: 5,
      averageBuyPrice: 3500,
      currentPrice: 4100,
      currentValue: 20500,
      pnl: 3000,
      share: 35,
      risk: "HIGH"
    },
    {
      ticker: "MOEX",
      name: "Московская биржа",
      quantity: 50,
      averageBuyPrice: 210,
      currentPrice: 230,
      currentValue: 11500,
      pnl: 1000,
      share: 10,
      risk: "LOW"
    }
  ];

  return rows.map((row, index) => ({ ...row, ...(overrides[index] ?? {}) }));
}

function allText(items: RecommendationView[]) {
  return items.map((item) => `${item.title} ${item.description}`.toLowerCase()).join("\n");
}

describe("InvestmentAnalysisService", () => {
  const service = new InvestmentAnalysisService();

  it("flags concentration and high-risk share for conservative profile", () => {
    const analysis = service.analyze(portfolio(), "CONSERVATIVE", {
      SBER: [300, 310, 295, 320],
      YNDX: [3600, 3900, 3400, 4100],
      MOEX: [220, 225, 222, 230]
    });

    expect(analysis.risks.map((item) => item.id)).toEqual(
      expect.arrayContaining(["single-position-concentration", "high-risk-share", "diversification"])
    );
    expect(analysis.risks.find((item) => item.id === "single-position-concentration")?.severity).toBe("CRITICAL");
  });

  it("returns an empty-portfolio message when there are no positions", () => {
    const analysis = service.analyze([], "MODERATE");

    expect(analysis.risks).toHaveLength(1);
    expect(analysis.risks[0].id).toBe("portfolio-empty");
    expect(analysis.education.length).toBeGreaterThan(0);
  });

  it("keeps investment analysis free from direct trade advice phrases", () => {
    const analysis = service.analyze(portfolio(), "MODERATE", {
      SBER: [320, 300, 315, 290],
      YNDX: [4100, 3600, 4200, 3500],
      MOEX: [230, 228, 231, 229]
    });
    const text = allText([...analysis.risks, ...analysis.education]);

    for (const phrase of forbiddenPhrases) {
      expect(text).not.toContain(phrase);
    }
  });
});
