"use client";

import type { FilePickResult, FileSystemAdapter } from "@/lib/files/FileSystemAdapter";

export class BrowserFileSystemAdapter implements FileSystemAdapter {
  async pickTextFile(accept = ".csv,.json,text/csv,application/json"): Promise<FilePickResult | null> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;

    const file = await new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });

    if (!file) return null;

    return {
      name: file.name,
      content: await file.text(),
      mimeType: file.type
    };
  }

  async saveTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8"): Promise<void> {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
