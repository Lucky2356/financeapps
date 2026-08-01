// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadHook(get = vi.fn()) {
  vi.resetModules();
  vi.doMock("@/lib/api/client", () => ({ apiClient: { get } }));

  const mod = await import("@/hooks/use-api-page-data");
  return { useApiPageData: mod.useApiPageData, get };
}

describe("useApiPageData", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/api/client");
    vi.resetModules();
  });

  // The server-rendered payload is an empty shell (lib/data.ts) — the real
  // numbers only exist on the device, so every screen must read them back.
  it("replaces the server shell with the data read from the device", async () => {
    const get = vi.fn(async () => ({ value: "local-data" }));
    const { useApiPageData } = await loadHook(get);

    const { result } = renderHook(() => useApiPageData({ value: "placeholder" }, "/dashboard"));

    await waitFor(() => expect(result.current.data).toEqual({ value: "local-data" }));
    expect(get).toHaveBeenCalledWith("/dashboard");
  });

  it("falls back to the initial data when the read fails", async () => {
    const get = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    const { useApiPageData } = await loadHook(get);

    const { result } = renderHook(() => useApiPageData({ value: "placeholder" }, "/dashboard"));

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current.data).toEqual({ value: "placeholder" });
  });
});
