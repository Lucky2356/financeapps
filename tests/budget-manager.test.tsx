// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BudgetsPageData } from "@/lib/data";
import type { BudgetRow } from "@/types/finance";
import { renderWithConfirm } from "./ui-helpers";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/budgets"
}));
const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));
vi.mock("sonner", () => ({ toast }));

import { BudgetManager } from "@/components/budgets/budget-manager";

function makeBudget(
  overrides: Partial<BudgetRow> & Pick<BudgetRow, "categoryId" | "category">
): BudgetRow {
  return {
    id: overrides.id ?? overrides.categoryId,
    color: "#64748b",
    limitAmount: 0,
    spent: 0,
    progress: 0,
    isExceeded: false,
    suggestedLimit: 0,
    rollover: false,
    rolloverAmount: 0,
    ...overrides
  };
}

const currentMonth = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();

function makeData(budgets: BudgetRow[]): BudgetsPageData {
  return {
    source: "database",
    budgets,
    categories: [],
    recommendations: [],
    currency: "RUB",
    selectedMonth: currentMonth
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.post.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BudgetManager", () => {
  it("renders a row for each budget category", async () => {
    const data = makeData([
      makeBudget({
        categoryId: "food",
        category: "Еда",
        limitAmount: 3000,
        spent: 1500,
        progress: 50
      })
    ]);
    apiClientMock.get.mockResolvedValue(data);

    renderWithConfirm(<BudgetManager data={data} />);

    // The category label renders in both the desktop table and the mobile grid.
    expect(await screen.findAllByText("Еда")).not.toHaveLength(0);
  });

  it("auto-saves an edited limit on blur", async () => {
    const user = userEvent.setup();
    const data = makeData([
      makeBudget({
        categoryId: "food",
        category: "Еда",
        limitAmount: 3000,
        spent: 1500,
        progress: 50
      })
    ]);
    apiClientMock.get.mockResolvedValue(data);

    renderWithConfirm(<BudgetManager data={data} />);

    const input = (await screen.findAllByRole("spinbutton"))[0];
    await user.clear(input);
    await user.type(input, "2500");
    await user.tab(); // blur commits immediately

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/budgets", {
        categoryId: "food",
        limitAmount: "2500",
        month: currentMonth
      })
    );
  });

  it("shows an info toast when there are no empty categories to suggest", async () => {
    const user = userEvent.setup();
    // Both categories already have a limit → nothing to suggest.
    const data = makeData([
      makeBudget({ categoryId: "food", category: "Еда", limitAmount: 3000, suggestedLimit: 2000 })
    ]);
    apiClientMock.get.mockResolvedValue(data);

    renderWithConfirm(<BudgetManager data={data} />);

    await user.click(await screen.findByRole("button", { name: /Предложить лимиты/ }));

    expect(toast.info).toHaveBeenCalled();
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });

  it("fills suggested limits for empty categories that have history", async () => {
    const user = userEvent.setup();
    const data = makeData([
      makeBudget({
        categoryId: "fun",
        category: "Развлечения",
        limitAmount: 0,
        suggestedLimit: 1500
      })
    ]);
    apiClientMock.get.mockResolvedValue(data);

    renderWithConfirm(<BudgetManager data={data} />);

    await user.click(await screen.findByRole("button", { name: /Предложить лимиты/ }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/budgets", {
        categoryId: "fun",
        limitAmount: "1500",
        month: currentMonth
      })
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("resets a limit to zero after the user confirms in the dialog", async () => {
    const user = userEvent.setup();
    const data = makeData([
      makeBudget({
        categoryId: "food",
        category: "Еда",
        limitAmount: 3000,
        spent: 1500,
        progress: 50
      })
    ]);
    apiClientMock.get.mockResolvedValue(data);

    renderWithConfirm(<BudgetManager data={data} />);

    const resetButton = (await screen.findAllByRole("button", { name: "Сбросить лимит" }))[0];
    await user.click(resetButton);

    // Styled confirm dialog appears; "Сбросить" is the confirm action.
    await user.click(await screen.findByRole("button", { name: "Сбросить" }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/budgets", {
        categoryId: "food",
        limitAmount: 0,
        month: currentMonth
      })
    );
  });

  it("does not reset when the user cancels the confirm dialog", async () => {
    const user = userEvent.setup();
    const data = makeData([
      makeBudget({
        categoryId: "food",
        category: "Еда",
        limitAmount: 3000,
        spent: 1500,
        progress: 50
      })
    ]);
    apiClientMock.get.mockResolvedValue(data);

    renderWithConfirm(<BudgetManager data={data} />);

    const resetButton = (await screen.findAllByRole("button", { name: "Сбросить лимит" }))[0];
    await user.click(resetButton);

    await user.click(await screen.findByRole("button", { name: "Отмена" }));

    expect(apiClientMock.post).not.toHaveBeenCalled();
  });
});
