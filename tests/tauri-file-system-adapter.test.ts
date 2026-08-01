import { describe, expect, it } from "vitest";

import { fileNameFromPath } from "@/lib/files/TauriFileSystemAdapter";

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
