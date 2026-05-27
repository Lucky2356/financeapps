"use client";

import { BrowserStorageAdapter } from "@/lib/storage/BrowserStorageAdapter";
import { DesktopStorageAdapter } from "@/lib/storage/DesktopStorageAdapter";
import { IndexedDbStorageAdapter } from "@/lib/storage/IndexedDbStorageAdapter";
import { runtimeConfig } from "@/lib/platform/env";

export function createStorageAdapter() {
  if (runtimeConfig.platform === "desktop") {
    return new DesktopStorageAdapter();
  }

  if (runtimeConfig.platform === "android") {
    return new IndexedDbStorageAdapter("financial-assistant-mobile");
  }

  return new BrowserStorageAdapter();
}
