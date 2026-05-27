"use client";

import { BrowserFileSystemAdapter } from "@/lib/files/BrowserFileSystemAdapter";
import { TauriFileSystemAdapter } from "@/lib/files/TauriFileSystemAdapter";
import { runtimeConfig } from "@/lib/platform/env";

export function createFileSystemAdapter() {
  if (runtimeConfig.platform === "desktop") {
    return new TauriFileSystemAdapter();
  }

  return new BrowserFileSystemAdapter();
}
