// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredConflict } from "@/lib/vault/conflicts";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));

// Настоящий runtime тянет за собой хранилище устройства и Tauri; проверяется
// здесь экран, а не они.
const { runtime } = vi.hoisted(() => {
  const statusListeners = new Set<(status: string) => void>();
  const conflictListeners = new Set<(list: unknown[]) => void>();
  let conflicts: unknown[] = [];
  return {
    runtime: {
      statusListeners,
      conflictListeners,
      setConflicts(list: unknown[]) {
        conflicts = list;
      },
      syncStorage: {
        status: "off" as string,
        onStatus(listener: (status: string) => void) {
          statusListeners.add(listener);
          return () => statusListeners.delete(listener);
        }
      },
      conflictStore: {
        list: async () => conflicts,
        resolve: vi.fn(async () => {}),
        onChange(listener: (list: unknown[]) => void) {
          conflictListeners.add(listener);
          return () => conflictListeners.delete(listener);
        }
      }
    }
  };
});
vi.mock("@/lib/vault/runtime", () => ({
  syncStorage: runtime.syncStorage,
  conflictStore: runtime.conflictStore
}));

import { SyncStatusIndicator } from "@/components/sync/sync-status";

const conflict: StoredConflict = {
  slot: "localFinanceState_profile-default",
  collection: "transactions",
  key: "t1",
  mine: { id: "t1", description: "обед", amount: 700 },
  theirs: { id: "t1", description: "обед", amount: 900 },
  chosen: "theirs",
  noticedAt: "2026-09-16T12:00:00.000Z"
};

describe("значок состояния связи", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.syncStorage.status = "off";
    runtime.setConflicts([]);
  });

  it("без сервера и без споров не показывается вовсе", async () => {
    // Значок, который всегда горит серым «не подключено», через неделю
    // перестают замечать — а вместе с ним перестают замечать и красный.
    const { container } = render(<SyncStatusIndicator />);
    await waitFor(() => expect(container.querySelector("button")).toBeNull());
  });

  it("со включённой синхронизацией показывает состояние словами", async () => {
    runtime.syncStorage.status = "offline";
    render(<SyncStatusIndicator />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Нет связи/ })).toBeInTheDocument()
    );
  });

  it("спорные записи видны, даже когда синхронизация выключена", async () => {
    // Спор мог возникнуть до того, как связь пропала, и молчать о нём нельзя:
    // в книге лежит одна из двух версий, и человек об этом не знает.
    runtime.setConflicts([conflict]);
    render(<SyncStatusIndicator />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Правили в двух местах/ })).toBeInTheDocument()
    );
  });

  it("показывает обе версии и помечает ту, что сейчас в данных", async () => {
    runtime.setConflicts([conflict]);
    render(<SyncStatusIndicator />);

    await userEvent.click(await screen.findByRole("button", { name: /Правили в двух местах/ }));

    expect(await screen.findByText("Здесь")).toBeInTheDocument();
    expect(screen.getByText("На другом устройстве")).toBeInTheDocument();
    expect(screen.getByText("700")).toBeInTheDocument();
    expect(screen.getByText("900")).toBeInTheDocument();
    expect(screen.getAllByText("сейчас в данных")).toHaveLength(1);
  });

  it("выбор уходит в книгу обычной правкой и убирает спор", async () => {
    runtime.setConflicts([conflict]);
    apiClientMock.post.mockResolvedValue({ resolved: true });
    render(<SyncStatusIndicator />);

    await userEvent.click(await screen.findByRole("button", { name: /Правили в двух местах/ }));
    const [keepMine] = await screen.findAllByRole("button", { name: "Оставить эту" });
    await userEvent.click(keepMine);

    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/sync/resolve", {
        collection: "transactions",
        key: "t1",
        row: conflict.mine
      })
    );
    expect(runtime.conflictStore.resolve).toHaveBeenCalled();
  });
});
