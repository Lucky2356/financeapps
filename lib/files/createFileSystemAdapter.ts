"use client";

import { BrowserFileSystemAdapter } from "@/lib/files/BrowserFileSystemAdapter";
import { TauriFileSystemAdapter } from "@/lib/files/TauriFileSystemAdapter";
import { isTauriShell } from "@/lib/platform/env";

// Native dialogs inside the Tauri shell (Windows and Android alike); plain
// browser download/upload when the pages are opened with `npm run dev`.
export function createFileSystemAdapter() {
  return isTauriShell() ? new TauriFileSystemAdapter() : new BrowserFileSystemAdapter();
}
