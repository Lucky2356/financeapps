// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BudgetsPageData, RecurringTransactionsPageData } from "@/lib/data";
import type { InvestmentData } from "@/types/finance";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/"
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

import { BudgetManager } from "@/components/budgets/budget-manager";
import { RecurringManager } from "@/components/recurring/recurring-manager";
import { InvestmentsView } from "@/components/investments/investments-view";
import { renderWithConfirm } from "./ui-helpers";

const budgetData: BudgetsPageData = {
  source: "database",
  budgets: [],
  categories: [],
  recommendations: [],
  currency: "RUB",
  selectedMonth: "2026-06"
};
const recurringData: RecurringTransactionsPageData = {
  source: "database",
  recurringTransactions: [],
  accounts: [],
  categories: [],
  currency: "RUB",
  summary: {
    activeCount: 0,
    dueCount: 0,
    nextSevenDaysAmount: 0,
    monthlyPlannedExpense: 0,
    monthlyPlannedIncome: 0
  }
};
const investmentData: InvestmentData = {
  source: "database",
  currency: "RUB",
  riskProfile: "Умеренный",
  securities: [],
  watchlist: [],
  portfolio: [],
  structure: [],
  sectorStructure: [],
  risks: [],
  education: []
};

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockImplementation((path: string) => {
    if (path.startsWith("/budgets")) return Promise.resolve(budgetData);
    if (path.startsWith("/recurring")) return Promise.resolve(recurringData);
    if (path.startsWith("/investments")) return Promise.resolve(investmentData);
    return Promise.resolve({});
  });
});

// Smoke tests: the useApiMutation-refactored managers mount without errors and
// render their key UI / empty states.
describe("manager smoke tests", () => {
  it("BudgetManager renders with the suggest-limits action", async () => {
    renderWithConfirm(<BudgetManager data={budgetData} />);
    expect(await screen.findByRole("button", { name: /Предложить лимиты/ })).toBeInTheDocument();
  });

  it("RecurringManager renders an empty state", async () => {
    render(<RecurringManager data={recurringData} />);
    expect(await screen.findByText("Плановых операций пока нет")).toBeInTheDocument();
  });

  it("InvestmentsView shows tabs and the picker on the Рынок tab", async () => {
    render(<InvestmentsView data={investmentData} />);
    // Redesigned screen is tabbed; the securities picker now lives under the
    // Market tab (alongside the watchlist) instead of at the top of a long scroll.
    fireEvent.click(screen.getByRole("button", { name: "Рынок" }));
    expect(await screen.findByText("Подбор бумаг для портфеля")).toBeInTheDocument();
  });
});
