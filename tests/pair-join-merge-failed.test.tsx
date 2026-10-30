// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Подключились, а свои записи («Объединить») добавить не вышло.
//
// Раньше это была всплывашка, следом «готово» и перезагрузка — и записи,
// которых после подключения больше нигде нет, пропадали молча. Теперь экран
// остаётся, записи — в памяти, и есть выход: повторить или сохранить в файл.

const { calls } = vi.hoisted(() => ({
  calls: { merges: 0, failMerge: true, saved: [] as string[], arrived: true }
}));

vi.mock("@/lib/vault/runtime", () => ({
  joinWithLink: async () => undefined,
  sharedBooksArrived: async () => calls.arrived,
  // Обратная связка не нужна: ждём вечно, чтобы не мешала.
  requestPairing: () => new Promise(() => undefined),
  checkPairingRequest: async () => false
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: async () => {
      calls.merges += 1;
      if (calls.failMerge) throw new Error("Хранилище занято");
      return { merged: 1 };
    }
  }
}));

vi.mock("@/lib/files/createFileSystemAdapter", () => ({
  createFileSystemAdapter: () => ({
    saveTextFile: async (name: string) => {
      calls.saved.push(name);
      return true;
    }
  })
}));

vi.mock("@/lib/sync/scan-qr", () => ({
  cameraPossible: () => false,
  scanQr: async () => ({ ok: false, why: "absent" })
}));

import { I18nProvider } from "@/lib/i18n/context";
import { PairJoin } from "@/components/sync/pair-join";
import { carryOver, peekCarryOver, takeCarryOver } from "@/lib/sync/carry-over";

const bundle = {
  format: "profiles",
  savedAt: "2026-10-23T10:00:00.000Z",
  activeProfileId: "profile-default",
  profiles: [
    {
      profile: { id: "profile-default", name: "Основной", color: "#0d9488", createdAt: "" },
      backup: { transactions: [], accounts: [{ id: "a" }], investments: { portfolio: [] } }
    },
    {
      profile: { id: "profile-biz", name: "Бизнес", color: "#f59e0b", createdAt: "" },
      backup: { transactions: [], accounts: [{ id: "b" }], investments: { portfolio: [] } }
    }
  ]
};

beforeEach(() => {
  localStorage.setItem("app-locale", "ru");
  calls.merges = 0;
  calls.failMerge = true;
  calls.saved = [];
  calls.arrived = true;
  takeCarryOver();
});

describe("объединение не удалось", () => {
  it("не перечитывает приложение, держит записи и предлагает выход", async () => {
    const joined = vi.fn();
    carryOver(bundle);
    render(
      <I18nProvider>
        <PairJoin initialLink="financeapps://pair?c=1" onJoined={joined} />
      </I18nProvider>
    );

    const panel = await screen.findByTestId("merge-failed");
    expect(panel).toHaveTextContent("Хранилище занято");
    expect(joined).not.toHaveBeenCalled();
    expect(peekCarryOver()).toBe(bundle);

    // В файл — по файлу на профиль: «Восстановить» принимает один профиль.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Сохранить мои записи в файл" }));
    expect(calls.saved).toEqual([
      expect.stringMatching(/^financial-assistant-backup-\d{4}-\d{2}-\d{2}\.json$/),
      expect.stringMatching(/-Бизнес\.json$/)
    ]);

    // Повтор удался — тогда и только тогда «готово».
    calls.failMerge = false;
    await user.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(calls.merges).toBe(2);
    expect(joined).toHaveBeenCalledOnce();
    expect(peekCarryOver()).toBeNull();
  });

  it("не вливает записи, пока общие данные не приехали", async () => {
    // Разбор 2.8.1: на медленной связи подключение отпускало через 20 секунд,
    // и свои записи ложились в пустое место целиком. Приехавшая следом общая
    // книга сливалась с ними без основы — «Кофе» и «Карта» задваивались.
    calls.arrived = false;
    calls.failMerge = false;
    const joined = vi.fn();
    carryOver(bundle);
    render(
      <I18nProvider>
        <PairJoin initialLink="financeapps://pair?c=1" onJoined={joined} />
      </I18nProvider>
    );

    const panel = await screen.findByTestId("merge-failed");
    expect(panel).toHaveTextContent("ещё не загрузились");
    expect(calls.merges).toBe(0);
    expect(peekCarryOver()).toBe(bundle);

    calls.arrived = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(calls.merges).toBe(1);
    expect(joined).toHaveBeenCalledOnce();
  });
});
