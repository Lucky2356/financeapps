"use client";

import type { FilePickResult, FileSystemAdapter } from "@/lib/files/FileSystemAdapter";

export class TauriFileSystemAdapter implements FileSystemAdapter {
  async pickTextFile(): Promise<FilePickResult | null> {
    const dialog = await import("@tauri-apps/plugin-dialog").catch(() => null);
    const fs = await import("@tauri-apps/plugin-fs").catch(() => null);

    if (!dialog || !fs) {
      throw new Error("Tauri file plugins are not installed. Add @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs for native file dialogs.");
    }

    const selected = await dialog.open({
      multiple: false,
      filters: [{ name: "Data", extensions: ["csv", "json"] }]
    });

    if (!selected || Array.isArray(selected)) return null;
    const content = await fs.readTextFile(selected);
    const name = selected.split(/[\\/]/).pop() ?? "import.csv";

    return { name, content };
  }

  async saveTextFile(filename: string, content: string): Promise<void> {
    const dialog = await import("@tauri-apps/plugin-dialog").catch(() => null);
    const fs = await import("@tauri-apps/plugin-fs").catch(() => null);

    if (!dialog || !fs) {
      throw new Error("Tauri file plugins are not installed. Add @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs for native file dialogs.");
    }

    const target = await dialog.save({ defaultPath: filename });
    if (target) {
      await fs.writeTextFile(target, content);
    }
  }
}
