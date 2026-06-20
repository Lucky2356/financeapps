// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CashflowChart } from "@/components/charts/cashflow-chart";
import { ExpenseCategoryChart } from "@/components/charts/expense-category-chart";
import { ForecastBalanceChart } from "@/components/charts/forecast-balance-chart";
import { NetWorthChart } from "@/components/charts/net-worth-chart";
import { PortfolioStructureChart } from "@/components/charts/portfolio-structure-chart";

// Recharts needs a sized container; jsdom reports 0×0, so these are mount smoke
// tests — they guard against import/prop/runtime regressions, not pixel output.
// ResizeObserver is polyfilled in tests/setup.ts.
describe("charts render without crashing", () => {
  it("CashflowChart with data and when empty", () => {
    const { container, rerender } = render(
      <CashflowChart
        data={[
          { month: "апр.", income: 200000, expense: 120000 },
          { month: "май", income: 200000, expense: 140000 }
        ]}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
    rerender(<CashflowChart data={[]} />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("ExpenseCategoryChart with data and when empty", () => {
    const { container, rerender } = render(
      <ExpenseCategoryChart
        data={[
          { name: "Еда", value: 12000, fill: "#149365" },
          { name: "Транспорт", value: 4000 }
        ]}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
    rerender(<ExpenseCategoryChart data={[]} />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("NetWorthChart with data", () => {
    const { container } = render(
      <NetWorthChart
        data={[
          { month: "апр.", value: 500000 },
          { month: "май", value: 540000 }
        ]}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("ForecastBalanceChart with data", () => {
    const { container } = render(
      <ForecastBalanceChart
        data={[
          { date: "2026-06-01", label: "1 июн", balance: 100000, income: 0, expense: 0 },
          { date: "2026-06-02", label: "2 июн", balance: 95000, income: 0, expense: 5000 }
        ]}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("PortfolioStructureChart with data and when empty", () => {
    const { container, rerender } = render(
      <PortfolioStructureChart
        data={[
          { name: "Технологии", value: 60 },
          { name: "Энергетика", value: 40 }
        ]}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
    rerender(<PortfolioStructureChart data={[]} />);
    expect(container.querySelector("div")).toBeTruthy();
  });
});
