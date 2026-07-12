// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TransactionsPageData } from "@/lib/data";
import { renderWithConfirm } from "./ui-helpers";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/transactions",
  useSearchParams: () => new URLSearchParams("")
}));
const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock("sonner", () => ({ toast }));

import { TransactionManager } from "@/components/transactions/transaction-manager";

const data: TransactionsPageData = {
  source: "database",
  transactions: [],
  accounts: [{ id: "acc-1", name: "Карта", type: "DEBIT_CARD", balance: 5000, currency: "RUB" }],
  categories: [
    { id: "cat-food", label: "Еда", kind: "EXPENSE", color: "#ea580c" },
    { id: "cat-fun", label: "Развлечения", kind: "EXPENSE", color: "#7c3aed" },
    { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#16a34a" }
  ],
  rules: [{ id: "rule-1", match: "Пятёрочка", categoryId: "cat-fun" }],
  filters: {},
  pagination: { page: 1, limit: 20, total: 0, hasPreviousPage: false, hasNextPage: false }
} as TransactionsPageData;

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockResolvedValue(data);
  apiClientMock.post.mockResolvedValue({});
});

describe("TransactionManager", () => {
  it("shows an empty state when there are no transactions", async () => {
    renderWithConfirm(<TransactionManager data={data} />);
    expect(await screen.findByText("Операции не найдены")).toBeInTheDocument();
  });

  it("creates an expense through the add dialog with sensible defaults", async () => {
    const user = userEvent.setup();
    renderWithConfirm(<TransactionManager data={data} />);

    await user.click(await screen.findByRole("button", { name: "Добавить операцию" }));

    // Amount is the only number field in the dialog; type/category/account default.
    await user.type(await screen.findByRole("spinbutton"), "1000");
    await user.click(screen.getByRole("button", { name: "Добавить" }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith(
        "/transactions",
        expect.objectContaining({
          amount: "1000",
          type: "EXPENSE",
          categoryId: "cat-food",
          accountId: "acc-1"
        })
      )
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("applies a category rule from the description, overriding the default category", async () => {
    const user = userEvent.setup();
    renderWithConfirm(<TransactionManager data={data} />);

    await user.click(await screen.findByRole("button", { name: "Добавить операцию" }));
    // Default expense category is the first one (cat-food); the "Пятёрочка" rule
    // should move it to cat-fun as soon as the keyword appears in the description.
    await user.type(await screen.findByRole("spinbutton"), "500");
    // Target the description Textarea specifically (a separate tags input also
    // renders as a textbox now).
    await user.type(screen.getByPlaceholderText(/подберётся/), "Покупка в Пятёрочка");
    await user.click(screen.getByRole("button", { name: "Добавить" }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith(
        "/transactions",
        expect.objectContaining({ type: "EXPENSE", categoryId: "cat-fun" })
      )
    );
  });
});
