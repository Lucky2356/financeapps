// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GoalsPageData } from "@/lib/data";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/goals"
}));
const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock("sonner", () => ({ toast }));

import { GoalManager } from "@/components/goals/goal-manager";
import { renderWithConfirm } from "./ui-helpers";

const emptyData: GoalsPageData = { source: "database", goals: [], currency: "RUB" };

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockResolvedValue(emptyData);
  apiClientMock.post.mockResolvedValue({ id: "goal-1" });
});

describe("GoalManager", () => {
  it("shows an empty state with a create CTA", async () => {
    renderWithConfirm(<GoalManager data={emptyData} />);
    expect(await screen.findByText("Пока нет целей")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать цель" })).toBeInTheDocument();
  });

  it("creates a goal through the dialog (calls the API and shows success)", async () => {
    const user = userEvent.setup();
    renderWithConfirm(<GoalManager data={emptyData} />);

    await user.click(await screen.findByRole("button", { name: "Создать цель" }));
    await user.type(await screen.findByRole("textbox"), "Отпуск");
    await user.type(screen.getByRole("spinbutton"), "200000");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith(
        "/goals",
        expect.objectContaining({ title: "Отпуск" })
      )
    );
    expect(toast.success).toHaveBeenCalled();
  });
});
