// @vitest-environment jsdom
import { screen } from "@testing-library/react";
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

  // Creating an operation moved to the quick-add dialog (this screen's own add
  // button was a second door to the same room) — see tests/quick-add.test.tsx.
});
