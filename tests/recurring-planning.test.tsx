// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecurringTransactionsPageData } from "@/lib/data";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/recurring"
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

import { RecurringManager } from "@/components/recurring/recurring-manager";

const baseData: RecurringTransactionsPageData = {
  source: "database",
  recurringTransactions: [],
  accounts: [{ id: "acc-1", name: "Карта", type: "Дебетовая", balance: 1000, currency: "RUB" }],
  categories: [
    { id: "cat-food", label: "Продукты", kind: "EXPENSE", color: "#22c55e" },
    { id: "cat-transport", label: "Транспорт", kind: "EXPENSE", color: "#f97316" },
    { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#3b82f6" }
  ],
  budgetHints: [
    { categoryId: "cat-food", amount: 15000 },
    { categoryId: "cat-transport", amount: 5000 }
  ],
  debtPayments: [
    {
      id: "debt-1",
      name: "Ипотека",
      amount: 25000,
      dueDate: "2026-08-10T00:00:00.000Z",
      daysUntilNext: 9,
      isDue: false,
      autoPay: true
    }
  ],
  currency: "RUB",
  summary: {
    activeCount: 1,
    dueCount: 0,
    nextSevenDaysAmount: 0,
    monthlyPlannedExpense: 25000,
    monthlyPlannedIncome: 0
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockResolvedValue(baseData);
});

describe("planning screen", () => {
  it("lists debt payments coming from the debts page", async () => {
    render(<RecurringManager data={baseData} />);

    expect(await screen.findByText("Платежи по долгам")).toBeInTheDocument();
    expect(screen.getByText("Ипотека")).toBeInTheDocument();
    // Auto-pay debts are labelled so it is clear which ones post themselves.
    expect(screen.getByText("Списывается автоматически")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /К долгам/ })).toHaveAttribute("href", "/debts");
  });

  it("hides the debts block when no liability has a due day", async () => {
    const withoutDebts = { ...baseData, debtPayments: [] };
    apiClientMock.get.mockResolvedValue(withoutDebts);
    render(<RecurringManager data={withoutDebts} />);

    expect(await screen.findByText("Плановые операции")).toBeInTheDocument();
    expect(screen.queryByText("Платежи по долгам")).not.toBeInTheDocument();
  });

  it("prefills the template amount from the category budget", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<RecurringManager data={baseData} />);

    await user.click(await screen.findByRole("button", { name: /Добавить шаблон/ }));

    // The default expense category is "Продукты", whose budget is 15 000.
    const amount = screen.getByRole("spinbutton");
    expect(amount).toHaveValue(15000);
    expect(screen.getByText(/Из бюджета категории/)).toBeInTheDocument();
  });

  it("never overwrites an amount the user typed", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<RecurringManager data={baseData} />);

    await user.click(await screen.findByRole("button", { name: /Добавить шаблон/ }));
    const amount = screen.getByRole("spinbutton");
    await user.clear(amount);
    await user.type(amount, "9000");

    // Switching to a category with its own budget must keep the typed value.
    const categorySelect = screen.getAllByRole("combobox")[1];
    await user.click(categorySelect);
    await user.click(await screen.findByRole("option", { name: "Транспорт" }));

    expect(screen.getByRole("spinbutton")).toHaveValue(9000);
  });
});
