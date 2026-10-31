// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportPageData } from "@/lib/data";

// Экран «Данные»: копия под паролем. Сохранить — с паролем или осознанно без;
// восстановить запертый файл — спросить пароль, на неверном сказать об этом и
// оставить файл выбранным, на верном пойти тем же путём, что и открытый файл.

const { apiClientMock, files, toast } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  files: { pickTextFile: vi.fn(), saveTextFile: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
vi.mock("@/lib/files/createFileSystemAdapter", () => ({
  createFileSystemAdapter: () => files
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/import"
}));
vi.mock("sonner", () => ({ toast }));

import { ImportExportPanel } from "@/components/import/import-export-panel";
import { encryptBackupText, isEncryptedBackup, readBackupFileText } from "@/lib/backup/encryption";

const importData: ImportPageData = {
  source: "database",
  accounts: [],
  categories: [],
  lastBackupAt: null,
  backupReminderDue: true
};

const book = {
  schemaVersion: 7,
  appVersion: "2.9.0",
  accounts: [{ id: "a1", name: "Карта" }],
  categories: [],
  transactions: [{ id: "t1", amount: -350, description: "Кофе" }]
};

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockImplementation(async (path: string) => {
    if (path === "/backup") return book;
    if (path === "/backup/before-upgrade") return null;
    if (path.startsWith("/transactions")) return { transactions: [] };
    return importData;
  });
  apiClientMock.post.mockResolvedValue({ restored: true });
  files.saveTextFile.mockResolvedValue(undefined);
});

function renderPanel() {
  return render(<ImportExportPanel data={importData} transactions={[]} />);
}

describe("копия под паролем на экране «Данные»", () => {
  it("запертый файл: спрашивает пароль, неверный — ошибка без потери файла, верный — восстановление", async () => {
    const user = userEvent.setup();
    const content = await encryptBackupText(
      JSON.stringify({ exportedAt: "2026-10-31T10:00:00.000Z", backup: book }, null, 2),
      "correct horse"
    );
    files.pickTextFile.mockResolvedValue({ name: "copy.json", content });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Восстановить из копии" }));
    await user.click(await screen.findByRole("button", { name: "Выбрать и проверить файл" }));

    expect(await screen.findByText("Файл защищён паролем")).toBeInTheDocument();
    const restore = screen.getByRole("button", { name: "Восстановить выбранный backup" });
    expect(restore).toBeDisabled();

    await user.type(screen.getByLabelText("Пароль от файла"), "wrong horse");
    await user.click(screen.getByRole("button", { name: "Открыть файл" }));
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent(
      /Пароль не подходит/
    );
    expect(restore).toBeDisabled();
    expect(apiClientMock.post).not.toHaveBeenCalled();

    // Ещё раз — тот же файл, выбирать заново не нужно.
    await user.clear(screen.getByLabelText("Пароль от файла"));
    await user.type(screen.getByLabelText("Пароль от файла"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Открыть файл" }));
    expect(await screen.findByText("Операции: 1", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(files.pickTextFile).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Восстановить выбранный backup" }));
    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/backup", { backup: book })
    );
  }, 20_000);

  it("открытый файл восстанавливается как прежде, без пароля", async () => {
    const user = userEvent.setup();
    files.pickTextFile.mockResolvedValue({ name: "copy.json", content: JSON.stringify(book) });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Восстановить из копии" }));
    await user.click(await screen.findByRole("button", { name: "Выбрать и проверить файл" }));

    expect(await screen.findByText("Операции: 1")).toBeInTheDocument();
    expect(screen.queryByText("Файл защищён паролем")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Восстановить выбранный backup" }));
    await waitFor(() =>
      expect(apiClientMock.post).toHaveBeenCalledWith("/backup", { backup: book })
    );
  });

  it("«Скачать копию» с паролем пишет запертый файл, который открывается этим паролем", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Скачать копию" }));
    await user.type(await screen.findByLabelText("Пароль для файла"), "correct horse");
    await user.type(screen.getByLabelText("Пароль ещё раз"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Сохранить с паролем" }));

    await waitFor(() => expect(files.saveTextFile).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const [name, content] = files.saveTextFile.mock.calls[0] as [string, string];
    expect(name).toMatch(/^financial-assistant-backup-.*\.json$/);
    expect(content).not.toContain("Кофе");
    expect(isEncryptedBackup(JSON.parse(content))).toBe(true);
    await expect(readBackupFileText(content, "correct horse")).resolves.toEqual(book);
  }, 20_000);

  it("пароли не совпали — файл не пишется", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Скачать копию" }));
    await user.type(await screen.findByLabelText("Пароль для файла"), "correct horse");
    await user.type(screen.getByLabelText("Пароль ещё раз"), "correct hose");
    await user.click(screen.getByRole("button", { name: "Сохранить с паролем" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Пароли не совпадают.");
    expect(files.saveTextFile).not.toHaveBeenCalled();
  });

  it("«Сохранить без пароля» пишет обычный JSON, как прежде", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Скачать копию" }));
    await user.click(await screen.findByRole("button", { name: "Сохранить без пароля" }));

    await waitFor(() => expect(files.saveTextFile).toHaveBeenCalledTimes(1));
    const [, content] = files.saveTextFile.mock.calls[0] as [string, string];
    expect(JSON.parse(content)).toEqual(book);
  });
});
