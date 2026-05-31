import { describe, expect, it } from "vitest";

import { InvestmentSuggestionService } from "@/services/InvestmentSuggestionService";
import type { PortfolioRow, WatchlistRow } from "@/types/finance";

const service = new InvestmentSuggestionService();

function sec(ticker: string, sector: string, price: number, risk: WatchlistRow["risk"], change30d = 0): WatchlistRow {
  return { ticker, name: ticker, sector, price, changeDay: 0, change30d, risk, comment: "" };
}

const universe: WatchlistRow[] = [
  sec("SBER", "Финансы", 300, "MEDIUM", 5),
  sec("LKOH", "Энергетика", 7000, "MEDIUM", 2),
  sec("MOEX", "Инфраструктура", 200, "LOW", 3),
  sec("YNDX", "Технологии", 4000, "HIGH", 10)
];

describe("InvestmentSuggestionService", () => {
  it("returns nothing without a positive budget", () => {
    expect(service.suggest({ budget: 0, riskProfile: "MODERATE", portfolio: [], securities: universe })).toEqual([]);
  });

  it("excludes high-risk securities for a conservative profile", () => {
    const result = service.suggest({ budget: 50000, riskProfile: "CONSERVATIVE", portfolio: [], securities: universe });
    expect(result.every((s) => s.risk === "LOW")).toBe(true);
    expect(result.some((s) => s.ticker === "YNDX")).toBe(false);
  });

  it("suggests whole-share quantities within budget and prefers new sectors", () => {
    const portfolio: PortfolioRow[] = [
      { ticker: "SBER", name: "SBER", sector: "Финансы", quantity: 100, averageBuyPrice: 250, currentPrice: 300, currentValue: 30000, pnl: 5000, share: 100, risk: "MEDIUM" }
    ];
    const result = service.suggest({ budget: 40000, riskProfile: "AGGRESSIVE", portfolio, securities: universe });
    expect(result.length).toBeGreaterThan(0);
    for (const s of result) {
      expect(s.suggestedQuantity).toBeGreaterThanOrEqual(1);
      expect(s.suggestedAmount).toBeLessThanOrEqual(40000);
    }
    // Should diversify away from the already-dominant Финансы sector.
    expect(result[0].sector).not.toBe("Финансы");
  });
});
