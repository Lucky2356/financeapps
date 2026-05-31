// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountsPageData } from "@/lib/data";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/accounts"
}));
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));

import { AccountManager } from "@/components/accounts/account-manager";

const emptyData: AccountsPageData = { source: "database", accounts: [], totalBalance: 0, currency: "RUB" };

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockResolvedValue(emptyData);
  apiClientMock.post.mockResolvedValue({ id: "acc-1", name: "Карта", type: "DEBIT_CARD", balance: 0, currency: "RUB" });
});

describe("AccountManager", () => {
  it("shows an empty state with a create CTA when there are no accounts", async () => {
    render(<AccountManager data={emptyData} />);
    expect(await screen.findByText("Пока нет счетов")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать счёт" })).toBeInTheDocument();
  });

  it("creates an account through the dialog (calls the API and shows success)", async () => {
    const user = userEvent.setup();
    render(<AccountManager data={emptyData} />);

    await user.click(await screen.findByRole("button", { name: "Создать счёт" }));
    const nameField = await screen.findByRole("textbox");
    await user.type(nameField, "Новая карта");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(apiClientMock.post).toHaveBeenCalledWith("/accounts", expect.objectContaining({ name: "Новая карта" })));
    expect(toast.success).toHaveBeenCalled();
  });
});
