// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiabilitiesPageData } from "@/lib/data";
import { renderWithConfirm } from "./ui-helpers";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/debts"
}));
const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock("sonner", () => ({ toast }));

import { DebtManager } from "@/components/debts/debt-manager";

const emptyData: LiabilitiesPageData = {
  source: "database",
  liabilities: [],
  total: 0,
  currency: "RUB"
};

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockResolvedValue(emptyData);
  apiClientMock.post.mockResolvedValue({ id: "debt-1" });
});

describe("DebtManager", () => {
  it("shows an empty state with a create CTA", async () => {
    renderWithConfirm(<DebtManager data={emptyData} />);
    expect(await screen.findByText("Пока нет обязательств")).toBeInTheDocument();
  });

  it("creates a liability through the dialog", async () => {
    const user = userEvent.setup();
    renderWithConfirm(<DebtManager data={emptyData} />);

    await user.click((await screen.findAllByRole("button", { name: "Добавить долг" }))[0]);
    await user.type(await screen.findByRole("textbox"), "Ипотека");
    await user.type((await screen.findAllByRole("spinbutton"))[0], "2000000");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith(
        "/debts",
        expect.objectContaining({ name: "Ипотека", balance: "2000000" })
      )
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("renders a payoff estimate for an existing liability", async () => {
    const data: LiabilitiesPageData = {
      source: "database",
      currency: "RUB",
      total: 100000,
      liabilities: [
        {
          id: "d1",
          name: "Кредитка",
          kind: "CREDIT_CARD",
          balance: 100000,
          originalAmount: 100000,
          interestRate: 0,
          minPayment: 25000,
          currency: "RUB",
          progress: 0
        }
      ]
    };
    apiClientMock.get.mockResolvedValue(data);
    renderWithConfirm(<DebtManager data={data} />);

    // 100k / 25k = 4 months at 0% interest.
    expect(await screen.findByText(/≈ 4 мес\./)).toBeInTheDocument();
  });
});
