import { beforeEach, describe, expect, it, vi } from "vitest";

import { fileNameFromPath, TauriFileSystemAdapter } from "@/lib/files/TauriFileSystemAdapter";

// The picker hands back a real path on Windows and a Storage Access Framework
// URI on Android; the import screen shows this name to the user, so it must not
// degrade into URI noise on the phone.
describe("fileNameFromPath", () => {
  it("takes the last segment of a Windows path", () => {
    expect(fileNameFromPath("C:\\Users\\Alex\\Downloads\\financial-assistant-backup.json")).toBe(
      "financial-assistant-backup.json"
    );
  });

  it("takes the last segment of a POSIX path", () => {
    expect(fileNameFromPath("/home/alex/statement.csv")).toBe("statement.csv");
  });

  it("decodes an Android content URI", () => {
    expect(
      fileNameFromPath(
        "content://com.android.providers.downloads.documents/document/primary%3ADownload%2Fbackup-2026-08-01.json"
      )
    ).toBe("backup-2026-08-01.json");
  });

  it("falls back when the picked path carries no file name", () => {
    expect(fileNameFromPath("content://com.example.provider/document/1234")).toBe("import.csv");
    expect(fileNameFromPath("", "backup.json")).toBe("backup.json");
  });

  it("survives malformed percent-escapes instead of throwing", () => {
    expect(fileNameFromPath("content://provider/%E0%A4%A.csv")).toBe("%E0%A4%A.csv");
  });
});

// ——— чтение и запись через плагины Tauri (подменены) ———

const plugins = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  readFile: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: plugins.open, save: plugins.save }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: plugins.readFile,
  readTextFile: plugins.readTextFile,
  writeTextFile: plugins.writeTextFile
}));

/** Строка в Windows-1251 — так её пишут выгрузки Сбера и 1С. */
function cp1251(text: string): Uint8Array {
  return Uint8Array.from([...text], (char) => {
    const code = char.charCodeAt(0);
    if (code < 0x80) return code;
    if (char === "Ё") return 0xa8;
    if (char === "ё") return 0xb8;
    if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
    throw new Error(`no cp1251 byte for ${char}`);
  });
}

const statement = "Дата операции;Сумма;Описание\n05.10.2026;-200;Кофе Ёлка";

describe("TauriFileSystemAdapter.pickTextFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a cp1251 statement as bytes and decodes it", async () => {
    plugins.open.mockResolvedValue("C:\\Users\\Alex\\Downloads\\sber.csv");
    plugins.readFile.mockResolvedValue(cp1251(statement));

    const picked = await new TauriFileSystemAdapter().pickTextFile();

    expect(picked).toEqual({ name: "sber.csv", content: statement });
    expect(picked?.content).not.toContain("\uFFFD");
    expect(plugins.readFile).toHaveBeenCalledWith("C:\\Users\\Alex\\Downloads\\sber.csv");
    // readTextFile — только UTF-8; на нём и получался мусор.
    expect(plugins.readTextFile).not.toHaveBeenCalled();
  });

  it("still reads UTF-8 and drops the BOM", async () => {
    plugins.open.mockResolvedValue("/home/alex/backup.json");
    plugins.readFile.mockResolvedValue(new TextEncoder().encode('\uFEFF{"ok":"да"}'));

    const picked = await new TauriFileSystemAdapter().pickTextFile();

    expect(picked?.content).toBe('{"ok":"да"}');
  });

  it("passes an Android content:// URI to readFile as a string", async () => {
    const uri =
      "content://com.android.providers.downloads.documents/document/primary%3ADownload%2Fvtb.csv";
    plugins.open.mockResolvedValue(uri);
    plugins.readFile.mockResolvedValue(cp1251(statement));

    const picked = await new TauriFileSystemAdapter().pickTextFile();

    // Строкой, не объектом URL: URL со схемой content: плагин отвергает.
    expect(plugins.readFile).toHaveBeenCalledWith(uri);
    expect(typeof plugins.readFile.mock.calls[0][0]).toBe("string");
    expect(picked).toEqual({ name: "vtb.csv", content: statement });
  });

  it("returns null when the picker is closed, without reading anything", async () => {
    plugins.open.mockResolvedValue(null);

    await expect(new TauriFileSystemAdapter().pickTextFile()).resolves.toBeNull();
    expect(plugins.readFile).not.toHaveBeenCalled();
  });

  it("lets a read failure reach the caller", async () => {
    plugins.open.mockResolvedValue("/home/alex/statement.csv");
    plugins.readFile.mockRejectedValue(new Error("forbidden path"));

    await expect(new TauriFileSystemAdapter().pickTextFile()).rejects.toThrow("forbidden path");
  });
});

describe("TauriFileSystemAdapter.saveTextFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes to the chosen target", async () => {
    plugins.save.mockResolvedValue("/home/alex/export.csv");

    await expect(new TauriFileSystemAdapter().saveTextFile("export.csv", "a;b")).resolves.toBe(
      true
    );
    expect(plugins.writeTextFile).toHaveBeenCalledWith("/home/alex/export.csv", "a;b");
    expect(plugins.save).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: "CSV", extensions: ["csv"] }] })
    );
  });

  it("reports a closed save sheet as false", async () => {
    plugins.save.mockResolvedValue(null);

    await expect(new TauriFileSystemAdapter().saveTextFile("export.csv", "a;b")).resolves.toBe(
      false
    );
    expect(plugins.writeTextFile).not.toHaveBeenCalled();
  });
});
