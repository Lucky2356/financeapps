// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CategoriesPageData } from "@/lib/data";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/categories" }));
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));

import { CategoryManager } from "@/components/categories/category-manager";

const emptyData: CategoriesPageData = { source: "database", categories: [] };

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockResolvedValue(emptyData);
  apiClientMock.post.mockResolvedValue({ id: "cat-x" });
});

describe("CategoryManager", () => {
  it("creates a category through the add dialog", async () => {
    const user = userEvent.setup();
    render(<CategoryManager data={emptyData} />);

    const addButtons = await screen.findAllByRole("button", { name: "Добавить" });
    await user.click(addButtons[0]);
    await user.type(await screen.findByRole("textbox"), "Премия");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(apiClientMock.post).toHaveBeenCalledWith("/categories", expect.objectContaining({ name: "Премия" })));
    expect(toast.success).toHaveBeenCalled();
  });
});
