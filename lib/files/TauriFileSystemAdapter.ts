"use client";

import type { FilePickResult, FileSystemAdapter } from "@/lib/files/FileSystemAdapter";

/**
 * Reads the file name out of whatever the native picker returned.
 *
 * On Windows that is a real path (`C:\Users\...\backup.json`). On Android it is
 * a Storage Access Framework URI whose last segment is percent-encoded and
 * carries no useful name (`content://…/document/primary%3ADownload%2Fb.json`),
 * so decode it and take what follows the last separator.
 */
export function fileNameFromPath(path: string, fallback = "import.csv"): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed percent-escapes — keep the raw value.
  }
  const name = decoded
    .split(/[\\/:]/)
    .pop()
    ?.trim();
  return name && /\.[a-z0-9]+$/i.test(name) ? name : fallback;
}

export class TauriFileSystemAdapter implements FileSystemAdapter {
  async pickTextFile(): Promise<FilePickResult | null> {
    const dialog = await import("@tauri-apps/plugin-dialog").catch(() => null);
    const fs = await import("@tauri-apps/plugin-fs").catch(() => null);

    if (!dialog || !fs) {
      throw new Error(
        "Tauri file plugins are not installed. Add @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs for native file dialogs."
      );
    }

    const selected = await dialog.open({
      multiple: false,
      // Android ignores extension filters and shows every document; that is
      // fine, the importer validates the contents anyway.
      filters: [{ name: "Data", extensions: ["csv", "json"] }]
    });

    if (!selected || Array.isArray(selected)) return null;
    // The dialog plugin adds whatever the user picked to the fs scope, so the
    // read below is allowed even for a path outside the configured scope.
    const content = await fs.readTextFile(selected);

    return { name: fileNameFromPath(selected), content };
  }

  // The MIME type of the interface is unused here: the native sheet derives the
  // type from the extension of the suggested name.
  async saveTextFile(filename: string, content: string): Promise<void> {
    const dialog = await import("@tauri-apps/plugin-dialog").catch(() => null);
    const fs = await import("@tauri-apps/plugin-fs").catch(() => null);

    if (!dialog || !fs) {
      throw new Error(
        "Tauri file plugins are not installed. Add @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs for native file dialogs."
      );
    }

    const extension = filename.split(".").pop();
    const target = await dialog.save({
      defaultPath: filename,
      // Gives the Android "create document" sheet a sensible type and keeps the
      // Windows save dialog's file-type dropdown meaningful.
      ...(extension
        ? { filters: [{ name: extension.toUpperCase(), extensions: [extension] }] }
        : {})
    });
    if (target) {
      await fs.writeTextFile(target, content);
    }
  }
}
