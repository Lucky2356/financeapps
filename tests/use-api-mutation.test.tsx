// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useApiMutation } from "@/hooks/use-api-mutation";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("useApiMutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs the action, shows a success toast and calls onSuccess", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useApiMutation());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.run(async () => "ok", { success: "Готово", onSuccess });
    });

    expect(returned).toBe("ok");
    expect(toast.success).toHaveBeenCalledWith("Готово");
    expect(onSuccess).toHaveBeenCalledWith("ok");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the error message on failure and returns undefined", async () => {
    const { result } = renderHook(() => useApiMutation());

    let returned: unknown = "unchanged";
    await act(async () => {
      returned = await result.current.run(
        async () => {
          throw new Error("Боом");
        },
        { success: "Готово" }
      );
    });

    expect(returned).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("Боом");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("falls back to the provided error text when the thrown value has no message", async () => {
    const { result } = renderHook(() => useApiMutation());

    await act(async () => {
      await result.current.run(
        async () => {
          throw "nope";
        },
        { error: "Не удалось" }
      );
    });

    expect(toast.error).toHaveBeenCalledWith("Не удалось");
  });
});
