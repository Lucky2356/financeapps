// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type RuntimeOverrides = {
  platform?: "web" | "android" | "desktop";
  apiMode?: "cloud" | "local" | "mock";
  desktopDataMode?: "cloud" | "local";
};

async function loadHook(runtime: RuntimeOverrides, get = vi.fn()) {
  vi.resetModules();
  vi.doMock("@/lib/platform/env", () => ({
    runtimeConfig: {
      platform: runtime.platform ?? "web",
      environment: "test",
      apiMode: runtime.apiMode ?? "cloud",
      apiBaseUrl: "/api",
      desktopDataMode: runtime.desktopDataMode ?? "cloud",
      isStaticExport: false
    }
  }));
  vi.doMock("@/lib/api/client", () => ({ apiClient: { get } }));

  const mod = await import("@/hooks/use-api-page-data");
  return { useApiPageData: mod.useApiPageData, get };
}

describe("useApiPageData", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/platform/env");
    vi.doUnmock("@/lib/api/client");
    vi.resetModules();
  });

  it("keeps fresh server data for static-export-compatible read-only routes in web/cloud mode", async () => {
    const get = vi.fn(async () => ({ value: "static-api-snapshot" }));
    const { useApiPageData } = await loadHook({ platform: "web", apiMode: "cloud" }, get);

    const { result } = renderHook(() => useApiPageData({ value: "server-data" }, "/dashboard"));

    expect(result.current.data).toEqual({ value: "server-data" });
    expect(get).not.toHaveBeenCalled();
  });

  it("refetches the same route in desktop local mode where server data is only a shell placeholder", async () => {
    const get = vi.fn(async () => ({ value: "local-data" }));
    const { useApiPageData } = await loadHook(
      { platform: "desktop", apiMode: "local", desktopDataMode: "local" },
      get
    );

    const { result } = renderHook(() => useApiPageData({ value: "placeholder" }, "/dashboard"));

    await waitFor(() => expect(result.current.data).toEqual({ value: "local-data" }));
    expect(get).toHaveBeenCalledWith("/dashboard");
  });
});
