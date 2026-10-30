// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BudgetsPageData } from "@/lib/data";
import type { BudgetRow } from "@/types/finance";

// Разбор №282: шапка экрана лимитов всегда читала текущий месяц, а список под
// ней — выбранный. После выбора сентября над сентябрьским списком стояли
// октябрьские цифры.

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));

import { BudgetsSummary } from "@/components/budgets/budgets-summary";

function page(month: string, spent: number): BudgetsPageData {
  const budget: BudgetRow = {
    id: "food",
    categoryId: "food",
    category: "Продукты",
    color: "#64748b",
    limitAmount: 30000,
    spent,
    progress: Math.round((spent / 30000) * 100),
    isExceeded: false,
    suggestedLimit: 0,
    rollover: false,
    rolloverAmount: 0
  };
  return {
    source: "database",
    budgets: [budget],
    categories: [],
    recommendations: [],
    currency: "RUB",
    selectedMonth: month
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
  apiClientMock.get.mockImplementation(async (path: string) =>
    path.includes("month=2026-09") ? page("2026-09", 12345) : page("2026-10", 2000)
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("шапка лимитов", () => {
  it("показывает выбранный месяц, а не текущий", async () => {
    render(<BudgetsSummary data={page("2026-10", 2000)} month="2026-09" />);

    expect(await screen.findAllByText(/12\s345/)).not.toHaveLength(0);
    expect(apiClientMock.get).toHaveBeenCalledWith("/budgets?month=2026-09");
    // У прошедшего месяца дней не осталось — вместо «в день до конца» среднее.
    expect(screen.queryByText(/Осталось дней/)).toBeNull();
    expect(screen.getByText(/Дней в месяце: 30/)).toBeTruthy();
  });
});
