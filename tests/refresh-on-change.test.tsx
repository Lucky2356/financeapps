// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Поведение того, что сторож tests/every-screen-refreshes.test.ts проверяет по
// исходнику: карточка, читающая книгу своим запросом, перечитывает её, когда
// книга изменилась — здесь или приехав с другого устройства.

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));

import { DividendTracker } from "@/components/investments/dividend-tracker";
import { emitDataChanged } from "@/lib/api/data-events";

describe("карточка со своим запросом перечитывает книгу", () => {
  beforeEach(() => {
    apiClientMock.get.mockReset();
  });

  it("дивиденды: изменение книги — новый запрос, без перехода на другой экран", async () => {
    apiClientMock.get.mockResolvedValue({ dividends: [], realized: [], currency: "RUB" });
    render(<DividendTracker />);
    await waitFor(() => expect(apiClientMock.get).toHaveBeenCalledTimes(1));
    expect(apiClientMock.get).toHaveBeenCalledWith("/investments/dividends");

    // Другое устройство добавило выплату — книга изменилась.
    act(() => emitDataChanged());
    await waitFor(() => expect(apiClientMock.get).toHaveBeenCalledTimes(2));
    expect(apiClientMock.get).toHaveBeenLastCalledWith("/investments/dividends");
  });
});
