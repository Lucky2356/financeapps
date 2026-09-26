import { beforeEach, describe, expect, it, vi } from "vitest";

// Обновление на телефоне: скачать APK внутри приложения и открыть установку.
// Главное обещание — человека не отправляют в браузер НИ ПРИ КАКОМ исходе. В
// 2.0.0 любая заминка сети молча открывала страницу GitHub.

const { core, opener, toast } = vi.hoisted(() => {
  class FakeChannel<T> {
    onmessage: (message: T) => void = () => {};
  }
  return {
    core: { invoke: vi.fn(), Channel: FakeChannel },
    opener: { openUrl: vi.fn() },
    toast: { loading: vi.fn(() => "t1"), success: vi.fn(), error: vi.fn() }
  };
});

vi.mock("@tauri-apps/api/core", () => core);
vi.mock("@tauri-apps/plugin-opener", () => opener);
vi.mock("sonner", () => ({ toast }));

import { installAndroidUpdate, startAndroidUpdate } from "@/lib/updates/android";

const update = {
  version: "9.9.9",
  url: "https://github.com/Lucky2356/financeapps/releases/download/v9.9.9/app.apk"
} as Parameters<typeof startAndroidUpdate>[0];

const words = {
  downloading: "Загрузка…",
  progress: (percent: number) => `Загрузка… ${percent}%`,
  opening: "Открываю установку",
  failed: "Не удалось скачать обновление",
  retry: "Повторить"
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("обновление на телефоне", () => {
  it("скачивает своим плагином, передавая адрес выпуска", async () => {
    core.invoke.mockResolvedValue({});

    await startAndroidUpdate(update);

    expect(core.invoke).toHaveBeenCalledWith(
      "plugin:installer|install",
      expect.objectContaining({ url: update.url })
    );
  });

  it("сорвалось — в браузер не отправляет, говорит почему и предлагает повторить", async () => {
    core.invoke.mockRejectedValue("Нет соединения с интернетом.");

    await installAndroidUpdate(update, words);

    expect(opener.openUrl).not.toHaveBeenCalled();
    const [title, options] = toast.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(title).toBe(words.failed);
    expect(options.description).toBe("Нет соединения с интернетом.");
    expect((options.action as { label: string }).label).toBe(words.retry);
  });

  it("«Повторить» запускает скачивание заново", async () => {
    core.invoke.mockRejectedValueOnce("обрыв").mockResolvedValueOnce({});

    await installAndroidUpdate(update, words);
    const options = toast.error.mock.calls[0][1] as { action: { onClick: () => void } };
    options.action.onClick();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());

    expect(core.invoke).toHaveBeenCalledTimes(2);
  });

  it("показывает, сколько скачано, в одной и той же строке", async () => {
    core.invoke.mockImplementation(async (_command: string, args: Record<string, unknown>) => {
      const channel = args.onProgress as { onmessage: (step: object) => void };
      channel.onmessage({ received: 10, total: 40 });
      channel.onmessage({ received: 40, total: 40 });
      return {};
    });

    await installAndroidUpdate(update, words);

    expect(toast.loading).toHaveBeenCalledWith("Загрузка… 25%", { id: "t1" });
    expect(toast.loading).toHaveBeenCalledWith("Загрузка… 100%", { id: "t1" });
    expect(toast.success).toHaveBeenCalledWith(
      words.opening,
      expect.objectContaining({ id: "t1" })
    );
  });
});
