// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadHook(get = vi.fn()) {
  vi.resetModules();
  vi.doMock("@/lib/api/client", () => ({ apiClient: { get } }));

  const mod = await import("@/hooks/use-api-page-data");
  const cache = await import("@/lib/api/page-data-cache");
  return { useApiPageData: mod.useApiPageData, get, cache };
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

  // Экран, который уже открывали, обязан рисоваться его числами СРАЗУ. Иначе
  // каждый переход начинается с пустой оболочки сборки, и возврат туда, где
  // только что был, снова показывает нули.
  it("второй приход на маршрут показывает числа без ожидания", async () => {
    const get = vi.fn(async () => ({ value: "местные-числа" }));
    const { useApiPageData } = await loadHook(get);

    const first = renderHook(() => useApiPageData({ value: "оболочка" }, "/dashboard"));
    await waitFor(() => expect(first.result.current.data).toEqual({ value: "местные-числа" }));
    first.unmount();

    const second = renderHook(() => useApiPageData({ value: "оболочка" }, "/dashboard"));
    // Без единого ожидания: то, что видно в первом же кадре.
    expect(second.result.current.data).toEqual({ value: "местные-числа" });
  });

  // Хуже пустоты только чужие числа: на кадр показать суммы прежнего месяца
  // или прежнего фильтра — значит показать их как свои.
  it("смена маршрута не показывает числа прежнего маршрута", async () => {
    const get = vi.fn(async (path: string) => ({ value: path }));
    const { useApiPageData } = await loadHook(get);

    const { result, rerender } = renderHook(
      ({ path }) => useApiPageData({ value: "оболочка" }, path),
      {
        initialProps: { path: "/budgets?month=2026-08" }
      }
    );
    await waitFor(() => expect(result.current.data).toEqual({ value: "/budgets?month=2026-08" }));

    rerender({ path: "/budgets?month=2026-09" });
    expect(result.current.data).toEqual({ value: "оболочка" });
    await waitFor(() => expect(result.current.data).toEqual({ value: "/budgets?month=2026-09" }));
  });

  // Неудачное чтение не должно стирать память: показанные числа были
  // настоящими, а оболочка сборки — пустая.
  it("сбой чтения оставляет последние показанные числа", async () => {
    let fail = false;
    const get = vi.fn(async () => {
      if (fail) throw new Error("storage unavailable");
      return { value: "местные-числа" };
    });
    const { useApiPageData } = await loadHook(get);

    const first = renderHook(() => useApiPageData({ value: "оболочка" }, "/accounts"));
    await waitFor(() => expect(first.result.current.data).toEqual({ value: "местные-числа" }));
    first.unmount();

    fail = true;
    const second = renderHook(() => useApiPageData({ value: "оболочка" }, "/accounts"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(second.result.current.data).toEqual({ value: "местные-числа" });
  });

  // Книга перестала быть той же самой — память о показанном обязана уйти,
  // иначе на кадр покажутся числа чужого профиля.
  it("после смены книги память о показанном очищается", async () => {
    const get = vi.fn(async () => ({ value: "местные-числа" }));
    const { useApiPageData, cache } = await loadHook(get);

    const first = renderHook(() => useApiPageData({ value: "оболочка" }, "/dashboard"));
    await waitFor(() => expect(first.result.current.data).toEqual({ value: "местные-числа" }));
    first.unmount();

    cache.clearPageData();

    const second = renderHook(() => useApiPageData({ value: "оболочка" }, "/dashboard"));
    expect(second.result.current.data).toEqual({ value: "оболочка" });
  });
});
